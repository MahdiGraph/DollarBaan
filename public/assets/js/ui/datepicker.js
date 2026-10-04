import { html, icon, setHtml } from '../lib/dom.js';
import {
    isoToJalali, jalaliToIso, monthLength, jalaliWeekday, isValidJalaali, MONTH_NAMES, WEEKDAY_SHORT,
} from '../lib/jalali.js';
import { faDigits, latinDigits, todayIso } from '../format.js';

let uid = 0;
const pad = (value) => String(value).padStart(2, '0');

function display(iso) {
    if (!iso) return '';
    const { jy, jm, jd } = isoToJalali(iso);
    return faDigits(`${jy}/${pad(jm)}/${pad(jd)}`);
}

function parse(text) {
    const match = /^\s*(\d{4})\s*[/\-.\s]\s*(\d{1,2})\s*[/\-.\s]\s*(\d{1,2})\s*$/.exec(latinDigits(text));
    if (!match) return null;
    const [jy, jm, jd] = match.slice(1).map(Number);
    return isValidJalaali(jy, jm, jd) ? jalaliToIso(jy, jm, jd) : null;
}

/**
 * Jalali date field. `value`, `min` and `max` are Gregorian YYYY-MM-DD strings.
 */
export function createDatePicker(container, { value = todayIso(), min = '1990-01-01', max = todayIso(), onChange, label = 'تاریخ' } = {}) {
    uid += 1;
    const inputId = `date-${uid}`;
    container.classList.add('date-field');
    setHtml(container, html`
        <input id="${inputId}" class="input num" type="text" inputmode="numeric" autocomplete="off"
            placeholder="۱۴۰۴/۰۱/۰۱" aria-label="${label} (شمسی)">
        <button type="button" class="icon-btn plain addon-btn" aria-label="باز کردن تقویم" aria-expanded="false">${icon('calendar')}</button>
    `);
    const input = container.querySelector('input');
    const toggle = container.querySelector('button');
    let current = value;
    let view = isoToJalali(current || max);
    let popover = null;

    const minJ = isoToJalali(min);
    const maxJ = isoToJalali(max);

    function setValue(iso, { emit = true } = {}) {
        current = iso;
        input.value = display(iso);
        input.classList.remove('invalid');
        if (iso) view = isoToJalali(iso);
        if (emit && onChange) onChange(iso);
    }

    function commitTyped() {
        if (!input.value.trim()) {
            input.value = display(current);
            return;
        }
        const iso = parse(input.value);
        if (iso && iso >= min && iso <= max) {
            if (iso !== current) setValue(iso);
            else input.value = display(iso);
        } else {
            input.classList.add('invalid');
        }
    }

    function renderPopover() {
        const { jy, jm } = view;
        const days = monthLength(jy, jm);
        const offset = jalaliWeekday(jy, jm, 1);
        const today = todayIso();
        const years = [];
        for (let year = maxJ.jy; year >= minJ.jy; year -= 1) years.push(year);
        const cells = [];
        for (let i = 0; i < offset; i += 1) cells.push(html`<span></span>`);
        for (let day = 1; day <= days; day += 1) {
            const iso = jalaliToIso(jy, jm, day);
            const classes = ['dp-day'];
            if (iso === today) classes.push('is-today');
            if (iso === current) classes.push('is-selected');
            if ((offset + day - 1) % 7 === 6) classes.push('is-friday');
            cells.push(html`<button type="button" class="${classes.join(' ')}" data-day="${iso}"
                ${iso < min || iso > max ? html`disabled` : ''} aria-pressed="${iso === current}">${faDigits(day)}</button>`);
        }
        setHtml(popover, html`
            <div class="dp-head">
                <button type="button" class="icon-btn plain icon-btn-sm" data-nav="-1" aria-label="ماه قبل">${icon('chevron-right')}</button>
                <select class="select dp-month" aria-label="ماه">
                    ${MONTH_NAMES.map((name, index) => html`<option value="${index + 1}" ${index + 1 === jm ? html`selected` : ''}>${name}</option>`)}
                </select>
                <select class="select dp-year" aria-label="سال">
                    ${years.map((year) => html`<option value="${year}" ${year === jy ? html`selected` : ''}>${faDigits(year)}</option>`)}
                </select>
                <button type="button" class="icon-btn plain icon-btn-sm" data-nav="1" aria-label="ماه بعد">${icon('chevron-left')}</button>
            </div>
            <div class="dp-grid">
                ${WEEKDAY_SHORT.map((day) => html`<span class="dp-weekday">${day}</span>`)}
                ${cells}
            </div>
            <div class="dp-foot">
                <button type="button" class="btn btn-ghost btn-sm" data-today>امروز</button>
                <button type="button" class="btn btn-ghost btn-sm" data-close-picker>بستن</button>
            </div>
        `);
    }

    function move(delta) {
        let { jy, jm } = view;
        jm += delta;
        if (jm < 1) { jm = 12; jy -= 1; }
        if (jm > 12) { jm = 1; jy += 1; }
        if (jy < minJ.jy || jy > maxJ.jy) return;
        view = { jy, jm, jd: 1 };
        renderPopover();
    }

    /** Fixed to the viewport so it can overflow dialogs; aligned to the field's start (right) edge. */
    function place() {
        if (!popover) return;
        const rect = container.getBoundingClientRect();
        const width = Math.min(300, window.innerWidth - 16);
        popover.style.width = `${width}px`;
        const height = popover.offsetHeight;
        const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
        let top = rect.bottom + 6;
        if (top + height > window.innerHeight - 8 && rect.top - height - 6 > 8) top = rect.top - height - 6;
        popover.style.left = `${left}px`;
        popover.style.top = `${Math.max(8, top)}px`;
    }

    function onDocumentPointer(event) {
        if (!container.contains(event.target)) close();
    }

    function open() {
        if (popover) return;
        commitTyped();
        view = isoToJalali(current || max);
        popover = document.createElement('div');
        popover.className = 'datepicker';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-label', 'انتخاب تاریخ');
        container.append(popover);
        renderPopover();
        place();
        toggle.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', onDocumentPointer, true);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        const selected = popover.querySelector('.is-selected') || popover.querySelector('.dp-day:not(:disabled)');
        if (selected) selected.focus();

        popover.addEventListener('click', (event) => {
            const day = event.target.closest('[data-day]');
            if (day && !day.disabled) {
                setValue(day.dataset.day);
                close(true);
                return;
            }
            const nav = event.target.closest('[data-nav]');
            if (nav) {
                move(Number(nav.dataset.nav));
                place();
            }
            if (event.target.closest('[data-today]')) {
                setValue(todayIso() > max ? max : todayIso());
                close(true);
            }
            if (event.target.closest('[data-close-picker]')) close(true);
        });
        popover.addEventListener('change', (event) => {
            if (event.target.classList.contains('dp-month')) view = { ...view, jm: Number(event.target.value) };
            if (event.target.classList.contains('dp-year')) view = { ...view, jy: Number(event.target.value) };
            renderPopover();
            place();
        });
        popover.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(true);
            }
        });
    }

    function close(focusInput = false) {
        if (!popover) return;
        popover.remove();
        popover = null;
        toggle.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', onDocumentPointer, true);
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
        if (focusInput) input.focus();
    }

    toggle.addEventListener('click', () => (popover ? close(true) : open()));
    input.addEventListener('blur', commitTyped);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitTyped();
        } else if (event.key === 'ArrowDown' && event.altKey) {
            open();
        } else if (event.key === 'Escape' && popover) {
            event.preventDefault();
            event.stopPropagation();
            close(true);
        }
    });

    setValue(value, { emit: false });

    return {
        id: inputId,
        get value() {
            return current;
        },
        set value(iso) {
            setValue(iso, { emit: false });
        },
        isValid() {
            commitTyped();
            return Boolean(current) && !input.classList.contains('invalid');
        },
        close,
    };
}
