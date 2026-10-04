'use strict';

const express = require('express');
const config = require('../config');
const auth = require('../services/auth');
const portfolio = require('../services/portfolio');
const { market, describeError } = require('../services/market');
const { settings, RANGES } = require('../services/settings');
const { createProvider, PROVIDERS } = require('../providers');
const { isMigrationPending } = require('../services/legacy');
const { CATEGORIES, CUSTOM_KINDS } = require('../catalog');
const { isIsoDate, tehranDate } = require('../lib/dates');
const { badRequest } = require('../lib/errors');
const logger = require('../logger');

const router = express.Router();
const MANUAL_SYNC_COOLDOWN_MS = 60 * 1000;

const rangeOf = (value) => (RANGES.includes(value) ? value : settings.preferences().chartRange);

function statusPayload() {
    const status = market.publicStatus();
    const provider = PROVIDERS.find((item) => item.id === (market.provider && market.provider.id));
    return { ...status, providerName: provider ? provider.name : null, today: tehranDate(), legacyPending: isMigrationPending() };
}

function attachment(res, filename, type) {
    res.set('Content-Type', type);
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
}

/* ---------- app shell ---------- */

router.get('/bootstrap', async (req, res) => {
    res.json({
        version: config.version,
        username: req.session.username,
        defaultPassword: auth.usesDefaultPassword(),
        preferences: settings.publicPreferences(),
        providers: PROVIDERS,
        categories: CATEGORIES,
        customKinds: CUSTOM_KINDS,
        status: statusPayload(),
    });
});

router.get('/status', (req, res) => res.json(statusPayload()));

router.post('/sync', async (req, res) => {
    const last = Date.parse(market.status.lastAttemptAt);
    const recent = Number.isFinite(last) && Date.now() - last < MANUAL_SYNC_COOLDOWN_MS;
    if (!recent || market.syncing) await market.sync({ reason: 'manual' });
    res.json(statusPayload());
});

/* ---------- assets & market ---------- */

router.get('/assets', async (req, res) => {
    const referenced = [...await market.heldSymbols(), ...settings.preferences().watchlist];
    res.json(market.catalog(referenced));
});

router.get('/assets/:symbol', async (req, res) => {
    res.json(await portfolio.getAssetDetail(req.params.symbol));
});

router.get('/assets/:symbol/history', async (req, res) => {
    res.json(await portfolio.getAssetHistory(req.params.symbol, rangeOf(req.query.range)));
});

router.get('/assets/:symbol/price', async (req, res) => {
    const date = String(req.query.date || tehranDate());
    if (!isIsoDate(date)) throw badRequest('تاریخ معتبر نیست');
    res.json(await market.priceAt(req.params.symbol, date));
});

router.get('/watchlist', async (req, res) => {
    res.json(await portfolio.getWatchlist());
});

router.post('/custom-assets', async (req, res) => {
    res.status(201).json(await market.createCustomAsset(req.body || {}));
});

router.put('/custom-assets/:symbol', async (req, res) => {
    res.json(await market.updateCustomAsset(req.params.symbol, req.body || {}));
});

router.delete('/custom-assets/:symbol', async (req, res) => {
    await market.deleteCustomAsset(req.params.symbol);
    res.status(204).end();
});

/* ---------- portfolio ---------- */

router.get('/portfolio', async (req, res) => {
    res.json(await portfolio.getPortfolio());
});

router.get('/portfolio/timeline', async (req, res) => {
    res.json(await portfolio.getTimeline(rangeOf(req.query.range)));
});

router.get('/transactions', async (req, res) => {
    const limit = parseInt(req.query.limit, 10);
    res.json(await portfolio.listTransactions({ limit: limit > 0 ? Math.min(limit, 1000) : undefined }));
});

router.post('/transactions', async (req, res) => {
    res.status(201).json(await portfolio.createTransaction(req.body));
});

router.put('/transactions/:id', async (req, res) => {
    res.json(await portfolio.updateTransaction(req.params.id, req.body));
});

router.delete('/transactions/:id', async (req, res) => {
    await portfolio.deleteTransaction(req.params.id);
    res.status(204).end();
});

/* ---------- settings ---------- */

router.get('/settings', (req, res) => {
    res.json({ preferences: settings.publicPreferences(), providers: PROVIDERS, status: statusPayload() });
});

router.put('/settings', async (req, res) => {
    const { before, after } = await settings.updatePreferences(req.body);
    await market.applyPreferences(before, after);
    res.json({ preferences: settings.publicPreferences(), status: statusPayload() });
});

router.post('/settings/test-provider', async (req, res) => {
    const body = req.body || {};
    const current = settings.preferences();
    const candidate = {
        ...current,
        provider: body.provider || current.provider,
        iranMarket: { ...current.iranMarket, ...(body.iranMarket || {}) },
        navasan: {
            apiKey: body.navasan && typeof body.navasan.apiKey === 'string' && body.navasan.apiKey.trim()
                ? body.navasan.apiKey.trim()
                : current.navasan.apiKey,
        },
    };
    const provider = createProvider(candidate, logger);
    try {
        const result = await provider.test();
        res.json({ ok: true, publishedAt: result.publishedAt || null });
    } catch (error) {
        res.json({ ok: false, error: describeError(error, provider) });
    }
});

router.post('/account/password', async (req, res) => {
    const { current, next } = req.body || {};
    await auth.changePassword(current, next);
    await auth.destroyOtherSessions(req.session.id);
    res.json({ ok: true });
});

router.post('/account/logout-others', async (req, res) => {
    const removed = await auth.destroyOtherSessions(req.session.id);
    res.json({ ok: true, removed });
});

/* ---------- backup ---------- */

router.get('/export', async (req, res) => {
    attachment(res, `dollarbaan-backup-${tehranDate()}.json`, 'application/json; charset=utf-8');
    res.send(JSON.stringify(await portfolio.exportData(), null, 2));
});

router.get('/export.csv', async (req, res) => {
    attachment(res, `dollarbaan-transactions-${tehranDate()}.csv`, 'text/csv; charset=utf-8');
    res.send(await portfolio.exportCsv());
});

router.post('/import', async (req, res) => {
    const mode = req.query.mode === 'replace' ? 'replace' : 'merge';
    res.json(await portfolio.importData(req.body, { mode }));
});

module.exports = router;
