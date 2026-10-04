import { html, icon, setHtml } from '../lib/dom.js';

const ICONS = { success: 'circle-check', error: 'circle-alert', info: 'info' };

export function toast(message, { type = 'info', timeout = 4500 } = {}) {
    const container = document.getElementById('toasts');
    if (!container) return;
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    setHtml(element, html`
        ${icon(ICONS[type] || 'info')}
        <div class="grow">${message}</div>
        <button type="button" class="icon-btn plain icon-btn-sm" aria-label="بستن">${icon('x', 'icon-sm')}</button>
    `);
    const close = () => {
        if (element.classList.contains('leaving')) return;
        element.classList.add('leaving');
        setTimeout(() => element.remove(), 180);
    };
    element.querySelector('button').addEventListener('click', close);
    container.append(element);
    if (timeout) setTimeout(close, timeout);
}

export const notify = {
    success: (message) => toast(message, { type: 'success' }),
    error: (message) => toast(message, { type: 'error', timeout: 7000 }),
    info: (message) => toast(message, { type: 'info' }),
};
