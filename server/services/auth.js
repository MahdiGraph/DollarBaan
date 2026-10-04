'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const config = require('../config');
const { Session } = require('../db');
const { settings } = require('./settings');
const { badRequest } = require('../lib/errors');
const logger = require('../logger');

const COOKIE_NAME = 'dollarbaan_session';
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;
const SCRYPT = { N: 16384, r: 8, p: 1 };

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest();

/** Constant-time string comparison (hashing first equalizes lengths). */
function safeEqual(a, b) {
    return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
    return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyHash(password, stored) {
    const [scheme, salt, hash] = String(stored || '').split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, SCRYPT);
    return crypto.timingSafeEqual(actual, expected);
}

function credentials() {
    const stored = settings.get('auth') || {};
    return { username: config.auth.username, passwordHash: stored.passwordHash || null };
}

function checkPassword(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') return false;
    const { username: expectedUser, passwordHash } = credentials();
    const userOk = safeEqual(username, expectedUser);
    const passwordOk = passwordHash ? verifyHash(password, passwordHash) : safeEqual(password, config.auth.password);
    return userOk && passwordOk;
}

function usesDefaultPassword() {
    return !credentials().passwordHash && config.auth.password === 'changeit';
}

async function changePassword(current, next) {
    if (!checkPassword(config.auth.username, String(current || ''))) {
        throw badRequest('رمز عبور فعلی درست نیست', 'wrong_password');
    }
    if (typeof next !== 'string' || next.length < 8) throw badRequest('رمز عبور جدید باید حداقل ۸ کاراکتر باشد');
    if (next.length > 200) throw badRequest('رمز عبور جدید بیش از حد طولانی است');
    if (next === current) throw badRequest('رمز عبور جدید باید با رمز فعلی فرق داشته باشد');
    await settings.set('auth', {
        ...(settings.get('auth') || {}),
        passwordHash: hashPassword(next),
        changedAt: new Date().toISOString(),
    });
}

/* ---------- sessions ---------- */

function cookieOptions(req) {
    const secure = config.cookieSecure === 'true' ? true : config.cookieSecure === 'false' ? false : Boolean(req.secure);
    return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: config.sessionMaxAgeMs };
}

async function createSession(req, username) {
    const token = crypto.randomBytes(32).toString('base64url');
    await Session.create({
        id: sha256(token).toString('hex'),
        username,
        expiresAt: new Date(Date.now() + config.sessionMaxAgeMs),
        lastSeenAt: new Date(),
        userAgent: String(req.get('user-agent') || '').slice(0, 255),
        ip: String(req.ip || '').slice(0, 64),
    });
    return token;
}

/** Returns the live session for a cookie token, extending it while the user is active. */
async function resolveSession(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const session = await Session.findByPk(sha256(token).toString('hex'));
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
        await session.destroy().catch(() => {});
        return null;
    }
    if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
        session.lastSeenAt = new Date();
        session.expiresAt = new Date(Date.now() + config.sessionMaxAgeMs);
        await session.save().catch(() => {});
        session.refreshed = true;
    }
    return session;
}

async function destroySession(token) {
    if (typeof token !== 'string' || !token) return;
    await Session.destroy({ where: { id: sha256(token).toString('hex') } });
}

async function destroyOtherSessions(currentId) {
    return Session.destroy({ where: { id: { [Op.ne]: currentId } } });
}

async function cleanupSessions() {
    try {
        const removed = await Session.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
        if (removed) logger.info(`Removed ${removed} expired sessions`);
    } catch (error) {
        logger.warn(`Session cleanup failed: ${error.message}`);
    }
}

function startSessionCleanup() {
    cleanupSessions();
    const timer = setInterval(cleanupSessions, 6 * 60 * 60 * 1000);
    timer.unref();
}

/* ---------- brute-force protection ---------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const failures = new Map();

const loginLimiter = {
    blocked(ip) {
        const entry = failures.get(ip);
        if (!entry) return false;
        if (Date.now() - entry.since > WINDOW_MS) {
            failures.delete(ip);
            return false;
        }
        return entry.count >= MAX_FAILURES;
    },
    fail(ip) {
        const now = Date.now();
        const entry = failures.get(ip);
        if (!entry || now - entry.since > WINDOW_MS) failures.set(ip, { count: 1, since: now });
        else entry.count += 1;
        if (failures.size > 5000) {
            for (const [key, value] of failures) if (now - value.since > WINDOW_MS) failures.delete(key);
        }
    },
    reset(ip) {
        failures.delete(ip);
    },
};

module.exports = {
    COOKIE_NAME,
    checkPassword,
    usesDefaultPassword,
    changePassword,
    cookieOptions,
    createSession,
    resolveSession,
    destroySession,
    destroyOtherSessions,
    startSessionCleanup,
    loginLimiter,
};
