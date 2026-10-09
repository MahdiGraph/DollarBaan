// User preferences and internal key/value state, stored through a storage adapter.
import { badRequest } from '../errors.js';

export const PROVIDER_IDS = ['iran-market', 'navasan'];
export const MIRRORS = ['github', 'jsdelivr', 'custom'];
export const UNITS = ['toman', 'rial'];
export const RANGES = ['1m', '3m', '6m', '1y', '3y', 'all'];
export const MIN_REFRESH = 5;
export const MAX_REFRESH = 7 * 24 * 60;
const SYMBOL = /^[A-Z0-9_]{1,64}$/;

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

export class SettingsCore {
    /**
     * @param {object} options
     * @param {object} options.store     storage adapter (listSettings, putSetting)
     * @param {Function} options.defaults returns the default preferences object
     * @param {string[]} [options.providers] provider ids this installation may use
     */
    constructor({ store, defaults, providers = PROVIDER_IDS }) {
        this.store = store;
        this.defaults = defaults;
        this.providers = providers;
        this.values = new Map();
    }

    async load() {
        const rows = await this.store.listSettings();
        this.values = new Map(rows.map((row) => [row.key, row.value]));
    }

    get(key, fallback = null) {
        return this.values.has(key) ? this.values.get(key) : fallback;
    }

    async set(key, value) {
        this.values.set(key, value);
        await this.store.putSetting(key, value);
    }

    preferences() {
        const base = this.defaults();
        const stored = this.get('preferences') || {};
        const merged = {
            ...base,
            ...stored,
            iranMarket: { ...base.iranMarket, ...(stored.iranMarket || {}) },
            navasan: { ...base.navasan, ...(stored.navasan || {}) },
            watchlist: Array.isArray(stored.watchlist) ? stored.watchlist : base.watchlist,
        };
        if (!this.providers.includes(merged.provider)) merged.provider = this.providers[0];
        return merged;
    }

    /** Preferences as sent to the browser: the Navasan key never leaves the backend. */
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
            if (!this.providers.includes(patch.provider)) throw badRequest('منبع داده انتخاب‌شده معتبر نیست');
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
