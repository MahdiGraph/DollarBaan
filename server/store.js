'use strict';

// Storage adapter for the shared cores, backed by Sequelize (SQLite or MySQL).
// The in-app backend implements the same interface on IndexedDB.
const { Op, fn, col } = require('sequelize');
const { sequelize, Setting, Asset, Transaction, PricePoint } = require('./db');

const ASSET_FIELDS = ['source', 'provider', 'nameFa', 'nameEn', 'category', 'currency', 'unit', 'price', 'prevClose',
    'high', 'low', 'quoteTime', 'stale', 'listed', 'rateSymbol', 'meta', 'updatedAt'];
const TRANSACTION_FIELDS = ['symbol', 'side', 'quantity', 'unitPrice', 'fee', 'date', 'note', 'updatedAt'];
const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'origin'];

const plain = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);

function parseJson(text) {
    if (text === null || text === undefined) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/** Assets keep `meta` as an object in memory and as JSON text in the database. */
function assetToRow(asset) {
    const row = { ...asset };
    if (row.meta !== undefined) row.meta = JSON.stringify(row.meta || {});
    return row;
}

function assetFromRow(row) {
    const data = plain(row);
    return { ...data, meta: parseJson(data.meta) || {} };
}

async function inChunks(rows, size, write) {
    for (let i = 0; i < rows.length; i += size) await write(rows.slice(i, i + size));
}

module.exports = {
    async listSettings() {
        return (await Setting.findAll()).map((row) => ({ key: row.key, value: parseJson(row.value) }));
    },

    async putSetting(key, value) {
        await Setting.upsert({ key, value: JSON.stringify(value) });
    },

    async listAssets() {
        return (await Asset.findAll()).map(assetFromRow);
    },

    async upsertAssets(rows) {
        await inChunks(rows.map(assetToRow), 200, (chunk) => Asset.bulkCreate(chunk, { updateOnDuplicate: ASSET_FIELDS }));
    },

    async setListed(symbols, listed) {
        await Asset.update({ listed }, { where: { symbol: { [Op.in]: symbols } } });
    },

    async insertAsset(row) {
        await Asset.create(assetToRow(row));
    },

    async updateAsset(symbol, patch) {
        await Asset.update(assetToRow(patch), { where: { symbol } });
    },

    async deleteAsset(symbol) {
        await Asset.destroy({ where: { symbol } });
    },

    async heldSymbols() {
        const rows = await Transaction.findAll({ attributes: [[fn('DISTINCT', col('symbol')), 'symbol']], raw: true });
        return rows.map((row) => row.symbol);
    },

    async firstTransactionDate() {
        return (await Transaction.min('date')) || null;
    },

    async countTransactions(symbol) {
        return Transaction.count({ where: { symbol } });
    },

    async allTransactions() {
        return (await Transaction.findAll()).map(plain);
    },

    async transactionsFor(symbols) {
        return (await Transaction.findAll({ where: { symbol: { [Op.in]: symbols } } })).map(plain);
    },

    async getTransaction(id) {
        const row = await Transaction.findByPk(id);
        return row ? plain(row) : null;
    },

    async insertTransaction(row) {
        await Transaction.create(row);
    },

    async updateTransaction(id, patch) {
        await Transaction.update(patch, { where: { id } });
    },

    async deleteTransaction(id) {
        await Transaction.destroy({ where: { id } });
    },

    async listPrices(symbol) {
        return PricePoint.findAll({ where: { symbol }, attributes: ['date', 'close'], order: [['date', 'ASC']], raw: true });
    },

    async getPrice(symbol, date) {
        return (await PricePoint.findOne({ where: { symbol, date }, raw: true })) || null;
    },

    async putPrice(row) {
        await PricePoint.upsert(row);
    },

    async upsertPrices(rows) {
        await inChunks(rows, 500, (chunk) => PricePoint.bulkCreate(chunk, { updateOnDuplicate: PRICE_FIELDS }));
    },

    async providerPriceRange(symbol) {
        return PricePoint.findOne({
            where: { symbol, origin: 'provider' },
            attributes: [[fn('MIN', col('date')), 'first'], [fn('MAX', col('date')), 'last']],
            raw: true,
        });
    },

    async deletePrices(symbol) {
        await PricePoint.destroy({ where: { symbol } });
    },

    /** Writes a restored backup atomically. */
    async importBackup({ assets, prices, transactions, replace }) {
        await sequelize.transaction(async (transaction) => {
            for (const asset of assets) await Asset.upsert(assetToRow(asset), { transaction });
            await inChunks(prices, 500, (chunk) => PricePoint.bulkCreate(chunk, { transaction, updateOnDuplicate: PRICE_FIELDS }));
            if (replace) await Transaction.destroy({ where: {}, transaction });
            await inChunks(transactions, 500, (chunk) => Transaction.bulkCreate(chunk, { transaction, updateOnDuplicate: TRANSACTION_FIELDS }));
        });
    },
};
