import { api } from '../api.js';
import { store } from '../state.js';
import { html, icon, setHtml } from '../lib/dom.js';
import {
    money, compactMoney, percent, quantity, unitLabel, jalaliDate, relativeTime, number, currencyLabel, trend,
} from '../format.js';
import { lineChart, cssVar } from '../lib/charts.js';
import { avatar, categoryLabel, deltaPill, deltaText } from '../ui/asset-visuals.js';
import { openTransactionForm } from '../ui/transaction-form.js';
import { openCustomAssetForm } from '../ui/custom-asset-form.js';
import { confirmDialog } from '../ui/dialog.js';
import { notify } from '../ui/toast.js';
import { RANGES } from './dashboard.js';

function positionCard(holding, asset) {
    if (!holding) {
        return html`
            <article class="card">
                <div class="card-head"><h2>موقعیت شما</h2></div>
                <div class="empty">
                    <p>هنوز از این دارایی خرید ثبت نکرده‌اید.</p>
                    <div class="actions"><button type="button" class="btn btn-primary btn-sm" data-buy>${icon('plus', 'icon-sm')}<span>ثبت خرید</span></button></div>
                </div>
            </article>`;
    }
    const unit = unitLabel(asset.unit);
    const open = holding.quantity > 0;
    return html`
        <article class="card">
            <div class="card-head"><h2>موقعیت شما</h2>${open ? '' : html`<span class="badge">فروخته‌شده</span>`}</div>
            <div class="position-grid" style="margin-top:14px">
                <div><span class="label">مقدار</span><span class="value">${quantity(holding.quantity)} <span class="small muted">${unit}</span></span></div>
                <div><span class="label">ارزش روز</span><span class="value">${compactMoney(holding.value, { unit: true })}</span></div>
                <div><span class="label">میانگین خرید</span><span class="value">${open ? compactMoney(holding.avgCost, { unit: true }) : '—'}</span></div>
                <div><span class="label">بهای تمام‌شده</span><span class="value">${compactMoney(holding.cost, { unit: true })}</span></div>
                <div><span class="label">سود و زیان باز</span>
                    <span class="value ${trend(holding.unrealized)}">${compactMoney(holding.unrealized, { sign: true, unit: true })}</span>
                    <span class="small">${deltaText(holding.unrealizedPct)}</span></div>
                <div><span class="label">سود محقق‌شده</span>
                    <span class="value ${trend(holding.realized)}">${compactMoney(holding.realized, { sign: true, unit: true })}</span></div>
                <div><span class="label">مجموع خرید</span><span class="value">${compactMoney(holding.invested, { unit: true })}</span></div>
                <div><span class="label">اولین خرید</span><span class="value">${jalaliDate(holding.firstDate)}</span></div>
            </div>
        </article>`;
}

function transactionsCard(transactions) {
    return html`
        <article class="card">
            <div class="card-head"><h2>تراکنش‌های این دارایی</h2><span class="sub">${number(transactions.length)} مورد</span></div>
            ${transactions.length ? html`
                <div class="list" style="margin-top:8px">
                    ${transactions.map((tx) => html`
                        <button type="button" class="list-row" data-edit="${tx.id}">
                            <span class="badge ${tx.side}">${tx.side === 'buy' ? 'خرید' : 'فروش'}</span>
                            <div class="grow">
                                <span class="title">${quantity(tx.quantity)} ${unitLabel(tx.unit)} به قیمت ${money(tx.unitPrice)}</span>
                                <span class="meta">${jalaliDate(tx.date)}${tx.note ? ` · ${tx.note}` : ''}</span>
                            </div>
                            <div class="end"><span class="value">${compactMoney(tx.total)}</span></div>
                        </button>`)}
                </div>` : html`<div class="empty"><p>تراکنشی برای این دارایی ثبت نشده است.</p></div>`}
        </article>`;
}

/** Index of the first chart point on or after `date` (or the last point). */
function indexFor(points, date) {
    const index = points.findIndex((point) => point.date >= date);
    return index === -1 ? points.length - 1 : index;
}

export function mount({ view, params, setTitle }) {
    const symbol = params[0];
    setTitle('دارایی');
    let alive = true;
    let chart = null;
    let detail = null;
    let history = null;
    let range = store.preferences.chartRange || '6m';

    setHtml(view, html`<div class="card card-pad"><span class="skeleton" style="height:180px"></span></div>`);

    function destroyChart() {
        if (chart) chart.destroy();
        chart = null;
    }

    function drawChart() {
        destroyChart();
        const box = view.querySelector('[data-chart]');
        if (!box || !history) return;
        const points = history.points;
        if (points.length < 2) {
            setHtml(box, html`<div class="chart-empty">${detail.asset.source === 'custom'
                ? 'برای این دارایی هنوز تاریخچه قیمتی ثبت نشده است؛ با هر بار به‌روزرسانی قیمت، نمودار کامل‌تر می‌شود.'
                : 'تاریخچه قیمت این دارایی هنوز در دسترس نیست.'}</div>`);
            return;
        }
        setHtml(box, html`<canvas role="img" aria-label="${`نمودار قیمت ${detail.asset.name}`}"></canvas>`);
        const dates = points.map((point) => point.date);
        const inRange = detail.transactions.filter((tx) => tx.date >= points[0].date);
        const buys = new Array(points.length).fill(null);
        const sells = new Array(points.length).fill(null);
        for (const tx of inRange) (tx.side === 'buy' ? buys : sells)[indexFor(points, tx.date)] = tx.unitPrice;
        const series = [{
            label: 'قیمت',
            values: points.map((point) => point.close),
            color: cssVar('--chart-line'),
            fill: cssVar('--chart-fill'),
            endDot: true,
        }];
        if (buys.some((value) => value !== null)) series.push({ type: 'markers', label: 'خرید شما', values: buys, color: cssVar('--chart-buy') });
        if (sells.some((value) => value !== null)) series.push({ type: 'markers', label: 'فروش شما', values: sells, color: cssVar('--chart-sell') });
        chart = lineChart(box.querySelector('canvas'), { dates, series });

        const legend = view.querySelector('[data-legend]');
        setHtml(legend, html`
            <span class="legend-item"><span class="legend-key value"></span>قیمت هر ${unitLabel(detail.asset.unit)}</span>
            ${series.some((item) => item.label === 'خرید شما') ? html`<span class="legend-item"><span class="legend-dot buy"></span>خرید شما</span>` : ''}
            ${series.some((item) => item.label === 'فروش شما') ? html`<span class="legend-item"><span class="legend-dot sell"></span>فروش شما</span>` : ''}`);
    }

    function renderRanges() {
        const bar = view.querySelector('[data-ranges]');
        if (bar) setHtml(bar, RANGES.map(([key, label]) => html`<button type="button" data-range="${key}" aria-pressed="${key === range}">${label}</button>`));
    }

    async function loadHistory() {
        const card = view.querySelector('[data-chart-card]');
        if (card) card.classList.add('is-refreshing');
        try {
            history = await api.get(`/api/assets/${encodeURIComponent(symbol)}/history?range=${range}`);
            if (alive) drawChart();
        } catch (error) {
            const box = view.querySelector('[data-chart]');
            if (box) setHtml(box, html`<div class="chart-empty">${error.message}</div>`);
        } finally {
            if (card) card.classList.remove('is-refreshing');
        }
    }

    function render() {
        const { asset, holding, transactions } = detail;
        setTitle(asset.name, categoryLabel(asset));
        const watched = store.isWatched(asset.symbol);
        const custom = asset.source === 'custom';
        const changeText = asset.change !== null ? `${compactMoney(asset.change, { sign: true })} (${percent(asset.changePct || 0)})` : 'بدون تغییر';
        setHtml(view, html`
            <article class="card asset-hero">
                <div>
                    <div class="asset-title">
                        ${avatar(asset)}
                        <div>
                            <h2>${asset.name}</h2>
                            <div class="small muted">${categoryLabel(asset)} · قیمت هر ${unitLabel(asset.unit)}${custom ? '' : html` · <span class="ltr">${asset.symbol}</span>`}</div>
                        </div>
                    </div>
                    <div class="asset-price">
                        <span class="value">${money(asset.price, { unit: false })}</span>
                        <span class="unit">${currencyLabel()}</span>
                        ${custom ? '' : deltaPill(asset.change, changeText)}
                    </div>
                    <div class="asset-facts">
                        ${asset.low > 0 && asset.high > 0 ? html`<span>بازه امروز: ${compactMoney(asset.low)} تا ${compactMoney(asset.high)}</span>` : ''}
                        ${asset.nativeCurrency ? html`<span>قیمت جهانی: ${number(asset.nativePrice, asset.nativePrice < 1 ? 6 : 2)} دلار</span>` : ''}
                        <span>${custom ? 'آخرین قیمت‌گذاری' : 'به‌روزرسانی'}: ${asset.time ? relativeTime(asset.time) : '—'}</span>
                        ${asset.otherSource ? html`<span class="badge warn">از منبع داده قبلی</span>` : asset.stale ? html`<span class="badge warn">قیمت قدیمی</span>` : ''}
                    </div>
                </div>
                <div class="asset-actions">
                    ${custom ? html`
                        <button type="button" class="btn btn-secondary" data-edit-asset>${icon('pencil', 'icon-sm')}<span>ویرایش و قیمت جدید</span></button>
                        <button type="button" class="icon-btn" data-delete-asset aria-label="حذف دارایی" title="حذف دارایی">${icon('trash-2')}</button>`
                    : html`<button type="button" class="icon-btn ${watched ? 'is-on' : ''}" data-watch aria-pressed="${watched}"
                            aria-label="${watched ? 'حذف از دیده‌بان' : 'افزودن به دیده‌بان'}" title="${watched ? 'حذف از دیده‌بان' : 'افزودن به دیده‌بان'}">${icon('star')}</button>`}
                    ${holding && holding.quantity > 0 ? html`<button type="button" class="btn btn-secondary" data-sell>${icon('arrow-up-right', 'icon-sm')}<span>فروش</span></button>` : ''}
                    <button type="button" class="btn btn-primary" data-buy>${icon('plus', 'icon-sm')}<span>خرید</span></button>
                </div>
            </article>
            <div class="dash-toolbar">
                <h2>نمودار قیمت</h2>
                <div class="segmented" role="group" aria-label="بازه زمانی نمودار" data-ranges></div>
            </div>
            <div class="asset-cols" style="margin-top:0">
                <div class="stack">
                    <article class="card" data-chart-card>
                        <div class="chart-head"><div class="legend" data-legend></div></div>
                        <div class="chart-box" data-chart></div>
                    </article>
                    ${transactionsCard(transactions)}
                </div>
                <div class="stack">${positionCard(holding, asset)}</div>
            </div>`);
        renderRanges();
        if (history) drawChart();
    }

    async function load({ quiet = false } = {}) {
        if (quiet) view.classList.add('is-refreshing');
        try {
            detail = await api.get(`/api/assets/${encodeURIComponent(symbol)}`);
            if (!alive) return;
            destroyChart();
            render();
            await loadHistory();
        } catch (error) {
            if (!alive) return;
            setHtml(view, html`
                <div class="card">
                    <div class="empty" style="padding:56px 24px">
                        <span class="empty-icon">${icon('circle-alert')}</span>
                        <h3>${error.status === 404 ? 'این دارایی پیدا نشد' : 'خطا در بارگذاری'}</h3>
                        <p>${error.message}</p>
                        <div class="actions"><a class="btn btn-secondary" href="#/market">بازگشت به بازار</a></div>
                    </div>
                </div>`);
        } finally {
            view.classList.remove('is-refreshing');
        }
    }

    const onClick = async (event) => {
        const rangeButton = event.target.closest('[data-range]');
        if (rangeButton && rangeButton.dataset.range !== range) {
            range = rangeButton.dataset.range;
            renderRanges();
            await loadHistory();
            return;
        }
        if (event.target.closest('[data-buy]')) {
            openTransactionForm({ symbol, side: 'buy' });
            return;
        }
        if (event.target.closest('[data-sell]')) {
            openTransactionForm({ symbol, side: 'sell' });
            return;
        }
        const edit = event.target.closest('[data-edit]');
        if (edit) {
            const tx = detail.transactions.find((item) => item.id === edit.dataset.edit);
            if (tx) openTransactionForm({ transaction: tx });
            return;
        }
        const watch = event.target.closest('[data-watch]');
        if (watch) {
            try {
                const added = await store.toggleWatch(symbol);
                notify.success(added ? 'به دیده‌بان اضافه شد' : 'از دیده‌بان حذف شد');
                render();
            } catch (error) {
                notify.error(error.message);
            }
            return;
        }
        if (event.target.closest('[data-edit-asset]')) {
            const saved = await openCustomAssetForm({ asset: detail.asset });
            if (saved) load({ quiet: true });
            return;
        }
        if (event.target.closest('[data-delete-asset]')) {
            const confirmed = await confirmDialog({
                title: 'حذف دارایی دستی',
                message: `«${detail.asset.name}» و تاریخچه قیمت آن حذف شود؟ دارایی‌ای که تراکنش دارد قابل حذف نیست.`,
                confirmText: 'حذف شود',
                danger: true,
            });
            if (!confirmed) return;
            try {
                await api.del(`/api/custom-assets/${encodeURIComponent(symbol)}`);
                notify.success('دارایی حذف شد');
                store.dataChanged();
                window.location.hash = '#/holdings';
            } catch (error) {
                notify.error(error.message);
            }
        }
    };
    view.addEventListener('click', onClick);

    const unsubscribe = [
        store.on('data-changed', () => load({ quiet: true })),
        store.on('synced', () => load({ quiet: true })),
        store.on('unit', () => detail && render()),
        store.on('theme', () => drawChart()),
    ];
    load();

    return {
        unmount() {
            alive = false;
            destroyChart();
            view.removeEventListener('click', onClick);
            unsubscribe.forEach((off) => off());
        },
    };
}
