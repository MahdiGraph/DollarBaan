'use strict';

const config = require('../config');
const { HttpError } = require('../shared').errors;

const USER_AGENT = `DollarBaan/${config.version} (+https://github.com/MahdiGraph/DollarBaan)`;

/**
 * GET a JSON document. With `etag`, a 304 answer resolves to { notModified: true }.
 */
async function getJson(url, { timeoutMs = config.http.timeoutMs, etag, headers = {} } = {}) {
    let response;
    try {
        response = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'application/json',
                ...(etag ? { 'If-None-Match': etag } : {}),
                ...headers,
            },
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (error) {
        const reason = error.name === 'TimeoutError' ? 'timed out' : error.cause?.code || error.message;
        throw new HttpError(`Request to ${hostOf(url)} failed: ${reason}`, { url });
    }

    if (response.status === 304) return { notModified: true, etag };
    if (!response.ok) {
        throw new HttpError(`Request to ${hostOf(url)} failed with HTTP ${response.status}`, {
            status: response.status,
            url,
        });
    }

    const text = await response.text();
    try {
        return { data: JSON.parse(text), etag: response.headers.get('etag') };
    } catch {
        throw new HttpError(`Invalid JSON from ${hostOf(url)}`, { url });
    }
}

function hostOf(url) {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

module.exports = { getJson, HttpError };
