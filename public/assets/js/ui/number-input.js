import { normalizeNumber } from '../format.js';

const SIGNIFICANT = /[\d.]/;

function clean(raw, decimals) {
    let text = normalizeNumber(raw).replace(/[^\d.]/g, '');
    if (!decimals) text = text.replace(/\./g, '');
    const dot = text.indexOf('.');
    if (dot !== -1) text = `${text.slice(0, dot + 1)}${text.slice(dot + 1).replace(/\./g, '')}`;
    return text;
}

function group(text) {
    const [whole, fraction] = text.split('.');
    const digits = whole.replace(/^0+(?=\d)/, '');
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fraction === undefined ? grouped : `${grouped || '0'}.${fraction.slice(0, 10)}`;
}

function plain(value) {
    if (!Number.isFinite(value)) return '';
    const fixed = Math.abs(value) >= 1 ? value.toFixed(6) : value.toPrecision(10);
    const text = Number(fixed).toString();
    if (!/e/i.test(text)) return text;
    return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Live thousands separators on a text input, accepting Persian/Arabic digits.
 * Returns an object with a numeric `value` property (null when empty).
 */
export function bindNumberInput(input, { decimals = true, onChange } = {}) {
    input.setAttribute('inputmode', decimals ? 'decimal' : 'numeric');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('dir', 'ltr');
    input.classList.add('num');

    const control = {
        get value() {
            const text = input.value.replace(/,/g, '');
            if (!text || text === '.') return null;
            const parsed = Number(text);
            return Number.isFinite(parsed) ? parsed : null;
        },
        set value(number) {
            input.value = number === null || number === undefined || !Number.isFinite(number) ? '' : group(plain(number));
        },
    };

    input.addEventListener('input', () => {
        const raw = input.value;
        const caret = input.selectionStart === null ? raw.length : input.selectionStart;
        const before = clean(raw.slice(0, caret), decimals).length;
        const formatted = group(clean(raw, decimals));
        if (formatted !== raw) {
            input.value = formatted;
            let position = 0;
            let seen = 0;
            while (position < formatted.length && seen < before) {
                if (SIGNIFICANT.test(formatted[position])) seen += 1;
                position += 1;
            }
            input.setSelectionRange(position, position);
        }
        if (onChange) onChange(control.value);
    });

    return control;
}
