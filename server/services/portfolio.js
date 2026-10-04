'use strict';

const config = require('../config');
const { sequelize, Transaction, Asset, PricePoint } = require('../db');
const { market } = require('./market');
const { settings } = require('./settings');
const ledger = require('./ledger');
const { tehranDate, isIsoDate, addDays, addMonths, toJalali, faDigits } = require('../lib/dates');
const { badRequest, notFound } = require('../lib/errors');
const { CATEGORIES, CUSTOM_KINDS } = require('../catalog');
const logger = require('../logger');

const MIN_DATE = '1990-01-01';
const RANGE_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '3y': 36 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOM_SYMBOL = /^CUSTOM_[A-F0-9]{10}$/;

function toTx(row) {
    const data = typeof row.get === 'function' ? row.get({ plain: true }) : row;
    return {
        id: data.id,
        symbol: data.symbol,
        side: data.side,
        quantity: Number(data.quantity),
        unitPrice: Number(data.unitPrice),
        fee: Number(data.fee) || 0,
        date: data.date,
        note: data.note || '',
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    };
}

function withAsset(tx) {
    const view = market.view(market.getAsset(tx.symbol));
    return {
        ...tx,
        name: view ? view.name : tx.symbol,
        category: view ? view.category : 'custom',
        unit: view ? view.unit : null,
        kind: view ? view.kind : null,
        total: tx.quantity * tx.unitPrice,
    };
}

function assetName(symbol) {
    const asset = market.getAsset(symbol);
    return asset ? asset.nameFa : symbol;
}

function validateTransaction(input, { knownSymbols } = {}) {
    if (!input || typeof input !== 'object') throw badRequest('اطلاعات تراکنش معتبر نیست');
    const symbol = String(input.symbol || '').trim();
    if (!symbol) throw badRequest('دارایی را انتخاب کنید');
    if (!market.getAsset(symbol) && !(knownSymbols && knownSymbols.has(symbol))) {
        throw badRequest(`دارایی «${symbol}» پیدا نشد`);
    }
    const side = input.side === 'buy' || input.side === 'sell' ? input.side : null;
    if (!side) throw badRequest('نوع تراکنش (خرید یا فروش) را مشخص کنید');
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e15) throw badRequest('مقدار باید عددی بزرگ‌تر از صفر باشد');
    const unitPrice = Number(input.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1e18) throw badRequest('قیمت هر واحد باید عددی بزرگ‌تر از صفر باشد');
    const fee = input.fee === undefined || input.fee === null || input.fee === '' ? 0 : Number(input.fee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1e18) throw badRequest('کارمزد باید صفر یا عددی مثبت باشد');
    const date = String(input.date || '');
    if (!isIsoDate(date)) throw badRequest('تاریخ تراکنش معتبر نیست');
    if (date > addDays(tehranDate(), 1)) throw badRequest('تاریخ تراکنش نمی‌تواند در آینده باشد');
    if (date < MIN_DATE) throw badRequest('تاریخ تراکنش بیش از حد قدیمی است');
    const note = String(input.note === undefined || input.note === null ? '' : input.note).trim().slice(0, 500);
    return { symbol, side, quantity, unitPrice, fee, date, note };
}

function assertNoOversell(transactions) {
    const issue = ledger.findOversell(transactions);
    if (!issue) return;
    throw badRequest(
        `با این تغییر، مقدار فروش «${assetName(issue.symbol)}» در تاریخ ${faDigits(toJalali(issue.date))} از موجودی شما در آن روز بیشتر می‌شود`,
        'oversell'
    );
}

async function transactionsFor(symbols) {
    const rows = await Transaction.findAll({ where: { symbol: [...symbols] }, raw: true });
    return rows.map(toTx);
}

async function allTransactions() {
    return (await Transaction.findAll({ raw: true })).map(toTx);
}

/* ---------- transactions ---------- */

async function listTransactions({ limit } = {}) {
    const rows = await Transaction.findAll({
        order: [['date', 'DESC'], ['createdAt', 'DESC']],
        ...(limit ? { limit } : {}),
    });
    return rows.map(toTx).map(withAsset);
}

async function createTransaction(input) {
    const data = validateTransaction(input);
    const existing = await transactionsFor([data.symbol]);
    assertNoOversell([...existing, { ...data, id: 'new', createdAt: new Date() }]);
    const row = await Transaction.create(data);
    market.trackNow([data.symbol]).catch((error) => logger.warn(`Tracking ${data.symbol} failed: ${error.message}`));
    return withAsset(toTx(row));
}

async function updateTransaction(id, input) {
    const row = await Transaction.findByPk(id);
    if (!row) throw notFound('تراکنش پیدا نشد');
    const data = validateTransaction(input);
    const previousSymbol = row.symbol;
    const others = (await transactionsFor([previousSymbol, data.symbol])).filter((tx) => tx.id !== id);
    assertNoOversell([...others, { ...data, id, createdAt: row.createdAt }]);
    await row.update(data);
    if (data.symbol !== previousSymbol) market.trackNow([data.symbol]).catch(() => {});
    return withAsset(toTx(row));
}

async function deleteTransaction(id) {
    const row = await Transaction.findByPk(id);
    if (!row) throw notFound('تراکنش پیدا نشد');
    const others = (await transactionsFor([row.symbol])).filter((tx) => tx.id !== id);
    assertNoOversell(others);
    await row.destroy();
}

/* ---------- portfolio ---------- */

function quotesFor(symbols) {
    const quotes = new Map();
    for (const symbol of symbols) {
        const toman = market.toman(market.getAsset(symbol));
        if (toman.price > 0) quotes.set(symbol, { price: toman.price, prevClose: toman.prevClose });
    }
    return quotes;
}

function decorateHolding(row) {
    const view = market.view(market.getAsset(row.symbol));
    return {
        ...row,
        name: view ? view.name : row.symbol,
        category: view ? view.category : 'custom',
        unit: view ? view.unit : null,
        kind: view ? view.kind : null,
        stale: view ? view.stale : true,
        source: view ? view.source : null,
    };
}

async function getPortfolio() {
    const transactions = await allTransactions();
    const symbols = new Set(transactions.map((tx) => tx.symbol));
    const summary = ledger.summarize(transactions, quotesFor(symbols));
    const holdings = summary.holdings.map(decorateHolding);
    const closed = summary.closed.map(decorateHolding);

    const byCategory = new Map();
    for (const holding of holdings) {
        byCategory.set(holding.category, (byCategory.get(holding.category) || 0) + holding.value);
    }
    const allocation = CATEGORIES
        .filter((category) => byCategory.get(category) > 0)
        .map((category) => ({
            category,
            value: byCategory.get(category),
            weight: summary.totals.value > 0 ? (byCategory.get(category) / summary.totals.value) * 100 : 0,
        }));

    return {
        totals: summary.totals,
        holdings,
        closed,
        allocation,
        transactionCount: transactions.length,
        firstDate: transactions.reduce((min, tx) => (!min || tx.date < min ? tx.date : min), null),
    };
}

function rangeStart(range, today, first) {
    const start = range === 'all' ? first : addMonths(today, -(RANGE_MONTHS[range] || 6));
    return start < first ? first : start;
}

async function getTimeline(range) {
    const transactions = await allTransactions();
    if (!transactions.length) return { range, points: [] };
    const today = tehranDate();
    const first = transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date);
    const start = rangeStart(range, today, first > today ? today : first);
    const dates = ledger.sampleDates(start, today, 160);

    const symbols = [...new Set(transactions.map((tx) => tx.symbol))];
    const seriesBySymbol = new Map();
    const currentPrices = new Map();
    for (const symbol of symbols) {
        seriesBySymbol.set(symbol, await market.seriesFor(symbol));
        const price = market.toman(market.getAsset(symbol)).price;
        if (price > 0) currentPrices.set(symbol, price);
    }
    const points = ledger.buildTimeline({ transactions, seriesBySymbol, currentPrices, dates, today });
    return { range, start, points, performance: ledger.windowPerformance(points, transactions) };
}

/* ---------- single asset ---------- */

async function getAssetDetail(symbol) {
    const asset = market.getAsset(symbol);
    if (!asset) throw notFound('این دارایی پیدا نشد');
    const rows = await Transaction.findAll({ where: { symbol }, order: [['date', 'DESC'], ['createdAt', 'DESC']] });
    const transactions = rows.map(toTx);
    const summary = ledger.summarize(transactions, quotesFor([symbol]));
    return {
        asset: market.view(asset),
        holding: summary.holdings[0] || summary.closed[0] || null,
        transactions: transactions.map(withAsset),
    };
}

function downsample(points, max) {
    if (points.length <= max) return points;
    const step = Math.ceil(points.length / max);
    const out = [];
    for (let i = points.length - 1; i >= 0; i -= step) out.push(points[i]);
    return out.reverse();
}

async function getAssetHistory(symbol, range) {
    const asset = market.getAsset(symbol);
    if (!asset) throw notFound('این دارایی پیدا نشد');
    await market.ensureHistory(symbol);
    let series = await market.seriesFor(symbol);
    const today = tehranDate();
    const current = market.toman(asset).price;
    if (current > 0) series = ledger.mergeSeries(series, [{ date: today, close: current }]);
    if (!series.length) return { range, points: [] };
    const start = range === 'all' ? series[0].date : addMonths(today, -(RANGE_MONTHS[range] || 6));
    let points = series.filter((point) => point.date >= start);
    // Carry the last earlier price to the window start (sparse series such as custom assets).
    const before = ledger.closeAsOf(series, addDays(start, -1));
    if (before && (!points.length || points[0].date > start)) points = [{ date: start, close: before.close }, ...points];
    return { range, points: downsample(points, 400) };
}

/* ---------- watchlist ---------- */

async function getWatchlist() {
    const symbols = settings.preferences().watchlist;
    const since = addDays(tehranDate(), -30);
    const items = [];
    for (const symbol of symbols) {
        const asset = market.getAsset(symbol);
        if (!asset) continue;
        const series = (await market.seriesFor(symbol)).filter((point) => point.date >= since);
        const view = market.view(asset);
        if (view.price > 0) {
            const today = tehranDate();
            if (!series.length || series[series.length - 1].date < today) series.push({ date: today, close: view.price });
        }
        items.push({ ...view, spark: series.map((point) => point.close) });
    }
    return items;
}

/* ---------- export / import ---------- */

async function exportData() {
    const transactions = (await Transaction.findAll({ order: [['date', 'ASC'], ['createdAt', 'ASC']], raw: true }))
        .map(toTx)
        .map(({ createdAt, updatedAt, ...tx }) => tx);
    const customAssets = [];
    for (const asset of market.assets.values()) {
        if (asset.source !== 'custom') continue;
        customAssets.push({
            symbol: asset.symbol,
            name: asset.nameFa,
            unit: asset.unit,
            kind: asset.meta.kind || 'other',
            price: asset.price,
            history: await market.historyRows(asset.symbol),
        });
    }
    const prefs = settings.preferences();
    return {
        app: 'DollarBaan',
        format: 1,
        version: config.version,
        exportedAt: new Date().toISOString(),
        preferences: { watchlist: prefs.watchlist, displayUnit: prefs.displayUnit, chartRange: prefs.chartRange },
        customAssets,
        transactions,
    };
}

function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function exportCsv() {
    const header = ['تاریخ (شمسی)', 'تاریخ (میلادی)', 'دارایی', 'نماد', 'نوع', 'مقدار', 'قیمت واحد (تومان)', 'کارمزد (تومان)', 'مبلغ کل (تومان)', 'یادداشت'];
    const lines = [header.map(csvCell).join(',')];
    for (const tx of (await listTransactions()).reverse()) {
        lines.push([
            toJalali(tx.date),
            tx.date,
            tx.name,
            tx.symbol,
            tx.side === 'buy' ? 'خرید' : 'فروش',
            tx.quantity,
            tx.unitPrice,
            tx.fee,
            tx.side === 'buy' ? tx.total + tx.fee : tx.total - tx.fee,
            tx.note,
        ].map(csvCell).join(','));
    }
    return `\ufeff${lines.join('\r\n')}\r\n`;
}

async function importData(payload, { mode = 'merge' } = {}) {
    if (!payload || payload.app !== 'DollarBaan' || !Array.isArray(payload.transactions)) {
        throw badRequest('فایل پشتیبان دلاربان معتبر نیست');
    }
    if (payload.transactions.length > 50000) throw badRequest('تعداد تراکنش‌های فایل بیش از حد مجاز است');

    const customAssets = [];
    for (const item of Array.isArray(payload.customAssets) ? payload.customAssets : []) {
        if (!item || !CUSTOM_SYMBOL.test(item.symbol)) throw badRequest('یکی از دارایی‌های دستی فایل پشتیبان معتبر نیست');
        const data = market.validateCustom({ name: item.name, unit: item.unit, kind: item.kind, price: item.price });
        const history = (Array.isArray(item.history) ? item.history : [])
            .filter((point) => point && isIsoDate(point.date) && Number(point.close) > 0)
            .map((point) => ({ date: point.date, close: Number(point.close) }));
        customAssets.push({ symbol: item.symbol, ...data, kind: CUSTOM_KINDS.includes(data.kind) ? data.kind : 'other', history });
    }
    const customSymbols = new Set(customAssets.map((asset) => asset.symbol));

    const unknown = new Set();
    const imported = [];
    for (const raw of payload.transactions) {
        const symbol = raw && String(raw.symbol || '');
        if (symbol && !market.getAsset(symbol) && !customSymbols.has(symbol)) {
            unknown.add(symbol);
            continue;
        }
        const data = validateTransaction(raw, { knownSymbols: customSymbols });
        const id = raw.id && UUID.test(raw.id) ? raw.id.toLowerCase() : null;
        imported.push({ ...data, id });
    }
    if (unknown.size) {
        throw badRequest(`این دارایی‌ها در منبع داده فعلی پیدا نشدند: ${[...unknown].slice(0, 8).join('، ')}`);
    }

    const existing = await allTransactions();
    const byId = new Map(mode === 'replace' ? [] : existing.map((tx) => [tx.id, tx]));
    let counter = 0;
    for (const tx of imported) {
        const id = tx.id || `import-${counter += 1}`;
        byId.set(id, { ...tx, id, createdAt: new Date() });
    }
    assertNoOversell([...byId.values()]);

    await sequelize.transaction(async (transaction) => {
        for (const asset of customAssets) {
            await Asset.upsert({
                symbol: asset.symbol,
                source: 'custom',
                provider: null,
                nameFa: asset.nameFa,
                nameEn: null,
                category: 'custom',
                currency: 'IRT',
                unit: asset.unit,
                price: asset.price,
                quoteTime: new Date(),
                stale: false,
                listed: true,
                meta: JSON.stringify({ kind: asset.kind }),
            }, { transaction });
            const points = asset.history.map((point) => ({
                symbol: asset.symbol,
                date: point.date,
                open: point.close,
                high: point.close,
                low: point.close,
                close: point.close,
                origin: 'manual',
            }));
            for (let i = 0; i < points.length; i += 500) {
                await PricePoint.bulkCreate(points.slice(i, i + 500), {
                    transaction,
                    updateOnDuplicate: ['open', 'high', 'low', 'close', 'origin'],
                });
            }
        }
        if (mode === 'replace') await Transaction.destroy({ where: {}, transaction });
        const rows = imported.map(({ id, ...tx }) => (id ? { id, ...tx } : tx));
        for (let i = 0; i < rows.length; i += 500) {
            await Transaction.bulkCreate(rows.slice(i, i + 500), {
                transaction,
                updateOnDuplicate: ['symbol', 'side', 'quantity', 'unitPrice', 'fee', 'date', 'note', 'updatedAt'],
            });
        }
    });

    for (const asset of customAssets) market.history.delete(asset.symbol);
    await market.reloadAssets();
    if (payload.preferences && Array.isArray(payload.preferences.watchlist)) {
        const watchlist = payload.preferences.watchlist.filter((symbol) => market.getAsset(symbol));
        const { before, after } = await settings.updatePreferences({ watchlist });
        await market.applyPreferences(before, after);
    }
    market.trackNow([...new Set(imported.map((tx) => tx.symbol))]).catch(() => {});
    return { transactions: imported.length, customAssets: customAssets.length };
}

module.exports = {
    listTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getPortfolio,
    getTimeline,
    getAssetDetail,
    getAssetHistory,
    getWatchlist,
    exportData,
    exportCsv,
    importData,
};
