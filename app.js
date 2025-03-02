'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const path = require('path');
const axios = require('axios');
const { Sequelize, DataTypes, Op } = require('sequelize');
const moment = require('moment-jalaali');
const cors = require('cors');
const winston = require('winston');
const fs = require('fs');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const FileStore = require('session-file-store')(session);

const logDir = process.env.LOG_DIR || './logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: `${logDir}/error.log`, level: 'error' }),
        new winston.transports.File({ filename: `${logDir}/combined.log` })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

const PERSIAN_NAMES = {
    // Currencies
    'usd_sell': 'دلار آمریکا',
    'eur_sell': 'یورو',
    'eur_hav': 'حواله یورو',
    'eur_pp': 'یورو پی پال',
    'gbp': 'پوند انگلیس',
    'gbp_hav': 'حواله پوند انگلیس',
    'cad': 'دلار کانادا',
    'cad_hav': 'حواله دلار کانادا',
    'aud': 'دلار استرالیا',
    'aud_hav': 'حواله دلار استرالیا',
    'nzd': 'دلار نیوزیلند',
    'try': 'لیر ترکیه',
    'try_hav': 'حواله لیر ترکیه',
    'aed_sell': 'درهم امارات',
    'dirham_dubai': 'درهم دوبی',
    'sar': 'ریال سعودی',
    'qar': 'ریال قطر',
    'omr': 'ریال عمان',
    'bhd': 'دینار بحرین',
    'kwd': 'دینار کویت',
    'iqd': 'دینار عراق',
    'jod': 'دلار اردن',
    'lbp': 'پوند لبنان',
    'syp': 'پوند سوریه',
    'cny': 'یوان چین',
    'cny_hav': 'حواله یوان چین',
    'jpy': 'ین ژاپن',
    'jpy_hav': 'حواله ین ژاپن',
    'inr': 'روپیه هند',
    'krw': 'وون کره',
    'myr': 'رینگیت مالزی',
    'myr_hav': 'حواله رینگیت مالزی',
    'sgd': 'دلار سنگاپور',
    'hkd': 'دلار هنگ کنگ',
    'zar': 'رند افریقای جنوبی',
    'egp': 'پوند مصر',
    'ngn': 'نایرا نیجریه',
    'dzd': 'دینار الجزایر',
    'mad': 'درهم مراکش',
    'tnd': 'دینار تونس',
    'xaf': 'فرانک آفریقای مرکزی',
    'xof': 'فرانک آفریقای غربی',
    'chf': 'فرانک سوئیس',
    'sek': 'کرون سوئد',
    'nok': 'کرون نروژ',
    'dkk': 'کرون دانمارک',
    'pln': 'زلوتی لهستانی',
    'czk': 'کرون چک',
    'rub': 'روبل روسیه',
    'hrk': 'کونا کرواسی',
    'bgn': 'لو بلغارستان',
    'isk': 'کرون ایسلند',
    'brl': 'رئال برزیل',
    'mxn': 'پزو مکزیک',
    'clp': 'پزو شیلی',
    'cop': 'پزو کلمبیا',
    'ars': 'پزو آرژانتین',
    'pen': 'سولوی پرو',
    'uyu': 'پزو اروگوئه',
    'afn': 'افغانی',
    'gel': 'لاری گرجستان',
    'azn': 'منات آذربایجان',
    'tmt': 'منات ترکمنستان',
    'uzs': 'سام ازبکستان',
    'tjs': 'سامونی تاجیکستان',
    'kzt': 'تنگه قزاقستان',
    'amd': 'درام ارمنستان',

    // harat
    'harat_naghdi_sell': 'دلار هرات',
    'dolar_harat_sell': 'دلار هرات نقد',
    'dolar_soleimanie_sell': 'دلار سلیمانیه',
    'dolar_kordestan_sell': 'دلار کردستان',
    'dolar_mashad_sell': 'دلار مشهد',
    'usd_farda_sell': 'دلار تهران فردایی',
    
    // dollar types
    'mob_usd': 'دلار مبادله‌ای',
    'mex_usd_sell': 'دلار صرافی ملی',
    'usd_shakhs': 'دلار حواله شخص',
    'usd_sherkat': 'دلار حواله شرکت',
    'usd_pp': 'دلار پی پال',
    
    // euro types
    'mob_eur': 'یورو مبادله‌ای',
    'mex_eur_sell': 'یورو صرافی ملی',
    
    // gold and coin
    'sekkeh': 'سکه امامی',
    'coin': 'سکه تمام بهار آزادی',
    'bahar': 'سکه بهار آزادی',
    'nim': 'نیم سکه',
    'rob': 'ربع سکه',
    'gerami': 'سکه گرمی',
    'gold': 'طلای ۱۸ عیار',
    '18ayar': 'گرم طلای ۱۸ عیار',
    'abshodeh': 'مثقال طلای آبشده',
    'usd_xau': 'اونس جهانی طلا',
    'xau': 'اونس طلا',
    
    // Crypto
    'bitcoin': 'بیت‌کوین',
    'ethereum': 'اتریوم',
    'usdt': 'تتر',
    'ltc': 'لایت‌کوین',
    'xrp': 'ریپل',
    'bch': 'بیت‌کوین کش',
    'bnb': 'بایننس',
    'eos': 'ای‌او‌اس',
    'ada': 'کاردانو',
    'dash': 'دش',
    'doge': 'دوج‌کوین',
    'shib': 'شیبا اینو',
    'aave': 'آوه',
    'avax': 'آوالانچ',
    'sol': 'سولانا',
    'matic': 'متیک',
    'trx': 'ترون',
    'dot': 'پولکادات',
    'link': 'چین‌لینک',
    'xlm': 'استلار',
    'uni': 'یونی‌سواپ',
    'atom': 'کازموس',
    'ton': 'تون‌کوین',
    'etc': 'اتریوم کلاسیک',
    'xmr': 'مونرو',
    'fil': 'فایل‌کوین',
    'icp': 'آی‌سی‌پی',
    'hbar': 'هدرا',
    'vet': 'وی‌چین',
    'near': 'نییر پروتکل',
    'qnt': 'کوانت',
    'mkr': 'میکر',
    'grt': 'گراف',
    'algo': 'آلگورند',
    'axs': 'اَکسی',
    'stx': 'استک',
    'egld': 'مولتی‌ورس',
    'sand': 'سند‌باکس',
    'theta': 'تتا',
};

const PRIORITY_TYPES = [
    'usd_sell', 'cad', 'sekkeh', 'abshodeh', 'usdt', 'try',
    'bitcoin', 'ethereum', 'gold', '18ayar', 'eur_sell', 'coin'
];

const apiStatus = {
    lastConnectionTime: null,
    lastConnectionSuccess: true,
    lastError: null,
    errorMessage: null
};

const cache = {
    timelineChartData: null,
    timelineChartDataTimestamp: null,
    typeChartData: {},
    validityPeriod: 15 * 60 * 1000,
    isValid: function(timestamp) {
        return timestamp && (Date.now() - timestamp) < this.validityPeriod;
    },
    clearAll: function() {
        this.timelineChartData = null;
        this.timelineChartDataTimestamp = null;
        this.typeChartData = {};
        logger.info('Cache cleared');
    }
};

class NavasanAPIClient {
    constructor(apiKey) {
        if (!apiKey) throw new Error('API key is required');
        this.apiKey = apiKey.trim();
        this.baseUrl = process.env.NAVASAN_BASE_URL || 'https://api.navasan.tech';
        this.timeout = parseInt(process.env.NAVASAN_TIMEOUT || '120000');
        this.maxRetries = parseInt(process.env.NAVASAN_MAX_RETRIES || '3');
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.requestDelay = 500;
        setInterval(() => this.processQueue(), this.requestDelay);
    }
    
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) return;
        this.isProcessingQueue = true;
        const request = this.requestQueue.shift();
        try {
            const result = await this.executeRequest(
                request.endpoint,
                request.params,
                request.maxRetries
            );
            request.resolve(result);
        } catch (error) {
            request.reject(error);
        } finally {
            this.isProcessingQueue = false;
        }
    }
    
    async executeRequest(endpoint, params = {}, maxRetries = this.maxRetries) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info(`Attempt ${attempt}: Fetching ${endpoint}`);
                apiStatus.lastConnectionTime = new Date();
                const response = await axios.get(`${this.baseUrl}/${endpoint}`, {
                    params: { ...params, api_key: this.apiKey },
                    timeout: this.timeout
                });
                apiStatus.lastConnectionSuccess = true;
                apiStatus.lastError = null;
                apiStatus.errorMessage = null;
                return response.data;
            } catch (error) {
                const errorMessage = error.response ?
                    `Status: ${error.response.status}, ${error.response.statusText}` :
                    error.message;
                logger.error(`Fetch attempt ${attempt} failed: ${errorMessage}`);
                if (attempt === maxRetries) {
                    apiStatus.lastConnectionSuccess = false;
                    apiStatus.lastError = error;
                    apiStatus.errorMessage = `Error connecting to Navasan service: ${errorMessage}`;
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
    
    fetchWithRetry(endpoint, params = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({
                endpoint, params, maxRetries: this.maxRetries, resolve, reject
            });
        });
    }
    
    getLatestPrices() {
        return this.fetchWithRetry('latest');
    }
    
    getHistoricalPrices(type, startDate, endDate) {
        return this.fetchWithRetry('ohlcSearch', {
            item: type,
            start: startDate,
            end: endDate
        });
    }
}

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    logger.error('CRITICAL: API_KEY is not set in .env file');
    process.exit(1);
}
const navasanClient = new NavasanAPIClient(API_KEY);

let sequelize;

const getDecimalType = () => {
    return process.env.DB_DIALECT === 'sqlite' ? 
        DataTypes.FLOAT : 
        DataTypes.DECIMAL(15, 2);
};

if (process.env.DB_DIALECT === 'sqlite') {
    const storagePath = process.env.SQLITE_PATH || './database.sqlite';
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: storagePath,
        logging: false
    });
    logger.info(`Using SQLite database at ${storagePath}`);
} else {
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            dialect: process.env.DB_DIALECT || 'mysql',
            logging: false,
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000
            }
        }
    );
    logger.info(`Using ${process.env.DB_DIALECT || 'mysql'} database`);
}

const InvestmentType = sequelize.define('InvestmentType', {
    type: {
        type: DataTypes.STRING,
        primaryKey: true,
        unique: true
    },
    currentPrice: {
        type: getDecimalType(),
        allowNull: false
    },
    lastUpdated: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    persianName: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

const Investment = sequelize.define('Investment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false
    },
    amount: {
        type: getDecimalType(),
        allowNull: false
    },
    date: {
        type: DataTypes.DATE,
        allowNull: false
    }
});

const HistoricalPrice = sequelize.define('HistoricalPrice', {
    type: {
        type: DataTypes.STRING,
        allowNull: false
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    open: {
        type: getDecimalType(),
        allowNull: false
    },
    high: {
        type: getDecimalType(),
        allowNull: false
    },
    low: {
        type: getDecimalType(),
        allowNull: false
    },
    close: {
        type: getDecimalType(),
        allowNull: false
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['type', 'date']
        }
    ]
});

Investment.belongsTo(InvestmentType, {
    foreignKey: 'type',
    targetKey: 'type'
});

async function getInvestedTypes() {
    if (process.env.DB_DIALECT === 'sqlite') {
        const query = "SELECT DISTINCT type FROM Investments";
        const result = await sequelize.query(query, {
            type: sequelize.QueryTypes.SELECT
        });
        return result.map(row => ({ type: row.type }));
    } else {
        return await Investment.findAll({
            attributes: ['type'],
            group: ['type']
        });
    }
}

async function getLatestPrice(type) {
    try {
        const latestPrice = await HistoricalPrice.findOne({
            where: { type },
            order: [['date', 'DESC']]
        });
        if (latestPrice) {
            return latestPrice.close;
        }
        const currentPrice = await InvestmentType.findByPk(type);
        return currentPrice ? currentPrice.currentPrice : null;
    } catch (error) {
        logger.error(`Error getting latest price for ${type}`, error);
        return null;
    }
}

async function calculateInvestmentValue(investment, investmentType) {
    try {
        const historicalPrice = await HistoricalPrice.findOne({
            where: {
                type: investment.type,
                date: {
                    [Op.lte]: moment(investment.date).format('YYYY-MM-DD')
                }
            },
            order: [['date', 'DESC']]
        });
        const currentPrice = await getLatestPrice(investment.type) ||
                            (investmentType ? investmentType.currentPrice : 0);
        const purchasePrice = historicalPrice ? historicalPrice.close : currentPrice;
        const unitsPurchased = purchasePrice > 0 ? investment.amount / purchasePrice : 0;
        const currentValue = unitsPurchased * currentPrice;
        const profit = currentValue - investment.amount;
        return {
            initialInvestment: parseFloat(investment.amount),
            purchasePrice: parseFloat(purchasePrice),
            unitsPurchased: parseFloat(unitsPurchased),
            currentValue: parseFloat(currentValue),
            currentPrice: parseFloat(currentPrice),
            profit: parseFloat(profit)
        };
    } catch (error) {
        logger.error(`Investment value calculation error: ${error.message}`);
        return {
            initialInvestment: parseFloat(investment.amount),
            purchasePrice: 0,
            unitsPurchased: 0,
            currentValue: 0,
            currentPrice: 0,
            profit: 0
        };
    }
}

async function fetchHistoricalDataForType(type, startDate, endDate) {
    try {
        logger.info(`Fetching historical data for ${type}`);
        const historicalData = await navasanClient.getHistoricalPrices(type, startDate, endDate);
        if (!historicalData || !Array.isArray(historicalData) || historicalData.length === 0) {
            logger.warn(`No historical data found for ${type}`);
            return [];
        }
        logger.info(`Received ${historicalData.length} historical records for ${type}`);
        
        const historicalPrices = historicalData.map(price => {
            if (!price.date) {
                logger.warn(`Missing date in historical data record for ${type}`);
                return null;
            }
            try {
                const gregorianDate = moment(price.date, 'jYYYY-jM-jD').format('YYYY-MM-DD');
                const open = parseFloat(price.open) || 0;
                const high = parseFloat(price.high) || 0;
                const low = parseFloat(price.low) || 0;
                const close = parseFloat(price.close) || 0;
                return {
                    type,
                    date: gregorianDate,
                    open,
                    high,
                    low,
                    close
                };
            } catch (error) {
                logger.error(`Error processing historical data record for ${type}`);
                return null;
            }
        }).filter(item => item !== null);
        
        if (historicalPrices.length === 0) {
            logger.warn(`No valid historical data found for ${type}`);
            return [];
        }
        
        if (process.env.DB_DIALECT === 'sqlite') {
            for (const record of historicalPrices) {
                try {
                    const existingRecord = await HistoricalPrice.findOne({
                        where: { 
                            type: record.type, 
                            date: record.date 
                        }
                    });
                    
                    if (existingRecord) {
                        await existingRecord.update({
                            open: record.open,
                            high: record.high,
                            low: record.low,
                            close: record.close
                        });
                    } else {
                        await HistoricalPrice.create(record);
                    }
                } catch (err) {
                    logger.error(`Error saving historical price for ${type} on date ${record.date}: ${err.message}`);
                }
            }
        } else {
            await HistoricalPrice.bulkCreate(historicalPrices, {
                updateOnDuplicate: ['open', 'high', 'low', 'close']
            });
        }
        
        logger.info(`Stored ${historicalPrices.length} historical prices for ${type}`);
        return historicalPrices;
    } catch (error) {
        logger.error(`Historical data fetch error for ${type}: ${error.message}`);
        return [];
    }
}

async function updateInvestmentPrices() {
    try {
        logger.info('Starting comprehensive price update...');
        const investedTypes = await getInvestedTypes();
        if (investedTypes.length === 0) {
            logger.info('No invested types found. Skipping price update.');
            return;
        }
        let latestPrices;
        try {
            latestPrices = await navasanClient.getLatestPrices();
            logger.info(`Received latest prices for ${Object.keys(latestPrices).length} types`);
        } catch (error) {
            logger.error('Failed to fetch latest prices from Navasan API', error);
            throw new Error('Error fetching latest prices from Navasan service');
        }
        for (const typeObj of investedTypes) {
            const type = typeObj.type;
            if (!latestPrices[type]) {
                logger.warn(`Type ${type} not found in latest prices. Skipping update.`);
                continue;
            }
            await InvestmentType.upsert({
                type,
                currentPrice: parseFloat(latestPrices[type].value),
                lastUpdated: new Date(),
                persianName: PERSIAN_NAMES[type] || type
            });
            const lastHistoricalPrice = await HistoricalPrice.findOne({
                where: { type },
                order: [['date', 'DESC']]
            });
            let startDate;
            if (lastHistoricalPrice) {
                startDate = moment(lastHistoricalPrice.date).add(1, 'day').format('jYYYY-jM-jD');
            } else {
                const firstInvestment = await Investment.findOne({
                    where: { type },
                    order: [['date', 'ASC']]
                });
                if (firstInvestment) {
                    startDate = moment(firstInvestment.date).subtract(1, 'month').format('jYYYY-jM-jD');
                } else {
                    startDate = moment().subtract(3, 'years').format('jYYYY-jM-jD');
                }
            }
            const endDate = moment().format('jYYYY-jM-jD');
            if (startDate < endDate) {
                try {
                    await fetchHistoricalDataForType(type, startDate, endDate);
                } catch (error) {
                    logger.error(`Error fetching historical data for ${type}`, error);
                }
            }
            
            // =====================================================================
            // WARNING: This section is commented out to prevent storing latest API 
            // prices in the HistoricalPrice table.
            // 
            // The "latest" API often returns prices with fewer decimal places than
            // the historical API, which can cause calculation inconsistencies.
            // 
            // Uncommenting this section may lead to inaccurate historical prices
            // and affect investment value calculations.
            // =====================================================================
            /*
            const today = moment().format('YYYY-MM-DD');
            const todayPriceExists = await HistoricalPrice.findOne({
                where: {
                    type,
                    date: today
                }
            });
            if (!todayPriceExists && latestPrices[type]) {
                const currentPrice = parseFloat(latestPrices[type].value);
                await HistoricalPrice.create({
                    type,
                    date: today,
                    open: currentPrice,
                    high: currentPrice,
                    low: currentPrice,
                    close: currentPrice
                });
                logger.info(`Added today's price for ${type}: ${currentPrice}`);
            }
            */
            // =====================================================================
        }
        cache.clearAll();
        logger.info('Comprehensive price update completed successfully');
    } catch (error) {
        logger.error('Comprehensive price update failed', error);
        apiStatus.lastConnectionSuccess = false;
        apiStatus.lastError = error;
        apiStatus.errorMessage = `Error updating prices: ${error.message}`;
        throw error;
    }
}

async function calculateInvestmentValueAtDate(investment, investmentType, targetDate, priceMap = null) {
    try {
        let purchasePrice, priceAtTargetDate;
        if (priceMap && priceMap[investment.type]) {
            const investmentDateISO = moment(investment.date).format('YYYY-MM-DD');
            purchasePrice = findClosestPriceInMap(priceMap[investment.type], investmentDateISO);
            priceAtTargetDate = findClosestPriceInMap(priceMap[investment.type], targetDate);
            if (!purchasePrice && investmentType) {
                purchasePrice = investmentType.currentPrice;
            }
            if (!priceAtTargetDate && purchasePrice) {
                priceAtTargetDate = purchasePrice;
            }
        } else {
            const historicalPrice = await HistoricalPrice.findOne({
                where: {
                    type: investment.type,
                    date: {
                        [Op.lte]: moment(investment.date).format('YYYY-MM-DD')
                    }
                },
                order: [['date', 'DESC']]
            });
            const targetPrice = await HistoricalPrice.findOne({
                where: {
                    type: investment.type,
                    date: {
                        [Op.lte]: targetDate
                    }
                },
                order: [['date', 'DESC']]
            });
            purchasePrice = historicalPrice ? historicalPrice.close :
                        (investmentType ? investmentType.currentPrice : 0);
            priceAtTargetDate = targetPrice ? targetPrice.close : purchasePrice;
        }
        const unitsPurchased = purchasePrice > 0 ? investment.amount / purchasePrice : 0;
        const valueAtTargetDate = unitsPurchased * priceAtTargetDate;
        return {
            initialInvestment: parseFloat(investment.amount),
            purchasePrice: parseFloat(purchasePrice || 0),
            unitsPurchased: parseFloat(unitsPurchased),
            currentValue: parseFloat(valueAtTargetDate),
            currentPrice: parseFloat(priceAtTargetDate || 0),
            profit: parseFloat(valueAtTargetDate - investment.amount)
        };
    } catch (error) {
        logger.error(`Investment value calculation error at date ${targetDate}: ${error.message}`);
        return {
            initialInvestment: parseFloat(investment.amount),
            purchasePrice: 0,
            unitsPurchased: 0,
            currentValue: 0,
            currentPrice: 0,
            profit: 0
        };
    }
}

function findClosestPriceInMap(pricesByDate, targetDate) {
    const targetTime = moment(targetDate).valueOf();
    let closestDate = null;
    let closestDistance = Infinity;
    for (const dateStr in pricesByDate) {
        const currentTime = moment(dateStr).valueOf();
        const distance = Math.abs(currentTime - targetTime);
        if (currentTime <= targetTime && distance < closestDistance) {
            closestDistance = distance;
            closestDate = dateStr;
        }
    }
    return closestDate ? pricesByDate[closestDate].close : null;
}

async function generateTimelineChartData() {
    if (cache.timelineChartData && cache.isValid(cache.timelineChartDataTimestamp)) {
        logger.debug('Using cached timeline chart data');
        return cache.timelineChartData;
    }
    logger.info('Generating timeline chart data for all investments...');
    const summaryChartMonths = parseInt(process.env.SUMMARY_CHART_MONTHS) || 12;
    const startDate = moment().subtract(summaryChartMonths, 'months').startOf('day');
    const endDate = moment().endOf('day');
    const dataPoints = [];
    let currentDate = moment(startDate);
    while (currentDate.isSameOrBefore(endDate)) {
        dataPoints.push({
            date: currentDate.format('YYYY-MM-DD'),
            jalaliDate: currentDate.format('jYYYY/jMM/jDD'),
            totalValue: 0,
            investments: {}
        });
        currentDate.add(1, 'week');
    }
    const investments = await Investment.findAll();
    const investmentTypes = await InvestmentType.findAll();
    const typeMap = {};
    investmentTypes.forEach(type => {
        typeMap[type.type] = type;
    });
    const investedTypes = [...new Set(investments.map(inv => inv.type))];
    const historicalPrices = await HistoricalPrice.findAll({
        where: {
            type: { [Op.in]: investedTypes },
            date: { [Op.gte]: startDate.format('YYYY-MM-DD') }
        }
    });
    const priceMap = {};
    historicalPrices.forEach(price => {
        if (!priceMap[price.type]) {
            priceMap[price.type] = {};
        }
        priceMap[price.type][price.date] = price;
    });
    for (let dataPoint of dataPoints) {
        const pointDate = moment(dataPoint.date);
        for (const investment of investments) {
            if (moment(investment.date).isAfter(pointDate)) {
                continue;
            }
            const investmentValue = await calculateInvestmentValueAtDate(
                investment,
                typeMap[investment.type],
                dataPoint.date,
                priceMap
            );
            dataPoint.totalValue += investmentValue.currentValue;
            if (!dataPoint.investments[investment.type]) {
                dataPoint.investments[investment.type] = 0;
            }
            dataPoint.investments[investment.type] += investmentValue.currentValue;
        }
    }
    const maxChartPoints = parseInt(process.env.MAX_CHART_POINTS) || 52;
    const limitedDataPoints = limitDataPoints(dataPoints, maxChartPoints);
    cache.timelineChartData = limitedDataPoints;
    cache.timelineChartDataTimestamp = Date.now();
    logger.info(`Generated ${limitedDataPoints.length} timeline data points`);
    return limitedDataPoints;
}

async function generateTypeChartData(type) {
    if (cache.typeChartData[type] && cache.isValid(cache.typeChartData[type].timestamp)) {
        logger.debug(`Using cached chart data for ${type}`);
        return cache.typeChartData[type].data;
    }
    logger.info(`Generating chart data for ${type}...`);
    try {
        const investmentChartMonths = parseInt(process.env.INVESTMENT_CHART_MONTHS) || 6;
        const startDate = moment().subtract(investmentChartMonths, 'months').format('YYYY-MM-DD');
        const historicalPrices = await HistoricalPrice.findAll({
            where: {
                type,
                date: {
                    [Op.gte]: startDate
                }
            },
            order: [['date', 'ASC']]
        });
        if (historicalPrices.length === 0) {
            logger.warn(`No historical data found for ${type} in the specified period`);
            return { labels: [], datasets: [{ label: PERSIAN_NAMES[type] || type, data: [] }] };
        }
        const rawChartData = historicalPrices.map(price => ({
            date: moment(price.date).format('YYYY-MM-DD'),
            jalaliDate: moment(price.date).format('jYYYY/jMM/jDD'),
            price: parseFloat(price.close)
        }));
        const chartData = limitDataPoints(rawChartData);
        const chartDataObject = {
            labels: chartData.map(point => point.jalaliDate),
            datasets: [{
                label: `قیمت ${PERSIAN_NAMES[type] || type}`,
                data: chartData.map(point => point.price)
            }]
        };
        cache.typeChartData[type] = {
            data: chartDataObject,
            timestamp: Date.now()
        };
        logger.info(`Generated chart data for ${type} with ${chartData.length} points`);
        return chartDataObject;
    } catch (error) {
        logger.error(`Error generating chart data for ${type}:`, error);
        return {
            labels: [],
            datasets: [{
                label: `قیمت ${PERSIAN_NAMES[type] || type}`,
                data: []
            }]
        };
    }
}

function limitDataPoints(data, maxPoints = 52) {
    if (!data || data.length <= maxPoints) return data;
    const step = Math.ceil(data.length / maxPoints);
    const result = [];
    for (let i = 0; i < data.length; i += step) {
        result.push(data[i]);
    }
    if (result.length > 0 && data.length > 0 &&
        result[result.length - 1] !== data[data.length - 1]) {
        result.push(data[data.length - 1]);
    }
    return result;
}

const app = express();

const sessionDir = './sessions';
if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
}

const sessionOptions = {
    store: new FileStore({
        path: sessionDir,
        ttl: 86400,
        retries: 0,
        logFn: function (message) {
            if (!message.includes('ENOENT')) {
                logger.debug(message);
            }
        }
    }),
    secret: process.env.SESSION_SECRET || 'dollarbaan-default-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000
    },
    rolling: true,
    unset: 'destroy'
};

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_INSECURE_COOKIES !== 'true') {
    sessionOptions.cookie.secure = true;
    if (process.env.TRUST_PROXY === 'true') {
        app.set('trust proxy', 1);
    }
}

app.use((req, res, next) => {
    const originalErrorHandler = req.socket.listeners('error').shift();
    
    req.socket.on('error', err => {
        if (err.message.includes('ENOENT') && err.message.includes('session')) {
            req.session = null;
            
            if (req.xhr || req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'جلسه نامعتبر است. لطفا دوباره وارد شوید.' });
            }
            
            return res.redirect('/login?error=invalid_session');
        }
        
        originalErrorHandler(err);
    });
    
    next();
});

app.use(cookieParser());
app.use(session(sessionOptions));
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const isAuthenticated = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();
    }
    req.session.returnTo = req.originalUrl;
    res.redirect('/login');
};

app.get('/', isAuthenticated);
app.use([
    '/investments',
    '/investment-types',
    '/invested-types',
    '/api-status',
    '/update-prices',
    '/clear-cache'
], isAuthenticated);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
    if (req.session.isAuthenticated) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (process.env.NODE_ENV === 'production' && !isSecure && sessionOptions.cookie.secure) {
        return res.redirect('/login?error=production_http');
    }
    if (username === process.env.AUTH_USERNAME && password === process.env.AUTH_PASSWORD) {
        req.session.isAuthenticated = true;
        req.session.username = username;
        const returnTo = req.session.returnTo || '/';
        delete req.session.returnTo;
        return res.redirect(returnTo);
    }
    res.redirect('/login?error=invalid_credentials');
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/api-status', (req, res) => {
    res.json({
        lastConnectionTime: apiStatus.lastConnectionTime,
        lastConnectionSuccess: apiStatus.lastConnectionSuccess,
        lastError: apiStatus.errorMessage,
        isConnected: apiStatus.lastConnectionSuccess
    });
});

app.post('/clear-cache', async (req, res) => {
    try {
        cache.clearAll();
        res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
        logger.error('Error clearing cache:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/update-prices', async (req, res) => {
    try {
        logger.info('Manual price update initiated via API endpoint');
        await updateInvestmentPrices();
        res.json({
            success: true
        });
    } catch (error) {
        logger.error('Manual price update failed', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/investments', async (req, res) => {
    const { type, amount, date } = req.body;
    try {
        const investmentType = await InvestmentType.findOne({ where: { type } });
        if (!investmentType) {
            return res.status(404).json({ error: 'Investment type not found' });
        }
        
        const gregorianDate = moment(date, 'jYYYY/jM/jD').toDate();
        const investment = await Investment.create({
            type,
            amount,
            date: gregorianDate
        });
        
        let existingHistoricalData;
        if (process.env.DB_DIALECT === 'sqlite') {
            existingHistoricalData = await HistoricalPrice.findOne({
                where: { type }
            });
            if (!existingHistoricalData) {
                logger.info(`No historical data found for ${type}. Fetching historical data...`);
                const firstInvestmentDate = moment(investment.date)
                    .subtract(1, 'month').format('jYYYY-jM-jD');
                const endDate = moment().format('jYYYY-jM-jD');
                try {
                    const historicalData = await fetchHistoricalDataForType(type, firstInvestmentDate, endDate);
                    if (historicalData.length === 0) {
                        logger.warn(`No historical data could be fetched for ${type}`);
                    } else {
                        logger.info(`Successfully fetched ${historicalData.length} historical records for ${type}`);
                    }
                } catch (historyError) {
                    logger.error(`Unexpected error fetching historical data for ${type}: ${historyError.message}`);
                }
            }
        } else {
            const count = await HistoricalPrice.count({
                where: { type }
            });
            if (count === 0) {
                logger.info(`No historical data found for ${type}. Fetching historical data...`);
                const firstInvestmentDate = moment(investment.date)
                    .subtract(1, 'month').format('jYYYY-jM-jD');
                const endDate = moment().format('jYYYY-jM-jD');
                try {
                    const historicalData = await fetchHistoricalDataForType(type, firstInvestmentDate, endDate);
                    if (historicalData.length === 0) {
                        logger.warn(`No historical data could be fetched for ${type}`);
                    }
                } catch (historyError) {
                    logger.error(`Unexpected error fetching historical data for ${type}:`, historyError);
                }
            }
        }
        
        const investmentValue = await calculateInvestmentValue(investment, investmentType);
        return res.status(201).json({
            ...investment.toJSON(),
            date: moment(investment.date).format('jYYYY/jM/jD'),
            persianName: PERSIAN_NAMES[type] || type,
            ...investmentValue
        });
    } catch (err) {
        logger.error('Investment creation error:', err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

app.get('/investments', async (req, res) => {
    try {
        const investments = await Investment.findAll({
            include: [{
                model: InvestmentType,
                attributes: ['type', 'currentPrice']
            }],
            order: [['date', 'DESC']]
        });
        const investmentsWithDetails = await Promise.all(
            investments.map(async (investment) => {
                const investmentType = investment.InvestmentType;
                const investmentValue = await calculateInvestmentValue(investment, investmentType);
                return {
                    ...investment.toJSON(),
                    date: moment(investment.date).format('jYYYY/jM/jD'),
                    persianName: PERSIAN_NAMES[investment.type] || investmentType,
                    ...investmentValue
                };
            })
        );
        const groupedInvestments = {};
        investmentsWithDetails.forEach(investment => {
            if (!groupedInvestments[investment.type]) {
                groupedInvestments[investment.type] = {
                    type: investment.type,
                    persianName: PERSIAN_NAMES[investment.type] || investment.type,
                    investments: [],
                    totalInvestment: 0,
                    totalCurrentValue: 0,
                    totalProfit: 0
                };
            }
            groupedInvestments[investment.type].investments.push(investment);
            groupedInvestments[investment.type].totalInvestment += investment.initialInvestment;
            groupedInvestments[investment.type].totalCurrentValue += investment.currentValue;
            groupedInvestments[investment.type].totalProfit += investment.profit;
        });
        const result = [];
        for (const [type, group] of Object.entries(groupedInvestments)) {
            group.profitPercentage = group.totalInvestment > 0
                ? (group.totalProfit / group.totalInvestment) * 100
                : 0;
            group.chartData = await generateTypeChartData(type);
            result.push(group);
        }
        result.sort((a, b) => {
            const aIndex = PRIORITY_TYPES.indexOf(a.type);
            const bIndex = PRIORITY_TYPES.indexOf(b.type);
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return b.totalInvestment - a.totalInvestment;
        });
        return res.json(result);
    } catch (err) {
        logger.error('Error fetching investments:', err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

app.get('/investments/summary', async (req, res) => {
    try {
        const investments = await Investment.findAll({
            include: [{
                model: InvestmentType,
                attributes: ['type', 'currentPrice']
            }]
        });
        const summary = {
            totalInvestment: 0,
            totalCurrentValue: 0,
            totalProfit: 0,
            investments: []
        };
        for (const investment of investments) {
            const investmentType = investment.InvestmentType;
            const investmentValue = await calculateInvestmentValue(investment, investmentType);
            summary.totalInvestment += investmentValue.initialInvestment;
            summary.totalCurrentValue += investmentValue.currentValue;
            summary.totalProfit += investmentValue.profit;
            summary.investments.push({
                ...investment.toJSON(),
                date: moment(investment.date).format('jYYYY/jM/jD'),
                persianName: PERSIAN_NAMES[investment.type] || investment.type,
                ...investmentValue
            });
        }
        summary.totalProfitPercentage = summary.totalInvestment > 0
            ? (summary.totalProfit / summary.totalInvestment) * 100
            : 0;
        const chartData = await generateTimelineChartData();
        const timelineData = {
            labels: chartData.map(point => point.jalaliDate),
            datasets: [
                {
                    label: 'ارزش کل (تومان)',
                    data: chartData.map(point => point.totalValue)
                }
            ]
        };
        const typeDatasets = {};
        chartData.forEach(point => {
            Object.entries(point.investments).forEach(([type, value]) => {
                if (!typeDatasets[type]) {
                    typeDatasets[type] = {
                        label: PERSIAN_NAMES[type] || type,
                        data: new Array(chartData.length).fill(0)
                    };
                }
            });
        });
        chartData.forEach((point, index) => {
            Object.entries(point.investments).forEach(([type, value]) => {
                if (typeDatasets[type]) {
                    typeDatasets[type].data[index] = value;
                }
            });
        });
        timelineData.typeDatasets = Object.values(typeDatasets);
        summary.summaryChartMonths = parseInt(process.env.SUMMARY_CHART_MONTHS) || 12;
        summary.chartData = timelineData;
        summary.apiStatus = {
            lastConnectionTime: apiStatus.lastConnectionTime,
            lastConnectionSuccess: apiStatus.lastConnectionSuccess,
            lastError: apiStatus.errorMessage
        };
        return res.json(summary);
    } catch (err) {
        logger.error('Error generating investment summary:', err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message,
            apiStatus: {
                lastConnectionTime: apiStatus.lastConnectionTime,
                lastConnectionSuccess: apiStatus.lastConnectionSuccess,
                lastError: apiStatus.errorMessage
            }
        });
    }
});

app.get('/investments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const investment = await Investment.findByPk(id, {
            include: [{
                model: InvestmentType,
                attributes: ['type', 'currentPrice']
            }]
        });
        if (!investment) {
            return res.status(404).json({ error: 'Investment not found' });
        }
        const investmentType = investment.InvestmentType;
        const investmentValue = await calculateInvestmentValue(investment, investmentType);
        return res.json({
            ...investment.toJSON(),
            date: moment(investment.date).format('jYYYY/jM/jD'),
            persianName: PERSIAN_NAMES[investment.type] || investment.type,
            ...investmentValue
        });
    } catch (err) {
        logger.error(`Error fetching investment ${id}:`, err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

app.put('/investments/:id', async (req, res) => {
    const { id } = req.params;
    const { type, amount, date } = req.body;
    try {
        const investment = await Investment.findByPk(id);
        if (!investment) {
            return res.status(404).json({ error: 'Investment not found' });
        }
        const investmentType = await InvestmentType.findOne({ where: { type } });
        if (!investmentType) {
            return res.status(404).json({ error: 'Investment type not found' });
        }
        const gregorianDate = moment(date, 'jYYYY/jM/jD').toDate();
        await investment.update({
            type,
            amount,
            date: gregorianDate
        });
        const investmentValue = await calculateInvestmentValue(investment, investmentType);
        return res.json({
            ...investment.toJSON(),
            date: moment(investment.date).format('jYYYY/jM/jD'),
            persianName: PERSIAN_NAMES[type] || type,
            ...investmentValue
        });
    } catch (err) {
        logger.error(`Error updating investment ${id}:`, err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

app.delete('/investments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const investment = await Investment.findByPk(id);
        if (!investment) {
            return res.status(404).json({ error: 'Investment not found' });
        }
        await investment.destroy();
        return res.status(200).json({
            message: 'Investment deleted successfully',
            deletedInvestment: {
                id: investment.id,
                type: investment.type,
                amount: investment.amount,
                date: moment(investment.date).format('jYYYY/jM/jD')
            }
        });
    } catch (err) {
        logger.error(`Error deleting investment ${id}:`, err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

app.get('/investment-types', async (req, res) => {
    try {
        const investmentTypes = await InvestmentType.findAll({
            attributes: ['type', 'currentPrice']
        });
        
        const enhancedTypes = await Promise.all(
            investmentTypes.map(async (type) => {
                const typeKey = type.type;
                const latestHistoricalPrice = await HistoricalPrice.findOne({
                    where: { type: typeKey },
                    order: [['date', 'DESC']]
                });
                
                return {
                    type: typeKey,
                    currentPrice: latestHistoricalPrice
                        ? latestHistoricalPrice.close
                        : type.currentPrice,
                    persianName: PERSIAN_NAMES[typeKey] || typeKey,
                    lastHistoricalDate: latestHistoricalPrice
                        ? moment(latestHistoricalPrice.date).format('jYYYY/jM/jD')
                        : null
                };
            })
        );
        
        enhancedTypes.sort((a, b) => {
            const aIndex = PRIORITY_TYPES.indexOf(a.type);
            const bIndex = PRIORITY_TYPES.indexOf(b.type);
            
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            
            const aHasPersianName = PERSIAN_NAMES.hasOwnProperty(a.type);
            const bHasPersianName = PERSIAN_NAMES.hasOwnProperty(b.type);
            
            if (aHasPersianName && !bHasPersianName) return -1;
            if (!aHasPersianName && bHasPersianName) return 1;
            
            return a.persianName.localeCompare(b.persianName);
        });
        
        return res.json(enhancedTypes);
    } catch (err) {
        logger.error('Error fetching investment types:', err);
        return res.status(500).json({
            error: 'Internal server error',
            details: err.message
        });
    }
});

app.get('/invested-types', async (req, res) => {
    try {
        const investedTypes = await getInvestedTypes();
        const typesWithDetails = await Promise.all(
            investedTypes.map(async (investedType) => {
                const investmentType = await InvestmentType.findOne({
                    where: { type: investedType.type }
                });
                
                const latestHistoricalPrice = await HistoricalPrice.findOne({
                    where: { type: investedType.type },
                    order: [['date', 'DESC']]
                });
                
                return {
                    type: investedType.type,
                    persianName: PERSIAN_NAMES[investedType.type] || investedType.type,
                    currentPrice: investmentType ? investmentType.currentPrice : null,
                    latestHistoricalPrice: latestHistoricalPrice ? {
                        date: moment(latestHistoricalPrice.date).format('jYYYY/jM/jD'),
                        close: latestHistoricalPrice.close
                    } : null
                };
            })
        );
        res.json(typesWithDetails);
    } catch (error) {
        logger.error('Error fetching invested types:', error);
        res.status(500).json({
            error: 'Failed to fetch invested types',
            details: error.message
        });
    }
});

function setupCronJobs() {
    logger.info(`Setting up price update cron job with schedule: ${process.env.UPDATE_CRONJOB}`);
    const priceUpdateJob = cron.schedule(process.env.UPDATE_CRONJOB, () => {
        logger.info('Scheduled price update initiated');
        updateInvestmentPrices()
            .then(() => logger.info('Scheduled price update completed'))
            .catch(error => logger.error('Scheduled price update failed', error));
    });

    const sessionCleanupJob = cron.schedule('0 3 * * *', () => {
        logger.info('Scheduled session cleanup initiated');
        cleanupOldSessionFiles();
    });

    return { priceUpdateJob, sessionCleanupJob };
}

function cleanupOldSessionFiles() {
    const sessionDir = process.env.SESSION_DIR || './sessions';
    const maxAge = parseInt(process.env.SESSION_FILES_MAX_AGE) || 604800000;
    const now = Date.now();
    
    try {
        logger.info(`Starting session files cleanup (files older than ${maxAge / (24 * 60 * 60 * 1000)} days)...`);
        
        if (!fs.existsSync(sessionDir)) {
            logger.info(`Session directory ${sessionDir} does not exist. Creating it...`);
            fs.mkdirSync(sessionDir, { recursive: true });
            return;
        }
        
        const sessionFiles = fs.readdirSync(sessionDir)
            .filter(file => file.endsWith('.json') && file !== '.gitkeep');
        
        let removedCount = 0;
        let totalFiles = sessionFiles.length;
        
        for (const file of sessionFiles) {
            const filePath = path.join(sessionDir, file);
            
            try {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                let shouldDelete = false;
                
                try {
                    const sessionData = JSON.parse(fileContent);
                    
                    if (sessionData.cookie && sessionData.cookie.expires) {
                        const expiryDate = new Date(sessionData.cookie.expires);
                        shouldDelete = expiryDate < new Date();
                        
                        if (shouldDelete) {
                            logger.debug(`Session file ${file} has expired cookies (expires: ${expiryDate.toISOString()})`);
                        }
                    } else if (sessionData._expires) {
                        const expiryDate = new Date(sessionData._expires);
                        shouldDelete = expiryDate < new Date();
                        
                        if (shouldDelete) {
                            logger.debug(`Session file ${file} has expired (expires: ${expiryDate.toISOString()})`);
                        }
                    } else {
                        const stats = fs.statSync(filePath);
                        const fileAge = now - stats.mtimeMs;
                        shouldDelete = fileAge > maxAge;
                        
                        if (shouldDelete) {
                            logger.debug(`Session file ${file} is old (age: ${fileAge / (24 * 60 * 60 * 1000)} days)`);
                        }
                    }

                    if (shouldDelete) {
                        fs.unlinkSync(filePath);
                        removedCount++;
                        logger.debug(`Removed session file: ${file}`);
                    }
                } catch (jsonError) {
                    logger.warn(`Invalid session file found: ${file}. Will be removed.`);
                    fs.unlinkSync(filePath);
                    removedCount++;
                }
            } catch (fileError) {
                logger.error(`Error processing session file ${file}: ${fileError.message}`);
            }
        }
        
        logger.info(`Session cleanup completed. Removed ${removedCount} out of ${totalFiles} files.`);
    } catch (error) {
        logger.error(`Error during session files cleanup: ${error.message}`);
    }
}

async function initializeApplication() {
    try {
        logger.info('Starting application initialization...');
        
        cleanupOldSessionFiles();

        logger.info(`Database dialect: ${process.env.DB_DIALECT || 'mysql'}`);
        if (process.env.DB_DIALECT === 'sqlite') {
            logger.info(`SQLite database path: ${process.env.SQLITE_PATH || './database.sqlite'}`);
        } else {
            logger.info(`MySQL database: ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}`);
        }
        
        await sequelize.sync({ alter: true });
        logger.info('Database synchronized');
        
        const typesCount = await InvestmentType.count();
        logger.info(`Found ${typesCount} investment types in database`);
        
        if (typesCount === 0) {
            logger.info('No investment types found. Performing initial seeding...');
            try {
                const latestPrices = await navasanClient.getLatestPrices();
                logger.info(`Received ${Object.keys(latestPrices).length} types from API for initial seeding`);
                for (const [type, data] of Object.entries(latestPrices)) {
                    await InvestmentType.create({
                        type,
                        currentPrice: parseFloat(data.value),
                        lastUpdated: new Date(),
                        persianName: PERSIAN_NAMES[type] || type
                    });
                }
                logger.info('Initial investment types seeded successfully');
            } catch (seedError) {
                logger.error('Failed to seed initial investment types', seedError);
            }
        }

        updateInvestmentPrices()
            .then(() => logger.info('Initial price update completed'))
            .catch(error => logger.error('Initial price update failed', error));
        
        const { priceUpdateJob, sessionCleanupJob } = setupCronJobs();
        
        const PORT = process.env.PORT || 3000;
        const server = app.listen(PORT, () => {
            console.log(`Dollarbaan is up and running on port ${PORT}`);
        });
        
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received. Shutting down gracefully');
            priceUpdateJob.stop();
            sessionCleanupJob.stop();
            server.close(() => {
                logger.info('Process terminated');
                process.exit(0);
            });
        });
    } catch (error) {
        logger.error('Application initialization failed', error);
        process.exit(1);
    }
}

initializeApplication();

module.exports = app;