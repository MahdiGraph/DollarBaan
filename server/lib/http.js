'use strict';

const config = require('../config');

const USER_AGENT = `DollarBaan/${config.version} (+https://github.com/MahdiGraph/DollarBaan)`;

class HttpError extends Error {
    constructor(message, { status, url, cause } = {}) {
        super(message, cause ? { cause } : undefined);
        this.name = 'HttpError';
        this.status = status;
        this.url = url;
    }
}

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
        throw new HttpError(`Request to ${hostOf(url)} failed: ${reason}`, { url, cause: error });
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
    } catch (error) {
        throw new HttpError(`Invalid JSON from ${hostOf(url)}`, { url, cause: error });
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
