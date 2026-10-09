import { store } from './state.js';
import { api, IS_LOCAL } from './api.js';
import { html, icon, setHtml, $, $$ } from './lib/dom.js';
import { relativeTime } from './format.js';
import { notify } from './ui/toast.js';
import { openTransactionForm } from './ui/transaction-form.js';
import { effectiveTheme, toggleTheme } from './ui/theme.js';
import * as dashboard from './pages/dashboard.js';
import * as holdings from './pages/holdings.js';
import * as transactions from './pages/transactions.js';
import * as market from './pages/market.js';
import * as asset from './pages/asset.js';
import * as settings from './pages/settings.js';

const ROUTES = [
    { name: 'dashboard', pattern: /^\/?$/, page: dashboard, title: 'داشبورد' },
    { name: 'holdings', pattern: /^\/holdings\/?$/, page: holdings, title: 'دارایی‌های من' },
    { name: 'transactions', pattern: /^\/transactions\/?$/, page: transactions, title: 'تراکنش‌ها' },
    { name: 'market', pattern: /^\/market\/?$/, page: market, title: 'بازار' },
    { name: 'asset', pattern: /^\/asset\/([A-Za-z0-9_]+)\/?$/, page: asset, title: 'دارایی', nav: 'market' },
    { name: 'settings', pattern: /^\/settings\/?$/, page: settings, title: 'تنظیمات' },
];

let current = null;
let statusTimer = null;

function setTitle(title, subtitle = '') {
    $('#pageTitle').textContent = title;
    $('#pageSubtitle').textContent = subtitle;
    document.title = title === 'داشبورد' ? 'دلاربان' : `${title} · دلاربان`;
}

function setActiveNav(name) {
    for (const link of $$('[data-route]')) {
        if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }
}

function resolve() {
    const path = decodeURIComponent(window.location.hash.replace(/^#/, '')) || '/';
    for (const route of ROUTES) {
        const match = route.pattern.exec(path);
        if (match) return { route, params: match.slice(1) };
    }
    return { route: ROUTES[0], params: [] };
}

async function navigate() {
    // Leaving a page (e.g. Android back) also closes any open dialog.
    for (const dialog of $$('dialog[open]')) {
        const close = dialog.querySelector('[data-close]');
        if (close) close.click();
    }
    const { route, params } = resolve();
    if (current && current.instance && current.instance.unmount) current.instance.unmount();
    const view = $('#view');
    view.replaceChildren();
    setActiveNav(route.nav || route.name);
    setTitle(route.title);
    current = { route, instance: null };
    const entry = current;
    try {
        const instance = await route.page.mount({ view, params, setTitle });
        if (current === entry) entry.instance = instance;
        else if (instance && instance.unmount) instance.unmount();
    } catch (error) {
        console.error(error);
        setHtml(view, html`<div class="alert error">${icon('circle-alert')}<div class="grow">${error.message}</div></div>`);
    }
    window.scrollTo(0, 0);
}

/* ---------- status ---------- */

function statusInfo(status) {
    if (!status) return { state: 'stale', text: 'در حال بارگذاری…' };
    if (status.running) return { state: 'running', text: 'در حال دریافت قیمت‌ها…' };
    if (status.ok === false) return { state: 'error', text: 'خطا در دریافت قیمت‌ها' };
    if (!status.lastSuccessAt) return { state: 'stale', text: 'در انتظار قیمت‌ها' };
    const minutes = (Date.now() - Date.parse(status.lastSuccessAt)) / 60000;
    const interval = (store.preferences && store.preferences.refreshMinutes) || 30;
    return { state: minutes > interval * 3 ? 'stale' : 'ok', text: `به‌روزرسانی ${relativeTime(status.lastSuccessAt)}` };
}

function renderStatus(status) {
    const pill = $('#statusPill');
    const { state, text } = statusInfo(status);
    pill.dataset.state = state;
    const source = status && status.providerName ? `منبع: ${status.providerName}` : '';
    pill.title = status && status.ok === false && status.error
        ? `${status.error} — برای تلاش دوباره کلیک کنید`
        : `${source} — برای به‌روزرسانی کلیک کنید`;
    pill.setAttribute('aria-label', `${text}. ${pill.title}`);
    setHtml(pill, html`<span class="status-dot"></span><span class="status-text">${text}</span>`);

    const card = $('#sourceCard');
    if (status) {
        setHtml(card, html`
            <span class="muted small">منبع قیمت‌ها</span>
            <strong>${status.providerName || '—'}</strong>
            <span class="small">${status.publishedAt ? `انتشار ${relativeTime(status.publishedAt)}` : ''}</span>`);
    }

    clearTimeout(statusTimer);
    statusTimer = setTimeout(pollStatus, status && (status.running || status.legacyPending) ? 3000 : 60000);
}

async function pollStatus() {
    try {
        await store.refreshStatus();
    } catch {
        renderStatus(store.status);
    }
}

async function syncNow() {
    const pill = $('#statusPill');
    if (pill.dataset.state === 'running') return;
    renderStatus({ ...(store.status || {}), running: true });
    try {
        const status = await api.post('/api/sync');
        store.setStatus(status);
        if (status.ok === false) notify.error(status.error || 'دریافت قیمت‌ها ناموفق بود');
        else notify.success('قیمت‌ها به‌روز شد');
    } catch (error) {
        notify.error(error.message);
        renderStatus(store.status);
    }
}

/* ---------- chrome ---------- */

function renderThemeIcon() {
    const dark = effectiveTheme() === 'dark';
    const button = $('#themeBtn');
    setHtml(button, icon(dark ? 'sun' : 'moon'));
    button.setAttribute('aria-label', dark ? 'پوسته روشن' : 'پوسته تیره');
    button.title = dark ? 'پوسته روشن' : 'پوسته تیره';
}

function renderBanner() {
    const banner = $('#banner');
    const notes = [];
    if (store.status && store.status.legacyPending) {
        notes.push(html`
            <div class="alert info" role="status">
                ${icon('info')}
                <div class="grow">داده‌های نسخه قبلی دلاربان پیدا شد و پس از دریافت قیمت‌ها به‌طور خودکار به نسخه جدید منتقل می‌شود.</div>
            </div>`);
    }
    if (store.defaultPassword) {
        notes.push(html`
            <div class="alert warn" role="status">
                ${icon('triangle-alert')}
                <div class="grow">از رمز عبور پیش‌فرض استفاده می‌کنید. برای امنیت داده‌هایتان آن را تغییر دهید.</div>
                <a class="btn btn-secondary btn-sm" href="#/settings">تغییر رمز</a>
            </div>`);
    }
    setHtml(banner, notes);
}

async function logout() {
    try {
        await api.post('/api/auth/logout');
    } finally {
        window.location.href = '/login';
    }
}

async function start() {
    try {
        await store.bootstrap();
    } catch (error) {
        setHtml($('#view'), html`<div class="alert error">${icon('circle-alert')}<div class="grow">${error.message}</div></div>`);
        return;
    }

    renderThemeIcon();
    renderBanner();
    renderStatus(store.status);

    let legacyWasPending = Boolean(store.status && store.status.legacyPending);
    store.on('status', (status) => {
        renderStatus(status);
        // Reload everything once the 1.x import has finished.
        if (legacyWasPending && !status.legacyPending) store.dataChanged();
        legacyWasPending = Boolean(status.legacyPending);
        renderBanner();
    });
    store.on('theme', renderThemeIcon);
    store.on('account', renderBanner);
    $('#statusPill').addEventListener('click', syncNow);
    $('#themeBtn').addEventListener('click', toggleTheme);
    if (IS_LOCAL) $('#logoutBtn').hidden = true;
    else $('#logoutBtn').addEventListener('click', logout);
    const capacitor = window.Capacitor;
    if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()) {
        import('./native.js').then((module) => module.setupNative()).catch((error) => console.error(error));
    }
    $('#addTxBtn').addEventListener('click', () => openTransactionForm());

    const topbar = $('#topbar');
    window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
    window.addEventListener('hashchange', navigate);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') pollStatus();
    });

    await navigate();
}

start();
