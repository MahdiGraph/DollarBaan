import { store } from '../state.js';
import { html, icon, setHtml } from '../lib/dom.js';
import { money, compactMoney, relativeTime, searchKey, CATEGORY_LABELS, number, currencyLabel } from '../format.js';
import { assetCell, assetSub, deltaText } from '../ui/asset-visuals.js';
import { notify } from '../ui/toast.js';

const PAGE_SIZE = 80;

function star(symbol) {
    const on = store.isWatched(symbol);
    return html`<button type="button" class="icon-btn plain icon-btn-sm ${on ? 'is-on' : ''}" data-watch="${symbol}"
        aria-pressed="${on}" aria-label="${on ? 'حذف از دیده‌بان' : 'افزودن به دیده‌بان'}" title="${on ? 'حذف از دیده‌بان' : 'افزودن به دیده‌بان'}">${icon('star', 'icon-sm')}</button>`;
}

function range(asset) {
    if (!(asset.low > 0) || !(asset.high > 0)) return '—';
    return html`${compactMoney(asset.low)} <span class="muted">تا</span> ${compactMoney(asset.high)}`;
}

export function mount({ view, setTitle }) {
    const providerName = store.status && store.status.providerName;
    setTitle('بازار', providerName ? `قیمت‌ها از ${providerName}، به ${currencyLabel()}` : '');
    let alive = true;
    const filters = { query: '', category: 'all', watched: false, limit: PAGE_SIZE };

    setHtml(view, html`<div class="card card-pad"><span class="skeleton" style="height:320px"></span></div>`);

    const marketAssets = () => store.assets.filter((asset) => asset.source === 'market');

    function filtered() {
        const tokens = searchKey(filters.query).split(' ').filter(Boolean);
        return marketAssets().filter((asset) => {
            if (filters.category !== 'all' && asset.category !== filters.category) return false;
            if (filters.watched && !store.isWatched(asset.symbol)) return false;
            if (!tokens.length) return true;
            const key = searchKey(`${asset.name} ${asset.nameEn || ''} ${asset.symbol.replace(/_/g, ' ')}`);
            return tokens.every((token) => key.includes(token));
        });
    }

    function renderResults() {
        const target = view.querySelector('[data-results]');
        if (!target) return;
        const all = filtered();
        const rows = all.slice(0, filters.limit);
        if (!rows.length) {
            setHtml(target, html`<div class="card"><div class="empty"><p>${filters.watched ? 'هنوز چیزی به دیده‌بان اضافه نکرده‌اید.' : 'نتیجه‌ای پیدا نشد.'}</p></div></div>`);
            return;
        }
        setHtml(target, html`
            <div class="card desktop-table">
                <div class="table-wrap">
                    <table class="table">
                        <thead>
                            <tr>
                                <th style="width:44px"><span class="sr-only">دیده‌بان</span></th>
                                <th>دارایی</th>
                                <th class="end">قیمت (${currencyLabel()})</th>
                                <th class="end">تغییر روز</th>
                                <th class="end">بازه امروز</th>
                                <th class="end">به‌روزرسانی</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((asset) => html`
                                <tr class="clickable" data-symbol="${asset.symbol}" tabindex="0">
                                    <td>${star(asset.symbol)}</td>
                                    <td>${assetCell(asset, { sub: asset.nativeCurrency ? `${assetSub(asset)} · ${number(asset.nativePrice, asset.nativePrice < 1 ? 6 : 2)} دلار` : assetSub(asset) })}</td>
                                    <td class="end strong">${money(asset.price, { unit: false })}</td>
                                    <td class="end">${deltaText(asset.changePct)}</td>
                                    <td class="end small">${range(asset)}</td>
                                    <td class="end small muted">${asset.stale ? html`<span class="badge warn">قدیمی</span>` : relativeTime(asset.time)}</td>
                                </tr>`)}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="card mobile-cards">
                <div class="list">
                    ${rows.map((asset) => html`
                        <div class="list-row" data-symbol="${asset.symbol}">
                            ${star(asset.symbol)}
                            <a class="grow" href="#/asset/${asset.symbol}" style="color:inherit">
                                <span class="title">${asset.name}</span>
                                <span class="meta">${assetSub(asset)}</span>
                            </a>
                            <div class="end">
                                <span class="value">${money(asset.price, { unit: false })}</span>
                                <span class="sub">${deltaText(asset.changePct)}</span>
                            </div>
                        </div>`)}
                </div>
            </div>
            ${all.length > rows.length ? html`
                <div style="display:flex;justify-content:center;margin-top:16px">
                    <button type="button" class="btn btn-secondary" data-more>نمایش موارد بیشتر (${number(all.length - rows.length)} مورد دیگر)</button>
                </div>` : ''}`);
    }

    function render() {
        const assets = marketAssets();
        if (!assets.length) {
            const status = store.status || {};
            setHtml(view, html`
                <div class="card">
                    <div class="empty" style="padding:56px 24px">
                        <span class="empty-icon">${icon(status.ok === false ? 'cloud-off' : 'refresh-cw')}</span>
                        <h3>${status.ok === false ? 'قیمت‌ها دریافت نشد' : 'در حال دریافت قیمت‌ها…'}</h3>
                        <p>${status.ok === false ? status.error : 'چند لحظه صبر کنید؛ قیمت‌ها از منبع داده دریافت می‌شوند.'}</p>
                        <div class="actions"><a class="btn btn-secondary" href="#/settings">تنظیمات منبع داده</a></div>
                    </div>
                </div>`);
            return;
        }
        const counts = new Map();
        for (const asset of assets) counts.set(asset.category, (counts.get(asset.category) || 0) + 1);
        setHtml(view, html`
            <div class="toolbar">
                <label class="search-input">${icon('search')}
                    <input class="input" type="search" placeholder="جستجوی دلار، طلا، سکه، بیت‌کوین…" aria-label="جستجو در بازار" value="${filters.query}" data-query>
                </label>
                <div class="chips" role="group" aria-label="دسته‌بندی">
                    <button type="button" class="chip" data-category="all" aria-pressed="${filters.category === 'all'}">همه <span class="count">${number(assets.length)}</span></button>
                    ${store.categories.filter((key) => counts.has(key)).map((key) => html`
                        <button type="button" class="chip" data-category="${key}" aria-pressed="${filters.category === key}">${CATEGORY_LABELS[key]} <span class="count">${number(counts.get(key))}</span></button>`)}
                </div>
                <span class="spacer"></span>
                <button type="button" class="chip" data-watched aria-pressed="${filters.watched}">${icon('star', 'icon-sm')}دیده‌بان</button>
            </div>
            <div data-results></div>`);
        renderResults();
    }

    async function load({ force = false } = {}) {
        try {
            await store.loadAssets({ force });
            if (alive) render();
        } catch (error) {
            if (alive) setHtml(view, html`<div class="alert error">${icon('circle-alert')}<div class="grow">${error.message}</div></div>`);
        }
    }

    async function toggleWatch(button) {
        const symbol = button.dataset.watch;
        button.disabled = true;
        try {
            const added = await store.toggleWatch(symbol);
            notify.success(added ? 'به دیده‌بان اضافه شد' : 'از دیده‌بان حذف شد');
            for (const element of view.querySelectorAll(`[data-watch="${symbol}"]`)) {
                element.classList.toggle('is-on', added);
                element.setAttribute('aria-pressed', String(added));
                element.setAttribute('aria-label', added ? 'حذف از دیده‌بان' : 'افزودن به دیده‌بان');
            }
            if (filters.watched) renderResults();
        } catch (error) {
            notify.error(error.message);
        } finally {
            button.disabled = false;
        }
    }

    const onClick = (event) => {
        const watch = event.target.closest('[data-watch]');
        if (watch) {
            event.stopPropagation();
            toggleWatch(watch);
            return;
        }
        const chip = event.target.closest('[data-category]');
        if (chip) {
            filters.category = chip.dataset.category;
            filters.limit = PAGE_SIZE;
            for (const element of view.querySelectorAll('[data-category]')) {
                element.setAttribute('aria-pressed', String(element.dataset.category === filters.category));
            }
            renderResults();
            return;
        }
        const watched = event.target.closest('[data-watched]');
        if (watched) {
            filters.watched = !filters.watched;
            watched.setAttribute('aria-pressed', String(filters.watched));
            renderResults();
            return;
        }
        if (event.target.closest('[data-more]')) {
            filters.limit += PAGE_SIZE * 2;
            renderResults();
            return;
        }
        const row = event.target.closest('tr[data-symbol]');
        if (row) window.location.hash = `#/asset/${row.dataset.symbol}`;
    };
    const onInput = (event) => {
        if (event.target.matches('[data-query]')) {
            filters.query = event.target.value;
            filters.limit = PAGE_SIZE;
            renderResults();
        }
    };
    const onKey = (event) => {
        const row = event.target.closest('tr[data-symbol]');
        if (row && event.target === row && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            window.location.hash = `#/asset/${row.dataset.symbol}`;
        }
    };
    view.addEventListener('click', onClick);
    view.addEventListener('input', onInput);
    view.addEventListener('keydown', onKey);

    const unsubscribe = [
        store.on('synced', () => load({ force: true })),
        store.on('unit', () => render()),
        store.on('status', (status) => {
            if (!marketAssets().length && status && !status.running) load({ force: true });
        }),
    ];
    load();

    return {
        unmount() {
            alive = false;
            view.removeEventListener('click', onClick);
            view.removeEventListener('input', onInput);
            view.removeEventListener('keydown', onKey);
            unsubscribe.forEach((off) => off());
        },
    };
}
