'use strict';

const config = require('./config');
const logger = require('./logger');
const { sequelize, initDatabase } = require('./db');
const { settings } = require('./services/settings');
const { market } = require('./services/market');
const auth = require('./services/auth');
const { migrateLegacyData, detectPendingMigration } = require('./services/legacy');
const { createApp } = require('./app');

async function main() {
    await initDatabase();
    await settings.load();
    await market.init();
    if (await detectPendingMigration()) logger.info('DollarBaan 1.x data found; it will be imported after the first price sync');

    const app = createApp();
    const server = await new Promise((resolve, reject) => {
        const onListening = () => resolve(instance);
        const instance = config.host
            ? app.listen(config.port, config.host, onListening)
            : app.listen(config.port, onListening);
        instance.once('error', reject);
    });
    logger.info(`DollarBaan ${config.version} is up and running on port ${config.port}`);
    if (auth.usesDefaultPassword()) {
        logger.warn('You are using the default password "changeit". Change it from Settings or set AUTH_PASSWORD in .env.');
    }

    market.on('synced', () => migrateLegacyData());
    if (market.assets.size > 0) migrateLegacyData();
    market.start();
    auth.startSessionCleanup();

    let closing = false;
    const shutdown = (signal) => {
        if (closing) return;
        closing = true;
        logger.info(`${signal} received, shutting down`);
        market.stop();
        server.close(() => {
            sequelize.close().finally(() => process.exit(0));
        });
        setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
    if (error && error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use. Stop the other process or set PORT in .env.`);
    } else {
        logger.error(`Startup failed: ${error && error.stack ? error.stack : error}`);
    }
    process.exit(1);
});
