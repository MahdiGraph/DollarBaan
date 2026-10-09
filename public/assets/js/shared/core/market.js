// Market data: quotes, daily price history, scheduled syncing and custom assets.
// Storage goes through an adapter (SQL on the server, IndexedDB in the apps).
import { Emitter } from '../emitter.js';
import { tehranDate, addDays, addMonths, diffDays } from '../dates.js';
import { rankOf, compareAssets, CUSTOM_KINDS } from '../catalog.js';
import { convertSeries, mergeSeries, closeAsOf } from '../ledger.js';
import { badRequest, notFound, conflict } from '../errors.js';

const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;
const MAX_LISTED_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const HISTORY_CACHE_LIMIT = 80;
const MAX_TIMER_MS = 2 ** 31 - 1;

function parseMeta(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value) || {};
    } catch {
        return {};
    }
}

function toCached(row) {
    const data = { ...row };
    data.meta = parseMeta(data.meta);
    data.quoteTime = data.quoteTime ? new Date(data.quoteTime) : null;
    for (const key of ['price', 'prevClose', 'high', 'low']) {
        data[key] = data[key] === null || data[key] === undefined ? null : Number(data[key]);
    }
    data.stale = Boolean(data.stale);
    data.listed = Boolean(data.listed);
    return data;
}

export function describeError(error, provider) {
    if (error && error.code === 'missing_key') return error.message;
    const status = error && error.status;
    if (status === 401 || status === 403) {
        return provider.id === 'navasan'
            ? 'کلید API نوسان نامعتبر است یا اعتبار آن تمام شده است'
            : `دسترسی به منبع داده رد شد (HTTP ${status})`;
    }
    if (status === 429) return 'سقف درخواست‌های منبع داده پر شده است؛ کمی بعد دوباره تلاش کنید';
    if (status) return `منبع داده با خطای HTTP ${status} پاسخ داد`;
    if (error && error.name === 'HttpError') return 'اتصال به منبع داده برقرار نشد؛ اتصال اینترنت یا آدرس آینه را بررسی کنید';
    return `دریافت قیمت‌ها ناموفق بود: ${error && error.message ? error.message : 'خطای ناشناخته'}`;
}

function cleanText(value, max) {
    return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export class MarketCore extends Emitter {
    /**
     * @param {object} options
     * @param {object} options.store          storage adapter
     * @param {object} options.settings       SettingsCore
     * @param {Function} options.createProvider (preferences) => provider
     * @param {object} options.platform       { logger, randomHex }
     */
    constructor({ store, settings, createProvider, platform }) {
        super();
        this.store = store;
        this.settings = settings;
        this.createProvider = createProvider;
        this.logger = platform.logger;
        this.randomHex = platform.randomHex;
        this.assets = new Map();
        this.history = new Map();
        this.inflight = new Map();
        this.provider = null;
        this.timer = null;
        this.syncing = null;
        this.status = {
            provider: null,
            running: false,
            ok: null,
            error: null,
            lastAttemptAt: null,
            lastSuccessAt: null,
            publishedAt: null,
            nextRunAt: null,
            quoteCount: 0,
            historyErrors: [],
        };
    }

    async init() {
        await this.reloadAssets();
        const saved = this.settings.get('syncState');
        if (saved && typeof saved === 'object') Object.assign(this.status, saved, { running: false });
        this.provider = this.createProvider(this.settings.preferences());
    }

    /* ---------- scheduling ---------- */

    intervalMs() {
        return this.settings.preferences().refreshMinutes * 60 * 1000;
    }

    /** True when the last successful sync is older than the refresh interval. */
    isStale() {
        const last = Date.parse(this.status.lastSuccessAt);
        return !(this.status.ok && this.status.provider === this.provider.id
            && Number.isFinite(last) && Date.now() - last < this.intervalMs() && this.assets.size > 0);
    }

    start() {
        if (this.isStale()) {
            this.sync({ reason: 'startup' });
        } else {
            this.schedule(this.intervalMs() - (Date.now() - Date.parse(this.status.lastSuccessAt)));
        }
    }

    stop() {
        clearTimeout(this.timer);
        this.timer = null;
    }

    schedule(delayMs) {
        clearTimeout(this.timer);
        const delay = Math.min(MAX_TIMER_MS, Math.max(1000, delayMs));
        this.status.nextRunAt = new Date(Date.now() + delay).toISOString();
        this.timer = setTimeout(() => this.sync({ reason: 'schedule' }), delay);
        if (this.timer && typeof this.timer.unref === 'function') this.timer.unref();
    }

    /** Starts a sync, or joins the one already running. Never rejects. */
    sync({ reason = 'manual' } = {}) {
        if (!this.syncing) {
            this.syncing = this.runSync(reason).finally(() => {
                this.syncing = null;
            });
        }
        return this.syncing;
    }

    async runSync(reason) {
        const provider = this.provider;
        this.status.running = true;
        this.status.lastAttemptAt = new Date().toISOString();
        this.logger.info(`Price sync started (${reason}) using ${provider.id}`);
        try {
            const { quotes, publishedAt } = await provider.fetchLatest();
            if (provider !== this.provider) {
                this.logger.info('Data source changed during sync; discarding the result');
                return this.status;
            }
            await this.storeQuotes(provider.id, quotes);
            const tracked = await this.trackedSymbols();
            await this.recordSnapshots(tracked);
            const historyErrors = await this.refreshHistories(provider, tracked);
            Object.assign(this.status, {
                provider: provider.id,
                ok: true,
                error: null,
                lastSuccessAt: new Date().toISOString(),
                publishedAt,
                quoteCount: quotes.length,
                historyErrors,
            });
            this.logger.info(`Price sync finished: ${quotes.length} quotes, ${tracked.size} tracked symbols`);
            this.emit('synced');
        } catch (error) {
            Object.assign(this.status, { provider: provider.id, ok: false, error: describeError(error, provider) });
            this.logger.error(`Price sync failed: ${error.message}`);
        } finally {
            this.status.running = false;
            const { running, nextRunAt, ...persisted } = this.status;
            await this.settings.set('syncState', persisted)
                .catch((error) => this.logger.error(`Cannot save sync state: ${error.message}`));
            if (provider === this.provider) {
                const intervalMs = this.intervalMs();
                const retry = provider.backfillOnly ? intervalMs : Math.min(intervalMs, RETRY_AFTER_FAILURE_MS);
                this.schedule(this.status.ok ? intervalMs : retry);
            }
        }
        return this.status;
    }

    /** Called after preferences change. */
    async applyPreferences(before, after) {
        const sourceChanged = before.provider !== after.provider
            || before.iranMarket.mirror !== after.iranMarket.mirror
            || before.iranMarket.customUrl !== after.iranMarket.customUrl
            || before.navasan.apiKey !== after.navasan.apiKey;
        if (sourceChanged) {
            this.provider = this.createProvider(after);
            this.status.provider = this.provider.id;
            // A sync still running for the old source discards its result; start fresh after it.
            const start = () => this.sync({ reason: 'settings' });
            if (this.syncing) this.syncing.then(start);
            else start();
            return;
        }
        if (before.refreshMinutes !== after.refreshMinutes) {
            const last = Date.parse(this.status.lastSuccessAt);
            const elapsed = Number.isFinite(last) ? Date.now() - last : Infinity;
            this.schedule(Math.max(0, after.refreshMinutes * 60 * 1000 - elapsed));
        }
        const added = after.watchlist.filter((symbol) => !before.watchlist.includes(symbol));
        if (added.length) this.trackNow(added).catch(() => {});
    }

    /** Snapshot + history for newly tracked symbols without waiting for the next sync. */
    async trackNow(symbols) {
        const tracked = this.withDependencies(symbols);
        await this.recordSnapshots(tracked);
        for (const symbol of tracked) await this.ensureHistory(symbol);
    }

    /* ---------- assets ---------- */

    async reloadAssets() {
        const rows = await this.store.listAssets();
        this.assets = new Map(rows.map((row) => [row.symbol, toCached(row)]));
    }

    getAsset(symbol) {
        return this.assets.get(symbol) || null;
    }

    /** Toman prices of an asset; USD assets are converted with their rate symbol. */
    toman(asset) {
        const empty = { price: null, prevClose: null, high: null, low: null };
        if (!asset) return empty;
        if (!asset.rateSymbol) {
            return { price: asset.price, prevClose: asset.prevClose, high: asset.high, low: asset.low };
        }
        const rate = this.assets.get(asset.rateSymbol);
        if (!rate || !(rate.price > 0) || !(asset.price > 0)) return empty;
        const previousRate = rate.prevClose > 0 ? rate.prevClose : rate.price;
        return {
            price: asset.price * rate.price,
            prevClose: asset.prevClose > 0 ? asset.prevClose * previousRate : null,
            high: asset.high > 0 ? asset.high * rate.price : null,
            low: asset.low > 0 ? asset.low * rate.price : null,
        };
    }

    view(asset) {
        if (!asset) return null;
        const toman = this.toman(asset);
        const change = toman.price > 0 && toman.prevClose > 0 ? toman.price - toman.prevClose : null;
        const otherSource = asset.source === 'market' && this.provider && asset.provider !== this.provider.id;
        return {
            symbol: asset.symbol,
            name: asset.nameFa,
            nameEn: asset.nameEn || null,
            category: asset.category,
            unit: asset.unit || 'unit',
            source: asset.source,
            kind: asset.meta && asset.meta.kind ? asset.meta.kind : null,
            price: toman.price,
            prevClose: toman.prevClose,
            change,
            changePct: change === null ? null : (change / toman.prevClose) * 100,
            high: toman.high,
            low: toman.low,
            nativePrice: asset.currency !== 'IRT' ? asset.price : null,
            nativeCurrency: asset.currency !== 'IRT' ? asset.currency : null,
            time: asset.quoteTime ? asset.quoteTime.toISOString() : null,
            stale: Boolean(asset.stale) || Boolean(otherSource) || !(toman.price > 0),
            otherSource: Boolean(otherSource),
            rank: rankOf(asset.symbol),
        };
    }

    /** Assets offered by the active data source plus custom assets and anything referenced. */
    catalog(referenced = []) {
        const activeId = this.provider ? this.provider.id : null;
        const now = Date.now();
        const include = new Set(referenced);
        const list = [];
        for (const asset of this.assets.values()) {
            const listed = asset.source === 'custom'
                || (asset.provider === activeId && asset.listed
                    && !(asset.quoteTime && now - asset.quoteTime.getTime() > MAX_LISTED_AGE_MS));
            if (listed || include.has(asset.symbol)) list.push(asset);
        }
        return list.sort((a, b) => compareAssets(a, b)).map((asset) => this.view(asset));
    }

    async storeQuotes(providerId, quotes) {
        const now = new Date();
        const rows = quotes.map((quote) => ({
            symbol: quote.symbol,
            source: 'market',
            provider: providerId,
            nameFa: quote.nameFa,
            nameEn: quote.nameEn || null,
            category: quote.category,
            currency: quote.currency,
            unit: quote.unit || 'unit',
            price: quote.price,
            prevClose: quote.prevClose,
            high: quote.high,
            low: quote.low,
            quoteTime: quote.time,
            stale: Boolean(quote.stale),
            listed: true,
            rateSymbol: quote.rateSymbol || null,
            meta: quote.proxy ? { proxy: quote.proxy } : {},
            createdAt: now,
            updatedAt: now,
        })).filter((row) => {
            const existing = this.assets.get(row.symbol);
            return !existing || existing.source !== 'custom';
        });

        const fresh = new Set(rows.map((row) => row.symbol));
        const vanished = [...this.assets.values()]
            .filter((asset) => asset.source === 'market' && asset.provider === providerId && asset.listed && !fresh.has(asset.symbol))
            .map((asset) => asset.symbol);
        if (vanished.length) await this.store.setListed(vanished, false);
        await this.store.upsertAssets(rows);
        await this.reloadAssets();
    }

    heldSymbols() {
        return this.store.heldSymbols();
    }

    /** Market symbols plus the rate and proxy symbols their prices depend on. */
    withDependencies(symbols) {
        const out = new Set();
        for (const symbol of symbols) {
            const asset = this.assets.get(symbol);
            if (!asset || asset.source !== 'market') continue;
            out.add(symbol);
            if (asset.rateSymbol) out.add(asset.rateSymbol);
            const proxy = asset.meta && asset.meta.proxy;
            if (proxy && proxy.symbol) {
                out.add(proxy.symbol);
                if (proxy.rateSymbol) out.add(proxy.rateSymbol);
            }
        }
        return out;
    }

    async trackedSymbols() {
        const held = await this.heldSymbols();
        return this.withDependencies([...held, ...this.settings.preferences().watchlist]);
    }

    /** Stores today's quote as a daily close so charts reach "now" and gaps get filled. */
    async recordSnapshots(symbols) {
        const today = tehranDate();
        for (const symbol of symbols) {
            const asset = this.assets.get(symbol);
            if (!asset || asset.source !== 'market' || !(asset.price > 0) || !asset.quoteTime) continue;
            const date = tehranDate(asset.quoteTime);
            if (!date || date > today) continue;
            const price = asset.price;
            const existing = await this.store.getPrice(symbol, date);
            if (!existing) {
                await this.store.putPrice({ symbol, date, open: price, high: price, low: price, close: price, origin: 'snapshot' });
                this.history.delete(symbol);
            } else if (date === today && Number(existing.close) !== price) {
                await this.store.putPrice({
                    ...existing,
                    close: price,
                    high: Math.max(Number(existing.high) || price, price),
                    low: Math.min(Number(existing.low) || price, price),
                });
                this.history.delete(symbol);
            }
        }
    }

    /* ---------- history ---------- */

    historyDue(provider, entry) {
        if (!entry || entry.provider !== provider.id) return true;
        if (provider.backfillOnly) return false;
        return Date.now() - Date.parse(entry.at) > provider.historyRefreshMs;
    }

    async markHistory(symbol, entry) {
        await this.settings.set('historySync', { ...(this.settings.get('historySync') || {}), [symbol]: entry });
    }

    async refreshHistories(provider, symbols) {
        const errors = [];
        for (const symbol of symbols) {
            if (provider !== this.provider) break;
            if (!provider.hasHistory(symbol)) continue;
            if (!this.historyDue(provider, (this.settings.get('historySync') || {})[symbol])) continue;
            try {
                await this.fetchHistory(provider, symbol);
            } catch (error) {
                errors.push(symbol);
                this.logger.warn(`History for ${symbol} failed: ${error.message}`);
            }
        }
        return errors;
    }

    async fetchHistory(provider, symbol) {
        const key = `${provider.id}:${symbol}`;
        if (this.inflight.has(key)) return this.inflight.get(key);
        const task = (async () => {
            const from = await this.backfillStart();
            const rows = await provider.fetchHistory(symbol, { from });
            await this.storeHistory(symbol, rows);
            await this.markHistory(symbol, { at: new Date().toISOString(), provider: provider.id, count: rows.length });
            return rows.length;
        })().finally(() => this.inflight.delete(key));
        this.inflight.set(key, task);
        return task;
    }

    /** Earliest day a backfill should cover: a month before the first transaction, at least a year. */
    async backfillStart() {
        const first = await this.store.firstTransactionDate();
        const yearAgo = addMonths(tehranDate(), -12);
        if (!first) return yearAgo;
        const before = addDays(first, -31);
        return before < yearAgo ? before : yearAgo;
    }

    async storeHistory(symbol, rows) {
        if (!rows.length) return;
        const range = await this.store.providerPriceRange(symbol);
        const first = range && range.first;
        const rewriteFrom = range && range.last ? addDays(range.last, -7) : null;
        const toWrite = rows
            .filter((row) => !first || row.date < first || row.date >= rewriteFrom)
            .map((row) => ({ symbol, ...row, origin: 'provider' }));
        await this.store.upsertPrices(toWrite);
        this.history.delete(symbol);
    }

    /** Fetches the history of a symbol (and its rate/proxy symbols) if it is missing or old. */
    async ensureHistory(symbol) {
        const provider = this.provider;
        const asset = this.assets.get(symbol);
        if (!provider || !asset || asset.source !== 'market') return;
        try {
            if (typeof provider.prepare === 'function') await provider.prepare();
        } catch (error) {
            this.logger.warn(`Cannot prepare ${provider.id}: ${error.message}`);
            return;
        }
        for (const dependency of this.withDependencies([symbol])) {
            if (!provider.hasHistory(dependency)) continue;
            if (!this.historyDue(provider, (this.settings.get('historySync') || {})[dependency])) continue;
            try {
                await this.fetchHistory(provider, dependency);
            } catch (error) {
                this.logger.warn(`History for ${dependency} failed: ${error.message}`);
            }
        }
    }

    /** Native-currency daily closes of a symbol, oldest first (cached; never mutate the result). */
    async historyRows(symbol) {
        if (this.history.has(symbol)) return this.history.get(symbol);
        const series = (await this.store.listPrices(symbol)).map((row) => ({ date: row.date, close: Number(row.close) }));
        if (this.history.size >= HISTORY_CACHE_LIMIT) this.history.delete(this.history.keys().next().value);
        this.history.set(symbol, series);
        return series;
    }

    /** Daily toman closes of an asset, oldest first. */
    async seriesFor(symbol) {
        const asset = this.assets.get(symbol);
        if (!asset) return [];
        let series = await this.historyRows(symbol);
        if (asset.rateSymbol) series = convertSeries(series, await this.historyRows(asset.rateSymbol));
        const proxy = asset.meta && asset.meta.proxy;
        if (proxy && proxy.symbol) {
            let proxySeries = await this.historyRows(proxy.symbol);
            if (proxy.rateSymbol) proxySeries = convertSeries(proxySeries, await this.historyRows(proxy.rateSymbol));
            series = mergeSeries(proxySeries, series);
        }
        return series;
    }

    /** Market price of an asset on a given day (for pre-filling the transaction form). */
    async priceAt(symbol, date) {
        const asset = this.assets.get(symbol);
        if (!asset) throw notFound('این دارایی پیدا نشد');
        const today = tehranDate();
        const current = this.toman(asset).price;
        if (date >= today) return { price: current, date: today, exact: true };
        await this.ensureHistory(symbol);
        const series = await this.seriesFor(symbol);
        const point = closeAsOf(series, date);
        if (point && diffDays(point.date, date) <= 14) return { price: point.close, date: point.date, exact: point.date === date };
        if (!point && series.length && diffDays(date, series[0].date) <= 14) {
            return { price: series[0].close, date: series[0].date, exact: false };
        }
        if (asset.source === 'custom') return { price: current, date: null, exact: false };
        return { price: null, date: null, exact: false };
    }

    /* ---------- custom assets ---------- */

    validateCustom(input, { partial = false } = {}) {
        const out = {};
        if (!partial || input.name !== undefined) {
            const name = cleanText(input.name, 80);
            if (!name) throw badRequest('نام دارایی را وارد کنید');
            out.nameFa = name;
        }
        if (!partial || input.kind !== undefined) {
            out.kind = CUSTOM_KINDS.includes(input.kind) ? input.kind : 'other';
        }
        if (!partial || input.unit !== undefined) {
            out.unit = cleanText(input.unit, 24) || 'واحد';
        }
        if (!partial || input.price !== undefined) {
            const price = Number(input.price);
            if (!Number.isFinite(price) || price <= 0 || price > 1e18) throw badRequest('قیمت هر واحد باید عددی بزرگ‌تر از صفر باشد');
            out.price = price;
        }
        return out;
    }

    async recordManualPrice(symbol, price) {
        const date = tehranDate();
        await this.store.putPrice({ symbol, date, open: price, high: price, low: price, close: price, origin: 'manual' });
        this.history.delete(symbol);
    }

    async createCustomAsset(input) {
        const data = this.validateCustom(input);
        const symbol = `CUSTOM_${this.randomHex(5).toUpperCase()}`;
        const now = new Date();
        await this.store.insertAsset({
            symbol,
            source: 'custom',
            provider: null,
            nameFa: data.nameFa,
            nameEn: null,
            category: 'custom',
            currency: 'IRT',
            unit: data.unit,
            price: data.price,
            prevClose: null,
            high: null,
            low: null,
            quoteTime: now,
            stale: false,
            listed: true,
            rateSymbol: null,
            meta: { kind: data.kind },
            createdAt: now,
            updatedAt: now,
        });
        await this.recordManualPrice(symbol, data.price);
        await this.reloadAssets();
        return this.view(this.assets.get(symbol));
    }

    async updateCustomAsset(symbol, input) {
        const asset = this.assets.get(symbol);
        if (!asset || asset.source !== 'custom') throw notFound('دارایی دستی پیدا نشد');
        const data = this.validateCustom(input, { partial: true });
        const update = {};
        if (data.nameFa) update.nameFa = data.nameFa;
        if (data.unit) update.unit = data.unit;
        if (data.kind) update.meta = { ...asset.meta, kind: data.kind };
        if (data.price !== undefined && data.price !== asset.price) {
            update.prevClose = asset.price;
            update.price = data.price;
            update.quoteTime = new Date();
        }
        if (Object.keys(update).length) await this.store.updateAsset(symbol, { ...update, updatedAt: new Date() });
        if (update.price !== undefined) await this.recordManualPrice(symbol, update.price);
        await this.reloadAssets();
        return this.view(this.assets.get(symbol));
    }

    async deleteCustomAsset(symbol) {
        const asset = this.assets.get(symbol);
        if (!asset || asset.source !== 'custom') throw notFound('دارایی دستی پیدا نشد');
        const used = await this.store.countTransactions(symbol);
        if (used > 0) throw conflict('این دارایی تراکنش ثبت‌شده دارد؛ ابتدا تراکنش‌های آن را حذف کنید');
        await this.store.deletePrices(symbol);
        await this.store.deleteAsset(symbol);
        this.history.delete(symbol);
        await this.reloadAssets();
    }

    publicStatus() {
        return { ...this.status, running: Boolean(this.syncing) };
    }
}
