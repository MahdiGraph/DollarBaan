import { store } from '../state.js';

const KEY = 'dollarbaan.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

/** 'system' | 'light' | 'dark' */
export function themeMode() {
    const value = document.documentElement.getAttribute('data-theme');
    return value === 'light' || value === 'dark' ? value : 'system';
}

export function effectiveTheme() {
    const mode = themeMode();
    if (mode !== 'system') return mode;
    return media.matches ? 'dark' : 'light';
}

function syncMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effectiveTheme() === 'dark' ? '#0b0f14' : '#f4f5f7');
}

export function setThemeMode(mode) {
    if (mode === 'light' || mode === 'dark') {
        document.documentElement.setAttribute('data-theme', mode);
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    try {
        if (mode === 'light' || mode === 'dark') localStorage.setItem(KEY, mode);
        else localStorage.removeItem(KEY);
    } catch {
        /* storage unavailable */
    }
    syncMeta();
    store.emit('theme', effectiveTheme());
}

export function toggleTheme() {
    setThemeMode(effectiveTheme() === 'dark' ? 'light' : 'dark');
}

media.addEventListener('change', () => {
    if (themeMode() === 'system') {
        syncMeta();
        store.emit('theme', effectiveTheme());
    }
});

syncMeta();
