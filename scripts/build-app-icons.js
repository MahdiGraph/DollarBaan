#!/usr/bin/env node
'use strict';

// Renders every raster icon (web, desktop, Android) from public/assets/img/logo.svg.
// Usage: npm install --no-save sharp && node scripts/build-app-icons.js
// The macOS .icns is only rebuilt on macOS (needs iconutil); the result is committed.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const WEB_IMG = path.join(ROOT, 'public', 'assets', 'img');
const DESKTOP_BUILD = path.join(ROOT, 'desktop', 'build');
const ANDROID_RES = path.join(ROOT, 'mobile', 'android', 'app', 'src', 'main', 'res');

// --- Pieces of the logo: gradient defs, tile and artwork (everything drawn on the tile) ---

const logo = fs.readFileSync(path.join(WEB_IMG, 'logo.svg'), 'utf8');
const defs = logo.match(/<defs>[\s\S]*?<\/defs>/)[0];
const tile = logo.match(/<rect width="64" height="64"[^>]*\/>/)[0];
const art = logo.slice(logo.indexOf(tile) + tile.length, logo.lastIndexOf('</svg>')).trim();
const fill = tile.match(/fill="([^"]+)"/)[1];

const svg = (viewBox, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs}${body}</svg>`;

// The logo as-is: rounded tile, transparent corners.
const rounded = () => svg('0 0 64 64', `${tile}${art}`);
// Full-bleed square for platforms that apply their own mask (iOS, maskable PWA icons).
const square = (artScale = 1) => svg('0 0 64 64', `<rect width="64" height="64" fill="${fill}"/>${scaled(art, artScale, 32, 32)}`);
// Circle for Android's legacy round launcher icon.
const circle = () => svg('0 0 64 64', `<circle cx="32" cy="32" r="32" fill="${fill}"/>${scaled(art, 0.9, 32, 32)}`);
// macOS Big Sur grid: 824px body on a 1024px canvas with a soft shadow.
const mac = () => svg('0 0 1024 1024', `
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
        <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.28"/>
    </filter>
    <rect x="100" y="100" width="824" height="824" rx="185" fill="${fill}" filter="url(#shadow)"/>
    <g transform="translate(100 100) scale(12.875)">${art}</g>`);
// Android adaptive icon foreground: artwork only, the 64-unit tile mapped onto the 66dp safe zone of 108dp.
const foreground = () => svg('0 0 108 108', `<g transform="translate(21 21) scale(1.03125)">${art}</g>`);

function scaled(markup, factor, cx, cy) {
    if (factor === 1) return markup;
    return `<g transform="translate(${cx * (1 - factor)} ${cy * (1 - factor)}) scale(${factor})">${markup}</g>`;
}

// Rasterizes at twice the target size, then downsamples for smoother edges.
async function png(source, size) {
    const sized = source.replace('<svg ', `<svg width="${size * 2}" height="${size * 2}" `);
    return sharp(Buffer.from(sized)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

async function write(file, source, size) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await png(source, size));
}

// ICO with PNG-compressed entries (supported since Windows Vista).
async function ico(file, source, sizes) {
    const images = await Promise.all(sizes.map((size) => png(source, size)));
    const header = Buffer.alloc(6 + 16 * sizes.length);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, i) => {
        const entry = 6 + 16 * i;
        header.writeUInt8(size >= 256 ? 0 : size, entry);
        header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
        header.writeUInt16LE(1, entry + 4);
        header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(images[i].length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += images[i].length;
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat([header, ...images]));
}

async function web() {
    await write(path.join(WEB_IMG, 'favicon-16x16.png'), rounded(), 16);
    await write(path.join(WEB_IMG, 'favicon-32x32.png'), rounded(), 32);
    await write(path.join(WEB_IMG, 'apple-touch-icon.png'), square(0.86), 180);
    await write(path.join(WEB_IMG, 'android-chrome-192x192.png'), rounded(), 192);
    await write(path.join(WEB_IMG, 'android-chrome-512x512.png'), rounded(), 512);
    await write(path.join(WEB_IMG, 'maskable-512x512.png'), square(0.86), 512);
    await ico(path.join(ROOT, 'public', 'favicon.ico'), rounded(), [16, 32, 48]);
}

async function desktop() {
    await ico(path.join(DESKTOP_BUILD, 'icon.ico'), rounded(), [16, 24, 32, 48, 64, 128, 256]);
    for (const size of [16, 32, 48, 64, 128, 256, 512]) {
        await write(path.join(DESKTOP_BUILD, 'icons', `${size}x${size}.png`), rounded(), size);
    }
    if (process.platform !== 'darwin') {
        console.warn('Skipping icon.icns: iconutil is only available on macOS');
        return;
    }
    const iconset = fs.mkdtempSync(path.join(os.tmpdir(), 'dollarbaan-')) + '/icon.iconset';
    fs.mkdirSync(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
        await write(path.join(iconset, `icon_${size}x${size}.png`), mac(), size);
        await write(path.join(iconset, `icon_${size}x${size}@2x.png`), mac(), size * 2);
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(DESKTOP_BUILD, 'icon.icns')]);
    fs.rmSync(path.dirname(iconset), { recursive: true, force: true });
}

async function android() {
    if (!fs.existsSync(ANDROID_RES)) {
        console.warn('Skipping Android icons: run "npx cap add android" in mobile/ first');
        return;
    }
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [density, factor] of Object.entries(densities)) {
        const dir = path.join(ANDROID_RES, `mipmap-${density}`);
        await write(path.join(dir, 'ic_launcher.png'), rounded(), 48 * factor);
        await write(path.join(dir, 'ic_launcher_round.png'), circle(), 48 * factor);
        await write(path.join(dir, 'ic_launcher_foreground.png'), foreground(), 108 * factor);
    }
    // Pre-Android 12 launch screen (res/drawable/splash.xml shows it at 112dp).
    await write(path.join(ANDROID_RES, 'drawable-nodpi', 'splash_logo.png'), rounded(), 448);
}

(async () => {
    await web();
    await desktop();
    await android();
    console.log('Icons written for web, desktop and Android');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
