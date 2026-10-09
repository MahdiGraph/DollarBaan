'use strict';

// End-to-end API test against a temporary SQLite database and a fake price provider.
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dollarbaan-test-'));
Object.assign(process.env, {
    DB_DIALECT: 'sqlite',
    SQLITE_PATH: path.join(tempDir, 'test.sqlite'),
    LOG_DIR: 'off',
    LOG_LEVEL: 'error',
    AUTH_USERNAME: 'tester',
    AUTH_PASSWORD: 'secret-pass-1',
});

// Optional: TEST_MYSQL_URL=mysql://user:pass@host:port/db runs the same suite on MySQL.
// The database is emptied first, so point it at a disposable test database only.
const mysqlUrl = process.env.TEST_MYSQL_URL ? new URL(process.env.TEST_MYSQL_URL) : null;
if (mysqlUrl) {
    Object.assign(process.env, {
        DB_DIALECT: 'mysql',
        DB_HOST: mysqlUrl.hostname,
        DB_PORT: mysqlUrl.port || '3306',
        DB_USER: decodeURIComponent(mysqlUrl.username),
        DB_PASSWORD: decodeURIComponent(mysqlUrl.password),
        DB_NAME: mysqlUrl.pathname.slice(1),
    });
}

const test = require('node:test');
const assert = require('node:assert/strict');
const { initDatabase, sequelize } = require('../server/db');
const { settings } = require('../server/services/settings');
const { market } = require('../server/services/market');
const { createApp } = require('../server/app');
const { tehranDate, addDays } = require('../public/assets/js/shared/dates.js');

const TODAY = tehranDate();

function weeklyHistory(from, to, startPrice, endPrice) {
    const rows = [];
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
    for (let day = 0; day <= days; day += 7) {
        const close = Math.round(startPrice + ((endPrice - startPrice) * day) / days);
        rows.push({ date: addDays(from, day), open: close, high: close, low: close, close });
    }
    return rows;
}

const HISTORY = new Map([
    ['USD_IRR_FREE', weeklyHistory(addDays(TODAY, -400), addDays(TODAY, -1), 60000, 99000)],
    ['XAU_USD', weeklyHistory(addDays(TODAY, -400), addDays(TODAY, -1), 3000, 3900)],
]);

const quote = (symbol, fields) => ({
    symbol, nameEn: symbol, currency: 'IRT', unit: 'unit', high: null, low: null, stale: false,
    time: new Date(), rateSymbol: null, proxy: null, ...fields,
});

class FakeProvider {
    constructor() {
        this.id = 'iran-market';
        this.backfillOnly = false;
        this.historyRefreshMs = 12 * 60 * 60 * 1000;
        this.calls = 0;
    }

    async prepare() {}

    async fetchLatest() {
        this.calls += 1;
        return {
            publishedAt: new Date().toISOString(),
            quotes: [
                quote('USD_IRR_FREE', { nameFa: 'دلار آمریکا', category: 'currency', price: 100000, prevClose: 98000 }),
                quote('USDT_IRR', { nameFa: 'تتر', category: 'crypto', price: 101000, prevClose: 100000 }),
                quote('GOLD_18K_IRR', { nameFa: 'طلای ۱۸ عیار', category: 'gold', unit: 'gram', price: 10000000, prevClose: 9900000 }),
                quote('XAU_USD', { nameFa: 'انس طلا', category: 'metal', currency: 'USD', unit: 'troy_ounce', price: 4000, prevClose: 3950, rateSymbol: 'USD_IRR_FREE' }),
            ],
        };
    }

    hasHistory(symbol) {
        return HISTORY.has(symbol);
    }

    async fetchHistory(symbol) {
        return HISTORY.get(symbol) || [];
    }

    async test() {
        return { publishedAt: null };
    }
}

let server;
let base;
let cookie = '';

async function call(method, url, body, { header = true, auth = true } = {}) {
    const headers = {};
    if (header) headers['X-Requested-With'] = 'DollarBaan';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && cookie) headers.Cookie = cookie;
    const response = await fetch(base + url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'manual',
    });
    const text = await response.text();
    let data = null;
    try {
        data = JSON.parse(text);
    } catch {
        data = null;
    }
    return { status: response.status, data, text, headers: response.headers };
}

test.before(async () => {
    if (mysqlUrl) await sequelize.getQueryInterface().dropAllTables();
    await initDatabase();
    await settings.load();
    await market.init();
    market.provider = new FakeProvider();
    await market.sync({ reason: 'test' });
    server = await new Promise((resolve) => {
        const instance = createApp().listen(0, '127.0.0.1', () => resolve(instance));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    market.stop();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

test('authentication, sessions and CSRF guard', async () => {
    assert.equal((await call('GET', '/api/portfolio')).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { username: 'tester', password: 'wrong' })).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { username: 'tester', password: 'secret-pass-1' }, { header: false })).status, 403);

    const login = await call('POST', '/api/auth/login', { username: 'tester', password: 'secret-pass-1' });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    cookie = setCookie.split(';')[0];

    const page = await fetch(`${base}/`, { headers: { Cookie: cookie }, redirect: 'manual' });
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    const anonymous = await fetch(`${base}/`, { redirect: 'manual' });
    assert.equal(anonymous.status, 302);
    assert.equal(anonymous.headers.get('location'), '/login');

    const me = await call('GET', '/api/auth/me');
    assert.equal(me.data.username, 'tester');
    assert.equal(me.data.defaultPassword, false);
});

test('catalog converts USD assets to toman', async () => {
    const { data } = await call('GET', '/api/assets');
    const bySymbol = new Map(data.map((asset) => [asset.symbol, asset]));
    assert.equal(bySymbol.get('USD_IRR_FREE').price, 100000);
    const ounce = bySymbol.get('XAU_USD');
    assert.equal(ounce.price, 4000 * 100000);
    assert.equal(ounce.prevClose, 3950 * 98000);
    assert.equal(ounce.nativePrice, 4000);

    const past = await call('GET', `/api/assets/USD_IRR_FREE/price?date=${addDays(TODAY, -200)}`);
    assert.ok(past.data.price > 60000 && past.data.price < 99000);
    const live = await call('GET', `/api/assets/USD_IRR_FREE/price?date=${TODAY}`);
    assert.equal(live.data.price, 100000);
    assert.equal((await call('GET', '/api/assets/NOPE/price')).status, 404);
});

test('transactions, oversell protection and portfolio', async () => {
    const buy = await call('POST', '/api/transactions', {
        symbol: 'USD_IRR_FREE', side: 'buy', quantity: 100, unitPrice: 80000, fee: 1000, date: addDays(TODAY, -100), note: 'first',
    });
    assert.equal(buy.status, 201);
    assert.equal(buy.data.name, 'دلار آمریکا');

    const oversell = await call('POST', '/api/transactions', {
        symbol: 'USD_IRR_FREE', side: 'sell', quantity: 150, unitPrice: 90000, date: addDays(TODAY, -50),
    });
    assert.equal(oversell.status, 400);
    assert.equal(oversell.data.code, 'oversell');

    const sell = await call('POST', '/api/transactions', {
        symbol: 'USD_IRR_FREE', side: 'sell', quantity: 40, unitPrice: 95000, date: addDays(TODAY, -10),
    });
    assert.equal(sell.status, 201);

    // Deleting the buy would leave the sale without holdings.
    assert.equal((await call('DELETE', `/api/transactions/${buy.data.id}`)).status, 400);
    assert.equal((await call('POST', '/api/transactions', { symbol: 'USD_IRR_FREE', side: 'buy', quantity: 1, unitPrice: 1, date: addDays(TODAY, 5) })).status, 400);
    assert.equal((await call('POST', '/api/transactions', { symbol: 'USD_IRR_FREE', side: 'buy', quantity: -1, unitPrice: 1, date: TODAY })).status, 400);

    const { data } = await call('GET', '/api/portfolio');
    const usd = data.holdings.find((row) => row.symbol === 'USD_IRR_FREE');
    assert.equal(usd.quantity, 60);
    const averageCost = (100 * 80000 + 1000) / 100;
    assert.ok(Math.abs(usd.avgCost - averageCost) < 1e-6);
    assert.ok(Math.abs(usd.realized - (40 * 95000 - 40 * averageCost)) < 1e-6);
    assert.equal(usd.value, 60 * 100000);
    assert.equal(data.totals.dayChange, 60 * (100000 - 98000));
    assert.deepEqual(data.allocation.map((item) => item.category), ['currency']);

    const timeline = await call('GET', '/api/portfolio/timeline?range=6m');
    assert.equal(timeline.status, 200);
    const last = timeline.data.points[timeline.data.points.length - 1];
    assert.equal(last.date, TODAY);
    assert.equal(last.value, 6000000);
    assert.ok(timeline.data.points[0].date >= addDays(TODAY, -100));
    assert.ok(timeline.data.performance);

    const update = await call('PUT', `/api/transactions/${sell.data.id}`, { ...sell.data, quantity: 50 });
    assert.equal(update.status, 200);
    assert.equal(update.data.quantity, 50);
});

test('custom assets', async () => {
    const created = await call('POST', '/api/custom-assets', { name: 'آپارتمان', kind: 'realestate', unit: 'واحد', price: 5000000000 });
    assert.equal(created.status, 201);
    assert.match(created.data.symbol, /^CUSTOM_[A-F0-9]{10}$/);

    const buy = await call('POST', '/api/transactions', { symbol: created.data.symbol, side: 'buy', quantity: 1, unitPrice: 4000000000, date: addDays(TODAY, -30) });
    assert.equal(buy.status, 201);

    const updated = await call('PUT', `/api/custom-assets/${created.data.symbol}`, { price: 6000000000 });
    assert.equal(updated.data.price, 6000000000);
    assert.equal(updated.data.prevClose, 5000000000);

    assert.equal((await call('DELETE', `/api/custom-assets/${created.data.symbol}`)).status, 409);
    const detail = await call('GET', `/api/assets/${created.data.symbol}`);
    assert.equal(detail.data.holding.value, 6000000000);
    assert.equal((await call('POST', '/api/custom-assets', { name: '', price: 1 })).status, 400);
});

test('backup export and import round trip', async () => {
    const exported = await call('GET', '/api/export');
    assert.equal(exported.data.app, 'DollarBaan');
    const count = exported.data.transactions.length;
    assert.ok(count >= 3);

    const merged = await call('POST', '/api/import', exported.data);
    assert.equal(merged.status, 200);
    assert.equal((await call('GET', '/api/transactions')).data.length, count);

    const replaced = await call('POST', '/api/import?mode=replace', { ...exported.data, transactions: exported.data.transactions.slice(0, 1) });
    assert.equal(replaced.status, 200);
    assert.equal((await call('GET', '/api/transactions')).data.length, 1);

    const csv = await fetch(`${base}/api/export.csv`, { headers: { Cookie: cookie } });
    const bytes = Buffer.from(await csv.arrayBuffer());
    // UTF-8 BOM so Excel shows Persian text correctly.
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.match(bytes.toString('utf8'), /USD_IRR_FREE/);

    assert.equal((await call('POST', '/api/import', { app: 'Other', transactions: [] })).status, 400);
    const unknown = await call('POST', '/api/import', { app: 'DollarBaan', transactions: [{ symbol: 'NOT_A_SYMBOL', side: 'buy', quantity: 1, unitPrice: 1, date: TODAY }] });
    assert.equal(unknown.status, 400);
});

test('settings validation and watchlist', async () => {
    assert.equal((await call('PUT', '/api/settings', { provider: 'navasan' })).status, 400);
    assert.equal((await call('PUT', '/api/settings', { refreshMinutes: 1 })).status, 400);
    assert.equal((await call('PUT', '/api/settings', { iranMarket: { mirror: 'custom', customUrl: 'ftp://x' } })).status, 400);

    const saved = await call('PUT', '/api/settings', { displayUnit: 'rial', chartRange: '1y', watchlist: ['USD_IRR_FREE', 'XAU_USD'] });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.preferences.displayUnit, 'rial');
    assert.equal(saved.data.preferences.navasan.apiKey, undefined);

    const watch = await call('GET', '/api/watchlist');
    assert.deepEqual(watch.data.map((item) => item.symbol), ['USD_IRR_FREE', 'XAU_USD']);
    assert.ok(watch.data[0].spark.length > 1);
});

test('password change signs out other sessions', async () => {
    const other = await call('POST', '/api/auth/login', { username: 'tester', password: 'secret-pass-1' }, { auth: false });
    const otherCookie = other.headers.get('set-cookie').split(';')[0];

    assert.equal((await call('POST', '/api/account/password', { current: 'wrong', next: 'another-pass-2' })).status, 400);
    assert.equal((await call('POST', '/api/account/password', { current: 'secret-pass-1', next: 'another-pass-2' })).status, 200);

    const stale = await fetch(`${base}/api/auth/me`, { headers: { Cookie: otherCookie } });
    assert.equal(stale.status, 401);
    assert.equal((await call('GET', '/api/auth/me')).status, 200);
    assert.equal((await call('POST', '/api/auth/login', { username: 'tester', password: 'secret-pass-1' }, { auth: false })).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { username: 'tester', password: 'another-pass-2' }, { auth: false })).status, 200);
});
