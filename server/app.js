'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./logger');
const auth = require('./services/auth');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { AppError } = require('./lib/errors');

const PUBLIC_DIR = path.join(config.root, 'public');
const LONG_CACHE = /\.(woff2|png|ico|jpg|webp)$/;

const CSP = [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
].join('; ');

function securityHeaders(req, res, next) {
    res.set({
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
}

async function loadSession(req, res, next) {
    const token = req.cookies && req.cookies[auth.COOKIE_NAME];
    req.session = token ? await auth.resolveSession(token) : null;
    // Keep the cookie lifetime in step with the sliding session.
    if (req.session && req.session.refreshed) res.cookie(auth.COOKIE_NAME, token, auth.cookieOptions(req));
    next();
}

function requireApiSession(req, res, next) {
    if (!req.session) return res.status(401).json({ error: 'نشست شما به پایان رسیده است؛ دوباره وارد شوید', code: 'unauthorized' });
    return next();
}

// Cross-site pages cannot send this header without a CORS preflight, which we never allow.
function requireAppHeader(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.get('x-requested-with') === 'DollarBaan') return next();
    return res.status(403).json({ error: 'درخواست نامعتبر است', code: 'csrf' });
}

function sendPage(name) {
    return (req, res) => {
        res.set('Cache-Control', 'no-cache');
        res.sendFile(path.join(PUBLIC_DIR, name));
    };
}

function createApp() {
    const app = express();
    app.disable('x-powered-by');
    if (config.trustProxy) app.set('trust proxy', 1);

    app.use(securityHeaders);
    app.use(cookieParser());
    app.use(express.json({ limit: '10mb' }));

    app.get('/healthz', (req, res) => res.json({ ok: true, version: config.version }));
    // The same frontend runs as a local (on-device) app; served from here it talks to this server.
    app.get('/assets/js/runtime-config.js', (req, res) => {
        res.set('Cache-Control', 'no-cache');
        res.type('application/javascript').send("export const MODE = 'server';\n");
    });

    app.use('/api', loadSession, requireAppHeader);
    app.use('/api/auth', authRoutes);
    app.use('/api', requireApiSession, apiRoutes);
    app.use('/api', (req, res) => res.status(404).json({ error: 'مسیر پیدا نشد', code: 'not_found' }));

    app.get('/login', loadSession, (req, res, next) => (req.session ? res.redirect('/') : next()), sendPage('login.html'));
    app.get('/logout', async (req, res) => {
        await auth.destroySession(req.cookies && req.cookies[auth.COOKIE_NAME]).catch(() => {});
        res.clearCookie(auth.COOKIE_NAME, { path: '/' });
        res.redirect('/login');
    });
    app.get(['/', '/index.html'], loadSession, (req, res, next) => (req.session ? next() : res.redirect('/login')), sendPage('index.html'));

    app.use(express.static(PUBLIC_DIR, {
        index: false,
        setHeaders(res, filePath) {
            res.set('Cache-Control', LONG_CACHE.test(filePath) ? 'public, max-age=2592000' : 'no-cache');
        },
    }));

    app.use((req, res) => res.status(404).type('text/plain').send('Not found'));

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        const isApi = req.path.startsWith('/api/');
        if (error instanceof AppError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        if (error && (error.type === 'entity.parse.failed' || error.type === 'entity.too.large')) {
            const status = error.type === 'entity.too.large' ? 413 : 400;
            return res.status(status).json({ error: status === 413 ? 'حجم درخواست بیش از حد مجاز است' : 'درخواست ارسال‌شده معتبر نیست' });
        }
        logger.error(error && error.stack ? error.stack : String(error));
        if (isApi) return res.status(500).json({ error: 'خطای داخلی سرور؛ جزئیات در لاگ سرور ثبت شد', code: 'internal' });
        return res.status(500).type('text/plain').send('Internal server error');
    });

    return app;
}

module.exports = { createApp };
