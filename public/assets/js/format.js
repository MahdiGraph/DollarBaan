import { isoToJalali, MONTH_NAMES } from './lib/jalali.js';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const settings = { unit: 'toman' };

const integer = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const decimals = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((digits) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: digits }));
const fixed1 = new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fixed2 = new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeFormat = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' });

export const UNIT_LABELS = {
    unit: 'واحد',
    gram: 'گرم',
    coin: 'عدد',
    mesghal: 'مثقال',
    troy_ounce: 'اونس',
};

export const CATEGORY_LABELS = {
    currency: 'ارز',
    coin: 'سکه',
    metal: 'نقره و فلزات',
    gold: 'طلا',
    fund: 'صندوق طلا',
    crypto: 'رمزارز',
    custom: 'دارایی دستی',
};

export const KIND_LABELS = {
    cash: 'پول نقد',
    deposit: 'سپرده بانکی',
    realestate: 'ملک',
    vehicle: 'خودرو',
    stock: 'سهام و صندوق',
    other: 'سایر',
};

export function setDisplayUnit(unit) {
    settings.unit = unit === 'rial' ? 'rial' : 'toman';
}

export function displayUnit() {
    return settings.unit;
}

export function currencyLabel() {
    return settings.unit === 'rial' ? 'ریال' : 'تومان';
}

/** Toman amount in the user's display unit. */
export function toDisplay(toman) {
    return settings.unit === 'rial' ? toman * 10 : toman;
}

export function fromDisplay(value) {
    return settings.unit === 'rial' ? value / 10 : value;
}

export function faDigits(value) {
    return String(value).replace(/[0-9]/g, (digit) => FA_DIGITS[digit]);
}

export function latinDigits(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/[۰-۹]/g, (digit) => String(FA_DIGITS.indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

/** Converts Persian/Arabic digits and separators to a plain Latin number string. */
export function normalizeNumber(value) {
    return latinDigits(value).replace(/[٫]/g, '.').replace(/[,٬،\s]/g, '');
}

export function parseNumber(value) {
    const text = normalizeNumber(value);
    if (!text || !/^-?\d*\.?\d*$/.test(text) || text === '.' || text === '-') return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
}

const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

export function number(value, maxDigits = 0) {
    if (!isNum(value)) return '—';
    return decimals[Math.max(0, Math.min(8, maxDigits))].format(value);
}

/** Money in the display unit: "۲۷۰٬۳۱۰ تومان". */
export function money(toman, { unit = true, sign = false } = {}) {
    if (!isNum(toman)) return '—';
    const value = toDisplay(toman);
    const abs = Math.abs(value);
    const digits = abs > 0 && abs < 10 ? 2 : abs < 1000 && abs % 1 !== 0 ? 1 : 0;
    let text = decimals[digits].format(abs);
    if (value < 0) text = `−${text}`;
    else if (sign && value > 0) text = `+${text}`;
    return unit ? `${text} ${currencyLabel()}` : text;
}

const SCALES = [
    [1e12, 'هزار میلیارد'],
    [1e9, 'میلیارد'],
    [1e6, 'میلیون'],
    [1e3, 'هزار'],
];

/** Short money for tight spaces: "۲۷۰ هزار"، "۱٫۲ میلیارد". */
export function compactMoney(toman, { unit = false, sign = false } = {}) {
    if (!isNum(toman)) return '—';
    const value = toDisplay(toman);
    const abs = Math.abs(value);
    let text = integer.format(abs);
    for (const [size, label] of SCALES) {
        if (abs >= size) {
            const scaled = abs / size;
            const formatter = scaled >= 100 ? decimals[0] : scaled >= 10 ? decimals[1] : decimals[2];
            text = `${formatter.format(scaled)} ${label}`;
            break;
        }
    }
    if (value < 0) text = `−${text}`;
    else if (sign && value > 0) text = `+${text}`;
    return unit ? `${text} ${currencyLabel()}` : text;
}

export function percent(value, { sign = true, digits = 2 } = {}) {
    if (!isNum(value)) return '—';
    const formatter = digits === 1 ? fixed1 : fixed2;
    const text = formatter.format(Math.abs(value));
    const prefix = value < 0 ? '−' : sign && value > 0 ? '+' : '';
    return `${prefix}${text}٪`;
}

/** Quantities keep the precision they need (crypto can be tiny). */
export function quantity(value) {
    if (!isNum(value)) return '—';
    const abs = Math.abs(value);
    const digits = abs === 0 ? 0 : abs < 0.001 ? 8 : abs < 1 ? 6 : abs < 100 ? 4 : 2;
    return decimals[digits].format(value);
}

export function unitLabel(unit) {
    if (!unit) return 'واحد';
    return UNIT_LABELS[unit] || unit;
}

export function jalaliParts(iso) {
    return isoToJalali(String(iso).slice(0, 10));
}

/** "۱۴۰۵/۰۷/۱۲" */
export function jalaliDate(iso) {
    if (!iso) return '—';
    const { jy, jm, jd } = jalaliParts(iso);
    return faDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/** "۱۲ مهر ۱۴۰۵" */
export function jalaliLong(iso, { year = true } = {}) {
    if (!iso) return '—';
    const { jy, jm, jd } = jalaliParts(iso);
    return faDigits(`${jd} ${MONTH_NAMES[jm - 1]}${year ? ` ${jy}` : ''}`);
}

/** "مهر ۱۴۰۵" */
export function jalaliMonth(iso) {
    const { jy, jm } = jalaliParts(iso);
    return faDigits(`${MONTH_NAMES[jm - 1]} ${jy}`);
}

export function timeOfDay(value) {
    if (!value) return '';
    return timeFormat.format(new Date(value));
}

/** "۵ دقیقه پیش" for past instants, "۲۵ دقیقه دیگر" for future ones. */
export function relativeTime(value) {
    if (!value) return 'هرگز';
    const diff = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    const future = diff < 0;
    const seconds = Math.abs(diff);
    if (seconds < 45) return future ? 'چند لحظه دیگر' : 'همین الان';
    const suffix = future ? 'دیگر' : 'پیش';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${faDigits(minutes)} دقیقه ${suffix}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${faDigits(hours)} ساعت ${suffix}`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${faDigits(days)} روز ${suffix}`;
    return jalaliDate(new Date(value).toISOString());
}

/** Sign class for coloring deltas: "pos" | "neg" | "". */
export function trend(value) {
    if (!isNum(value) || Math.abs(value) < 1e-9) return '';
    return value > 0 ? 'pos' : 'neg';
}

/** Today's date in Tehran as YYYY-MM-DD. */
export function todayIso() {
    const parts = {};
    for (const part of new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())) {
        parts[part.type] = part.value;
    }
    return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Normalizes Persian text for search (Arabic letters, ZWNJ, digits). */
export function searchKey(text) {
    return latinDigits(text)
        .toLowerCase()
        .replace(/[يى]/g, 'ی')
        .replace(/ك/g, 'ک')
        .replace(/[ۀة]/g, 'ه')
        .replace(/[أإآ]/g, 'ا')
        .replace(/‌/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}
