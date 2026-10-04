import { api } from '../api.js';
import { store } from '../state.js';
import { html, icon, setHtml } from '../lib/dom.js';
import {
    money, compactMoney, quantity, unitLabel, jalaliDate, jalaliParts, searchKey, number, faDigits,
} from '../format.js';
import { MONTH_NAMES } from '../lib/jalali.js';
import { avatar, assetCell } from '../ui/asset-visuals.js';
import { openTransactionForm } from '../ui/transaction-form.js';
import { confirmDialog } from '../ui/dialog.js';
import { notify } from '../ui/toast.js';

function monthKey(iso) {
    const { jy, jm } = jalaliParts(iso);
    return { key: `${jy}-${jm}`, label: faDigits(`${MONTH_NAMES[jm - 1]} ${jy}`) };
}

function groupByMonth(rows) {
    const groups = [];
    let last = null;
    for (const row of rows) {
        const { key, label } = monthKey(row.date);
        if (!last || last.key !== key) {
            last = { key, label, rows: [] };
            groups.push(last);
        }
        last.rows.push(row);
    }
    return groups;
}

const sideBadge = (side) => html`<span class="badge ${side}">${icon(side === 'buy' ? 'arrow-down-left' : 'arrow-up-right', 'icon-sm')}${side === 'buy' ? 'خرید' : 'فروش'}</span>`;

function table(groups) {
    return html`
        <div class="card desktop-table">
            <div class="table-wrap">
                <table class="table">
                    <thead>
                        <tr>
                            <th>تاریخ</th><th>دارایی</th><th>نوع</th><th class="end">مقدار</th>
                            <th class="end">قیمت هر واحد</th><th class="end">مبلغ کل</th><th>یادداشت</th><th class="end"><span class="sr-only">عملیات</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${groups.map((group) => html`
                            <tr class="group-row"><td colspan="8">${group.label}</td></tr>
                            ${group.rows.map((tx) => html`
                                <tr>
                                    <td>${jalaliDate(tx.date)}</td>
                                    <td><a href="#/asset/${tx.symbol}" style="color:inherit">${assetCell(tx)}</a></td>
                                    <td>${sideBadge(tx.side)}</td>
                                    <td class="end">${quantity(tx.quantity)}<span class="cell-sub">${unitLabel(tx.unit)}</span></td>
                                    <td class="end">${money(tx.unitPrice, { unit: false })}</td>
                                    <td class="end strong">${money(tx.total, { unit: false })}${tx.fee ? html`<span class="cell-sub">کارمزد ${money(tx.fee, { unit: false })}</span>` : ''}</td>
                                    <td class="note" title="${tx.note}">${tx.note || '—'}</td>
                                    <td class="end">
                                        <span class="row-actions">
                                            <button type="button" class="icon-btn plain icon-btn-sm" data-edit="${tx.id}" aria-label="ویرایش" title="ویرایش">${icon('pencil', 'icon-sm')}</button>
                                            <button type="button" class="icon-btn plain icon-btn-sm" data-delete="${tx.id}" aria-label="حذف" title="حذف">${icon('trash-2', 'icon-sm')}</button>
                                        </span>
                                    </td>
                                </tr>`)}`)}
                    </tbody>
                </table>
            </div>
        </div>`;
}

function cards(groups) {
    return html`
        <div class="mobile-cards stack">
            ${groups.map((group) => html`
                <div class="card">
                    <div class="card-head" style="padding-bottom:6px"><h2>${group.label}</h2></div>
                    <div class="list">
                        ${group.rows.map((tx) => html`
                            <button type="button" class="list-row" data-edit="${tx.id}">
                                ${avatar(tx, 'sm')}
                                <div class="grow">
                                    <span class="title">${tx.name}</span>
                                    <span class="meta">${jalaliDate(tx.date)} · ${quantity(tx.quantity)} ${unitLabel(tx.unit)}${tx.note ? ` · ${tx.note}` : ''}</span>
                                </div>
                                <div class="end">
                                    <span class="value">${compactMoney(tx.total)}</span>
                                    <span class="sub">${sideBadge(tx.side)}</span>
                                </div>
                            </button>`)}
                    </div>
                </div>`)}
        </div>`;
}

export function mount({ view, setTitle }) {
    setTitle('تراکنش‌ها');
    let alive = true;
    let all = [];
    const filters = { query: '', side: 'all', symbol: 'all' };

    setHtml(view, html`<div class="card card-pad"><span class="skeleton" style="height:240px"></span></div>`);

    function filtered() {
        const tokens = searchKey(filters.query).split(' ').filter(Boolean);
        return all.filter((tx) => {
            if (filters.side !== 'all' && tx.side !== filters.side) return false;
            if (filters.symbol !== 'all' && tx.symbol !== filters.symbol) return false;
            if (!tokens.length) return true;
            const key = searchKey(`${tx.name} ${tx.note} ${tx.symbol.replace(/_/g, ' ')}`);
            return tokens.every((token) => key.includes(token));
        });
    }

    function renderResults() {
        const target = view.querySelector('[data-results]');
        if (!target) return;
        const rows = filtered();
        const bought = rows.filter((tx) => tx.side === 'buy').reduce((sum, tx) => sum + tx.total + tx.fee, 0);
        const sold = rows.filter((tx) => tx.side === 'sell').reduce((sum, tx) => sum + tx.total - tx.fee, 0);
        setHtml(target, rows.length
            ? html`
                <p class="small muted" style="margin:0 0 12px">${number(rows.length)} تراکنش · مجموع خرید ${money(bought)} · مجموع فروش ${money(sold)}</p>
                ${table(groupByMonth(rows))}${cards(groupByMonth(rows))}`
            : html`<div class="card"><div class="empty"><p>تراکنشی با این فیلترها پیدا نشد.</p></div></div>`);
    }

    function render() {
        if (!all.length) {
            setHtml(view, html`
                <div class="card">
                    <div class="empty" style="padding:56px 24px">
                        <span class="empty-icon">${icon('arrow-left-right')}</span>
                        <h3>هنوز تراکنشی ثبت نشده است</h3>
                        <p>هر خرید یا فروش ارز، طلا، سکه، رمزارز یا دارایی دستی را اینجا ثبت کنید؛ میانگین قیمت و سود و زیان به‌طور خودکار محاسبه می‌شود.</p>
                        <div class="actions"><button type="button" class="btn btn-primary" data-add>${icon('plus')}<span>ثبت تراکنش</span></button></div>
                    </div>
                </div>`);
            return;
        }
        const symbols = [...new Map(all.map((tx) => [tx.symbol, tx.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'fa'));
        setHtml(view, html`
            <div class="toolbar">
                <label class="search-input">${icon('search')}
                    <input class="input" type="search" placeholder="جستجو در دارایی یا یادداشت…" aria-label="جستجو" value="${filters.query}" data-query>
                </label>
                <div class="segmented" role="group" aria-label="نوع تراکنش" data-side>
                    ${[['all', 'همه'], ['buy', 'خرید'], ['sell', 'فروش']].map(([key, label]) => html`<button type="button" data-value="${key}" aria-pressed="${filters.side === key}">${label}</button>`)}
                </div>
                <select class="select" style="width:auto;min-height:40px;max-width:220px" aria-label="فیلتر دارایی" data-symbol>
                    <option value="all">همه دارایی‌ها</option>
                    ${symbols.map(([symbol, name]) => html`<option value="${symbol}" ${filters.symbol === symbol ? html`selected` : ''}>${name}</option>`)}
                </select>
                <span class="spacer"></span>
                <a class="btn btn-secondary" href="/api/export.csv" download>${icon('file-spreadsheet')}<span>خروجی اکسل</span></a>
            </div>
            <div data-results></div>`);
        renderResults();
    }

    async function load({ quiet = false } = {}) {
        if (quiet) view.classList.add('is-refreshing');
        try {
            const [list] = await Promise.all([api.get('/api/transactions'), store.portfolio ? null : store.loadPortfolio()]);
            all = list;
            if (alive) render();
        } catch (error) {
            if (alive) setHtml(view, html`<div class="alert error">${icon('circle-alert')}<div class="grow">${error.message}</div></div>`);
        } finally {
            view.classList.remove('is-refreshing');
        }
    }

    async function remove(id) {
        const tx = all.find((item) => item.id === id);
        if (!tx) return;
        const confirmed = await confirmDialog({
            title: 'حذف تراکنش',
            message: `تراکنش ${tx.side === 'buy' ? 'خرید' : 'فروش'} «${tx.name}» در تاریخ ${jalaliDate(tx.date)} حذف شود؟`,
            confirmText: 'حذف شود',
            danger: true,
        });
        if (!confirmed) return;
        try {
            await api.del(`/api/transactions/${id}`);
            notify.success('تراکنش حذف شد');
            store.dataChanged();
        } catch (error) {
            notify.error(error.message);
        }
    }

    const onClick = (event) => {
        const sideButton = event.target.closest('[data-side] button');
        if (sideButton) {
            filters.side = sideButton.dataset.value;
            for (const button of view.querySelectorAll('[data-side] button')) {
                button.setAttribute('aria-pressed', String(button.dataset.value === filters.side));
            }
            renderResults();
            return;
        }
        const edit = event.target.closest('[data-edit]');
        if (edit) {
            const tx = all.find((item) => item.id === edit.dataset.edit);
            if (tx) openTransactionForm({ transaction: tx });
            return;
        }
        const del = event.target.closest('[data-delete]');
        if (del) {
            remove(del.dataset.delete);
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
        if (event.target.matches('[data-symbol]')) {
            filters.symbol = event.target.value;
            renderResults();
        }
    };
    view.addEventListener('click', onClick);
    view.addEventListener('input', onInput);
    view.addEventListener('change', onChange);

    const unsubscribe = [
        store.on('data-changed', () => load({ quiet: true })),
        store.on('unit', () => render()),
    ];
    load();

    return {
        unmount() {
            alive = false;
            view.removeEventListener('click', onClick);
            view.removeEventListener('input', onInput);
            view.removeEventListener('change', onChange);
            unsubscribe.forEach((off) => off());
        },
    };
}
