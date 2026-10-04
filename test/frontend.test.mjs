import test from 'node:test';
import assert from 'node:assert/strict';
import {
    toJalaali, toGregorian, jalaliToIso, isoToJalali, monthLength, jalaliWeekday, isValidJalaali,
} from '../public/assets/js/lib/jalali.js';
import {
    parseNumber, normalizeNumber, searchKey, compactMoney, money, percent, quantity, setDisplayUnit, faDigits,
} from '../public/assets/js/format.js';
import { html, raw, escapeHtml } from '../public/assets/js/lib/dom.js';

test('Jalali conversion matches ICU for every day 1990-2045', () => {
    const icu = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
    for (let time = Date.UTC(1990, 0, 1); time <= Date.UTC(2045, 0, 1); time += 86400000) {
        const date = new Date(time);
        const parts = Object.fromEntries(icu.formatToParts(date).map((part) => [part.type, part.value]));
        const jalali = toJalaali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
        assert.deepEqual([jalali.jy, jalali.jm, jalali.jd], [Number(parts.year), Number(parts.month), Number(parts.day)]);
        assert.deepEqual(toGregorian(jalali.jy, jalali.jm, jalali.jd), { gy: date.getUTCFullYear(), gm: date.getUTCMonth() + 1, gd: date.getUTCDate() });
    }
});

test('Jalali helpers', () => {
    assert.equal(jalaliToIso(1405, 7, 12), '2026-10-04');
    assert.deepEqual(isoToJalali('2025-03-21'), { jy: 1404, jm: 1, jd: 1 });
    assert.equal(monthLength(1403, 12), 30);
    assert.equal(monthLength(1404, 12), 29);
    assert.equal(jalaliWeekday(1405, 7, 12), 1);
    assert.ok(isValidJalaali(1403, 12, 30));
    assert.ok(!isValidJalaali(1404, 12, 30));
});

test('number parsing accepts Persian digits and separators', () => {
    assert.equal(parseNumber('۱۲٬۵۰۰٫۵'), 12500.5);
    assert.equal(parseNumber('1,250,000'), 1250000);
    assert.equal(parseNumber('٣٤'), 34);
    assert.equal(parseNumber('abc'), null);
    assert.equal(parseNumber(''), null);
    assert.equal(normalizeNumber('۱ ۲۳۴'), '1234');
});

test('search keys normalize Arabic letters and spacing', () => {
    assert.equal(searchKey('طلاي ۱۸ عيار'), searchKey('طلای 18 عیار'));
    assert.equal(searchKey('بیت‌کوین'), 'بیتکوین');
    assert.equal(searchKey('USD_IRR_FREE'), 'usd irr free');
});

test('money formatting in toman and rial', () => {
    setDisplayUnit('toman');
    assert.equal(money(270310), `${faDigits('270,310').replace(/,/g, '٬')} تومان`);
    assert.equal(compactMoney(1_250_000_000), '۱٫۲۵ میلیارد');
    assert.equal(compactMoney(-2_500_000, { sign: true }), '−۲٫۵ میلیون');
    assert.equal(compactMoney(25_000_000, { sign: true }), '+۲۵ میلیون');
    assert.equal(percent(2.345), '+۲٫۳۵٪');
    assert.equal(percent(-0.5), '−۰٫۵۰٪');
    assert.equal(quantity(0.000123), '۰٫۰۰۰۱۲۳');
    setDisplayUnit('rial');
    assert.equal(money(1), '۱۰ ریال');
    setDisplayUnit('toman');
});

test('html templates escape interpolated values', () => {
    const name = '<img src=x onerror=alert(1)>';
    assert.equal(String(html`<b>${name}</b>`), `<b>${escapeHtml(name)}</b>`);
    assert.equal(String(html`<i>${raw('<em>ok</em>')}</i>`), '<i><em>ok</em></i>');
    assert.equal(String(html`${[html`<a>${'&'}</a>`, null, false]}`), '<a>&amp;</a>');
});
