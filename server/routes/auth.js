'use strict';

const express = require('express');
const config = require('../config');
const auth = require('../services/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (auth.loginLimiter.blocked(ip)) {
        return res.status(429).json({ error: 'تلاش‌های ناموفق زیادی انجام شد؛ چند دقیقه دیگر دوباره امتحان کنید', code: 'rate_limited' });
    }
    const { username, password } = req.body || {};
    const user = typeof username === 'string' ? username.trim() : '';
    if (!auth.checkPassword(user, typeof password === 'string' ? password : '')) {
        auth.loginLimiter.fail(ip);
        return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است', code: 'invalid_credentials' });
    }
    auth.loginLimiter.reset(ip);
    const token = await auth.createSession(req, user);
    res.cookie(auth.COOKIE_NAME, token, auth.cookieOptions(req));
    return res.json({ ok: true });
});

router.post('/logout', async (req, res) => {
    await auth.destroySession(req.cookies && req.cookies[auth.COOKIE_NAME]);
    res.clearCookie(auth.COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
});

router.get('/me', (req, res) => {
    if (!req.session) return res.status(401).json({ error: 'وارد نشده‌اید', code: 'unauthorized' });
    return res.json({
        username: req.session.username,
        defaultPassword: auth.usesDefaultPassword(),
        version: config.version,
    });
});

module.exports = router;
