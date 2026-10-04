import { html, icon } from '../lib/dom.js';
import { CATEGORY_LABELS, KIND_LABELS, unitLabel, percent, trend } from '../format.js';

const CATEGORY_ICONS = {
    currency: 'banknote',
    coin: 'coins',
    metal: 'medal',
    gold: 'gem',
    fund: 'chart-pie',
    crypto: 'bitcoin',
    custom: 'package',
};

const KIND_ICONS = {
    cash: 'wallet',
    deposit: 'landmark',
    realestate: 'house',
    vehicle: 'car',
    stock: 'chart-candlestick',
    other: 'package',
};

export function assetIcon(asset) {
    if (!asset) return 'package';
    if (asset.category === 'custom') return KIND_ICONS[asset.kind] || 'package';
    return CATEGORY_ICONS[asset.category] || 'package';
}

export function avatar(asset, size = '') {
    const category = asset ? asset.category : 'custom';
    return html`<span class="asset-avatar cat-${category} ${size}">${icon(assetIcon(asset))}</span>`;
}

export function categoryLabel(asset) {
    if (!asset) return '';
    if (asset.category === 'custom') return KIND_LABELS[asset.kind] || CATEGORY_LABELS.custom;
    return CATEGORY_LABELS[asset.category] || asset.category;
}

/** "ارز · هر واحد" style secondary line. */
export function assetSub(asset) {
    if (!asset) return '';
    const parts = [categoryLabel(asset)];
    if (asset.unit && asset.unit !== 'unit') parts.push(`هر ${unitLabel(asset.unit)}`);
    return parts.join(' · ');
}

export function assetCell(asset, { sub } = {}) {
    return html`
        <div class="asset-cell">
            ${avatar(asset, 'sm')}
            <div class="names">
                <span class="name">${asset ? asset.name : '—'}</span>
                <span class="sub">${sub === undefined ? assetSub(asset) : sub}</span>
            </div>
        </div>`;
}

/** Percent change with an arrow; the arrow and color carry the sign, so the number is shown unsigned. */
export function deltaText(value, { digits = 2 } = {}) {
    const direction = trend(value);
    if (!direction) return html`<span class="delta muted">${percent(value || 0, { digits })}</span>`;
    return html`<span class="delta ${direction}">${icon(direction === 'pos' ? 'arrow-up' : 'arrow-down')}<span class="sr-only">${direction === 'pos' ? 'افزایش' : 'کاهش'}</span>${percent(Math.abs(value), { digits, sign: false })}</span>`;
}

export function deltaPill(value, text) {
    const direction = trend(value);
    return html`<span class="delta-pill ${direction}">${direction ? icon(direction === 'pos' ? 'trending-up' : 'trending-down', 'icon-sm') : ''}${text}</span>`;
}
