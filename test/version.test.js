'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

test('the web, desktop and Android builds carry the package.json version', () => {
    const script = path.join(__dirname, '..', 'scripts', 'sync-version.js');
    assert.doesNotThrow(() => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' }));
});
