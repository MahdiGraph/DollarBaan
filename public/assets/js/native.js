// Android (Capacitor) integration; only loaded inside the native app.
import { store } from './state.js';
import { effectiveTheme } from './ui/theme.js';

export function setupNative() {
    const plugins = window.Capacitor.Plugins || {};
    const { App, SystemBars } = plugins;

    // Light status bar icons on the dark theme, dark icons on the light theme.
    const applyBars = () => {
        if (!SystemBars || !SystemBars.setStyle) return;
        SystemBars.setStyle({ style: effectiveTheme() === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
    };
    applyBars();
    store.on('theme', applyBars);

    if (App && App.addListener) {
        App.addListener('backButton', () => {
            const dialog = document.querySelector('dialog[open]');
            if (dialog) {
                const close = dialog.querySelector('[data-close]');
                if (close) close.click();
                return;
            }
            const route = window.location.hash.replace(/^#/, '');
            if (route && route !== '/') {
                window.history.back();
                return;
            }
            App.exitApp();
        });
    }
}
