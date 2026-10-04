'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const env = process.env;

function str(value, fallback) {
    if (value === undefined || value === null) return fallback;
    const trimmed = String(value).trim();
    return trimmed === '' ? fallback : trimmed;
}

function int(value, fallback) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback) {
    if (value === undefined || String(value).trim() === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

// The old .env.template shipped this placeholder; treat it as "no key".
function navasanKey() {
    const key = str(env.NAVASAN_API_KEY, str(env.API_KEY, ''));
    return key === 'YOUR_NAVASAN_API_KEY' ? '' : key;
}

const pkg = require('../package.json');

module.exports = Object.freeze({
    root: ROOT,
    version: pkg.version,

    port: int(env.PORT, 3000),
    host: str(env.HOST, undefined),
    trustProxy: bool(env.TRUST_PROXY, false),
    // auto: mark the cookie Secure only when the request arrived over HTTPS.
    cookieSecure: str(env.COOKIE_SECURE, 'auto').toLowerCase(),
    sessionMaxAgeMs: int(env.SESSION_MAX_AGE, 7 * 24 * 60 * 60 * 1000),

    auth: {
        username: str(env.AUTH_USERNAME, 'admin'),
        password: str(env.AUTH_PASSWORD, 'changeit'),
    },

    db: {
        dialect: str(env.DB_DIALECT, 'sqlite').toLowerCase(),
        storage: path.resolve(ROOT, str(env.SQLITE_PATH, './database.sqlite')),
        name: str(env.DB_NAME, 'dollarbaan'),
        user: str(env.DB_USER, 'root'),
        password: env.DB_PASSWORD || '',
        host: str(env.DB_HOST, 'localhost'),
        port: int(env.DB_PORT, 3306),
    },

    log: {
        level: str(env.LOG_LEVEL, 'info'),
        // LOG_DIR=off keeps logs on stdout only (handy for Docker).
        dir: ['off', 'none', 'false'].includes(String(env.LOG_DIR).trim().toLowerCase()) ? null : str(env.LOG_DIR, './logs'),
    },

    http: {
        timeoutMs: int(env.HTTP_TIMEOUT, 60000),
    },

    // Initial values for settings that are editable later from the Settings page.
    defaults: {
        provider: str(env.PRICE_PROVIDER, 'iran-market'),
        iranMarketMirror: str(env.IRAN_MARKET_MIRROR, 'github'),
        iranMarketBaseUrl: str(env.IRAN_MARKET_BASE_URL, ''),
        navasanApiKey: navasanKey(),
        refreshMinutes: int(env.REFRESH_INTERVAL_MINUTES, 30),
    },
});
