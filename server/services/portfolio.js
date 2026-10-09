'use strict';

const config = require('../config');
const store = require('../store');
const platform = require('../platform');
const { settings } = require('./settings');
const { market } = require('./market');
const { portfolioCore } = require('../shared');

module.exports = new portfolioCore.PortfolioCore({ store, market, settings, platform, version: config.version });
