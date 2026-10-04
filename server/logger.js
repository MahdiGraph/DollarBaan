'use strict';

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const config = require('./config');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const consoleFormat = combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    ...(process.stdout.isTTY ? [colorize()] : []),
    printf(({ level, message, timestamp: time, stack }) => `${time} ${level} ${stack || message}`)
);

const transports = [new winston.transports.Console({ format: consoleFormat })];

if (config.log.dir) {
    const dir = path.resolve(config.root, config.log.dir);
    try {
        fs.mkdirSync(dir, { recursive: true });
        const fileFormat = combine(errors({ stack: true }), timestamp(), json());
        transports.push(
            new winston.transports.File({
                filename: path.join(dir, 'error.log'),
                level: 'error',
                format: fileFormat,
                maxsize: 5 * 1024 * 1024,
                maxFiles: 3,
            }),
            new winston.transports.File({
                filename: path.join(dir, 'combined.log'),
                format: fileFormat,
                maxsize: 5 * 1024 * 1024,
                maxFiles: 3,
            })
        );
    } catch (error) {
        // Logging to files is optional; keep running with console output only.
        console.warn(`Cannot write logs to ${dir}: ${error.message}`);
    }
}

module.exports = winston.createLogger({
    level: config.log.level,
    transports,
});
