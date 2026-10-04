import { api } from '../api.js';
import { store } from '../state.js';
import { html, icon, setHtml } from '../lib/dom.js';
import {
    money, compactMoney, percent, quantity, unitLabel, relativeTime, jalaliDate, jalaliLong, todayIso,
    currencyLabel, toDisplay, number, CATEGORY_LABELS, trend,
} from '../format.js';
import { lineChart, sparkline, cssVar } from '../lib/charts.js';
import { avatar, deltaText, deltaPill } from '../ui/asset-visuals.js';
import { openTransactionForm } from '../ui/transaction-form.js';

export const RANGES = [
    ['1m', '۱ ماه'],
    ['3m', '۳ ماه'],
    ['6m', '۶ ماه'],
    ['1y', '۱ سال'],
    ['3y', '۳ سال'],
    ['all', 'همه'],
];

const RANGE_TEXT = { '1m': 'یک ماه گذشته', '3m': 'سه ماه گذشته', '6m': 'شش ماه گذشته', '1y': 'یک سال گذشته', '3y': 'سه سال گذشته', all: 'از ابتدا' };

function heroValue(toman) {
    const text = number(Math.round(toDisplay(toman)));
    // Long totals (billions of rials) step down a size so the unit stays on the same line.
    const size = text.length > 15 ? 'xl' : text.length > 11 ? 'lg' : '';
    return html`<div class="hero-value ${size}"><span class="amount">${text}</span> <span class="unit">${currencyLabel()}</span></div>`;
}

function skeleton() {
    return html`
        <div class="kpis">
            <div class="card hero"><span class="skeleton" style="height:96px;opacity:.2"></span></div>
            ${[1, 2, 3].map(() => html`<div class="card stat"><span class="skeleton" style="height:16px;width:60%"></span><span class="skeleton" style="height:28px;width:80%"></span></div>`)}
        </div>
        <div class="dash-cols" style="margin-top:16px">
            <div class="card"><span class="skeleton" style="height:340px;margin:20px"></span></div>
            <div class="card"><span class="skeleton" style="height:340px;margin:20px"></span></div>
        </div>`;
}

function kpis(portfolio, status) {
    const { totals } = portfolio;
    const dayText = `${compactMoney(totals.dayChange, { sign: true })} (${percent(totals.dayChangePct || 0)}) امروز`;
    return html`
        <section class="kpis" aria-label="خلاصه سبد">
            <article class="card hero">
                <div>
                    <div class="hero-label">${icon('wallet', 'icon-sm')}ارزش کل دارایی‌ها</div>
                    ${heroValue(totals.value)}
                </div>
                <div class="hero-meta">
                    ${deltaPill(totals.dayChange, dayText)}
                    <span>${number(totals.holdings)} دارایی${status && status.lastSuccessAt ? ` · قیمت‌ها ${relativeTime(status.lastSuccessAt)}` : ''}</span>
                </div>
            </article>
            <article class="card stat">
                <div class="stat-label">${icon('trending-up')}سود و زیان کل</div>
                <div class="stat-value">${compactMoney(totals.pnl, { sign: true })} <span class="unit">${currencyLabel()}</span></div>
                <div class="stat-foot">${deltaText(totals.pnlPct)} <span>از کل خریدها</span></div>
            </article>
            <article class="card stat">
                <div class="stat-label">${icon('piggy-bank')}بهای تمام‌شده</div>
                <div class="stat-value">${compactMoney(totals.cost)} <span class="unit">${currencyLabel()}</span></div>
                <div class="stat-foot">سود باز: <span class="${trend(totals.unrealized)}">${compactMoney(totals.unrealized, { sign: true })}</span></div>
            </article>
            <article class="card stat">
                <div class="stat-label">${icon('hand-coins')}سود محقق‌شده</div>
                <div class="stat-value">${compactMoney(totals.realized, { sign: true })} <span class="unit">${currencyLabel()}</span></div>
                <div class="stat-foot">از فروش‌ها${totals.fees > 0 ? ` · کارمزدها ${compactMoney(totals.fees)}` : ''}</div>
            </article>
        </section>`;
}

function allocationCard(portfolio) {
    const { allocation } = portfolio;
    const description = allocation.map((item) => `${CATEGORY_LABELS[item.category]} ${percent(item.weight, { sign: false, digits: 1 })}`).join('، ');
    return html`
        <article class="card">
            <div class="card-head"><h2>ترکیب سبد</h2><span class="sub">بر اساس ارزش روز</span></div>
            <div class="card-body">
                <div class="alloc-bar" role="img" aria-label="${`سهم دسته‌ها: ${description}`}">
                    ${allocation.map((item) => html`<span class="cat-${item.category}" style="flex:${item.weight.toFixed(3)} 1 0"
                        title="${`${CATEGORY_LABELS[item.category]}: ${percent(item.weight, { sign: false, digits: 1 })}`}"></span>`)}
                </div>
                <div class="alloc-list">
                    ${allocation.map((item) => html`
                        <div class="alloc-row cat-${item.category}">
                            <span class="legend-swatch"></span>
                            <span>${CATEGORY_LABELS[item.category]}</span>
                            <span class="pct">${percent(item.weight, { sign: false, digits: 1 })}</span>
                            <span class="val">${compactMoney(item.value)}</span>
                        </div>`)}
                </div>
            </div>
        </article>`;
}

function holdingsCard(portfolio) {
    const rows = portfolio.holdings.slice(0, 6);
    return html`
        <article class="card">
            <div class="card-head">
                <h2>دارایی‌های من</h2>
                <a class="link-more" href="#/holdings">همه دارایی‌ها${icon('chevron-left', 'icon-sm')}</a>
            </div>
            <div class="list" style="margin-top:8px">
                ${rows.map((holding) => html`
                    <a class="list-row" href="#/asset/${holding.symbol}">
                        ${avatar(holding)}
                        <div class="grow">
                            <span class="title">${holding.name}</span>
                            <span class="meta">${quantity(holding.quantity)} ${unitLabel(holding.unit)} · ${percent(holding.weight, { sign: false, digits: 1 })} از سبد</span>
                        </div>
                        <div class="end">
                            <span class="value">${money(holding.value)}</span>
                            <span class="sub">${deltaText(holding.unrealizedPct)}</span>
                        </div>
                    </a>`)}
            </div>
        </article>`;
}

function watchlistCard(items) {
    return html`
        <article class="card">
            <div class="card-head">
                <h2>دیده‌بان بازار</h2>
                <a class="link-more" href="#/market">بازار${icon('chevron-left', 'icon-sm')}</a>
            </div>
            <div class="list" style="margin-top:8px">
                ${items.length ? items.map((item) => html`
                    <a class="list-row" href="#/asset/${item.symbol}">
                        <div class="grow">
                            <span class="title">${item.name}</span>
                            <span class="meta">${item.time ? relativeTime(item.time) : ''}</span>
                        </div>
                        ${sparkline(item.spark)}
                        <div class="end">
                            <span class="value">${money(item.price, { unit: false })}</span>
                            <span class="sub">${deltaText(item.changePct)}</span>
                        </div>
                    </a>`) : html`<div class="empty"><p>از صفحه بازار با ستاره، دارایی‌ها را به دیده‌بان اضافه کنید.</p></div>`}
            </div>
        </article>`;
}

function recentCard(transactions) {
    return html`
        <article class="card">
            <div class="card-head">
                <h2>آخرین تراکنش‌ها</h2>
                <a class="link-more" href="#/transactions">همه تراکنش‌ها${icon('chevron-left', 'icon-sm')}</a>
            </div>
            <div class="list" style="margin-top:8px">
                ${transactions.map((tx) => html`
                    <button type="button" class="list-row" data-edit="${tx.id}">
                        ${avatar(tx, 'sm')}
                        <div class="grow">
                            <span class="title">${tx.name}</span>
                            <span class="meta">${jalaliDate(tx.date)} · ${quantity(tx.quantity)} ${unitLabel(tx.unit)}</span>
                        </div>
                        <div class="end">
                            <span class="value">${money(tx.total)}</span>
                            <span class="sub"><span class="badge ${tx.side}">${tx.side === 'buy' ? 'خرید' : 'فروش'}</span></span>
                        </div>
                    </button>`)}
            </div>
        </article>`;
}

function welcome(watchlist) {
    return html`
        <article class="card">
            <div class="empty" style="padding:48px 24px">
                <span class="empty-icon">${icon('sparkles')}</span>
                <h3>به دلاربان خوش آمدید</h3>
                <p>خرید و فروش‌های خود را ثبت کنید تا ارزش لحظه‌ای سبد، سود و زیان و روند دارایی‌هایتان را به تومان ببینید. قیمت دلار، طلا، سکه و رمزارز به‌طور خودکار به‌روز می‌شود.</p>
                <div class="actions">
                    <button type="button" class="btn btn-primary" data-add>${icon('plus')}<span>ثبت اولین تراکنش</span></button>
                    <a class="btn btn-secondary" href="#/settings">${icon('upload')}<span>بازیابی از فایل پشتیبان</span></a>
                </div>
            </div>
        </article>
        <div class="section-title"><h2>نگاهی به بازار</h2></div>
        ${watchlistCard(watchlist)}`;
}

function timelineTable(points) {
    const rows = [...points].reverse();
    return html`
        <table class="table">
            <thead><tr><th>تاریخ</th><th class="end">ارزش دارایی‌ها</th><th class="end">بهای تمام‌شده</th><th class="end">سود و زیان باز</th></tr></thead>
            <tbody>
                ${rows.map((point) => html`<tr>
                    <td>${jalaliDate(point.date)}</td>
                    <td class="end">${money(point.value, { unit: false })}</td>
                    <td class="end">${money(point.invested, { unit: false })}</td>
                    <td class="end ${trend(point.value - point.invested)}">${money(point.value - point.invested, { unit: false, sign: true })}</td>
                </tr>`)}
            </tbody>
        </table>`;
}

export function mount({ view, setTitle }) {
    setTitle('داشبورد', jalaliLong(todayIso()));
    let alive = true;
    let chart = null;
    let range = store.preferences.chartRange || '6m';
    let showTable = false;
    let timeline = null;
    let hasData = false;
    let recentTransactions = [];

    setHtml(view, skeleton());

    function destroyChart() {
        if (chart) chart.destroy();
        chart = null;
    }

    function renderRangeBar() {
        const bar = view.querySelector('[data-ranges]');
        if (!bar) return;
        setHtml(bar, RANGES.map(([key, label]) => html`<button type="button" data-range="${key}" aria-pressed="${key === range}">${label}</button>`));
    }

    function renderPerformance() {
        const target = view.querySelector('[data-perf]');
        if (!target) return;
        const perf = timeline && timeline.performance;
        if (!perf) {
            target.textContent = '';
            return;
        }
        setHtml(target, html`سود و زیان در ${RANGE_TEXT[range]}: <span class="${trend(perf.pnl)} strong">${compactMoney(perf.pnl, { sign: true, unit: true })}</span>${perf.pct !== null ? html` (${deltaText(perf.pct)})` : ''}`);
    }

    function drawChart() {
        destroyChart();
        const box = view.querySelector('[data-chart]');
        if (!box || !timeline) return;
        const tableBox = view.querySelector('[data-chart-table]');
        const points = timeline.points;
        if (points.length < 2) {
            setHtml(box, html`<div class="chart-empty">برای رسم نمودار هنوز داده کافی نیست؛ با گذشت زمان یا ثبت تراکنش‌های قدیمی‌تر روند نمایش داده می‌شود.</div>`);
            tableBox.hidden = true;
            return;
        }
        setHtml(box, html`<canvas role="img" aria-label="نمودار روند ارزش دارایی‌ها و بهای تمام‌شده"></canvas>`);
        chart = lineChart(box.querySelector('canvas'), {
            dates: points.map((point) => point.date),
            series: [
                { label: 'ارزش دارایی‌ها', values: points.map((point) => point.value), color: cssVar('--chart-line'), fill: cssVar('--chart-fill'), endDot: true },
                { label: 'بهای تمام‌شده', values: points.map((point) => point.invested), color: cssVar('--chart-context'), stepped: true },
            ],
        });
        box.hidden = showTable;
        tableBox.hidden = !showTable;
        if (showTable) setHtml(tableBox, timelineTable(points));
    }

    async function loadTimeline() {
        if (!hasData) return;
        const card = view.querySelector('[data-chart-card]');
        if (card) card.classList.add('is-refreshing');
        try {
            const result = await api.get(`/api/portfolio/timeline?range=${range}`);
            if (!alive) return;
            timeline = result;
            drawChart();
            renderPerformance();
        } catch (error) {
            const box = view.querySelector('[data-chart]');
            if (box) setHtml(box, html`<div class="chart-empty">${error.message}</div>`);
        } finally {
            if (card) card.classList.remove('is-refreshing');
        }
    }

    async function load({ quiet = false } = {}) {
        const root = view.querySelector('.dash');
        if (quiet && root) root.classList.add('is-refreshing');
        try {
            const [portfolio, watchlist, recent] = await Promise.all([
                store.loadPortfolio(),
                api.get('/api/watchlist'),
                api.get('/api/transactions?limit=6'),
            ]);
            if (!alive) return;
            destroyChart();
            recentTransactions = recent;
            hasData = portfolio.transactionCount > 0;
            if (!hasData) {
                setHtml(view, html`<div class="dash">${welcome(watchlist)}</div>`);
                return;
            }
            setHtml(view, html`
                <div class="dash">
                    ${kpis(portfolio, store.status)}
                    <div class="dash-toolbar">
                        <div>
                            <h2>روند ارزش سبد</h2>
                            <div class="range-perf" data-perf></div>
                        </div>
                        <div class="segmented" role="group" aria-label="بازه زمانی نمودار" data-ranges></div>
                    </div>
                    <div class="dash-cols">
                        <div class="stack">
                            <article class="card" data-chart-card>
                                <div class="chart-head">
                                    <div class="legend">
                                        <span class="legend-item"><span class="legend-key value"></span>ارزش دارایی‌ها</span>
                                        <span class="legend-item"><span class="legend-key context"></span>بهای تمام‌شده</span>
                                    </div>
                                    <button type="button" class="btn btn-ghost btn-sm" data-toggle-table aria-pressed="${showTable}">
                                        ${icon(showTable ? 'chart-line' : 'table-2', 'icon-sm')}<span>${showTable ? 'نمودار' : 'جدول'}</span>
                                    </button>
                                </div>
                                <div class="chart-box" data-chart></div>
                                <div class="chart-table table-wrap" data-chart-table hidden></div>
                            </article>
                            ${holdingsCard(portfolio)}
                            ${recentCard(recent)}
                        </div>
                        <div class="stack">
                            ${allocationCard(portfolio)}
                            ${watchlistCard(watchlist)}
                        </div>
                    </div>
                </div>`);
            renderRangeBar();
            if (timeline) {
                drawChart();
                renderPerformance();
            }
            await loadTimeline();
        } catch (error) {
            if (!alive) return;
            setHtml(view, html`<div class="alert error">${icon('circle-alert')}<div class="grow">${error.message}</div>
                <button type="button" class="btn btn-secondary btn-sm" data-retry>تلاش دوباره</button></div>`);
        }
    }

    const onClick = async (event) => {
        const rangeButton = event.target.closest('[data-range]');
        if (rangeButton && rangeButton.dataset.range !== range) {
            range = rangeButton.dataset.range;
            renderRangeBar();
            await loadTimeline();
            return;
        }
        if (event.target.closest('[data-toggle-table]')) {
            showTable = !showTable;
            const button = event.target.closest('[data-toggle-table]');
            button.setAttribute('aria-pressed', String(showTable));
            setHtml(button, html`${icon(showTable ? 'chart-line' : 'table-2', 'icon-sm')}<span>${showTable ? 'نمودار' : 'جدول'}</span>`);
            const tableBox = view.querySelector('[data-chart-table]');
            const box = view.querySelector('[data-chart]');
            if (showTable && timeline) {
                setHtml(tableBox, timelineTable(timeline.points));
                tableBox.hidden = false;
                box.hidden = true;
            } else {
                tableBox.hidden = true;
                box.hidden = false;
            }
            return;
        }
        const edit = event.target.closest('[data-edit]');
        if (edit) {
            const tx = recentTransactions.find((item) => item.id === edit.dataset.edit);
            if (tx) openTransactionForm({ transaction: tx });
            return;
        }
        if (event.target.closest('[data-add]')) openTransactionForm();
        if (event.target.closest('[data-retry]')) load();
    };
    view.addEventListener('click', onClick);

    const unsubscribe = [
        store.on('data-changed', () => load({ quiet: true })),
        store.on('synced', () => load({ quiet: true })),
        store.on('unit', () => load({ quiet: true })),
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
