// The in-app backend: the same data API as the Node server, running on the device.
// Data lives in IndexedDB; prices come straight from Iran Market (CORS-enabled JSON).
import { SettingsCore } from '../shared/core/settings.js';
import { MarketCore } from '../shared/core/market.js';
import { PortfolioCore } from '../shared/core/portfolio.js';
import { createRoutes } from '../shared/core/routes.js';
import { createProvider, PROVIDERS } from '../shared/providers/index.js';
import { DEFAULT_WATCHLIST } from '../shared/catalog.js';
import { AppError, HttpError, notFound } from '../shared/errors.js';
import { openStore } from './idb-store.js';
import { VERSION } from '../version.js';

const LOCAL_PROVIDERS = PROVIDERS.filter((provider) => provider.id === 'iran-market');
const REQUEST_TIMEOUT_MS = 60000;

function hostOf(url) {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

/** The browser revalidates with ETags itself (cache: 'no-cache'), so no ETag bookkeeping here. */
async function fetchJson(url) {
    let response;
    try {
        const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined;
        response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-cache', signal });
    } catch {
        throw new HttpError(`Request to ${hostOf(url)} failed`, { url });
    }
    if (!response.ok) throw new HttpError(`Request to ${hostOf(url)} failed with HTTP ${response.status}`, { status: response.status, url });
    try {
        return { data: await response.json(), etag: null };
    } catch {
        throw new HttpError(`Invalid JSON from ${hostOf(url)}`, { url });
    }
}

function randomHex(bytes) {
    const values = crypto.getRandomValues(new Uint8Array(bytes));
    return [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const hex = randomHex(16).split('');
    hex[12] = '4';
    hex[16] = '89ab'[parseInt(hex[16], 16) & 3];
    const s = hex.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const platform = {
    logger: {
        info: () => {},
        debug: () => {},
        warn: (message) => console.warn(`[DollarBaan] ${message}`),
        error: (message) => console.error(`[DollarBaan] ${message}`),
    },
    fetchJson,
    uuid,
    randomHex,
};

const defaults = () => ({
    provider: 'iran-market',
    iranMarket: { mirror: 'github', customUrl: '' },
    navasan: { apiKey: '' },
    refreshMinutes: 30,
    displayUnit: 'toman',
    chartRange: '6m',
    watchlist: [...DEFAULT_WATCHLIST],
});

function compile(routes) {
    return routes.map((route) => {
        const names = [];
        const pattern = route.path.replace(/[.]/g, '\\.').replace(/:(\w+)/g, (match, name) => {
            names.push(name);
            return '([^/]+)';
        });
        return { ...route, regex: new RegExp(`^${pattern}$`), names };
    });
}

async function start() {
    const store = await openStore();
    const settings = new SettingsCore({ store, defaults, providers: LOCAL_PROVIDERS.map((provider) => provider.id) });
    await settings.load();
    const makeProvider = (preferences) => createProvider(preferences, platform);
    const market = new MarketCore({ store, settings, platform, createProvider: makeProvider });
    await market.init();
    const portfolio = new PortfolioCore({ store, market, settings, platform, version: VERSION });

    const routes = compile([
        ...createRoutes({
            market,
            portfolio,
            settings,
            providers: LOCAL_PROVIDERS,
            createProvider: makeProvider,
            mode: 'local',
            version: VERSION,
            account: () => ({ username: null, defaultPassword: false }),
        }),
        {
            // Local-only: wipe this device's data (Settings › Data on this device).
            method: 'POST',
            path: '/local/reset',
            handler: async () => {
                market.stop();
                await store.clearAll();
                return { ok: true };
            },
        },
    ]);

    market.start();
    const syncIfStale = () => {
        if (market.isStale() && !market.syncing) market.sync({ reason: 'resume' });
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') syncIfStale();
    });
    window.addEventListener('online', syncIfStale);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    return { routes };
}

let backend = null;

/** Handles an API call ("/api/...") locally. Resolves with plain JSON data like the server. */
export async function handle(method, url, body) {
    if (!backend) backend = start();
    const { routes } = await backend;
    const parsed = new URL(url, 'http://local');
    const path = parsed.pathname.replace(/^\/api/, '');
    const query = Object.fromEntries(parsed.searchParams);
    for (const route of routes) {
        if (route.method !== method) continue;
        const match = route.regex.exec(path);
        if (!match) continue;
        const params = Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
        const result = await route.handler({ params, query, body, session: null });
        if (route.download) return result;
        return result === undefined ? null : JSON.parse(JSON.stringify(result));
    }
    throw notFound('مسیر پیدا نشد', 'not_found');
}

export { AppError };
