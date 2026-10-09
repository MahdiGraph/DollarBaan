import { IranMarketProvider } from './iran-market.js';
import { NavasanProvider } from './navasan.js';

export const PROVIDERS = [
    { id: 'iran-market', name: 'Iran Market', requiresKey: false },
    { id: 'navasan', name: 'نوسان', requiresKey: true },
];

/** Builds the price provider selected in the preferences. */
export function createProvider(preferences, { logger, fetchJson }) {
    if (preferences.provider === 'navasan') {
        return new NavasanProvider({ apiKey: preferences.navasan.apiKey, logger, fetchJson });
    }
    return new IranMarketProvider({
        mirror: preferences.iranMarket.mirror,
        customUrl: preferences.iranMarket.customUrl,
        logger,
        fetchJson,
    });
}
