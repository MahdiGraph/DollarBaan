'use strict';

const config = require('../config');
const store = require('../store');
const { settingsCore, catalog } = require('../shared');

const { SettingsCore, MIRRORS, PROVIDER_IDS, MIN_REFRESH, MAX_REFRESH, RANGES } = settingsCore;

function clampInt(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

/** Initial preferences, taken from .env; everything is editable later from Settings. */
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
        watchlist: [...catalog.DEFAULT_WATCHLIST],
    };
}

module.exports = {
    settings: new SettingsCore({ store, defaults }),
    RANGES,
};
