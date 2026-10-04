import { html, icon, setHtml } from '../lib/dom.js';
import { store } from '../state.js';
import { CATEGORY_LABELS, money, searchKey } from '../format.js';
import { avatar, assetSub } from './asset-visuals.js';

const MAX_RESULTS = 150;
let uid = 0;

function matches(asset, tokens) {
    if (!tokens.length) return true;
    const haystack = searchKey(`${asset.name} ${asset.nameEn || ''} ${asset.symbol.replace(/_/g, ' ')}`);
    return tokens.every((token) => haystack.includes(token));
}

/**
 * Searchable asset selector that expands inline (works inside dialogs and on phones).
 */
export function createAssetPicker(container, { value = null, onChange, onCreateCustom, heldFirst = false } = {}) {
    uid += 1;
    const listId = `picker-list-${uid}`;
    let selected = value;
    let query = '';
    let category = 'all';
    let active = -1;
    let rendered = [];

    setHtml(container, html`
        <button type="button" class="picker-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}"></button>
        <div class="picker-panel" hidden>
            <div class="picker-search">
                <label class="search-input">
                    ${icon('search')}
                    <input class="input" type="search" placeholder="جستجوی نام یا نماد…" aria-label="جستجوی دارایی"
                        autocomplete="off" role="combobox" aria-controls="${listId}" aria-expanded="true">
                </label>
                <div class="chips" role="group" aria-label="دسته‌بندی"></div>
            </div>
            <div class="picker-list" id="${listId}" role="listbox" aria-label="فهرست دارایی‌ها"></div>
            ${onCreateCustom ? html`<div class="picker-foot">
                <button type="button" class="btn btn-ghost btn-sm btn-block" data-create>${icon('plus', 'icon-sm')}<span>تعریف دارایی دستی (ملک، خودرو، سپرده…)</span></button>
            </div>` : ''}
        </div>
    `);

    const trigger = container.querySelector('.picker-trigger');
    const panel = container.querySelector('.picker-panel');
    const search = container.querySelector('input[type="search"]');
    const chips = container.querySelector('.chips');
    const list = container.querySelector('.picker-list');

    const heldSymbols = () => new Set(((store.portfolio && store.portfolio.holdings) || []).map((holding) => holding.symbol));

    function renderTrigger() {
        const asset = selected ? store.asset(selected) : null;
        if (!asset) {
            setHtml(trigger, html`<span class="placeholder">${selected ? selected : 'یک دارایی انتخاب کنید'}</span>${icon('chevron-down', 'chev')}`);
            return;
        }
        setHtml(trigger, html`
            ${avatar(asset, 'sm')}
            <span class="names">
                <span class="name">${asset.name}</span>
                <span class="sub">${assetSub(asset)} · ${money(asset.price)}</span>
            </span>
            ${icon('chevron-down', 'chev')}`);
    }

    function renderChips() {
        const present = new Set(store.assets.map((asset) => asset.category));
        const options = [['all', 'همه']];
        if (heldSymbols().size) options.push(['held', 'دارایی‌های من']);
        for (const key of store.categories) if (present.has(key)) options.push([key, CATEGORY_LABELS[key]]);
        setHtml(chips, options.map(([key, label]) => html`<button type="button" class="chip" data-category="${key}" aria-pressed="${category === key}">${label}</button>`));
    }

    function option(asset) {
        return html`
            <button type="button" class="picker-option ${asset.symbol === selected ? 'is-current' : ''}" role="option"
                id="${listId}-${asset.symbol}" data-symbol="${asset.symbol}" aria-selected="false" tabindex="-1">
                ${avatar(asset, 'sm')}
                <span class="names"><span class="name">${asset.name}</span><span class="sub">${assetSub(asset)}</span></span>
                <span class="price">${money(asset.price, { unit: false })}</span>
            </button>`;
    }

    function renderList() {
        const tokens = searchKey(query).split(' ').filter(Boolean);
        const held = heldSymbols();
        let assets = store.assets.filter((asset) => matches(asset, tokens));
        if (category === 'held') assets = assets.filter((asset) => held.has(asset.symbol));
        else if (category !== 'all') assets = assets.filter((asset) => asset.category === category);
        if (heldFirst && held.size) {
            assets = [...assets.filter((asset) => held.has(asset.symbol)), ...assets.filter((asset) => !held.has(asset.symbol))];
        }
        assets = assets.slice(0, MAX_RESULTS);
        rendered = assets.map((asset) => asset.symbol);
        active = -1;

        if (!assets.length) {
            setHtml(list, html`<div class="picker-empty">موردی پیدا نشد${onCreateCustom ? '؛ می‌توانید آن را به‌صورت دستی تعریف کنید' : ''}.</div>`);
            return;
        }
        const grouped = !tokens.length && category === 'all';
        if (!grouped) {
            setHtml(list, assets.map(option));
            return;
        }
        const sections = [];
        const mine = assets.filter((asset) => held.has(asset.symbol));
        if (mine.length) sections.push(html`<div class="picker-group">دارایی‌های من</div>`, mine.map(option));
        for (const key of store.categories) {
            const items = assets.filter((asset) => asset.category === key && !held.has(asset.symbol));
            if (items.length) sections.push(html`<div class="picker-group">${CATEGORY_LABELS[key]}</div>`, items.map(option));
        }
        rendered = [...mine, ...store.categories.flatMap((key) => assets.filter((asset) => asset.category === key && !held.has(asset.symbol)))]
            .map((asset) => asset.symbol);
        setHtml(list, sections);
    }

    function setActive(index) {
        const options = [...list.querySelectorAll('.picker-option')];
        if (!options.length) return;
        active = (index + options.length) % options.length;
        options.forEach((element, i) => element.setAttribute('aria-selected', String(i === active)));
        const current = options[active];
        search.setAttribute('aria-activedescendant', current.id);
        current.scrollIntoView({ block: 'nearest' });
    }

    function onOutside(event) {
        if (!container.contains(event.target)) close();
    }

    function open() {
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        renderChips();
        renderList();
        document.addEventListener('pointerdown', onOutside, true);
        search.focus();
    }

    function close() {
        if (panel.hidden) return;
        panel.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', onOutside, true);
    }

    function choose(symbol) {
        selected = symbol;
        close();
        renderTrigger();
        trigger.focus();
        if (onChange) onChange(symbol);
    }

    trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
    search.addEventListener('input', () => {
        query = search.value;
        renderList();
    });
    search.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(active + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(active - 1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const options = list.querySelectorAll('.picker-option');
            const target = options[active >= 0 ? active : 0];
            if (target) choose(target.dataset.symbol);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            trigger.focus();
        }
    });
    chips.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-category]');
        if (!chip) return;
        category = chip.dataset.category;
        renderChips();
        renderList();
        search.focus();
    });
    list.addEventListener('click', (event) => {
        const target = event.target.closest('.picker-option');
        if (target) choose(target.dataset.symbol);
    });
    const create = container.querySelector('[data-create]');
    if (create) {
        create.addEventListener('click', async () => {
            close();
            const asset = await onCreateCustom(query.trim());
            if (asset) choose(asset.symbol);
        });
    }

    renderTrigger();

    return {
        get value() {
            return selected;
        },
        set value(symbol) {
            selected = symbol;
            renderTrigger();
        },
        open,
        close,
        refresh: renderTrigger,
        focus: () => trigger.focus(),
    };
}
