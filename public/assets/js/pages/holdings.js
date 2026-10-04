import { store } from '../state.js';
import { html, icon, setHtml } from '../lib/dom.js';
import {
    money, compactMoney, percent, quantity, unitLabel, jalaliDate, searchKey, CATEGORY_LABELS, trend, number,
} from '../format.js';
import { avatar, assetCell, deltaText } from '../ui/asset-visuals.js';
import { openTransactionForm } from '../ui/transaction-form.js';

const SORTS = [
    ['value', 'بیشترین ارزش'],
    ['pnl', 'بیشترین سود'],
    ['pnlPct', 'بیشترین بازده'],
    ['day', 'تغییر امروز'],
    ['name', 'نام'],
];

function sortRows(rows, sort) {
    const list = [...rows];
    const by = {
        value: (a, b) => b.value - a.value,
        pnl: (a, b) => b.unrealized - a.unrealized,
        pnlPct: (a, b) => (b.unrealizedPct ?? -Infinity) - (a.unrealizedPct ?? -Infinity),
        day: (a, b) => (b.dayChangePct ?? -Infinity) - (a.dayChangePct ?? -Infinity),
        name: (a, b) => a.name.localeCompare(b.name, 'fa'),
    }[sort];
    return list.sort(by);
}

function summary(totals) {
    return html`
        <div class="summary-strip">
            <div><span class="label">ارزش روز</span><span class="value">${money(totals.value)}</span></div>
            <div><span class="label">بهای تمام‌شده</span><span class="value">${money(totals.cost)}</span></div>
            <div><span class="label">سود و زیان باز</span>
                <span class="value ${trend(totals.unrealized)}">${compactMoney(totals.unrealized, { sign: true, unit: true })}</span></div>
            <div><span class="label">سود محقق‌شده</span>
                <span class="value ${trend(totals.realized)}">${compactMoney(totals.realized, { sign: true, unit: true })}</span></div>
        </div>`;
}

function table(rows) {
    return html`
        <div class="card desktop-table">
            <div class="table-wrap">
                <table class="table">
                    <thead>
                        <tr>
                            <th>دارایی</th>
                            <th class="end">مقدار</th>
                            <th class="end">میانگین خرید</th>
                            <th class="end">قیمت روز</th>
                            <th class="end">ارزش</th>
                            <th class="end">سود و زیان</th>
                            <th>سهم از سبد</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => html`
                            <tr class="clickable" data-symbol="${row.symbol}" tabindex="0">
                                <td>${assetCell(row)}</td>
                                <td class="end">${quantity(row.quantity)}<span class="cell-sub">${unitLabel(row.unit)}</span></td>
                                <td class="end">${money(row.avgCost, { unit: false })}</td>
                                <td class="end">${money(row.price, { unit: false })}<span class="cell-sub">${deltaText(row.dayChangePct)}</span></td>
                                <td class="end strong">${money(row.value, { unit: false })}</td>
                                <td class="end">
                                    <span class="${trend(row.unrealized)}">${money(row.unrealized, { unit: false, sign: true })}</span>
                                    <span class="cell-sub">${deltaText(row.unrealizedPct)}</span>
                                </td>
                                <td>
                                    <div class="weight-cell">
                                        <span>${percent(row.weight, { sign: false, digits: 1 })}</span>
                                        <div class="meter"><span style="width:${Math.min(100, row.weight).toFixed(2)}%"></span></div>
                                    </div>
                                </td>
                            </tr>`)}
                    </tbody>
                </table>
            </div>
        </div>`;
}

function cards(rows) {
    return html`
        <div class="card mobile-cards">
            <div class="list">
                ${rows.map((row) => html`
                    <a class="list-row" href="#/asset/${row.symbol}">
                        ${avatar(row)}
                        <div class="grow">
                            <span class="title">${row.name}</span>
                            <span class="meta">${quantity(row.quantity)} ${unitLabel(row.unit)} · میانگین ${compactMoney(row.avgCost)}</span>
                        </div>
                        <div class="end">
                            <span class="value">${compactMoney(row.value)}</span>
                            <span class="sub">${deltaText(row.unrealizedPct)}</span>
                        </div>
                    </a>`)}
            </div>
        </div>`;
}

function closedTable(rows) {
    if (!rows.length) return html`<div class="card"><div class="empty"><p>هنوز دارایی‌ای را به‌طور کامل نفروخته‌اید.</p></div></div>`;
    return html`
        <div class="card">
            <div class="list">
                ${rows.map((row) => html`
                    <a class="list-row" href="#/asset/${row.symbol}">
                        ${avatar(row, 'sm')}
                        <div class="grow">
                            <span class="title">${row.name}</span>
                            <span class="meta">آخرین معامله ${jalaliDate(row.lastDate)} · ${number(row.count)} تراکنش</span>
                        </div>
                        <div class="end">
                            <span class="value ${trend(row.realized)}">${compactMoney(row.realized, { sign: true, unit: true })}</span>
                            <span class="sub">${deltaText(row.pnlPct)}</span>
                        </div>
                    </a>`)}
            </div>
        </div>`;
}

export function mount({ view, setTitle }) {
    setTitle('دارایی‌های من');
    let alive = true;
    let portfolio = null;
    const filters = { query: '', category: 'all', sort: 'value', closed: false };

    setHtml(view, html`<div class="card card-pad"><span class="skeleton" style="height:240px"></span></div>`);

    function filtered() {
        const tokens = searchKey(filters.query).split(' ').filter(Boolean);
        return sortRows(portfolio.holdings.filter((row) => {
            if (filters.category !== 'all' && row.category !== filters.category) return false;
            if (!tokens.length) return true;
            const key = searchKey(`${row.name} ${row.symbol.replace(/_/g, ' ')}`);
            return tokens.every((token) => key.includes(token));
        }), filters.sort);
    }

    function renderResults() {
        const target = view.querySelector('[data-results]');
        if (!target) return;
        const rows = filtered();
        setHtml(target, html`
            ${rows.length ? html`${table(rows)}${cards(rows)}` : html`<div class="card"><div class="empty"><p>دارایی‌ای با این فیلترها پیدا نشد.</p></div></div>`}
            ${filters.closed ? html`<div class="section-title"><h2>دارایی‌های فروخته‌شده</h2></div>${closedTable(portfolio.closed)}` : ''}`);
    }

    function render() {
        if (!portfolio.holdings.length && !portfolio.closed.length) {
            setHtml(view, html`
                <div class="card">
                    <div class="empty" style="padding:56px 24px">
                        <span class="empty-icon">${icon('wallet')}</span>
                        <h3>هنوز دارایی‌ای ثبت نکرده‌اید</h3>
                        <p>با ثبت اولین خرید، دارایی‌های شما همراه با ارزش روز، میانگین خرید و سود و زیان اینجا نمایش داده می‌شوند.</p>
                        <div class="actions"><button type="button" class="btn btn-primary" data-add>${icon('plus')}<span>ثبت خرید</span></button></div>
                    </div>
                </div>`);
            return;
        }
        const present = new Set(portfolio.holdings.map((row) => row.category));
        const categories = store.categories.filter((key) => present.has(key));
        setHtml(view, html`
            ${summary(portfolio.totals)}
            <div class="toolbar">
                <label class="search-input">${icon('search')}
                    <input class="input" type="search" placeholder="جستجو در دارایی‌ها…" aria-label="جستجو در دارایی‌ها" value="${filters.query}" data-query>
                </label>
                <div class="chips" role="group" aria-label="دسته‌بندی">
                    <button type="button" class="chip" data-category="all" aria-pressed="${filters.category === 'all'}">همه <span class="count">${number(portfolio.holdings.length)}</span></button>
                    ${categories.map((key) => html`<button type="button" class="chip" data-category="${key}" aria-pressed="${filters.category === key}">${CATEGORY_LABELS[key]}</button>`)}
                </div>
                <span class="spacer"></span>
                <select class="select" style="width:auto;min-height:40px" aria-label="مرتب‌سازی" data-sort>
                    ${SORTS.map(([key, label]) => html`<option value="${key}" ${key === filters.sort ? html`selected` : ''}>${label}</option>`)}
                </select>
                <label class="check"><input type="checkbox" data-closed ${filters.closed ? html`checked` : ''}>فروخته‌شده‌ها</label>
            </div>
            <div data-results></div>`);
        renderResults();
    }

    async function load({ quiet = false } = {}) {
        if (quiet) view.classList.add('is-refreshing');
        try {
            portfolio = await store.loadPortfolio();
            if (alive) render();
        } catch (error) {
            if (alive) setHtml(view, html`<div class="alert error">${icon('circle-alert')}<div class="grow">${error.message}</div></div>`);
        } finally {
            view.classList.remove('is-refreshing');
        }
    }

    const onClick = (event) => {
        const chip = event.target.closest('[data-category]');
        if (chip) {
            filters.category = chip.dataset.category;
            for (const element of view.querySelectorAll('[data-category]')) {
                element.setAttribute('aria-pressed', String(element.dataset.category === filters.category));
            }
            renderResults();
            return;
        }
        const row = event.target.closest('tr[data-symbol]');
        if (row) {
            window.location.hash = `#/asset/${row.dataset.symbol}`;
            return;
        }
        if (event.target.closest('[data-add]')) openTransactionForm();
    };
    const onInput = (event) => {
        if (event.target.matches('[data-query]')) {
            filters.query = event.target.value;
            renderResults();
        }
    };
    const onChange = (event) => {
        if (event.target.matches('[data-sort]')) filters.sort = event.target.value;
        if (event.target.matches('[data-closed]')) filters.closed = event.target.checked;
        renderResults();
    };
    const onKey = (event) => {
        const row = event.target.closest('tr[data-symbol]');
        if (row && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            window.location.hash = `#/asset/${row.dataset.symbol}`;
        }
    };
    view.addEventListener('click', onClick);
    view.addEventListener('input', onInput);
    view.addEventListener('change', onChange);
    view.addEventListener('keydown', onKey);

    const unsubscribe = [
        store.on('data-changed', () => load({ quiet: true })),
        store.on('synced', () => load({ quiet: true })),
        store.on('unit', () => portfolio && render()),
    ];
    load();

    return {
        unmount() {
            alive = false;
            view.removeEventListener('click', onClick);
            view.removeEventListener('input', onInput);
            view.removeEventListener('change', onChange);
            view.removeEventListener('keydown', onKey);
            unsubscribe.forEach((off) => off());
        },
    };
}
