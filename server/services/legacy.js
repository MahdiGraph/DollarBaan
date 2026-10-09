'use strict';

// One-time import of DollarBaan 1.x data. Version 1 stored each investment as a toman
// amount on a date, keyed by Navasan item names, and derived the units from that day's
// price. Here every investment becomes a "buy" of quantity = amount / price-on-date,
// so the invested amount is preserved exactly. The old tables are left untouched.

const { QueryTypes } = require('sequelize');
const { sequelize, Transaction, Setting, PricePoint, listTables } = require('../db');
const { market } = require('./market');
const { settings } = require('./settings');
const { ledger, dates } = require('../shared');
const logger = require('../logger');

const { closeAsOf } = ledger;
const { tehranDate, isIsoDate, diffDays } = dates;

const LEGACY_SYMBOLS = {
    usd_sell: 'USD_IRR_FREE', usd: 'USD_IRR_FREE',
    eur_sell: 'EUR_IRR_FREE', eur: 'EUR_IRR_FREE',
    gbp: 'GBP_IRR_FREE', cad: 'CAD_IRR_FREE', aud: 'AUD_IRR_FREE', try: 'TRY_IRR_FREE',
    aed_sell: 'AED_IRR_FREE', aed: 'AED_IRR_FREE', dirham_dubai: 'AED_IRR_FREE',
    cny: 'CNY_IRR_FREE', chf: 'CHF_IRR_FREE', sek: 'SEK_IRR_FREE', nok: 'NOK_IRR_FREE',
    dkk: 'DKK_IRR_FREE', rub: 'RUB_IRR_FREE', sar: 'SAR_IRR_FREE', qar: 'QAR_IRR_FREE',
    omr: 'OMR_IRR_FREE', bhd: 'BHD_IRR_FREE', kwd: 'KWD_IRR_FREE', inr: 'INR_IRR_FREE',
    myr: 'MYR_IRR_FREE', sgd: 'SGD_IRR_FREE', hkd: 'HKD_IRR_FREE', nzd: 'NZD_IRR_FREE',
    afn: 'AFN_IRR_FREE', azn: 'AZN_IRR_FREE', amd: 'AMD_IRR_FREE', gel: 'GEL_IRR_FREE',
    sekkeh: 'COIN_EMAMI_IRR', bahar: 'COIN_BAHAR_IRR', coin: 'COIN_BAHAR_IRR',
    nim: 'COIN_HALF_IRR', rob: 'COIN_QUARTER_IRR', gerami: 'COIN_GRAMI_IRR',
    '18ayar': 'GOLD_18K_IRR', gold: 'GOLD_18K_IRR', abshodeh: 'GOLD_MESGHAL_IRR',
    usdt: 'USDT_IRR', bitcoin: 'BTC_IRR', btc: 'BTC_IRR', ethereum: 'ETH_IRR', eth: 'ETH_IRR',
    ltc: 'LTC_IRR', xrp: 'XRP_IRR', bch: 'BCH_IRR', bnb: 'BNB_IRR', eos: 'EOS_IRR',
    ada: 'ADA_IRR', dash: 'DASH_IRR', doge: 'DOGE_IRR', shib: 'SHIB_IRR', avax: 'AVAX_IRR',
    sol: 'SOL_IRR', trx: 'TRX_IRR', dot: 'DOT_IRR', link: 'LINK_IRR', xlm: 'XLM_IRR',
    ton: 'TON_IRR', xmr: 'XMR_IRR',
};

// Display names DollarBaan 1.x used, for items that become custom assets.
const LEGACY_NAMES = {
    jpy: 'ین ژاپن', krw: 'وون کره', iqd: 'دینار عراق', eur_hav: 'حواله یورو', eur_pp: 'یورو پی پال',
    gbp_hav: 'حواله پوند انگلیس', cad_hav: 'حواله دلار کانادا', aud_hav: 'حواله دلار استرالیا',
    try_hav: 'حواله لیر ترکیه', cny_hav: 'حواله یوان چین', jpy_hav: 'حواله ین ژاپن',
    myr_hav: 'حواله رینگیت مالزی', harat_naghdi_sell: 'دلار هرات', dolar_harat_sell: 'دلار هرات نقد',
    dolar_soleimanie_sell: 'دلار سلیمانیه', dolar_kordestan_sell: 'دلار کردستان',
    dolar_mashad_sell: 'دلار مشهد', usd_farda_sell: 'دلار تهران فردایی', mob_usd: 'دلار مبادله‌ای',
    mex_usd_sell: 'دلار صرافی ملی', usd_shakhs: 'دلار حواله شخص', usd_sherkat: 'دلار حواله شرکت',
    usd_pp: 'دلار پی پال', mob_eur: 'یورو مبادله‌ای', mex_eur_sell: 'یورو صرافی ملی',
    usd_xau: 'اونس جهانی طلا', xau: 'اونس طلا',
};

const NOTE = 'منتقل‌شده از نسخه قبلی دلاربان';
let running = null;
let pending = false;

function parseLegacyDate(value) {
    if (value instanceof Date) return value;
    const text = String(value || '').trim();
    const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(text);
    if (!match) return new Date(text);
    const zone = !match[3] || match[3] === 'Z' ? 'Z' : match[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
    return new Date(`${match[1]}T${match[2] || '00:00:00'}${zone}`);
}

function legacyDay(value) {
    if (typeof value === 'string' && isIsoDate(value)) return value;
    return tehranDate(parseLegacyDate(value));
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Ratio that converts legacy prices to the new series' unit (1 when both are toman). */
function unitRatio(series, legacySeries, current, legacyLatest) {
    const ratios = [];
    for (const point of legacySeries.slice(-60)) {
        const match = closeAsOf(series, point.date);
        if (match && diffDays(match.date, point.date) <= 3 && point.close > 0) ratios.push(match.close / point.close);
    }
    if (ratios.length) return median(ratios);
    if (current > 0 && legacyLatest > 0) return current / legacyLatest;
    return 1;
}

function priceOn(plan, date) {
    const point = closeAsOf(plan.series, date);
    if (point && diffDays(point.date, date) <= 14) return point.close;
    const legacy = closeAsOf(plan.legacySeries, date);
    if (legacy) return legacy.close * plan.ratio;
    if (plan.series.length && plan.series[0].date > date) return plan.series[0].close;
    if (point) return point.close;
    return plan.current || (plan.legacyLatest ? plan.legacyLatest * plan.ratio : null);
}

async function readTable(tables, name) {
    const actual = tables.find((table) => table.toLowerCase() === name.toLowerCase());
    if (!actual) return [];
    const quoted = sequelize.getQueryInterface().quoteIdentifier(actual);
    return sequelize.query(`SELECT * FROM ${quoted}`, { type: QueryTypes.SELECT });
}

async function run() {
    const state = settings.get('legacyMigration');
    if (state && state.done) return state;

    const tables = await listTables();
    const investments = (await readTable(tables, 'Investments'))
        .filter((row) => row && row.type && Number(row.amount) > 0 && row.date);
    if (!investments.length) {
        const done = { done: true, count: 0, at: new Date().toISOString() };
        await settings.set('legacyMigration', done);
        return done;
    }
    if (!market.provider || market.assets.size === 0) return { done: false, pending: true };

    logger.info(`Migrating ${investments.length} investments from DollarBaan 1.x`);
    const legacyHistory = new Map();
    for (const row of await readTable(tables, 'HistoricalPrices')) {
        const close = Number(row.close);
        const date = legacyDay(row.date);
        if (!(close > 0) || !date) continue;
        if (!legacyHistory.has(row.type)) legacyHistory.set(row.type, []);
        legacyHistory.get(row.type).push({ date, close });
    }
    for (const series of legacyHistory.values()) series.sort((a, b) => (a.date < b.date ? -1 : 1));
    const legacyLatest = new Map((await readTable(tables, 'InvestmentTypes'))
        .map((row) => [row.type, { price: Number(row.currentPrice) || null, name: row.persianName }]));

    const plans = new Map();
    for (const type of new Set(investments.map((row) => row.type))) {
        const legacySeries = legacyHistory.get(type) || [];
        const latest = legacyLatest.get(type) || {};
        const lastLegacy = legacySeries.length ? legacySeries[legacySeries.length - 1].close : latest.price;
        const target = LEGACY_SYMBOLS[type];
        const asset = target ? market.getAsset(target) : null;

        if (asset && asset.source === 'market') {
            await market.ensureHistory(target);
            const series = await market.seriesFor(target);
            const current = market.toman(asset).price;
            plans.set(type, {
                symbol: target,
                series,
                legacySeries,
                current,
                legacyLatest: lastLegacy,
                ratio: unitRatio(series, legacySeries, current, lastLegacy),
            });
            continue;
        }

        // No equivalent in the new data source: keep it as a manually priced asset.
        const name = LEGACY_NAMES[type] || (latest.name && latest.name !== type ? latest.name : type);
        const price = lastLegacy > 0 ? lastLegacy : 1;
        const existing = [...market.assets.values()].find((item) => item.source === 'custom' && item.nameFa === name);
        const symbol = existing
            ? existing.symbol
            : (await market.createCustomAsset({ name, kind: 'other', unit: 'واحد', price })).symbol;
        if (!existing && legacySeries.length) {
            // Keep the old price history so the asset's chart is not empty.
            await PricePoint.bulkCreate(legacySeries.map((point) => ({
                symbol, date: point.date, open: point.close, high: point.close, low: point.close, close: point.close, origin: 'manual',
            })), { ignoreDuplicates: true });
            market.history.delete(symbol);
        }
        plans.set(type, { symbol, series: legacySeries, legacySeries: [], current: price, legacyLatest: price, ratio: 1 });
        logger.warn(`Legacy item "${type}" has no market equivalent; using custom asset "${name}"`);
    }

    const rows = [];
    for (const investment of investments) {
        const plan = plans.get(investment.type);
        const date = legacyDay(investment.date);
        const price = plan && date ? priceOn(plan, date) : null;
        if (!(price > 0)) {
            logger.warn(`Skipping legacy investment ${investment.id}: no price for ${investment.type} on ${date}`);
            continue;
        }
        const amount = Number(investment.amount);
        rows.push({
            symbol: plan.symbol,
            side: 'buy',
            quantity: amount / price,
            unitPrice: price,
            fee: 0,
            date: date > tehranDate() ? tehranDate() : date,
            note: NOTE,
        });
    }

    const done = { done: true, count: rows.length, at: new Date().toISOString() };
    await sequelize.transaction(async (transaction) => {
        if (rows.length) await Transaction.bulkCreate(rows, { transaction });
        // Recorded inside the same transaction so a crash cannot import twice.
        await Setting.upsert({ key: 'legacyMigration', value: JSON.stringify(done) }, { transaction });
    });
    settings.values.set('legacyMigration', done);
    pending = false;
    market.trackNow([...new Set(rows.map((row) => row.symbol))]).catch(() => {});
    logger.info(`Migrated ${rows.length} legacy investments`);
    return done;
}

/** Whether 1.x data is waiting for the first successful price sync to be imported. */
async function detectPendingMigration() {
    const state = settings.get('legacyMigration');
    if (state && state.done) return false;
    try {
        const tables = await listTables();
        const table = tables.find((name) => name.toLowerCase() === 'investments');
        if (!table) return false;
        const quoted = sequelize.getQueryInterface().quoteIdentifier(table);
        const [row] = await sequelize.query(`SELECT COUNT(*) AS count FROM ${quoted}`, { type: QueryTypes.SELECT });
        pending = Number(row && row.count) > 0;
    } catch (error) {
        logger.warn(`Cannot inspect DollarBaan 1.x tables: ${error.message}`);
    }
    return pending;
}

function isMigrationPending() {
    return pending;
}

/** Runs the migration once; safe to call repeatedly. */
function migrateLegacyData() {
    if (!running) {
        running = run()
            .catch((error) => {
                logger.error(`Legacy migration failed: ${error.message}`);
                return { done: false, error: error.message };
            })
            .finally(() => {
                running = null;
            });
    }
    return running;
}

module.exports = {
    migrateLegacyData,
    detectPendingMigration,
    isMigrationPending,
    parseLegacyDate,
    unitRatio,
    priceOn,
};
