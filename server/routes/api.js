'use strict';

const express = require('express');
const config = require('../config');
const auth = require('../services/auth');
const portfolio = require('../services/portfolio');
const { market } = require('../services/market');
const { settings } = require('../services/settings');
const { isMigrationPending } = require('../services/legacy');
const platform = require('../platform');
const { routes, providers } = require('../shared');

const router = express.Router();

// Data endpoints are shared with the in-app backend of the desktop and mobile apps.
const sharedRoutes = routes.createRoutes({
    market,
    portfolio,
    settings,
    providers: providers.PROVIDERS,
    createProvider: (preferences) => providers.createProvider(preferences, platform),
    mode: 'server',
    version: config.version,
    account: (ctx) => ({ username: ctx.session.username, defaultPassword: auth.usesDefaultPassword() }),
    statusExtras: () => ({ legacyPending: isMigrationPending() }),
});

for (const route of sharedRoutes) {
    router[route.method.toLowerCase()](route.path, async (req, res) => {
        const result = await route.handler({ params: req.params, query: req.query, body: req.body, session: req.session });
        if (route.download) {
            res.set('Content-Type', result.type);
            res.set('Content-Disposition', `attachment; filename="${result.filename}"`);
            return res.send(result.body);
        }
        if (route.status === 204) return res.status(204).end();
        return res.status(route.status || 200).json(result);
    });
}

/* ---------- server-only: account ---------- */

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

module.exports = router;
