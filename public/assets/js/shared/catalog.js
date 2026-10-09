// Shared by the Node server and the in-app (local) backend.

// Fixed display order of asset categories. Chart colors follow this order, so
// a category keeps its color no matter which other categories are present.
export const CATEGORIES = ['currency', 'coin', 'metal', 'gold', 'fund', 'crypto', 'custom'];

// Most-used symbols first in pickers and market lists.
export const POPULAR = [
    'USD_IRR_FREE', 'EUR_IRR_FREE', 'GBP_IRR_FREE', 'AED_IRR_FREE', 'TRY_IRR_FREE',
    'CAD_IRR_FREE', 'AUD_IRR_FREE', 'CNY_IRR_FREE', 'CHF_IRR_FREE', 'JPY_IRR_FREE',
    'IQD_IRR_FREE', 'RUB_IRR_FREE', 'OMR_IRR_FREE', 'KWD_IRR_FREE', 'SAR_IRR_FREE',
    'COIN_EMAMI_IRR', 'COIN_BAHAR_IRR', 'COIN_HALF_IRR', 'COIN_QUARTER_IRR', 'COIN_GRAMI_IRR',
    'GOLD_18K_IRR', 'GOLD_24K_IRR', 'GOLD_MESGHAL_IRR', 'GOLD_USED_IRR', 'GOLD_18K_740_IRR',
    'GOLD_FUTURES', 'SILVER_999_IRR', 'SILVER_925_IRR', 'XAU_USD',
    'USDT_IRR', 'BTC_IRR', 'ETH_IRR', 'TON_IRR', 'TRX_IRR', 'SOL_IRR', 'BNB_IRR',
    'XRP_IRR', 'DOGE_IRR', 'ADA_IRR', 'USDC_IRR', 'LTC_IRR', 'DOT_IRR', 'AVAX_IRR', 'LINK_IRR',
];

export const DEFAULT_WATCHLIST = ['USD_IRR_FREE', 'EUR_IRR_FREE', 'GOLD_18K_IRR', 'COIN_EMAMI_IRR', 'USDT_IRR', 'BTC_IRR'];

// Kinds a user can pick for a custom (manually priced) asset.
export const CUSTOM_KINDS = ['cash', 'deposit', 'realestate', 'vehicle', 'stock', 'other'];

const popularRank = new Map(POPULAR.map((symbol, index) => [symbol, index]));

export function rankOf(symbol) {
    return popularRank.has(symbol) ? popularRank.get(symbol) : POPULAR.length;
}

export function categoryIndex(category) {
    const index = CATEGORIES.indexOf(category);
    return index === -1 ? CATEGORIES.length : index;
}

export function compareAssets(a, b) {
    return rankOf(a.symbol) - rankOf(b.symbol)
        || categoryIndex(a.category) - categoryIndex(b.category)
        || String(a.nameFa).localeCompare(String(b.nameFa), 'fa');
}
