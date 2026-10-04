'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const iranMarket = require('../server/providers/iranMarket');
const navasan = require('../server/providers/navasan');

const NOW = Date.parse('2026-10-04T10:00:00Z');
const fresh = '2026-10-04T09:30:00.000Z';

function item(symbol, fields = {}) {
    return {
        symbol,
        name_fa: symbol,
        name_en: symbol,
        category: 'currency',
        currency: 'IRT',
        unit: 'unit',
        price: 100,
        high: 110,
        low: 90,
        prev_close: 95,
        timestamp: fresh,
        stale: false,
        ...fields,
    };
}

const latest = {
    meta: { published_at: '2026-10-04T10:00:01.000Z' },
    data: {
        categories: {
            currency: [
                item('USD_IRR_FREE', { name_fa: 'دلار آمریکا (بازار آزاد)', name_en: 'US Dollar (open market)', price: 270000 }),
                item('PRICE_ZMW', { name_fa: 'کواچا زامبیا' }),
                item('DIFF_USD_TRY', { name_fa: 'usd/try' }),
                item('ARSHINEXCHANGE_USD_SELL', { name_fa: 'صرافی آرشین' }),
                item('LBP_IRR_FREE', { name_fa: 'پوند لبنان', timestamp: '2021-01-01T00:00:00Z', stale: true }),
            ],
            gold: [
                item('GOLD_18K_IRR', { category: 'gold', name_fa: 'طلای ۱۸ عیار (هر گرم)', unit: 'gram' }),
                item('GOLD_FUTURES', { category: 'gold', name_fa: 'آبشده نقدی', unit: 'gram' }),
                item('IME_FUND_ZAR', { category: 'gold', name_fa: 'صندوق طلای زر', unit: 'gram' }),
                item('RATIO_SILVER', { category: 'gold', name_fa: 'برابری طلا / نقره' }),
                item('GOLD_17_TRANSFER', { category: 'gold', name_fa: 'حباب آبشده' }),
            ],
            coin: [
                item('COIN_EMAMI_IRR', { category: 'coin', name_fa: 'سکه امامی', unit: 'coin' }),
                item('COIN_EMAMI_BUBBLE_IRR', { category: 'coin', name_fa: 'حباب سکه امامی' }),
                item('GC70', { category: 'coin' }),
            ],
            precious_metal: [
                item('XAU_USD', { category: 'precious_metal', currency: 'USD', name_fa: 'انس طلا', unit: 'troy_ounce', price: 4100 }),
            ],
            crypto: [
                item('BTC_IRR', { category: 'crypto', name_fa: 'بیت‌کوین' }),
                item('BTC_USD', { category: 'crypto', currency: 'USD', name_fa: 'بیت‌کوین', name_en: 'Bitcoin' }),
                item('ETH_USD', { category: 'crypto', currency: 'USD', name_fa: 'اتریوم', name_en: 'Ethereum' }),
                item('CRYPTO_ZCASH', { category: 'crypto', currency: 'USD' }),
            ],
            other: [
                item('ETH_IRR', { category: 'other', price: 700000000 }),
                item('IME_OPTION_X', { category: 'other' }),
            ],
            commodity: [item('ZINC', { category: 'commodity', currency: 'USD' })],
        },
    },
};

test('Iran Market catalog keeps holdable assets only', () => {
    const quotes = iranMarket.normalizeLatest(latest, new Set(['ETH_USD', 'USD_IRR_FREE']), NOW);
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    const symbols = [...bySymbol.keys()].sort();
    assert.deepEqual(symbols, [
        'BTC_IRR', 'COIN_EMAMI_IRR', 'CRYPTO_ZCASH', 'ETH_IRR', 'GOLD_18K_IRR', 'GOLD_FUTURES',
        'IME_FUND_ZAR', 'PRICE_ZMW', 'USD_IRR_FREE', 'XAU_USD',
    ]);

    const usd = bySymbol.get('USD_IRR_FREE');
    assert.equal(usd.nameFa, 'دلار آمریکا');
    assert.equal(usd.nameEn, 'US Dollar');
    assert.equal(usd.prevClose, 95);
    assert.equal(usd.rateSymbol, null);

    assert.equal(bySymbol.get('GOLD_FUTURES').unit, 'mesghal');
    assert.equal(bySymbol.get('IME_FUND_ZAR').category, 'fund');
    assert.equal(bySymbol.get('IME_FUND_ZAR').unit, 'unit');

    const eth = bySymbol.get('ETH_IRR');
    assert.equal(eth.category, 'crypto');
    assert.equal(eth.nameFa, 'اتریوم');
    assert.equal(eth.nameEn, 'Ethereum');
    assert.deepEqual(eth.proxy, { symbol: 'ETH_USD', rateSymbol: 'USDT_IRR' });

    assert.equal(bySymbol.get('XAU_USD').rateSymbol, 'USD_IRR_FREE');
    assert.equal(bySymbol.get('CRYPTO_ZCASH').rateSymbol, 'USDT_IRR');
    assert.equal(bySymbol.get('CRYPTO_ZCASH').nameFa, 'Zcash');
    assert.equal(bySymbol.get('BTC_IRR').proxy, null);
});

test('Iran Market rejects malformed payloads', () => {
    assert.throws(() => iranMarket.normalizeLatest({ data: [] }), /format/);
});

test('Iran Market history uses the Tehran calendar day', () => {
    const rows = iranMarket.normalizeHistory({
        data: [
            { t: '2026-10-02T20:30:00.000Z', t_tehran: '2026-10-03T00:00:00+03:30', open: 1, high: 3, low: 1, close: 2 },
            { t: '2026-10-03T20:30:00.000Z', open: null, high: null, low: null, close: 5 },
            { t: '2026-10-04T20:30:00.000Z', close: null },
        ],
    });
    assert.deepEqual(rows, [
        { date: '2026-10-03', open: 1, high: 3, low: 1, close: 2 },
        { date: '2026-10-04', open: 5, high: 5, low: 5, close: 5 },
    ]);
    const index = iranMarket.normalizeIndex({ data: [{ symbol: 'USD_IRR_FREE', file: 'history/USD_IRR_FREE.json', records: '10' }, { symbol: 'X' }] });
    assert.equal(index.size, 1);
    assert.equal(index.get('USD_IRR_FREE').records, 10);
});

test('Iran Market mirror order puts the chosen one first', () => {
    const custom = iranMarket.orderBases('custom', 'https://mirror.example.com/data/');
    assert.equal(custom[0], 'https://mirror.example.com/data');
    assert.equal(custom.length, 3);
    assert.equal(iranMarket.orderBases('jsdelivr')[0], iranMarket.MIRRORS.jsdelivr);
    assert.equal(iranMarket.orderBases('custom', '')[0], iranMarket.MIRRORS.github);
});

test('Navasan quotes map to canonical symbols', () => {
    const quotes = navasan.normalizeLatest({
        usd_sell: { value: '270,000', change: 1000, timestamp: 1790000000, date: '1405-07-12 12:00:00' },
        sekkeh: { value: '275000000', change: -500000, timestamp: 1790000000 },
        bitcoin: { value: '85000', change: 10 },
        jpy: { value: '1700', change: 0 },
    });
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
    assert.deepEqual([...bySymbol.keys()].sort(), ['COIN_EMAMI_IRR', 'NV_JPY', 'USD_IRR_FREE']);
    assert.equal(bySymbol.get('USD_IRR_FREE').price, 270000);
    assert.equal(bySymbol.get('USD_IRR_FREE').prevClose, 269000);
    assert.equal(bySymbol.get('COIN_EMAMI_IRR').unit, 'coin');
    assert.throws(() => navasan.normalizeLatest({ error: 'invalid api key' }), /invalid api key/);
});

test('Navasan history dates come from timestamps', () => {
    const rows = navasan.normalizeHistory([
        { timestamp: 1759437000, date: '1404-07-11', open: '10', high: '12', low: '9', close: '11' },
        { timestamp: null, close: '5' },
    ]);
    assert.deepEqual(rows, [{ date: '2025-10-03', open: 10, high: 12, low: 9, close: 11 }]);
});

test('Navasan without a key fails with a clear message', async () => {
    const provider = new navasan.NavasanProvider({ apiKey: '' });
    await assert.rejects(provider.fetchLatest(), (error) => error.code === 'missing_key');
});
