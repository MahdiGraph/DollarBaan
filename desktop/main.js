'use strict';

// DollarBaan desktop: an Electron shell around the static web app in public/.
// The page runs in local mode (public/assets/js/runtime-config.js): data stays in
// IndexedDB inside this app's profile and prices come straight from Iran Market.

const { app, BrowserWindow, Menu, nativeTheme, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SCHEME = 'app';
const HOST = 'dollarbaan';
const ORIGIN = `${SCHEME}://${HOST}`;
const REPO_URL = 'https://github.com/MahdiGraph/DollarBaan';

// Packaged builds ship public/ as resources/web (see "extraResources" in package.json).
const WEB_ROOT = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'public');

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};

const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
].join('; ');

// A standard, secure scheme gives the page a stable origin (so IndexedDB persists)
// and a secure context (crypto.randomUUID, storage APIs) without file:// quirks.
protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
]);

// Development runs get their own profile so they never touch the installed app's data.
if (!app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), 'DollarBaan (dev)'));

async function serve(request) {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('Not found', { status: 404 });

    let pathname;
    try {
        pathname = decodeURIComponent(url.pathname);
    } catch {
        return new Response('Bad request', { status: 400 });
    }
    if (pathname.endsWith('/')) pathname += 'index.html';

    const file = path.join(WEB_ROOT, pathname);
    const relative = path.relative(WEB_ROOT, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return new Response('Forbidden', { status: 403 });
    }

    try {
        const body = await fs.promises.readFile(file);
        return new Response(body, {
            headers: {
                'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
                'Content-Security-Policy': CSP,
                'Cache-Control': 'no-cache',
            },
        });
    } catch {
        return new Response('Not found', { status: 404 });
    }
}

function openExternal(url) {
    try {
        const { protocol: scheme } = new URL(url);
        if (scheme === 'https:' || scheme === 'http:' || scheme === 'mailto:') shell.openExternal(url);
    } catch {
        /* not a URL */
    }
}

// --- Window size and position, remembered between launches ---

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
    try {
        const state = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
        const fits = ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(state[key]));
        const visible = fits && screen.getAllDisplays().some(({ workArea }) => (
            state.x < workArea.x + workArea.width - 80 && state.x + state.width > workArea.x + 80
            && state.y < workArea.y + workArea.height - 80 && state.y + state.height > workArea.y
        ));
        return visible ? state : null;
    } catch {
        return null;
    }
}

function saveWindowState(win) {
    try {
        const bounds = win.getNormalBounds();
        fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: win.isMaximized() }));
    } catch {
        /* best effort */
    }
}

// --- Window ---

let mainWindow = null;

function createWindow() {
    const state = loadWindowState();
    const win = new BrowserWindow({
        width: state ? state.width : 1280,
        height: state ? state.height : 840,
        x: state ? state.x : undefined,
        y: state ? state.y : undefined,
        minWidth: 380,
        minHeight: 560,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0f14' : '#f4f5f7',
        icon: process.platform === 'linux' ? path.join(WEB_ROOT, 'assets', 'img', 'android-chrome-512x512.png') : undefined,
        webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            spellcheck: false,
        },
    });
    if (state && state.maximized) win.maximize();

    win.once('ready-to-show', () => win.show());
    win.on('close', () => saveWindowState(win));
    win.on('closed', () => {
        if (mainWindow === win) mainWindow = null;
    });

    // Everything outside the app opens in the system browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
        openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith(`${ORIGIN}/`)) return;
        event.preventDefault();
        openExternal(url);
    });

    win.loadURL(`${ORIGIN}/index.html`);
    mainWindow = win;
    return win;
}

function buildMenu() {
    const isMac = process.platform === 'darwin';
    return Menu.buildFromTemplate([
        ...(isMac ? [{ role: 'appMenu' }] : []),
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [
                { label: 'DollarBaan on GitHub', click: () => openExternal(REPO_URL) },
                { label: 'Report a problem', click: () => openExternal(`${REPO_URL}/issues`) },
                { label: 'Iran Market data', click: () => openExternal('https://github.com/iran-market/iran-market.github.io') },
            ],
        },
    ]);
}

// --- App lifecycle ---

if (!app.requestSingleInstanceLock()) {
    // IndexedDB belongs to one running copy; hand over to it.
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    });

    app.whenReady().then(() => {
        protocol.handle(SCHEME, serve);
        session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
            callback(permission === 'clipboard-sanitized-write' || permission === 'fullscreen');
        });
        Menu.setApplicationMenu(buildMenu());
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
