'use strict';

// Business logic shared with the in-app backend lives in public/assets/js/shared as
// ES modules; Node loads them here through require(esm) (Node 20.19+ / 22.12+).
module.exports = {
    errors: require('../public/assets/js/shared/errors.js'),
    dates: require('../public/assets/js/shared/dates.js'),
    catalog: require('../public/assets/js/shared/catalog.js'),
    ledger: require('../public/assets/js/shared/ledger.js'),
    providers: require('../public/assets/js/shared/providers/index.js'),
    iranMarket: require('../public/assets/js/shared/providers/iran-market.js'),
    navasan: require('../public/assets/js/shared/providers/navasan.js'),
    settingsCore: require('../public/assets/js/shared/core/settings.js'),
    marketCore: require('../public/assets/js/shared/core/market.js'),
    portfolioCore: require('../public/assets/js/shared/core/portfolio.js'),
    routes: require('../public/assets/js/shared/core/routes.js'),
};
