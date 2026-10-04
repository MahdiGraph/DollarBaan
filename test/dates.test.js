'use strict';

process.env.LOG_DIR = 'off';

const test = require('node:test');
const assert = require('node:assert/strict');
const dates = require('../server/lib/dates');
const { parseLegacyDate, unitRatio, priceOn } = require('../server/services/legacy');

test('tehranDate uses the Tehran calendar day', () => {
    assert.equal(dates.tehranDate(new Date('2026-10-02T20:29:00Z')), '2026-10-02');
    assert.equal(dates.tehranDate(new Date('2026-10-02T20:30:00Z')), '2026-10-03');
    assert.equal(dates.tehranDate('not a date'), null);
});

test('ISO date helpers', () => {
    assert.ok(dates.isIsoDate('2024-02-29'));
    assert.ok(!dates.isIsoDate('2025-02-29'));
    assert.ok(!dates.isIsoDate('2025-1-01'));
    assert.equal(dates.addDays('2025-12-31', 1), '2026-01-01');
    assert.equal(dates.addMonths('2025-03-31', -1), '2025-02-28');
    assert.equal(dates.addMonths('2024-01-31', 1), '2024-02-29');
    assert.equal(dates.diffDays('2025-01-01', '2025-03-01'), 59);
});

test('Jalali formatting on the server', () => {
    assert.equal(dates.toJalali('2026-10-04'), '1405/07/12');
    assert.equal(dates.toJalali('2025-03-21'), '1404/01/01');
    assert.equal(dates.faDigits('1405/07/12'), '۱۴۰۵/۰۷/۱۲');
});

test('legacy dates from SQLite and MySQL', () => {
    assert.equal(parseLegacyDate('2024-03-19 20:30:00.000 +00:00').toISOString(), '2024-03-19T20:30:00.000Z');
    assert.equal(parseLegacyDate('2024-03-19 20:30:00').toISOString(), '2024-03-19T20:30:00.000Z');
    const date = new Date('2024-03-20T00:00:00Z');
    assert.equal(parseLegacyDate(date), date);
});

test('legacy unit ratio and purchase price', () => {
    const series = [{ date: '2024-01-01', close: 60000 }, { date: '2024-02-01', close: 62000 }];
    const legacy = [{ date: '2023-06-01', close: 5000 }, { date: '2024-01-01', close: 6000 }, { date: '2024-02-01', close: 6200 }];
    const ratio = unitRatio(series, legacy, 62000, 6200);
    assert.equal(ratio, 10);
    const plan = { series, legacySeries: legacy, ratio, current: 62000, legacyLatest: 6200 };
    assert.equal(priceOn(plan, '2024-01-15'), 60000);
    // before the new history starts, fall back to the scaled legacy price
    assert.equal(priceOn(plan, '2023-07-01'), 50000);
    assert.equal(priceOn({ ...plan, legacySeries: [] }, '2023-07-01'), 60000);
});
