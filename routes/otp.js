const express   = require('express');
const router    = express.Router();
const crypto    = require('crypto');
const validator = require('validator');
const winston   = require('winston');
const pool      = require('../db');
const memStore  = require('../store');

require('dotenv').config();

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------
const ALGORITHM       = 'aes-256-gcm';
const IV_LENGTH       = 12;
const AUTH_TAG_LENGTH = 16;
const ENCRYPTION_KEY  = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
if (ENCRYPTION_KEY.length !== 32) { logger.error('Invalid ENCRYPTION_KEY'); process.exit(1); }

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const c  = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv, { authTagLength: AUTH_TAG_LENGTH });
  let enc  = c.update(text, 'utf8', 'hex');
  enc     += c.final('hex');
  return `${iv.toString('hex')}:${enc}:${c.getAuthTag().toString('hex')}`;
}

function decrypt(text) {
  if (!text || typeof text !== 'string') return null;
  const parts = text.split(':');
  if (parts.length !== 3) return null;
  try {
    const iv  = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) return null;
    const d = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv, { authTagLength: AUTH_TAG_LENGTH });
    d.setAuthTag(tag);
    let dec = d.update(Buffer.from(parts[1], 'hex'));
    dec = Buffer.concat([dec, d.final()]);
    const result = dec.toString('utf8');
    return /[^ -~]/.test(result) ? null : result;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter
// ---------------------------------------------------------------------------
function makeSimpleRL(maxPoints, windowSec) {
  const hits = new Map();
  return {
    consume(key) {
      const now = Date.now(), win = windowSec * 1000;
      const rec = hits.get(key) || { count: 0, start: now };
      if (now - rec.start > win) { rec.count = 0; rec.start = now; }
      rec.count++;
      hits.set(key, rec);
      if (rec.count > maxPoints) throw new Error('Rate limit exceeded');
    },
  };
}

const otpRequestRL = makeSimpleRL(10, 15 * 60);
const otpVerifyRL  = makeSimpleRL(20, 15 * 60);

const applyOtpRL = (req, res, next) => {
  try { otpRequestRL.consume(req.body.email?.toLowerCase() || req.ip); next(); }
  catch { res.status(429).json({ error: 'too_many_requests', message: 'Too many OTP requests' }); }
};
const applyVerRL = (req, res, next) => {
  try { otpVerifyRL.consume(req.body.email?.toLowerCase() || req.ip); next(); }
  catch { res.status(429).json({ error: 'too_many_attempts', message: 'Too many OTP verify attempts' }); }
};

const isAuthenticated = (req, res, next) => {
  if (!req.session?.isLoggedIn || !req.session?.userId)
    return res.status(401).json({ error: 'unauthorized', message: 'You must be logged in' });
  next();
};

function genOtp() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// ---------------------------------------------------------------------------
// POST /api/send-otp  — signup email verification
// ---------------------------------------------------------------------------
router.post('/send-otp', applyOtpRL, async (req, res) => {
  const { email } = req.body;
  if (!email || !validator.isEmail(email))
    return res.status(400).json({ error: 'invalid_email', message: 'Valid email is required' });

  const emailLC = email.toLowerCase();
  try {
    // Check if email already registered
    const rows = await pool.query('SELECT email FROM patients');
    for (const p of rows.rows) {
      if (decrypt(p.email) === emailLC)
        return res.status(400).json({ error: 'email_exists', message: 'Email already registered' });
    }

    const otp = genOtp();
    memStore.set(`otp:signup:${emailLC}`, JSON.stringify({ otp, purpose: 'signup' }), 15 * 60);

    console.log(`[OTP] Signup OTP for ${emailLC}: ${otp}`);
    res.json({ success: true, message: 'OTP generated (check server console)', dev_otp: otp });
  } catch (err) {
    logger.error('send-otp error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to send OTP' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/send-otp-password-change-admin
// ---------------------------------------------------------------------------
router.post('/send-otp-password-change-admin', applyOtpRL, isAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  try {
    const adminRow = await pool.query('SELECT id FROM admin WHERE id = $1', [userId]);
    if (!adminRow.rows.length)
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });

    const key = `otp:pwd-admin:${userId}`;
    const otp = genOtp();
    memStore.set(key, JSON.stringify({ otp, purpose: 'password_change_admin' }), 15 * 60);

    console.log(`[OTP] Admin password-change OTP for userId=${userId}: ${otp}`);
    res.json({ success: true, message: 'OTP generated (check server console)', dev_otp: otp });
  } catch (err) {
    logger.error('send-otp-password-change-admin error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to send OTP' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/send-otp-password-change-user
// ---------------------------------------------------------------------------
router.post('/send-otp-password-change-user', applyOtpRL, isAuthenticated, async (req, res) => {
  const userId = req.session.userId;
  try {
    const patRow = await pool.query('SELECT id FROM patients WHERE id = $1', [userId]);
    if (!patRow.rows.length)
      return res.status(403).json({ error: 'forbidden', message: 'Patient access required' });

    const key = `otp:pwd-user:${userId}`;
    const otp = genOtp();
    memStore.set(key, JSON.stringify({ otp, purpose: 'password_change_user' }), 15 * 60);

    console.log(`[OTP] User password-change OTP for userId=${userId}: ${otp}`);
    res.json({ success: true, message: 'OTP generated (check server console)', dev_otp: otp });
  } catch (err) {
    logger.error('send-otp-password-change-user error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to send OTP' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/verify-otp
// ---------------------------------------------------------------------------
router.post('/verify-otp', applyVerRL, async (req, res) => {
  const { email: providedEmail, otp, purpose, userId: bodyUserId } = req.body;
  if (!otp || !/^\d{6}$/.test(otp))
    return res.status(400).json({ error: 'invalid_otp', message: 'OTP must be 6 digits' });
  if (!['signup', 'password_change_user', 'password_change_admin'].includes(purpose))
    return res.status(400).json({ error: 'invalid_purpose', message: 'Invalid purpose' });

  try {
    let key;
    if (purpose === 'signup') {
      if (!providedEmail || !validator.isEmail(providedEmail))
        return res.status(400).json({ error: 'missing_email', message: 'Valid email required for signup OTP' });
      key = `otp:signup:${providedEmail.toLowerCase()}`;
    } else {
      const uid = bodyUserId || req.session?.userId;
      if (!uid) return res.status(400).json({ error: 'bad_request', message: 'userId required' });
      key = purpose === 'password_change_admin' ? `otp:pwd-admin:${uid}` : `otp:pwd-user:${uid}`;
    }

    const raw = memStore.get(key);
    if (!raw) return res.status(400).json({ error: 'invalid_otp', message: 'Invalid or expired OTP' });
    const stored = JSON.parse(raw);
    if (stored.purpose !== purpose)
      return res.status(400).json({ error: 'invalid_purpose', message: 'OTP purpose mismatch' });
    if (stored.otp !== otp)
      return res.status(400).json({ error: 'invalid_otp', message: 'Invalid OTP' });

    memStore.del(key);
    res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    logger.error('verify-otp error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to verify OTP' });
  }
});

router.use((err, _req, res, _next) => {
  logger.error('otp route error:', err.message);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong' });
});

module.exports = { otpRoutes: router };