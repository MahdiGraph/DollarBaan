#!/usr/bin/env node
// Smoke test for the packaged apps, driven over the Chrome DevTools protocol (used in CI).
//
//   node scripts/smoke.mjs --launch <executable> [--shot file.png] [-- extra app args]
//       starts a desktop build with remote debugging and checks it
//   node scripts/smoke.mjs --port 9222 [--shot file.png]
//       checks an app that is already exposing DevTools on this port (Android WebView via adb forward)
//
// Passes when the app renders, runs its built-in backend and completes a price sync.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? null : args[index + 1];
};
const separator = args.indexOf('--');
const appArgs = separator === -1 ? [] : args.slice(separator + 1);
const executable = option('--launch') && path.resolve(option('--launch'));
const port = Number(option('--port') || 9333);
const shot = option('--shot');
const APP_URL = /^(app:\/\/dollarbaan|https:\/\/localhost)\//;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let child = null;
if (executable) {
    child = spawn(executable, [`--remote-debugging-port=${port}`, ...appArgs], { stdio: 'inherit' });
    child.on('exit', (code) => {
        if (code !== null && code !== 0) console.error(`App exited early with code ${code}`);
    });
}

async function findPage() {
    for (let attempt = 0; attempt < 90; attempt += 1) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
            const page = targets.find((target) => target.type === 'page' && APP_URL.test(target.url));
            if (page) return page;
        } catch {
            /* DevTools is not listening yet */
        }
        await sleep(1000);
    }
    throw new Error('No app page appeared on the DevTools port');
}

async function connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () => reject(new Error('Cannot connect to DevTools'));
    });
    let nextId = 0;
    const pending = new Map();
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message);
            pending.delete(message.id);
        }
    };
    const send = (method, params = {}) => new Promise((resolve) => {
        nextId += 1;
        pending.set(nextId, resolve);
        socket.send(JSON.stringify({ id: nextId, method, params }));
    });
    return { socket, send };
}

// Runs inside the app page.
const CHECK = `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 60 && !document.querySelector('.nav-item, .tab'); i += 1) await wait(500);
    const { api, IS_LOCAL } = await import('./assets/js/api.js');
    let status = null;
    for (let i = 0; i < 120; i += 1) {
        status = await api.get('/api/status');
        if (status.lastSuccessAt || (status.ok === false && !status.running)) break;
        await wait(1000);
    }
    const assets = await api.get('/api/assets');
    return {
        title: document.title,
        local: IS_LOCAL,
        navigation: document.querySelectorAll('.nav-item, .tab').length,
        synced: Boolean(status && status.lastSuccessAt),
        error: status && status.error,
        assets: Array.isArray(assets) ? assets.length : (assets && assets.assets ? assets.assets.length : 0),
        userAgent: navigator.userAgent,
    };
})()`;

let failed = false;
try {
    const page = await findPage();
    console.log(`Found ${page.url}`);
    const { socket, send } = await connect(page.webSocketDebuggerUrl);
    const response = await send('Runtime.evaluate', { expression: CHECK, awaitPromise: true, returnByValue: true });
    if (response.result.exceptionDetails) {
        throw new Error(`Page check threw: ${JSON.stringify(response.result.exceptionDetails.exception || response.result.exceptionDetails)}`);
    }
    const result = response.result.result.value;
    console.log(JSON.stringify(result, null, 2));

    if (shot) {
        await sleep(1500);
        const image = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(shot, Buffer.from(image.result.data, 'base64'));
        console.log(`Screenshot saved to ${shot}`);
    }
    socket.close();

    const problems = [];
    if (!result.title.includes('دلاربان')) problems.push('unexpected page title');
    if (!result.local) problems.push('the app is not running its built-in backend');
    if (!result.navigation) problems.push('navigation did not render');
    if (!result.synced) problems.push(`price sync failed: ${result.error || 'timed out'}`);
    if (result.assets < 50) problems.push(`only ${result.assets} assets loaded`);
    if (problems.length) throw new Error(problems.join('; '));
    console.log('Smoke test passed');
} catch (error) {
    failed = true;
    console.error(`Smoke test failed: ${error.message}`);
} finally {
    if (child) child.kill();
}
process.exit(failed ? 1 : 0);
