'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../server/services/ledger');

const tx = (overrides) => ({
    id: Math.random().toString(36).slice(2),
    symbol: 'USD',
    side: 'buy',
    quantity: 1,
    unitPrice: 100,
    fee: 0,
    date: '2025-01-01',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
});

test('average cost and realized profit', () => {
    const transactions = [
        tx({ quantity: 10, unitPrice: 100, date: '2025-01-01' }),
        tx({ quantity: 10, unitPrice: 200, date: '2025-02-01', fee: 50 }),
        tx({ side: 'sell', quantity: 5, unitPrice: 300, date: '2025-03-01', fee: 10 }),
    ];
    const state = ledger.replay(transactions).get('USD');
    // cost before the sale: 1000 + 2000 + 50 = 3050 for 20 units (avg 152.5)
    assert.equal(state.quantity, 15);
    assert.equal(state.cost, 3050 - 152.5 * 5);
    assert.equal(state.realized, 5 * 300 - 10 - 152.5 * 5);
    assert.equal(state.bought, 3050);
    assert.equal(state.fees, 60);
});

test('selling everything closes the position', () => {
    const state = ledger.replay([
        tx({ quantity: 0.3, unitPrice: 10 }),
        tx({ side: 'sell', quantity: 0.3, unitPrice: 20, date: '2025-02-01' }),
    ]).get('USD');
    assert.equal(state.quantity, 0);
    assert.equal(state.cost, 0);
    assert.ok(Math.abs(state.realized - 3) < 1e-9);
});

test('same-day buy is applied before the sell', () => {
    const transactions = [
        tx({ side: 'sell', quantity: 1, unitPrice: 120, date: '2025-05-05', createdAt: new Date('2025-05-05T08:00:00Z') }),
        tx({ side: 'buy', quantity: 1, unitPrice: 100, date: '2025-05-05', createdAt: new Date('2025-05-05T09:00:00Z') }),
    ];
    assert.equal(ledger.findOversell(transactions), null);
    assert.equal(ledger.replay(transactions).get('USD').realized, 20);
});

test('findOversell reports the first sale exceeding the holding', () => {
    const transactions = [
        tx({ quantity: 2, date: '2025-01-01' }),
        tx({ side: 'sell', quantity: 1, date: '2025-02-01' }),
        tx({ side: 'sell', quantity: 1.5, date: '2025-03-01' }),
        tx({ symbol: 'GOLD', quantity: 1, date: '2025-01-01' }),
    ];
    const issue = ledger.findOversell(transactions);
    assert.equal(issue.symbol, 'USD');
    assert.equal(issue.date, '2025-03-01');
    assert.equal(issue.available, 1);
    // floating point leftovers are tolerated
    assert.equal(ledger.findOversell([tx({ quantity: 0.1 }), tx({ quantity: 0.2 }), tx({ side: 'sell', quantity: 0.3, date: '2025-02-01' })]), null);
});

test('summarize computes values, weights and day change', () => {
    const transactions = [
        tx({ symbol: 'USD', quantity: 10, unitPrice: 100 }),
        tx({ symbol: 'GOLD', quantity: 1, unitPrice: 1000 }),
        tx({ symbol: 'GOLD', side: 'sell', quantity: 1, unitPrice: 1500, date: '2025-02-01' }),
        tx({ symbol: 'BTC', quantity: 2, unitPrice: 50 }),
    ];
    const quotes = new Map([
        ['USD', { price: 150, prevClose: 140 }],
        ['GOLD', { price: 2000, prevClose: null }],
    ]);
    const { totals, holdings, closed } = ledger.summarize(transactions, quotes);
    assert.equal(holdings.length, 2);
    assert.equal(closed.length, 1);
    assert.equal(closed[0].symbol, 'GOLD');
    assert.equal(closed[0].realized, 500);

    const usd = holdings.find((row) => row.symbol === 'USD');
    assert.equal(usd.value, 1500);
    assert.equal(usd.unrealized, 500);
    assert.equal(usd.dayChange, 100);
    // BTC has no quote: valued at its last trade price instead of zero
    const btc = holdings.find((row) => row.symbol === 'BTC');
    assert.equal(btc.value, 100);
    assert.equal(btc.hasQuote, false);

    assert.equal(totals.value, 1600);
    assert.equal(totals.cost, 1100);
    assert.equal(totals.realized, 500);
    assert.equal(totals.pnl, 1000);
    assert.equal(totals.invested, 2100);
    assert.ok(Math.abs(usd.weight - (1500 / 1600) * 100) < 1e-9);
    assert.equal(holdings[0].symbol, 'USD');
});

test('sampleDates is anchored to the end date and bounded', () => {
    const dates = ledger.sampleDates('2024-01-01', '2026-01-01', 50);
    assert.ok(dates.length <= 50);
    assert.equal(dates[dates.length - 1], '2026-01-01');
    assert.ok(dates[0] >= '2024-01-01');
    assert.deepEqual(ledger.sampleDates('2025-01-01', '2025-01-03', 10), ['2025-01-01', '2025-01-02', '2025-01-03']);
    assert.deepEqual(ledger.sampleDates('2025-01-05', '2025-01-05'), ['2025-01-05']);
});

test('buildTimeline values holdings with the newest observation', () => {
    const transactions = [
        tx({ quantity: 2, unitPrice: 100, date: '2025-01-02' }),
        tx({ side: 'sell', quantity: 1, unitPrice: 130, date: '2025-01-04' }),
    ];
    const series = new Map([['USD', [
        { date: '2025-01-01', close: 90 },
        { date: '2025-01-03', close: 120 },
        { date: '2025-01-05', close: 140 },
    ]]]);
    const points = ledger.buildTimeline({
        transactions,
        seriesBySymbol: series,
        currentPrices: new Map([['USD', 150]]),
        dates: ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04', '2025-01-06'],
        today: '2025-01-06',
    });
    assert.deepEqual(points.map((point) => point.value), [0, 200, 240, 130, 150]);
    assert.deepEqual(points.map((point) => point.invested), [0, 200, 200, 100, 100]);
    assert.deepEqual(points.map((point) => point.realized), [0, 0, 0, 30, 30]);

    const performance = ledger.windowPerformance(points.slice(2), transactions);
    // from 01-03 (value 240, cost 200) to 01-06 (value 150, cost 100, realized 30)
    assert.equal(performance.pnl, (150 - 100 + 30) - (240 - 200));
});

test('series helpers convert, merge and look up', () => {
    const usd = [{ date: '2025-01-01', close: 2 }, { date: '2025-01-03', close: 3 }];
    const rate = [{ date: '2025-01-02', close: 100 }, { date: '2025-01-03', close: 110 }];
    assert.deepEqual(ledger.convertSeries(usd, rate), [{ date: '2025-01-03', close: 330 }]);
    const merged = ledger.mergeSeries([{ date: '2025-01-01', close: 1 }, { date: '2025-01-02', close: 2 }], [{ date: '2025-01-02', close: 5 }]);
    assert.deepEqual(merged, [{ date: '2025-01-01', close: 1 }, { date: '2025-01-02', close: 5 }]);
    assert.equal(ledger.closeAsOf(merged, '2025-01-05').close, 5);
    assert.equal(ledger.closeAsOf(merged, '2024-12-31'), null);
});
