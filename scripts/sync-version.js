#!/usr/bin/env node
'use strict';

// Copies the version from package.json into every place that ships it.
// Usage: node scripts/sync-version.js                 write the version everywhere
//        node scripts/sync-version.js --check         fail if any copy is out of date
//        node scripts/sync-version.js --check 2.1.0   ...or if package.json is not 2.1.0 (release tags)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { version } = require('../package.json');

if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`package.json version "${version}" must look like 1.2.3`);
    process.exit(1);
}

// Android needs a growing integer: 2.1.0 -> 20100.
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

const setJsonVersion = (text) => text.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`);

const TARGETS = [
    {
        file: 'public/assets/js/version.js',
        update: (text) => text.replace(/VERSION = '[^']*'/, `VERSION = '${version}'`),
    },
    { file: 'desktop/package.json', update: setJsonVersion },
    { file: 'mobile/package.json', update: setJsonVersion },
    {
        file: 'mobile/android/app/build.gradle',
        update: (text) => text
            .replace(/versionCode \d+/, `versionCode ${versionCode}`)
            .replace(/versionName "[^"]*"/, `versionName "${version}"`),
    },
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const expected = args.find((arg) => !arg.startsWith('--'));
const problems = [];

if (expected && expected.replace(/^v/, '') !== version) {
    problems.push(`package.json is ${version} but ${expected} was expected`);
}

for (const { file, update } of TARGETS) {
    const target = path.join(ROOT, file);
    const before = fs.readFileSync(target, 'utf8');
    const after = update(before);
    if (after === before) continue;
    if (check) {
        problems.push(`${file} is out of date`);
    } else {
        fs.writeFileSync(target, after);
        console.log(`Updated ${file}`);
    }
}

if (problems.length) {
    console.error(problems.join('\n'));
    console.error('Run "npm run version:sync" after changing the version in package.json.');
    process.exit(1);
}
if (check) console.log(`Version ${version} is consistent`);
