'use strict';

const store = require('../store');
const platform = require('../platform');
const { settings } = require('./settings');
const { marketCore, providers } = require('../shared');

const market = new marketCore.MarketCore({
    store,
    settings,
    platform,
    createProvider: (preferences) => providers.createProvider(preferences, platform),
});

module.exports = { market, describeError: marketCore.describeError };
