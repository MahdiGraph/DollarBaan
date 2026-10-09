'use strict';

// Error types are shared with the in-app backend.
const { AppError, HttpError, badRequest, notFound, conflict } = require('../shared').errors;

module.exports = { AppError, HttpError, badRequest, notFound, conflict };
