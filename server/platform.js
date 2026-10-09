'use strict';

// Node implementations of the services the shared cores need.
const crypto = require('crypto');
const logger = require('./logger');
const { getJson } = require('./lib/http');

module.exports = {
    logger,
    fetchJson: getJson,
    uuid: () => crypto.randomUUID(),
    randomHex: (bytes) => crypto.randomBytes(bytes).toString('hex'),
};
