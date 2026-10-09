// Shared by the Node server and the in-app (local) backend.

/** An error whose message is safe to show to the user (messages are in Persian). */
export class AppError extends Error {
    constructor(status, message, code) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code || null;
    }
}

/** A failed request to a market data source. */
export class HttpError extends Error {
    constructor(message, { status, url } = {}) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.url = url;
    }
}

export const badRequest = (message, code) => new AppError(400, message, code);
export const notFound = (message = 'مورد درخواستی پیدا نشد', code) => new AppError(404, message, code);
export const conflict = (message, code) => new AppError(409, message, code);
