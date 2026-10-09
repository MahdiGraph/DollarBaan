// Transactions, holdings, timelines and backups on top of MarketCore and a storage adapter.
import * as ledger from '../ledger.js';
import { tehranDate, isIsoDate, addDays, addMonths, toJalali, faDigits } from '../dates.js';
import { badRequest, notFound } from '../errors.js';
import { CATEGORIES, CUSTOM_KINDS } from '../catalog.js';

const MIN_DATE = '1990-01-01';
const RANGE_MONTHS = { '1m': 1, '3m': 3, '6m': 6, '1y': 12, '3y': 36 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOM_SYMBOL = /^CUSTOM_[A-F0-9]{10}$/;

function toTx(data) {
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

function timeValue(value) {
    const time = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(time) ? time : 0;
}

function byNewest(a, b) {
    return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || timeValue(b.createdAt) - timeValue(a.createdAt);
}

function downsample(points, max) {
    if (points.length <= max) return points;
    const step = Math.ceil(points.length / max);
    const out = [];
    for (let i = points.length - 1; i >= 0; i -= step) out.push(points[i]);
    return out.reverse();
}

function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export class PortfolioCore {
    /**
     * @param {object} options
     * @param {object} options.store    storage adapter
     * @param {object} options.market   MarketCore
     * @param {object} options.settings SettingsCore
     * @param {object} options.platform { logger, uuid }
     * @param {string} options.version  app version written into backups
     */
    constructor({ store, market, settings, platform, version }) {
        this.store = store;
        this.market = market;
        this.settings = settings;
        this.logger = platform.logger;
        this.uuid = platform.uuid;
        this.version = version;
    }

    withAsset(tx) {
        const view = this.market.view(this.market.getAsset(tx.symbol));
        return {
            ...tx,
            name: view ? view.name : tx.symbol,
            category: view ? view.category : 'custom',
            unit: view ? view.unit : null,
            kind: view ? view.kind : null,
            total: tx.quantity * tx.unitPrice,
        };
    }

    assetName(symbol) {
        const asset = this.market.getAsset(symbol);
        return asset ? asset.nameFa : symbol;
    }

    validateTransaction(input, { knownSymbols } = {}) {
        if (!input || typeof input !== 'object') throw badRequest('اطلاعات تراکنش معتبر نیست');
        const symbol = String(input.symbol || '').trim();
        if (!symbol) throw badRequest('دارایی را انتخاب کنید');
        if (!this.market.getAsset(symbol) && !(knownSymbols && knownSymbols.has(symbol))) {
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

    assertNoOversell(transactions) {
        const issue = ledger.findOversell(transactions);
        if (!issue) return;
        throw badRequest(
            `با این تغییر، مقدار فروش «${this.assetName(issue.symbol)}» در تاریخ ${faDigits(toJalali(issue.date))} از موجودی شما در آن روز بیشتر می‌شود`,
            'oversell'
        );
    }

    async transactionsFor(symbols) {
        return (await this.store.transactionsFor([...symbols])).map(toTx);
    }

    async allTransactions() {
        return (await this.store.allTransactions()).map(toTx);
    }

    /* ---------- transactions ---------- */

    async listTransactions({ limit } = {}) {
        const rows = (await this.allTransactions()).sort(byNewest);
        return (limit ? rows.slice(0, limit) : rows).map((tx) => this.withAsset(tx));
    }

    async createTransaction(input) {
        const data = this.validateTransaction(input);
        const existing = await this.transactionsFor([data.symbol]);
        const now = new Date();
        const row = { id: this.uuid(), ...data, createdAt: now, updatedAt: now };
        this.assertNoOversell([...existing, row]);
        await this.store.insertTransaction(row);
        this.market.trackNow([data.symbol]).catch((error) => this.logger.warn(`Tracking ${data.symbol} failed: ${error.message}`));
        return this.withAsset(toTx(row));
    }

    async updateTransaction(id, input) {
        const current = await this.store.getTransaction(id);
        if (!current) throw notFound('تراکنش پیدا نشد');
        const data = this.validateTransaction(input);
        const others = (await this.transactionsFor([current.symbol, data.symbol])).filter((tx) => tx.id !== id);
        this.assertNoOversell([...others, { ...data, id, createdAt: current.createdAt }]);
        const patch = { ...data, updatedAt: new Date() };
        await this.store.updateTransaction(id, patch);
        if (data.symbol !== current.symbol) this.market.trackNow([data.symbol]).catch(() => {});
        return this.withAsset(toTx({ ...current, ...patch }));
    }

    async deleteTransaction(id) {
        const current = await this.store.getTransaction(id);
        if (!current) throw notFound('تراکنش پیدا نشد');
        const others = (await this.transactionsFor([current.symbol])).filter((tx) => tx.id !== id);
        this.assertNoOversell(others);
        await this.store.deleteTransaction(id);
    }

    /* ---------- portfolio ---------- */

    quotesFor(symbols) {
        const quotes = new Map();
        for (const symbol of symbols) {
            const toman = this.market.toman(this.market.getAsset(symbol));
            if (toman.price > 0) quotes.set(symbol, { price: toman.price, prevClose: toman.prevClose });
        }
        return quotes;
    }

    decorateHolding(row) {
        const view = this.market.view(this.market.getAsset(row.symbol));
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

    async getPortfolio() {
        const transactions = await this.allTransactions();
        const symbols = new Set(transactions.map((tx) => tx.symbol));
        const summary = ledger.summarize(transactions, this.quotesFor(symbols));
        const holdings = summary.holdings.map((row) => this.decorateHolding(row));
        const closed = summary.closed.map((row) => this.decorateHolding(row));

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

    async getTimeline(range) {
        const transactions = await this.allTransactions();
        if (!transactions.length) return { range, points: [] };
        const today = tehranDate();
        let first = transactions.reduce((min, tx) => (tx.date < min ? tx.date : min), transactions[0].date);
        if (first > today) first = today;
        const wanted = range === 'all' ? first : addMonths(today, -(RANGE_MONTHS[range] || 6));
        const start = wanted < first ? first : wanted;
        const dates = ledger.sampleDates(start, today, 160);

        const symbols = [...new Set(transactions.map((tx) => tx.symbol))];
        const seriesBySymbol = new Map();
        const currentPrices = new Map();
        for (const symbol of symbols) {
            seriesBySymbol.set(symbol, await this.market.seriesFor(symbol));
            const price = this.market.toman(this.market.getAsset(symbol)).price;
            if (price > 0) currentPrices.set(symbol, price);
        }
        const points = ledger.buildTimeline({ transactions, seriesBySymbol, currentPrices, dates, today });
        return { range, start, points, performance: ledger.windowPerformance(points, transactions) };
    }

    /* ---------- single asset ---------- */

    async getAssetDetail(symbol) {
        const asset = this.market.getAsset(symbol);
        if (!asset) throw notFound('این دارایی پیدا نشد');
        const transactions = (await this.transactionsFor([symbol])).sort(byNewest);
        const summary = ledger.summarize(transactions, this.quotesFor([symbol]));
        return {
            asset: this.market.view(asset),
            holding: summary.holdings[0] || summary.closed[0] || null,
            transactions: transactions.map((tx) => this.withAsset(tx)),
        };
    }

    async getAssetHistory(symbol, range) {
        const asset = this.market.getAsset(symbol);
        if (!asset) throw notFound('این دارایی پیدا نشد');
        await this.market.ensureHistory(symbol);
        let series = await this.market.seriesFor(symbol);
        const today = tehranDate();
        const current = this.market.toman(asset).price;
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

    async getWatchlist() {
        const symbols = this.settings.preferences().watchlist;
        const today = tehranDate();
        const since = addDays(today, -30);
        const items = [];
        for (const symbol of symbols) {
            const asset = this.market.getAsset(symbol);
            if (!asset) continue;
            const series = (await this.market.seriesFor(symbol)).filter((point) => point.date >= since);
            const view = this.market.view(asset);
            if (view.price > 0 && (!series.length || series[series.length - 1].date < today)) {
                series.push({ date: today, close: view.price });
            }
            items.push({ ...view, spark: series.map((point) => point.close) });
        }
        return items;
    }

    /* ---------- export / import ---------- */

    async exportData() {
        const transactions = (await this.allTransactions())
            .sort((a, b) => -byNewest(a, b))
            .map(({ createdAt, updatedAt, ...tx }) => tx);
        const customAssets = [];
        for (const asset of this.market.assets.values()) {
            if (asset.source !== 'custom') continue;
            customAssets.push({
                symbol: asset.symbol,
                name: asset.nameFa,
                unit: asset.unit,
                kind: asset.meta.kind || 'other',
                price: asset.price,
                history: await this.market.historyRows(asset.symbol),
            });
        }
        const prefs = this.settings.preferences();
        return {
            app: 'DollarBaan',
            format: 1,
            version: this.version,
            exportedAt: new Date().toISOString(),
            preferences: { watchlist: prefs.watchlist, displayUnit: prefs.displayUnit, chartRange: prefs.chartRange },
            customAssets,
            transactions,
        };
    }

    async exportCsv() {
        const header = ['تاریخ (شمسی)', 'تاریخ (میلادی)', 'دارایی', 'نماد', 'نوع', 'مقدار', 'قیمت واحد (تومان)', 'کارمزد (تومان)', 'مبلغ کل (تومان)', 'یادداشت'];
        const lines = [header.map(csvCell).join(',')];
        for (const tx of (await this.listTransactions()).reverse()) {
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
        return `﻿${lines.join('\r\n')}\r\n`;
    }

    async importData(payload, { mode = 'merge' } = {}) {
        if (!payload || payload.app !== 'DollarBaan' || !Array.isArray(payload.transactions)) {
            throw badRequest('فایل پشتیبان دلاربان معتبر نیست');
        }
        if (payload.transactions.length > 50000) throw badRequest('تعداد تراکنش‌های فایل بیش از حد مجاز است');

        const customAssets = [];
        for (const item of Array.isArray(payload.customAssets) ? payload.customAssets : []) {
            if (!item || !CUSTOM_SYMBOL.test(item.symbol)) throw badRequest('یکی از دارایی‌های دستی فایل پشتیبان معتبر نیست');
            const data = this.market.validateCustom({ name: item.name, unit: item.unit, kind: item.kind, price: item.price });
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
            if (symbol && !this.market.getAsset(symbol) && !customSymbols.has(symbol)) {
                unknown.add(symbol);
                continue;
            }
            const data = this.validateTransaction(raw, { knownSymbols: customSymbols });
            const id = raw.id && UUID.test(raw.id) ? raw.id.toLowerCase() : this.uuid();
            imported.push({ ...data, id });
        }
        if (unknown.size) {
            throw badRequest(`این دارایی‌ها در منبع داده فعلی پیدا نشدند: ${[...unknown].slice(0, 8).join('، ')}`);
        }

        const now = new Date();
        const existing = await this.allTransactions();
        const existingById = new Map(existing.map((tx) => [tx.id, tx]));
        const rows = imported.map((tx) => ({
            ...tx,
            createdAt: mode !== 'replace' && existingById.has(tx.id) ? existingById.get(tx.id).createdAt : now,
            updatedAt: now,
        }));
        const finalSet = new Map(mode === 'replace' ? [] : existing.map((tx) => [tx.id, tx]));
        for (const row of rows) finalSet.set(row.id, row);
        this.assertNoOversell([...finalSet.values()]);

        await this.store.importBackup({
            replace: mode === 'replace',
            transactions: rows,
            assets: customAssets.map((asset) => ({
                symbol: asset.symbol,
                source: 'custom',
                provider: null,
                nameFa: asset.nameFa,
                nameEn: null,
                category: 'custom',
                currency: 'IRT',
                unit: asset.unit,
                price: asset.price,
                prevClose: null,
                high: null,
                low: null,
                quoteTime: now,
                stale: false,
                listed: true,
                rateSymbol: null,
                meta: { kind: asset.kind },
                createdAt: now,
                updatedAt: now,
            })),
            prices: customAssets.flatMap((asset) => asset.history.map((point) => ({
                symbol: asset.symbol,
                date: point.date,
                open: point.close,
                high: point.close,
                low: point.close,
                close: point.close,
                origin: 'manual',
            }))),
        });

        for (const asset of customAssets) this.market.history.delete(asset.symbol);
        await this.market.reloadAssets();
        if (payload.preferences && Array.isArray(payload.preferences.watchlist)) {
            const watchlist = payload.preferences.watchlist.filter((symbol) => this.market.getAsset(symbol));
            const { before, after } = await this.settings.updatePreferences({ watchlist });
            await this.market.applyPreferences(before, after);
        }
        this.market.trackNow([...new Set(imported.map((tx) => tx.symbol))]).catch(() => {});
        return { transactions: imported.length, customAssets: customAssets.length };
    }
}
