'use strict';

// Both storage adapters must behave the same: Sequelize (server) and IndexedDB (desktop/mobile/web apps).
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollarbaan-store-'));
Object.assign(process.env, {
    DB_DIALECT: 'sqlite',
    SQLITE_PATH: path.join(tempDir, 'store.sqlite'),
    LOG_DIR: 'off',
    LOG_LEVEL: 'error',
});

require('fake-indexeddb/auto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { initDatabase, sequelize } = require('../server/db');
const serverStore = require('../server/store');
const { openStore } = require('../public/assets/js/local/idb-store.js');

const STAMP = new Date('2026-01-10T08:00:00Z');

const asset = (symbol, fields = {}) => ({
    symbol, source: 'market', provider: 'iran-market', nameFa: symbol, nameEn: symbol, category: 'currency',
    currency: 'IRT', unit: 'unit', price: 100, prevClose: 99, high: null, low: null, quoteTime: STAMP,
    stale: false, listed: true, rateSymbol: null, meta: {}, createdAt: STAMP, updatedAt: STAMP, ...fields,
});

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tx = (n, symbol, date, side = 'buy') => ({
    id: uuid(n), symbol, side, quantity: 2, unitPrice: 1000, fee: 0, date, note: '', createdAt: STAMP, updatedAt: STAMP,
});

const price = (symbol, date, close, origin = 'provider') => ({ symbol, date, open: close, high: close, low: close, close, origin });

const ids = (rows) => rows.map((row) => row.id).sort();
const pick = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key]]));
const assetView = (rows) => rows
    .map((row) => ({ ...pick(row, ['symbol', 'price', 'listed', 'nameFa', 'meta']), quoteTime: new Date(row.quoteTime).toISOString() }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

async function contract(store) {
    // Settings keep any JSON value; writing a key again replaces it.
    await store.putSetting('displayUnit', 'toman');
    await store.putSetting('watchlist', ['USD_IRR_FREE', 'BTC_IRR']);
    await store.putSetting('displayUnit', 'rial');
    assert.deepEqual((await store.listSettings()).sort((a, b) => a.key.localeCompare(b.key)), [
        { key: 'displayUnit', value: 'rial' },
        { key: 'watchlist', value: ['USD_IRR_FREE', 'BTC_IRR'] },
    ]);

    // Assets: upsert, unlist, custom assets with object meta.
    await store.upsertAssets([asset('USD_IRR_FREE', { meta: { proxy: 'x' } }), asset('BTC_IRR', { price: 9e9 })]);
    await store.upsertAssets([asset('USD_IRR_FREE', { price: 101 })]);
    await store.setListed(['BTC_IRR', 'MISSING'], false);
    await store.insertAsset(asset('CUSTOM_A1', { source: 'custom', provider: null, meta: { kind: 'car' } }));
    await store.updateAsset('CUSTOM_A1', { nameFa: 'خودرو', meta: { kind: 'car', unitLabel: 'دستگاه' } });
    assert.deepEqual(assetView(await store.listAssets()), [
        { symbol: 'BTC_IRR', price: 9e9, listed: false, nameFa: 'BTC_IRR', meta: {}, quoteTime: STAMP.toISOString() },
        { symbol: 'CUSTOM_A1', price: 100, listed: true, nameFa: 'خودرو', meta: { kind: 'car', unitLabel: 'دستگاه' }, quoteTime: STAMP.toISOString() },
        { symbol: 'USD_IRR_FREE', price: 101, listed: true, nameFa: 'USD_IRR_FREE', meta: {}, quoteTime: STAMP.toISOString() },
    ]);
    await store.deleteAsset('CUSTOM_A1');
    assert.deepEqual((await store.listAssets()).map((row) => row.symbol).sort(), ['BTC_IRR', 'USD_IRR_FREE']);

    // Transactions.
    assert.equal(await store.firstTransactionDate(), null);
    await store.insertTransaction(tx(1, 'USD_IRR_FREE', '2026-01-05'));
    await store.insertTransaction(tx(2, 'USD_IRR_FREE', '2026-02-05', 'sell'));
    await store.insertTransaction(tx(3, 'BTC_IRR', '2025-12-01'));
    await assert.rejects(store.insertTransaction(tx(3, 'BTC_IRR', '2025-12-02')));
    assert.deepEqual((await store.heldSymbols()).sort(), ['BTC_IRR', 'USD_IRR_FREE']);
    assert.equal(await store.firstTransactionDate(), '2025-12-01');
    assert.equal(await store.countTransactions('USD_IRR_FREE'), 2);
    assert.equal(await store.countTransactions('NOPE'), 0);
    assert.deepEqual(ids(await store.transactionsFor(['USD_IRR_FREE', 'USD_IRR_FREE'])), [uuid(1), uuid(2)]);
    await store.updateTransaction(uuid(1), { quantity: 7, note: 'edited', updatedAt: new Date() });
    const edited = await store.getTransaction(uuid(1));
    assert.deepEqual(pick(edited, ['symbol', 'side', 'quantity', 'note', 'date']), {
        symbol: 'USD_IRR_FREE', side: 'buy', quantity: 7, note: 'edited', date: '2026-01-05',
    });
    assert.equal(await store.getTransaction(uuid(99)), null);
    await store.deleteTransaction(uuid(2));
    assert.deepEqual(ids(await store.allTransactions()), [uuid(1), uuid(3)]);

    // Daily prices; a symbol that prefixes another must not leak into it.
    await store.upsertPrices([
        price('USD_IRR_FREE', '2026-01-02', 100),
        price('USD_IRR_FREE', '2026-01-01', 99),
        price('USD_IRR', '2026-01-01', 1),
    ]);
    await store.putPrice({ symbol: 'USD_IRR_FREE', date: '2026-01-03', open: null, high: null, low: null, close: 101, origin: 'manual' });
    await store.upsertPrices([price('USD_IRR_FREE', '2026-01-02', 100.5)]);
    await store.upsertPrices([]);
    assert.deepEqual(await store.listPrices('USD_IRR_FREE'), [
        { date: '2026-01-01', close: 99 },
        { date: '2026-01-02', close: 100.5 },
        { date: '2026-01-03', close: 101 },
    ]);
    assert.deepEqual(pick(await store.getPrice('USD_IRR_FREE', '2026-01-03'), ['symbol', 'date', 'close', 'origin']), {
        symbol: 'USD_IRR_FREE', date: '2026-01-03', close: 101, origin: 'manual',
    });
    assert.equal(await store.getPrice('USD_IRR_FREE', '2030-01-01'), null);
    assert.deepEqual(await store.providerPriceRange('USD_IRR_FREE'), { first: '2026-01-01', last: '2026-01-02' });
    assert.deepEqual(await store.providerPriceRange('NOPE'), { first: null, last: null });
    await store.deletePrices('USD_IRR_FREE');
    assert.deepEqual(await store.listPrices('USD_IRR_FREE'), []);
    assert.deepEqual(await store.listPrices('USD_IRR'), [{ date: '2026-01-01', close: 1 }]);

    // Backups: merge keeps existing transactions, replace swaps them, a bad backup changes nothing.
    const custom = asset('CUSTOM_B2', { source: 'custom', provider: null, meta: { kind: 'other' } });
    await store.importBackup({
        assets: [custom], prices: [price('CUSTOM_B2', '2026-01-01', 5, 'manual')], transactions: [tx(4, 'CUSTOM_B2', '2026-01-01')], replace: false,
    });
    assert.deepEqual(ids(await store.allTransactions()), [uuid(1), uuid(3), uuid(4)]);
    assert.deepEqual(await store.listPrices('CUSTOM_B2'), [{ date: '2026-01-01', close: 5 }]);
    await store.importBackup({ assets: [], prices: [], transactions: [tx(5, 'USD_IRR_FREE', '2026-03-01')], replace: true });
    assert.deepEqual(ids(await store.allTransactions()), [uuid(5)]);
    await assert.rejects(store.importBackup({
        assets: [asset('CUSTOM_C3', { source: 'custom' })], prices: [{ symbol: 'CUSTOM_C3', close: 1 }], transactions: [], replace: true,
    }));
    assert.deepEqual(ids(await store.allTransactions()), [uuid(5)]);
    assert.ok(!(await store.listAssets()).some((row) => row.symbol === 'CUSTOM_C3'));
}

test.after(async () => {
    await sequelize.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('server store (SQLite) follows the storage contract', async () => {
    await initDatabase();
    await contract(serverStore);
});

test('local store (IndexedDB) follows the storage contract', async () => {
    await contract(await openStore());
});

test('local store can wipe everything on the device', async () => {
    const store = await openStore();
    await store.putSetting('displayUnit', 'rial');
    await store.clearAll();
    assert.deepEqual(await store.listSettings(), []);
    assert.deepEqual(await store.listAssets(), []);
    assert.deepEqual(await store.allTransactions(), []);
});
