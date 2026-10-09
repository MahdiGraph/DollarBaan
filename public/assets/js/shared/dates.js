// Shared by the Node server and the in-app (local) backend.
// Every stored date is a plain YYYY-MM-DD "market day" in Tehran time.
const TEHRAN = 'Asia/Tehran';
export const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const tehranParts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEHRAN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const jalaliParts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

function partsOf(formatter, date) {
    const parts = {};
    for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
    return parts;
}

/** Tehran calendar day (YYYY-MM-DD) of an instant. */
export function tehranDate(input = new Date()) {
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return null;
    const { year, month, day } = partsOf(tehranParts, date);
    return `${year}-${month}-${day}`;
}

export function isIsoDate(value) {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(iso, days) {
    const date = new Date(`${iso}T00:00:00Z`);
    return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(fromIso, toIso) {
    return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

export function addMonths(iso, months) {
    const date = new Date(`${iso}T00:00:00Z`);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date.toISOString().slice(0, 10);
}

/** Jalali date (YYYY/MM/DD, Latin digits) of a YYYY-MM-DD day. */
export function toJalali(iso) {
    const { year, month, day } = partsOf(jalaliParts, new Date(`${iso}T12:00:00Z`));
    return `${year}/${month}/${day}`;
}

export function faDigits(value) {
    return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[digit]);
}

/** Unix seconds of Tehran midnight at the start of the given day. */
export function tehranMidnightUnix(iso) {
    return Math.floor(Date.parse(`${iso}T00:00:00+03:30`) / 1000);
}
