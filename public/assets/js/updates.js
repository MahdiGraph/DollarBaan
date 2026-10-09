// Tells desktop and Android users when a newer release is published. Installed apps cannot
// update themselves, so this is how people find out about new versions.
import { VERSION } from './version.js';

const LATEST_RELEASE_API = 'https://api.github.com/repos/MahdiGraph/DollarBaan/releases/latest';
const RELEASES_URL = 'https://github.com/MahdiGraph/DollarBaan/releases/latest';
const CACHE_KEY = 'dollarbaan.latestRelease';
const DISMISSED_KEY = 'dollarbaan.dismissedUpdate';
const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;

/** True inside the desktop (Electron) or Android (Capacitor) app. */
export function isInstalledApp() {
    const capacitor = window.Capacitor;
    const native = Boolean(capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform());
    return native || /Electron/.test(navigator.userAgent);
}

function isNewer(candidate, current) {
    const a = candidate.split('.').map(Number);
    const b = current.split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
}

function read(key) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch {
        return null;
    }
}

function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* storage unavailable */
    }
}

/** Resolves to `{ version, url }` when a newer release exists, otherwise null. */
export async function findUpdate() {
    if (!isInstalledApp()) return null;
    let latest = read(CACHE_KEY);
    if (!latest || !(Date.now() - latest.checkedAt < CHECK_EVERY_MS)) {
        const response = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-cache' });
        if (!response.ok) return null;
        const release = await response.json();
        const url = /^https:\/\/github\.com\//.test(release.html_url) ? release.html_url : RELEASES_URL;
        latest = { version: String(release.tag_name || '').replace(/^v/, ''), url, checkedAt: Date.now() };
        write(CACHE_KEY, latest);
    }
    if (!/^\d+\.\d+\.\d+$/.test(latest.version) || !isNewer(latest.version, VERSION)) return null;
    return { version: latest.version, url: latest.url };
}

export const isDismissed = (update) => read(DISMISSED_KEY) === update.version;
export const dismissUpdate = (update) => write(DISMISSED_KEY, update.version);
