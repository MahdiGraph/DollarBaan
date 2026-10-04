'use strict';

const { Sequelize, DataTypes } = require('sequelize');
const config = require('./config');
const logger = require('./logger');

function createSequelize() {
    const { db } = config;
    if (db.dialect === 'sqlite') {
        return new Sequelize({ dialect: 'sqlite', storage: db.storage, logging: false });
    }
    if (db.dialect !== 'mysql' && db.dialect !== 'mariadb') {
        throw new Error(`Unsupported DB_DIALECT "${db.dialect}". Use "sqlite" or "mysql".`);
    }
    // mysql2 also talks to MariaDB, so both values use the mysql dialect.
    return new Sequelize(db.name, db.user, db.password, {
        host: db.host,
        port: db.port,
        dialect: 'mysql',
        logging: false,
        pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
        dialectOptions: { decimalNumbers: true },
        define: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    });
}

const sequelize = createSequelize();

const LONG_TEXT = config.db.dialect === 'sqlite' ? DataTypes.TEXT : DataTypes.TEXT('long');

const Setting = sequelize.define('Setting', {
    key: { type: DataTypes.STRING(64), primaryKey: true },
    value: { type: LONG_TEXT, allowNull: true },
}, { tableName: 'settings' });

// Every priced thing: market quotes (one row per symbol) and the user's custom assets.
const Asset = sequelize.define('Asset', {
    symbol: { type: DataTypes.STRING(64), primaryKey: true },
    source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'market' },
    provider: { type: DataTypes.STRING(32), allowNull: true },
    nameFa: { type: DataTypes.STRING(191), allowNull: false },
    nameEn: { type: DataTypes.STRING(191), allowNull: true },
    category: { type: DataTypes.STRING(32), allowNull: false },
    currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'IRT' },
    unit: { type: DataTypes.STRING(32), allowNull: true },
    price: { type: DataTypes.DOUBLE, allowNull: true },
    prevClose: { type: DataTypes.DOUBLE, allowNull: true },
    high: { type: DataTypes.DOUBLE, allowNull: true },
    low: { type: DataTypes.DOUBLE, allowNull: true },
    quoteTime: { type: DataTypes.DATE, allowNull: true },
    stale: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    listed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    rateSymbol: { type: DataTypes.STRING(64), allowNull: true },
    meta: { type: DataTypes.TEXT, allowNull: true },
}, {
    tableName: 'assets',
    indexes: [{ fields: ['provider'] }, { fields: ['source'] }],
});

const Transaction = sequelize.define('Transaction', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    symbol: { type: DataTypes.STRING(64), allowNull: false },
    side: { type: DataTypes.STRING(8), allowNull: false },
    quantity: { type: DataTypes.DOUBLE, allowNull: false },
    unitPrice: { type: DataTypes.DOUBLE, allowNull: false },
    fee: { type: DataTypes.DOUBLE, allowNull: false, defaultValue: 0 },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
}, {
    tableName: 'transactions',
    indexes: [{ fields: ['symbol'] }, { fields: ['date'] }],
});

// Daily candles in the asset's own currency (toman, or USD for global assets).
const PricePoint = sequelize.define('PricePoint', {
    symbol: { type: DataTypes.STRING(64), primaryKey: true },
    date: { type: DataTypes.DATEONLY, primaryKey: true },
    open: { type: DataTypes.DOUBLE, allowNull: true },
    high: { type: DataTypes.DOUBLE, allowNull: true },
    low: { type: DataTypes.DOUBLE, allowNull: true },
    close: { type: DataTypes.DOUBLE, allowNull: false },
    origin: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'provider' },
}, { tableName: 'price_history', timestamps: false });

const Session = sequelize.define('Session', {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    username: { type: DataTypes.STRING(191), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    lastSeenAt: { type: DataTypes.DATE, allowNull: true },
    userAgent: { type: DataTypes.STRING(255), allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
}, {
    tableName: 'sessions',
    indexes: [{ fields: ['expiresAt'] }],
});

async function initDatabase() {
    await sequelize.authenticate();
    // Creates missing tables only; tables from DollarBaan 1.x are left untouched.
    await sequelize.sync();
    if (config.db.dialect === 'sqlite') {
        logger.info(`Using SQLite database at ${config.db.storage}`);
    } else {
        logger.info(`Using MySQL database "${config.db.name}" on ${config.db.host}:${config.db.port}`);
    }
}

async function listTables() {
    const tables = await sequelize.getQueryInterface().showAllTables();
    return tables.map((table) => (typeof table === 'string' ? table : table.tableName || table.name));
}

module.exports = {
    sequelize,
    Setting,
    Asset,
    Transaction,
    PricePoint,
    Session,
    initDatabase,
    listTables,
};
