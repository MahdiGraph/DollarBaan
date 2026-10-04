'use strict';

const config = require('../config');
const { Setting } = require('../db');
const { DEFAULT_WATCHLIST } = require('../catalog');
const { badRequest } = require('../lib/errors');

const PROVIDER_IDS = ['iran-market', 'navasan'];
const MIRRORS = ['github', 'jsdelivr', 'custom'];
const UNITS = ['toman', 'rial'];
const RANGES = ['1m', '3m', '6m', '1y', '3y', 'all'];
const MIN_REFRESH = 5;
const MAX_REFRESH = 7 * 24 * 60;
const SYMBOL = /^[A-Z0-9_]{1,64}$/;

function clampInt(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function defaults() {
    const { defaults: env } = config;
    const customUrl = env.iranMarketBaseUrl || '';
    let mirror = MIRRORS.includes(env.iranMarketMirror) ? env.iranMarketMirror : 'github';
    if (customUrl && !process.env.IRAN_MARKET_MIRROR) mirror = 'custom';
    return {
        provider: PROVIDER_IDS.includes(env.provider) ? env.provider : 'iran-market',
        iranMarket: { mirror, customUrl },
        navasan: { apiKey: env.navasanApiKey || '' },
        refreshMinutes: clampInt(env.refreshMinutes, MIN_REFRESH, MAX_REFRESH, 30),
        displayUnit: 'toman',
        chartRange: '6m',
        watchlist: [...DEFAULT_WATCHLIST],
    };
}

function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function maskKey(key) {
    if (!key) return '';
    return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`;
}

class SettingsStore {
    constructor() {
        this.values = new Map();
    }

    async load() {
        const rows = await Setting.findAll();
        this.values.clear();
        for (const row of rows) {
            try {
                this.values.set(row.key, row.value === null ? null : JSON.parse(row.value));
            } catch {
                this.values.set(row.key, null);
            }
        }
    }

    get(key, fallback = null) {
        return this.values.has(key) ? this.values.get(key) : fallback;
    }

    async set(key, value) {
        this.values.set(key, value);
        await Setting.upsert({ key, value: JSON.stringify(value) });
    }

    preferences() {
        const base = defaults();
        const stored = this.get('preferences') || {};
        return {
            ...base,
            ...stored,
            iranMarket: { ...base.iranMarket, ...(stored.iranMarket || {}) },
            navasan: { ...base.navasan, ...(stored.navasan || {}) },
            watchlist: Array.isArray(stored.watchlist) ? stored.watchlist : base.watchlist,
        };
    }

    /** Preferences as sent to the browser: the Navasan key never leaves the server. */
    publicPreferences() {
        const prefs = this.preferences();
        return {
            ...prefs,
            navasan: { hasKey: Boolean(prefs.navasan.apiKey), keyHint: maskKey(prefs.navasan.apiKey) },
        };
    }

    async updatePreferences(patch) {
        if (!patch || typeof patch !== 'object') throw badRequest('تنظیمات ارسال‌شده معتبر نیست');
        const current = this.preferences();
        const next = {
            ...current,
            iranMarket: { ...current.iranMarket },
            navasan: { ...current.navasan },
        };

        if (patch.provider !== undefined) {
            if (!PROVIDER_IDS.includes(patch.provider)) throw badRequest('منبع داده انتخاب‌شده معتبر نیست');
            next.provider = patch.provider;
        }
        if (patch.iranMarket !== undefined) {
            const { mirror, customUrl } = patch.iranMarket || {};
            if (mirror !== undefined) {
                if (!MIRRORS.includes(mirror)) throw badRequest('آدرس منبع Iran Market معتبر نیست');
                next.iranMarket.mirror = mirror;
            }
            if (customUrl !== undefined) next.iranMarket.customUrl = String(customUrl || '').trim();
            if (next.iranMarket.mirror === 'custom' && !isHttpUrl(next.iranMarket.customUrl)) {
                throw badRequest('برای آینه اختصاصی یک آدرس http یا https معتبر وارد کنید');
            }
        }
        if (patch.navasan !== undefined && patch.navasan && patch.navasan.apiKey !== undefined) {
            const key = String(patch.navasan.apiKey || '').trim();
            if (key.length > 200) throw badRequest('کلید API نوسان بیش از حد طولانی است');
            next.navasan.apiKey = key;
        }
        if (patch.refreshMinutes !== undefined) {
            const minutes = parseInt(patch.refreshMinutes, 10);
            if (!Number.isFinite(minutes) || minutes < MIN_REFRESH || minutes > MAX_REFRESH) {
                throw badRequest('بازه به‌روزرسانی باید بین ۵ دقیقه تا ۷ روز باشد');
            }
            next.refreshMinutes = minutes;
        }
        if (patch.displayUnit !== undefined) {
            if (!UNITS.includes(patch.displayUnit)) throw badRequest('واحد نمایش معتبر نیست');
            next.displayUnit = patch.displayUnit;
        }
        if (patch.chartRange !== undefined) {
            if (!RANGES.includes(patch.chartRange)) throw badRequest('بازه نمودار معتبر نیست');
            next.chartRange = patch.chartRange;
        }
        if (patch.watchlist !== undefined) {
            if (!Array.isArray(patch.watchlist)) throw badRequest('فهرست دیده‌بان معتبر نیست');
            const symbols = [...new Set(patch.watchlist.map(String))];
            if (symbols.length > 40 || symbols.some((symbol) => !SYMBOL.test(symbol))) {
                throw badRequest('فهرست دیده‌بان معتبر نیست');
            }
            next.watchlist = symbols;
        }
        if (next.provider === 'navasan' && !next.navasan.apiKey) {
            throw badRequest('برای استفاده از نوسان ابتدا کلید API را وارد کنید');
        }

        await this.set('preferences', next);
        return { before: current, after: next };
    }
}

module.exports = {
    settings: new SettingsStore(),
    RANGES,
};
