'use strict';

const { IranMarketProvider } = require('./iranMarket');
const { NavasanProvider } = require('./navasan');

const PROVIDERS = [
    { id: 'iran-market', name: 'Iran Market', requiresKey: false },
    { id: 'navasan', name: 'نوسان', requiresKey: true },
];

function createProvider(settings, logger) {
    if (settings.provider === 'navasan') {
        return new NavasanProvider({ apiKey: settings.navasan.apiKey, logger });
    }
    return new IranMarketProvider({
        mirror: settings.iranMarket.mirror,
        customUrl: settings.iranMarket.customUrl,
        logger,
    });
}

module.exports = { PROVIDERS, createProvider };
