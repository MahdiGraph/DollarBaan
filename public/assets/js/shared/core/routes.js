// The data API, shared by the Node server (Express) and the in-app backend.
// A route is { method, path, handler(ctx), status?, download? } with ctx = { params, query, body, session }.
// Handlers return JSON-serialisable data; download routes return { filename, type, body }.
import { RANGES } from './settings.js';
import { describeError } from './market.js';
import { CATEGORIES, CUSTOM_KINDS } from '../catalog.js';
import { isIsoDate, tehranDate } from '../dates.js';
import { badRequest } from '../errors.js';

const MANUAL_SYNC_COOLDOWN_MS = 60 * 1000;

/**
 * @param {object} deps
 * @param {object} deps.market, deps.portfolio, deps.settings  the cores
 * @param {object[]} deps.providers        providers offered by this installation
 * @param {Function} deps.createProvider   (preferences) => provider, for connection tests
 * @param {'server'|'local'} deps.mode
 * @param {string} deps.version
 * @param {Function} deps.account          (ctx) => { username, defaultPassword }
 * @param {Function} [deps.statusExtras]   () => extra fields for the status payload
 */
export function createRoutes({ market, portfolio, settings, providers, createProvider, mode, version, account, statusExtras }) {
    const rangeOf = (value) => (RANGES.includes(value) ? value : settings.preferences().chartRange);

    const statusPayload = () => {
        const status = market.publicStatus();
        const provider = providers.find((item) => item.id === (market.provider && market.provider.id));
        return {
            ...status,
            providerName: provider ? provider.name : null,
            today: tehranDate(),
            ...(statusExtras ? statusExtras() : {}),
        };
    };

    return [
        /* ---------- app shell ---------- */
        {
            method: 'GET',
            path: '/bootstrap',
            handler: (ctx) => ({
                mode,
                version,
                ...account(ctx),
                preferences: settings.publicPreferences(),
                providers,
                categories: CATEGORIES,
                customKinds: CUSTOM_KINDS,
                status: statusPayload(),
            }),
        },
        { method: 'GET', path: '/status', handler: () => statusPayload() },
        {
            method: 'POST',
            path: '/sync',
            handler: async () => {
                const last = Date.parse(market.status.lastAttemptAt);
                const recent = Number.isFinite(last) && Date.now() - last < MANUAL_SYNC_COOLDOWN_MS;
                if (!recent || market.syncing) await market.sync({ reason: 'manual' });
                return statusPayload();
            },
        },

        /* ---------- assets & market ---------- */
        {
            method: 'GET',
            path: '/assets',
            handler: async () => market.catalog([...await market.heldSymbols(), ...settings.preferences().watchlist]),
        },
        { method: 'GET', path: '/assets/:symbol', handler: ({ params }) => portfolio.getAssetDetail(params.symbol) },
        {
            method: 'GET',
            path: '/assets/:symbol/history',
            handler: ({ params, query }) => portfolio.getAssetHistory(params.symbol, rangeOf(query.range)),
        },
        {
            method: 'GET',
            path: '/assets/:symbol/price',
            handler: ({ params, query }) => {
                const date = String(query.date || tehranDate());
                if (!isIsoDate(date)) throw badRequest('تاریخ معتبر نیست');
                return market.priceAt(params.symbol, date);
            },
        },
        { method: 'GET', path: '/watchlist', handler: () => portfolio.getWatchlist() },
        { method: 'POST', path: '/custom-assets', status: 201, handler: ({ body }) => market.createCustomAsset(body || {}) },
        { method: 'PUT', path: '/custom-assets/:symbol', handler: ({ params, body }) => market.updateCustomAsset(params.symbol, body || {}) },
        { method: 'DELETE', path: '/custom-assets/:symbol', status: 204, handler: ({ params }) => market.deleteCustomAsset(params.symbol) },

        /* ---------- portfolio ---------- */
        { method: 'GET', path: '/portfolio', handler: () => portfolio.getPortfolio() },
        { method: 'GET', path: '/portfolio/timeline', handler: ({ query }) => portfolio.getTimeline(rangeOf(query.range)) },
        {
            method: 'GET',
            path: '/transactions',
            handler: ({ query }) => {
                const limit = parseInt(query.limit, 10);
                return portfolio.listTransactions({ limit: limit > 0 ? Math.min(limit, 1000) : undefined });
            },
        },
        { method: 'POST', path: '/transactions', status: 201, handler: ({ body }) => portfolio.createTransaction(body) },
        { method: 'PUT', path: '/transactions/:id', handler: ({ params, body }) => portfolio.updateTransaction(params.id, body) },
        { method: 'DELETE', path: '/transactions/:id', status: 204, handler: ({ params }) => portfolio.deleteTransaction(params.id) },

        /* ---------- settings ---------- */
        {
            method: 'GET',
            path: '/settings',
            handler: () => ({ preferences: settings.publicPreferences(), providers, status: statusPayload() }),
        },
        {
            method: 'PUT',
            path: '/settings',
            handler: async ({ body }) => {
                const { before, after } = await settings.updatePreferences(body);
                await market.applyPreferences(before, after);
                return { preferences: settings.publicPreferences(), status: statusPayload() };
            },
        },
        {
            method: 'POST',
            path: '/settings/test-provider',
            handler: async ({ body = {} }) => {
                const current = settings.preferences();
                const providerId = providers.some((item) => item.id === body.provider) ? body.provider : current.provider;
                const candidate = {
                    ...current,
                    provider: providerId,
                    iranMarket: { ...current.iranMarket, ...(body.iranMarket || {}) },
                    navasan: {
                        apiKey: body.navasan && typeof body.navasan.apiKey === 'string' && body.navasan.apiKey.trim()
                            ? body.navasan.apiKey.trim()
                            : current.navasan.apiKey,
                    },
                };
                const provider = createProvider(candidate);
                try {
                    const result = await provider.test();
                    return { ok: true, publishedAt: result.publishedAt || null };
                } catch (error) {
                    return { ok: false, error: describeError(error, provider) };
                }
            },
        },

        /* ---------- backup ---------- */
        {
            method: 'GET',
            path: '/export',
            download: true,
            handler: async () => ({
                filename: `dollarbaan-backup-${tehranDate()}.json`,
                type: 'application/json; charset=utf-8',
                body: JSON.stringify(await portfolio.exportData(), null, 2),
            }),
        },
        {
            method: 'GET',
            path: '/export.csv',
            download: true,
            handler: async () => ({
                filename: `dollarbaan-transactions-${tehranDate()}.csv`,
                type: 'text/csv; charset=utf-8',
                body: await portfolio.exportCsv(),
            }),
        },
        {
            method: 'POST',
            path: '/import',
            handler: ({ query, body }) => portfolio.importData(body, { mode: query.mode === 'replace' ? 'replace' : 'merge' }),
        },
    ];
}
