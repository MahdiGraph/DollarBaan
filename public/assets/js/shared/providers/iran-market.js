// Public, key-less JSON published by https://github.com/iran-market/iran-market.github.io
// Shared by the Node server and the in-app (local) backend.
import { tehranDate } from '../dates.js';

export const MIRRORS = {
    github: 'https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data',
    jsdelivr: 'https://cdn.jsdelivr.net/gh/iran-market/iran-market.github.io@main/data',
};

const INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_QUOTE_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const SOURCE_CATEGORIES = new Set(['currency', 'gold', 'coin', 'precious_metal', 'crypto', 'other']);

// Bubble values, intrinsic-value estimates and duplicate fund codes are not holdable assets.
const EXCLUDED = new Set(['SEKEE_REAL', 'GOLD_17_TRANSFER']);
// Melted gold (آبشده) and mesghal quotes are per mesghal even when the feed says gram.
const MESGHAL_SYMBOLS = new Set([
    'GOLD_MESGHAL_IRR', 'GOLD_17', 'GOLD_17_COIN', 'GOLD_FUTURES',
    'GOLD_WORLD_FUTURES', 'GOLD_MELTED_WHOLESALE', 'GOLD_MELTED_TRANSFER',
]);

const PAIR = /^([A-Z0-9]{2,10})_(IRR|USD)$/;

function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function cleanName(name) {
    return String(name).replace(/\s*\(بازار آزاد\)/g, '').replace(/\s+/g, ' ').trim();
}

function prettify(code) {
    return code.toLowerCase().split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function hasRealName(item) {
    return Boolean(item && item.name_fa && item.name_fa.trim() && item.name_fa.trim() !== item.symbol);
}

function resolveNames(item, bySymbol, pair) {
    const twin = pair ? bySymbol.get(`${pair[1]}_${pair[2] === 'IRR' ? 'USD' : 'IRR'}`) : null;
    let nameFa = hasRealName(item) ? cleanName(item.name_fa) : null;
    if (!nameFa && hasRealName(twin)) nameFa = cleanName(twin.name_fa);
    if (!nameFa && item.symbol.startsWith('CRYPTO_')) nameFa = prettify(item.symbol.slice(7));

    const englishOf = (source) => (source && source.name_en && source.name_en !== source.symbol ? source.name_en : null);
    const english = englishOf(item) || englishOf(twin);
    const nameEn = english
        ? english.replace(/\s*\(open market\)/i, '').trim()
        : (item.symbol.startsWith('CRYPTO_') ? prettify(item.symbol.slice(7)) : null);
    return { nameFa, nameEn };
}

function mapCategory(item, pair, bySymbol) {
    const { symbol, category, currency } = item;
    switch (category) {
        case 'currency':
            return currency === 'IRT' && (/_IRR_FREE$/.test(symbol) || /^PRICE_[A-Z]{3}$/.test(symbol)) ? 'currency' : null;
        case 'gold':
            if (currency !== 'IRT') return null;
            return symbol.startsWith('IME_FUND_') ? 'fund' : (/^GOLD_/.test(symbol) ? 'gold' : null);
        case 'coin':
            return currency === 'IRT' && (/^COIN_/.test(symbol) || /_DOWN$/.test(symbol)) ? 'coin' : null;
        case 'precious_metal':
            return 'metal';
        case 'crypto':
            return 'crypto';
        case 'other':
            // A few toman crypto pairs (ETH_IRR, XRP_IRR, ...) are filed under "other".
            return pair && pair[2] === 'IRR' && bySymbol.has(`${pair[1]}_USD`) ? 'crypto' : null;
        default:
            return null;
    }
}

/**
 * Turns latest-toman.json into DollarBaan quotes. Prices of IRT assets are in
 * toman; USD assets keep their dollar price plus the symbol used to convert it.
 */
export function normalizeLatest(payload, historySymbols = new Set(), now = Date.now()) {
    const categories = payload && payload.data && payload.data.categories;
    if (!categories || typeof categories !== 'object') {
        throw new Error('Unexpected latest-toman.json format');
    }

    const items = [];
    for (const [category, list] of Object.entries(categories)) {
        if (!SOURCE_CATEGORIES.has(category) || !Array.isArray(list)) continue;
        for (const item of list) if (item && typeof item.symbol === 'string') items.push(item);
    }
    const bySymbol = new Map(items.map((item) => [item.symbol, item]));

    const accepted = new Map();
    for (const item of items) {
        const { symbol } = item;
        const price = num(item.price);
        if (!(price > 0) || EXCLUDED.has(symbol)) continue;
        if (/^(DIFF|RATIO)_|_BUBBLE_/.test(symbol) || /^GC\d+$/.test(symbol)) continue;
        if (item.currency !== 'IRT' && item.currency !== 'USD') continue;

        const pair = PAIR.exec(symbol);
        const category = mapCategory(item, pair, bySymbol);
        if (!category) continue;

        const time = Date.parse(item.timestamp);
        if (Number.isFinite(time) && now - time > MAX_QUOTE_AGE_MS) continue;

        const { nameFa, nameEn } = resolveNames(item, bySymbol, pair);
        if (!nameFa) continue;

        const isUsd = item.currency === 'USD';
        let unit = item.unit || 'unit';
        if (MESGHAL_SYMBOLS.has(symbol)) unit = 'mesghal';
        if (category === 'fund') unit = 'unit';

        let proxy = null;
        if (!isUsd && pair && pair[2] === 'IRR' && category === 'crypto'
            && !historySymbols.has(symbol) && historySymbols.has(`${pair[1]}_USD`)) {
            proxy = { symbol: `${pair[1]}_USD`, rateSymbol: 'USDT_IRR' };
        }

        accepted.set(symbol, {
            symbol,
            nameFa,
            nameEn,
            category,
            currency: item.currency,
            unit,
            price,
            high: num(item.high),
            low: num(item.low),
            prevClose: num(item.prev_close),
            time: Number.isFinite(time) ? new Date(time) : null,
            stale: Boolean(item.stale),
            rateSymbol: isUsd ? (category === 'crypto' ? 'USDT_IRR' : 'USD_IRR_FREE') : null,
            proxy,
            pair,
        });
    }

    // Prefer the toman pair of a crypto asset over its dollar pair.
    const quotes = [];
    for (const quote of accepted.values()) {
        const { pair, ...rest } = quote;
        if (quote.currency === 'USD' && quote.category === 'crypto' && pair && accepted.has(`${pair[1]}_IRR`)) continue;
        quotes.push(rest);
    }
    return quotes;
}

export function normalizeIndex(payload) {
    const list = payload && Array.isArray(payload.data) ? payload.data : [];
    const index = new Map();
    for (const entry of list) {
        if (!entry || typeof entry.symbol !== 'string' || typeof entry.file !== 'string') continue;
        index.set(entry.symbol, {
            file: entry.file,
            currency: entry.currency || null,
            from: entry.from || null,
            to: entry.to || null,
            records: num(entry.records),
        });
    }
    return index;
}

export function normalizeHistory(payload) {
    const rows = payload && Array.isArray(payload.data) ? payload.data : [];
    const out = [];
    for (const row of rows) {
        const close = num(row.close);
        if (!(close > 0)) continue;
        const date = typeof row.t_tehran === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.t_tehran)
            ? row.t_tehran.slice(0, 10)
            : tehranDate(row.t);
        if (!date) continue;
        const open = num(row.open);
        const high = num(row.high);
        const low = num(row.low);
        out.push({
            date,
            open: open > 0 ? open : close,
            high: high > 0 ? high : close,
            low: low > 0 ? low : close,
            close,
        });
    }
    return out;
}

export function orderBases(mirror, customUrl) {
    const bases = [];
    const custom = String(customUrl || '').trim().replace(/\/+$/, '');
    if (mirror === 'custom' && custom) bases.push(custom);
    if (MIRRORS[mirror]) bases.push(MIRRORS[mirror]);
    for (const url of Object.values(MIRRORS)) if (!bases.includes(url)) bases.push(url);
    return bases;
}

export class IranMarketProvider {
    constructor({ mirror = 'github', customUrl = '', logger = console, fetchJson } = {}) {
        this.id = 'iran-market';
        this.name = 'Iran Market';
        this.bases = orderBases(mirror, customUrl);
        this.logger = logger;
        this.fetchJson = fetchJson;
        this.etagCache = new Map();
        this.index = null;
        this.indexLoadedAt = 0;
        // Published histories are rebuilt once a day; fetching them again sooner is wasted traffic.
        this.historyRefreshMs = 12 * 60 * 60 * 1000;
        this.backfillOnly = false;
    }

    async getFile(file, { cache = false } = {}) {
        let lastError;
        for (const base of this.bases) {
            const url = `${base}/${file}`;
            const cached = cache ? this.etagCache.get(url) : null;
            try {
                const result = await this.fetchJson(url, { etag: cached && cached.etag });
                if (result.notModified && cached) return cached.data;
                if (cache && result.etag) this.etagCache.set(url, { etag: result.etag, data: result.data });
                return result.data;
            } catch (error) {
                lastError = error;
                this.logger.warn(`Iran Market: ${error.message}`);
            }
        }
        throw lastError || new Error('No Iran Market mirror is configured');
    }

    async loadIndex({ force = false } = {}) {
        if (!force && this.index && Date.now() - this.indexLoadedAt < INDEX_TTL_MS) return this.index;
        try {
            this.index = normalizeIndex(await this.getFile('history/index.json', { cache: true }));
            this.indexLoadedAt = Date.now();
        } catch (error) {
            if (!this.index) throw error;
            this.logger.warn(`Iran Market: keeping cached history index (${error.message})`);
        }
        return this.index;
    }

    async fetchLatest() {
        const index = await this.loadIndex();
        const payload = await this.getFile('latest-toman.json', { cache: true });
        const quotes = normalizeLatest(payload, new Set(index.keys()));
        if (quotes.length === 0) throw new Error('Iran Market returned no usable prices');
        return {
            quotes,
            publishedAt: (payload.meta && payload.meta.published_at) || payload.data.generated_at || null,
        };
    }

    /** Loads what hasHistory() needs. */
    async prepare() {
        await this.loadIndex();
    }

    hasHistory(symbol) {
        return Boolean(this.index && this.index.has(symbol));
    }

    async fetchHistory(symbol) {
        const index = await this.loadIndex();
        const entry = index.get(symbol);
        if (!entry) return [];
        return normalizeHistory(await this.getFile(entry.file));
    }

    async test() {
        const payload = await this.getFile('popular.json');
        const count = Array.isArray(payload && payload.data) ? payload.data.length : 0;
        if (!count) throw new Error('Iran Market returned an empty response');
        return { publishedAt: payload.meta && payload.meta.published_at, sample: count };
    }
}
