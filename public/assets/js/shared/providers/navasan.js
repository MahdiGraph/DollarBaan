// Shared by the Node server and the in-app (local) backend.
import { tehranDate, tehranMidnightUnix, addMonths } from '../dates.js';

const BASE_URL = 'https://api.navasan.tech';

// Navasan keys exposed by DollarBaan. Items that match an Iran Market asset use its
// canonical symbol, so holdings keep working when the data source is switched.
// Navasan values are in toman. Its crypto quotes are left out because their unit is
// not documented; USDT is quoted in toman like the rest of the Iranian market.
const ITEMS = [
    ['usd_sell', 'USD_IRR_FREE', 'دلار آمریکا', 'currency'],
    ['eur_sell', 'EUR_IRR_FREE', 'یورو', 'currency'],
    ['gbp', 'GBP_IRR_FREE', 'پوند انگلیس', 'currency'],
    ['aed_sell', 'AED_IRR_FREE', 'درهم امارات', 'currency'],
    ['try', 'TRY_IRR_FREE', 'لیر ترکیه', 'currency'],
    ['cad', 'CAD_IRR_FREE', 'دلار کانادا', 'currency'],
    ['aud', 'AUD_IRR_FREE', 'دلار استرالیا', 'currency'],
    ['cny', 'CNY_IRR_FREE', 'یوان چین', 'currency'],
    ['chf', 'CHF_IRR_FREE', 'فرانک سوئیس', 'currency'],
    ['sek', 'SEK_IRR_FREE', 'کرون سوئد', 'currency'],
    ['nok', 'NOK_IRR_FREE', 'کرون نروژ', 'currency'],
    ['dkk', 'DKK_IRR_FREE', 'کرون دانمارک', 'currency'],
    ['rub', 'RUB_IRR_FREE', 'روبل روسیه', 'currency'],
    ['sar', 'SAR_IRR_FREE', 'ریال عربستان', 'currency'],
    ['qar', 'QAR_IRR_FREE', 'ریال قطر', 'currency'],
    ['omr', 'OMR_IRR_FREE', 'ریال عمان', 'currency'],
    ['bhd', 'BHD_IRR_FREE', 'دینار بحرین', 'currency'],
    ['kwd', 'KWD_IRR_FREE', 'دینار کویت', 'currency'],
    ['inr', 'INR_IRR_FREE', 'روپیه هند', 'currency'],
    ['myr', 'MYR_IRR_FREE', 'رینگیت مالزی', 'currency'],
    ['sgd', 'SGD_IRR_FREE', 'دلار سنگاپور', 'currency'],
    ['hkd', 'HKD_IRR_FREE', 'دلار هنگ کنگ', 'currency'],
    ['nzd', 'NZD_IRR_FREE', 'دلار نیوزیلند', 'currency'],
    ['afn', 'AFN_IRR_FREE', 'افغانی', 'currency'],
    ['azn', 'AZN_IRR_FREE', 'منات آذربایجان', 'currency'],
    ['amd', 'AMD_IRR_FREE', 'درام ارمنستان', 'currency'],
    ['gel', 'GEL_IRR_FREE', 'لاری گرجستان', 'currency'],
    ['jpy', 'NV_JPY', 'ین ژاپن (نوسان)', 'currency'],
    ['iqd', 'NV_IQD', 'دینار عراق (نوسان)', 'currency'],
    ['eur_hav', 'NV_EUR_HAV', 'حواله یورو', 'currency'],
    ['usd_farda_sell', 'NV_USD_FARDA', 'دلار فردایی تهران', 'currency'],
    ['harat_naghdi_sell', 'NV_USD_HARAT', 'دلار هرات', 'currency'],
    ['dolar_soleimanie_sell', 'NV_USD_SOLEIMANIE', 'دلار سلیمانیه', 'currency'],
    ['dolar_kordestan_sell', 'NV_USD_KORDESTAN', 'دلار کردستان', 'currency'],
    ['dolar_mashad_sell', 'NV_USD_MASHAD', 'دلار مشهد', 'currency'],
    ['mex_usd_sell', 'NV_USD_MEX', 'دلار صرافی ملی', 'currency'],
    ['mob_usd', 'NV_USD_MOB', 'دلار مبادله‌ای', 'currency'],
    ['sekkeh', 'COIN_EMAMI_IRR', 'سکه امامی', 'coin', 'coin'],
    ['bahar', 'COIN_BAHAR_IRR', 'سکه بهار آزادی', 'coin', 'coin'],
    ['nim', 'COIN_HALF_IRR', 'نیم سکه', 'coin', 'coin'],
    ['rob', 'COIN_QUARTER_IRR', 'ربع سکه', 'coin', 'coin'],
    ['gerami', 'COIN_GRAMI_IRR', 'سکه گرمی', 'coin', 'coin'],
    ['18ayar', 'GOLD_18K_IRR', 'طلای ۱۸ عیار (هر گرم)', 'gold', 'gram'],
    ['abshodeh', 'GOLD_MESGHAL_IRR', 'مثقال طلا (آبشده)', 'gold', 'mesghal'],
    ['usdt', 'USDT_IRR', 'تتر', 'crypto'],
].map(([key, symbol, nameFa, category, unit = 'unit']) => ({ key, symbol, nameFa, category, unit }));

const BY_KEY = new Map(ITEMS.map((item) => [item.key, item]));
const BY_SYMBOL = new Map(ITEMS.map((item) => [item.symbol, item]));

function num(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeLatest(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Unexpected response from Navasan');
    }
    const quotes = [];
    for (const [key, value] of Object.entries(payload)) {
        const item = BY_KEY.get(key);
        if (!item || !value || typeof value !== 'object') continue;
        const price = num(value.value);
        if (!(price > 0)) continue;
        const change = num(value.change);
        const prevClose = change !== null && price - change > 0 ? price - change : null;
        const timestamp = num(value.timestamp);
        quotes.push({
            symbol: item.symbol,
            nameFa: item.nameFa,
            nameEn: key,
            category: item.category,
            currency: 'IRT',
            unit: item.unit,
            price,
            high: null,
            low: null,
            prevClose,
            time: timestamp ? new Date(timestamp * 1000) : null,
            stale: false,
            rateSymbol: null,
            proxy: null,
        });
    }
    if (quotes.length === 0) {
        const message = typeof payload.message === 'string' ? payload.message
            : typeof payload.error === 'string' ? payload.error : 'no usable prices';
        throw new Error(`Navasan: ${message}`);
    }
    return quotes;
}

export function normalizeHistory(payload) {
    const rows = Array.isArray(payload) ? payload : [];
    const out = [];
    for (const row of rows) {
        const close = num(row && row.close);
        const timestamp = num(row && row.timestamp);
        if (!(close > 0) || !timestamp) continue;
        const open = num(row.open);
        const high = num(row.high);
        const low = num(row.low);
        out.push({
            date: tehranDate(timestamp * 1000),
            open: open > 0 ? open : close,
            high: high > 0 ? high : close,
            low: low > 0 ? low : close,
            close,
        });
    }
    return out;
}

export class NavasanProvider {
    constructor({ apiKey = '', logger = console, fetchJson } = {}) {
        this.id = 'navasan';
        this.name = 'نوسان';
        this.apiKey = String(apiKey || '').trim();
        this.logger = logger;
        this.fetchJson = fetchJson;
        // The free plan allows ~120 calls a month: fetch a history once, then grow it from snapshots.
        this.backfillOnly = true;
        this.historyRefreshMs = Infinity;
    }

    url(endpoint, params = {}) {
        if (!this.apiKey) {
            const error = new Error('کلید API نوسان در تنظیمات وارد نشده است');
            error.code = 'missing_key';
            throw error;
        }
        const query = new URLSearchParams({ api_key: this.apiKey, ...params });
        return `${BASE_URL}/${endpoint}/?${query}`;
    }

    async fetchLatest() {
        const { data } = await this.fetchJson(this.url('latest'));
        const quotes = normalizeLatest(data);
        const newest = Math.max(...quotes.map((quote) => (quote.time ? quote.time.getTime() : 0)));
        return { quotes, publishedAt: newest > 0 ? new Date(newest).toISOString() : null };
    }

    async prepare() {}

    hasHistory(symbol) {
        return BY_SYMBOL.has(symbol);
    }

    async fetchHistory(symbol, { from } = {}) {
        const item = BY_SYMBOL.get(symbol);
        if (!item) return [];
        const today = tehranDate();
        const start = from || addMonths(today, -36);
        const { data } = await this.fetchJson(this.url('ohlcSearch', {
            item: item.key,
            start: String(tehranMidnightUnix(start)),
            end: String(tehranMidnightUnix(today) + 86399),
        }));
        return normalizeHistory(data);
    }

    async test() {
        const { data } = await this.fetchJson(this.url('latest', { item: 'usd_sell' }));
        // With `item`, Navasan may answer with the bare quote instead of a keyed object.
        const payload = data && typeof data === 'object' && 'value' in data ? { usd_sell: data } : data;
        return { publishedAt: null, sample: normalizeLatest(payload).length };
    }
}
