const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcrypt');
const crypto    = require('crypto');
const validator = require('validator');
const winston   = require('winston');
const pool      = require('../db');
const memStore  = require('../store');

require('dotenv').config();

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
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

if (ENCRYPTION_KEY.length !== 32) {
  logger.error('Invalid ENCRYPTION_KEY length'); process.exit(1);
}

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
// Simple in-process rate limiter
// ---------------------------------------------------------------------------
function makeSimpleRL(maxPoints, windowSec) {
  const hits = new Map();
  return {
    consume(key) {
      const now  = Date.now();
      const win  = windowSec * 1000;
      const rec  = hits.get(key) || { count: 0, start: now };
      if (now - rec.start > win) { rec.count = 0; rec.start = now; }
      rec.count++;
      hits.set(key, rec);
      if (rec.count > maxPoints) {
        const msLeft = win - (now - rec.start);
        const err    = new Error('Rate limit exceeded');
        err.msBeforeNext = msLeft;
        throw err;
      }
    },
  };
}

const loginRL   = makeSimpleRL(999, 15 * 60); // effectively unlimited locally
const forgotRL  = makeSimpleRL(20,  15 * 60);

const applyLoginRL = (req, res, next) => {
  try { loginRL.consume(req.ip); next(); }
  catch { res.status(429).json({ error: 'too_many_requests', message: 'Too many login attempts.' }); }
};
const applyForgotRL = (req, res, next) => {
  try { forgotRL.consume(req.ip); next(); }
  catch { res.status(429).json({ error: 'too_many_requests', message: 'Too many forgot-password requests.' }); }
};

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
router.post('/login', applyLoginRL, async (req, res) => {
  const { identifier, password, remember } = req.body;
  if (!identifier || !password)
    return res.status(400).json({ error: 'bad_request', message: 'Username/email and password are required' });

  try {
    let user = null, role = null, table = null;

    // 1. Check admin by username
    const adminRow = await pool.query(
      'SELECT id, username, password FROM admin WHERE username = $1', [identifier]
    );
    if (adminRow.rows.length) {
      const adm = adminRow.rows[0];
      if (!await bcrypt.compare(password, adm.password))
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
      user = adm; role = 'admin'; table = 'admin';
    }

    // 2. Check users by username
    if (!user) {
      const userRow = await pool.query(
        'SELECT id, username, password FROM users WHERE username = $1', [identifier]
      );
      if (userRow.rows.length) {
        const u = userRow.rows[0];
        if (!await bcrypt.compare(password, u.password))
          return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
        const pRow = await pool.query('SELECT email FROM patients WHERE id = $1', [u.id]);
        if (!pRow.rows.length)
          return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
        user = { ...u, email: decrypt(pRow.rows[0].email) };
        role = 'patient'; table = 'users';
      }
    }

    // 3. Check by email
    if (!user && validator.isEmail(identifier)) {
      const lower = identifier.toLowerCase();
      const allP  = await pool.query('SELECT id, email FROM patients');
      let matched = null;
      for (const p of allP.rows) {
        if (decrypt(p.email)?.toLowerCase() === lower) { matched = p; break; }
      }
      if (matched) {
        const uRow = await pool.query('SELECT id, username, password FROM users WHERE id = $1', [matched.id]);
        if (uRow.rows.length) {
          const u = uRow.rows[0];
          if (!await bcrypt.compare(password, u.password))
            return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
          user = { ...u, email: lower };
          role = 'patient'; table = 'users';
        }
      }
    }

    if (!user)
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });

    req.session.isLoggedIn = true;
    req.session.userId     = user.id;
    req.session.role       = role;

    if (remember) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(`UPDATE ${table} SET remember_token = $1 WHERE id = $2`, [token, user.id]);
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      res.cookie('remember_token', token, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    } else {
      await pool.query(`UPDATE ${table} SET remember_token = NULL WHERE id = $1`, [user.id]);
      res.clearCookie('remember_token');
    }

    logger.info(`Login OK: ${role} userId=${user.id}`);
    res.json({ success: true, message: 'Login successful', role, remember: !!remember });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// GET /auth/check-auth
// ---------------------------------------------------------------------------
router.get('/check-auth', async (req, res) => {
  if (!req.session?.isLoggedIn || !req.session?.userId)
    return res.status(401).json({ isLoggedIn: false, error: 'unauthorized' });
  const { userId } = req.session;
  try {
    const adminRow = await pool.query('SELECT id FROM admin WHERE id = $1', [userId]);
    if (adminRow.rows.length) return res.json({ isLoggedIn: true, userId, role: 'admin' });
    const userRow  = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userRow.rows.length) return res.json({ isLoggedIn: true, userId, role: 'patient' });
    return res.status(401).json({ isLoggedIn: false, error: 'unauthorized' });
  } catch (err) {
    logger.error('check-auth error:', err);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/auto-login
// ---------------------------------------------------------------------------
router.post('/auto-login', async (req, res) => {
  const token = req.cookies?.remember_token;
  if (!token || token.length !== 64)
    return res.status(401).json({ error: 'unauthorized', message: 'No valid remember token' });
  try {
    const adminRow = await pool.query('SELECT id FROM admin WHERE remember_token = $1', [token]);
    if (adminRow.rows.length) {
      req.session.isLoggedIn = true;
      req.session.userId     = adminRow.rows[0].id;
      req.session.role       = 'admin';
      return res.json({ success: true, message: 'Auto-login successful', role: 'admin' });
    }
    const userRow = await pool.query('SELECT id FROM users WHERE remember_token = $1', [token]);
    if (userRow.rows.length) {
      req.session.isLoggedIn = true;
      req.session.userId     = userRow.rows[0].id;
      req.session.role       = 'patient';
      return res.json({ success: true, message: 'Auto-login successful', role: 'patient' });
    }
    res.clearCookie('remember_token');
    res.status(401).json({ error: 'unauthorized', message: 'Invalid remember token' });
  } catch (err) {
    logger.error('auto-login error:', err);
    res.clearCookie('remember_token');
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/forgot-password  (OTP stored in-memory, printed to console)
// ---------------------------------------------------------------------------
router.post('/forgot-password', applyForgotRL, async (req, res) => {
  const { identifier } = req.body;
  if (!identifier)
    return res.status(400).json({ error: 'bad_request', message: 'Email or username is required' });
  try {
    let userId = null;
    if (validator.isEmail(identifier)) {
      const rows = await pool.query('SELECT id, email FROM patients');
      for (const p of rows.rows) {
        if (decrypt(p.email)?.toLowerCase() === identifier.toLowerCase()) { userId = p.id; break; }
      }
    } else {
      const row = await pool.query(
        'SELECT u.id FROM users u JOIN patients p ON p.id = u.id WHERE u.username = $1', [identifier]
      );
      if (row.rows.length) userId = row.rows[0].id;
    }
    if (!userId)
      return res.status(404).json({ error: 'not_found', message: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    memStore.set(`otp:${userId}:password_reset`, otp, 10 * 60);

    console.log(`[OTP] Password-reset OTP for userId=${userId}: ${otp}`);
    res.json({ success: true, message: 'OTP generated (check server console)', dev_otp: otp });
  } catch (err) {
    logger.error('forgot-password error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to send OTP' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/verify-otp
// ---------------------------------------------------------------------------
router.post('/verify-otp', async (req, res) => {
  const { identifier, otp, purpose } = req.body;
  if (!identifier || !otp || purpose !== 'password_reset')
    return res.status(400).json({ error: 'bad_request', message: 'identifier, otp, and purpose=password_reset are required' });
  try {
    let userId = null;
    if (validator.isEmail(identifier)) {
      const rows = await pool.query('SELECT id, email FROM patients');
      for (const p of rows.rows) {
        if (decrypt(p.email)?.toLowerCase() === identifier.toLowerCase()) { userId = p.id; break; }
      }
    } else {
      const row = await pool.query(
        'SELECT u.id FROM users u JOIN patients p ON p.id = u.id WHERE u.username = $1', [identifier]
      );
      if (row.rows.length) userId = row.rows[0].id;
    }
    if (!userId) return res.status(404).json({ error: 'not_found', message: 'User not found' });

    const stored = memStore.get(`otp:${userId}:password_reset`);
    if (!stored)        return res.status(400).json({ error: 'invalid_otp', message: 'Invalid or expired OTP' });
    if (stored !== otp) return res.status(400).json({ error: 'invalid_otp', message: 'Invalid OTP' });

    res.json({ success: true, message: 'OTP verified' });
  } catch (err) {
    logger.error('verify-otp error:', err);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// ---------------------------------------------------------------------------
router.post('/reset-password', async (req, res) => {
  const { identifier, otp, newPassword } = req.body;
  if (!identifier || !otp || !newPassword)
    return res.status(400).json({ error: 'bad_request', message: 'identifier, otp, and newPassword are required' });
  if (!validator.isLength(newPassword, { min: 8, max: 100 }))
    return res.status(400).json({ error: 'bad_request', message: 'Password must be 8-100 characters' });
  try {
    let userId = null;
    if (validator.isEmail(identifier)) {
      const rows = await pool.query('SELECT id, email FROM patients');
      for (const p of rows.rows) {
        if (decrypt(p.email)?.toLowerCase() === identifier.toLowerCase()) { userId = p.id; break; }
      }
    } else {
      const row = await pool.query(
        'SELECT u.id FROM users u JOIN patients p ON p.id = u.id WHERE u.username = $1', [identifier]
      );
      if (row.rows.length) userId = row.rows[0].id;
    }
    if (!userId) return res.status(404).json({ error: 'not_found', message: 'User not found' });

    const stored = memStore.get(`otp:${userId}:password_reset`);
    if (!stored || stored !== otp)
      return res.status(400).json({ error: 'invalid_otp', message: 'Invalid or expired OTP' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1, remember_token = NULL WHERE id = $2', [hash, userId]);
    memStore.del(`otp:${userId}:password_reset`);

    await new Promise((ok, fail) =>
      req.session.destroy((err) => err ? fail(err) : ok())
    );
    res.clearCookie('connect.sid');
    res.clearCookie('remember_token');
    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    logger.error('reset-password error:', err);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
router.post('/logout', async (req, res) => {
  const userId = req.session?.userId;
  try {
    if (userId) {
      const adminRow = await pool.query('SELECT id FROM admin WHERE id = $1', [userId]);
      const table    = adminRow.rows.length ? 'admin' : 'users';
      await pool.query(`UPDATE ${table} SET remember_token = NULL WHERE id = $1`, [userId]);
    }
    await new Promise((ok, fail) =>
      req.session?.destroy((err) => err ? fail(err) : ok()) ?? ok()
    );
    res.clearCookie('remember_token');
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    logger.error('logout error:', err);
    res.clearCookie('remember_token');
    res.clearCookie('connect.sid');
    res.status(500).json({ error: 'server_error', message: 'Logout failed' });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  logger.error('auth route error:', err.message);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong' });
});

module.exports = router;