'use strict';

/** An error whose message is safe to show to the user (messages are in Persian). */
class AppError extends Error {
    constructor(status, message, code) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code || null;
    }
}

const badRequest = (message, code) => new AppError(400, message, code);
const notFound = (message = 'مورد درخواستی پیدا نشد', code) => new AppError(404, message, code);
const conflict = (message, code) => new AppError(409, message, code);

module.exports = { AppError, badRequest, notFound, conflict };
