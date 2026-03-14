const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcrypt');
const crypto    = require('crypto');
const validator = require('validator');
const winston   = require('winston');
const pool      = require('../db');

require('dotenv').config();
router.use(express.json({ limit: '10kb' }));

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
// Middleware
// ---------------------------------------------------------------------------
const isAuthenticated = (req, res, next) => {
  if (!req.session?.isLoggedIn || !req.session?.userId)
    return res.status(401).json({ error: 'unauthorized', message: 'You must be logged in' });
  next();
};

const isAdmin = async (userId) => {
  const r = await pool.query('SELECT id FROM admin WHERE id = $1', [userId]);
  return r.rows.length > 0;
};

// Simple in-memory rate limiter
function makeRL(maxPoints, windowSec) {
  const hits = new Map();
  return async (req, res, next) => {
    const key = `user:${req.session?.userId || req.ip}`;
    const now = Date.now(), win = windowSec * 1000;
    const rec = hits.get(key) || { count: 0, start: now };
    if (now - rec.start > win) { rec.count = 0; rec.start = now; }
    rec.count++;
    hits.set(key, rec);
    if (rec.count > maxPoints)
      return res.status(429).json({ error: 'too_many_requests', message: 'Too many requests' });
    next();
  };
}

const registrationRL  = makeRL(10,  60 * 60);
const profileGetRL    = makeRL(200, 15 * 60);
const profileUpdateRL = makeRL(20,  60 * 60);
const changePassRL    = makeRL(10,  60 * 60);
const allPatientsRL   = makeRL(100, 60 * 60);
const adminProfileRL  = makeRL(200, 15 * 60);
const adminUpdateRL   = makeRL(10,  60 * 60);
const checkUsernameRL = makeRL(100, 60 * 60);

function calculateAge(birthdate) {
  try {
    const birth = new Date(birthdate);
    return Math.max(0, Math.floor((Date.now() - birth) / (365.25 * 24 * 60 * 60 * 1000)));
  } catch { return 0; }
}

// ---------------------------------------------------------------------------
// GET /patients/check-username
// ---------------------------------------------------------------------------
router.get('/check-username', checkUsernameRL, async (req, res) => {
  const { username } = req.query;
  if (!username || !validator.isLength(username, { min: 3, max: 50 }))
    return res.status(400).json({ error: 'invalid_request', message: 'Username must be 3-50 characters' });
  try {
    const r = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    res.json({ exists: r.rows.length > 0 });
  } catch (err) {
    logger.error('check-username error:', err);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /patients  — register
// ---------------------------------------------------------------------------
router.post('/', registrationRL, async (req, res) => {
  const {
    username, password, last_name, first_name, middle_name, birthdate, sex,
    nickname, religion, nationality, home_address, home_no, occupation,
    office_no, dental_insurance, fax_no, mobile_no, email,
  } = req.body;

  // Validate required
  for (const [k, v] of Object.entries({ username, password, last_name, first_name, birthdate, sex, home_address, mobile_no, email })) {
    if (!v) return res.status(400).json({ error: 'missing_fields', message: `${k} is required` });
  }
  if (!validator.isLength(username, { min: 3, max: 50 }))
    return res.status(400).json({ error: 'invalid_data', message: 'Username must be 3-50 characters' });
  if (!validator.isLength(password, { min: 8, max: 100 }))
    return res.status(400).json({ error: 'invalid_data', message: 'Password must be 8-100 characters' });
  if (!validator.isEmail(email))
    return res.status(400).json({ error: 'invalid_data', message: 'Invalid email' });
  if (!['M', 'F'].includes(sex))
    return res.status(400).json({ error: 'invalid_data', message: 'Sex must be M or F' });
  if (!validator.isISO8601(birthdate))
    return res.status(400).json({ error: 'invalid_data', message: 'Invalid birthdate' });

  const client = await pool.connect();
  try {
    // Check duplicate username
    const usernameCheck = await client.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length)
      return res.status(400).json({ error: 'username_exists', message: 'Username already taken' });

    // Check duplicate email
    const emailLC  = email.toLowerCase();
    const allPats  = await client.query('SELECT email FROM patients');
    for (const p of allPats.rows) {
      if (decrypt(p.email) === emailLC)
        return res.status(400).json({ error: 'email_exists', message: 'Email already registered' });
    }

    await client.query('BEGIN');

    const hashedPwd = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
      [username, hashedPwd]
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO patients
        (id, first_name, last_name, middle_name, birthdate, sex, nickname, religion, nationality,
         home_address, home_no, occupation, office_no, dental_insurance, fax_no, mobile_no, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        userId,
        encrypt(first_name), encrypt(last_name),
        middle_name ? encrypt(middle_name) : null,
        encrypt(birthdate), sex,
        nickname         ? encrypt(nickname)         : null,
        religion         ? encrypt(religion)         : null,
        nationality      ? encrypt(nationality)      : null,
        encrypt(home_address),
        home_no          ? encrypt(home_no)          : null,
        occupation       ? encrypt(occupation)       : null,
        office_no        ? encrypt(office_no)        : null,
        dental_insurance ? encrypt(dental_insurance) : null,
        fax_no           ? encrypt(fax_no)           : null,
        encrypt(mobile_no),
        encrypt(emailLC),
      ]
    );

    await client.query('COMMIT');
    logger.info(`Patient registered: userId=${userId}`);
    res.status(201).json({ success: true, message: 'Patient registered successfully', patient_id: userId });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('register error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to register patient' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// GET /patients/profile
// ---------------------------------------------------------------------------
router.get('/profile', isAuthenticated, profileGetRL, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT first_name, last_name, email, mobile_no, birthdate, sex, home_address, religion, nationality, home_no FROM patients WHERE id = $1',
      [req.session.userId]
    );
    if (!r.rows.length)
      return res.status(404).json({ error: 'not_found', message: 'Profile not found' });
    const d = r.rows[0];
    const profile = {
      full_name:    `${decrypt(d.first_name) || ''} ${decrypt(d.last_name) || ''}`.trim(),
      email:        decrypt(d.email)        || 'Not provided',
      phone:        decrypt(d.mobile_no)    || 'Not provided',
      dob:          decrypt(d.birthdate)    || 'Not provided',
      gender:       d.sex === 'M' ? 'male' : d.sex === 'F' ? 'female' : 'other',
      address:      decrypt(d.home_address) || 'Not provided',
      religion:     decrypt(d.religion)     || 'N/A',
      nationality:  decrypt(d.nationality)  || 'N/A',
      home_number:  decrypt(d.home_no)      || 'N/A',
    };
    res.json(profile);
  } catch (err) {
    logger.error('profile GET error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch profile' });
  }
});

// ---------------------------------------------------------------------------
// PUT /patients/profile
// ---------------------------------------------------------------------------
router.put('/profile', isAuthenticated, profileUpdateRL, async (req, res) => {
  const { fullName, dob, gender, address, religion, nationality, homeNumber, phone, email } = req.body;
  if (!fullName || !dob || !gender || !address || !phone || !email)
    return res.status(400).json({ error: 'missing_fields', message: 'All required fields must be provided' });
  if (!validator.isEmail(email))
    return res.status(400).json({ error: 'invalid_data', message: 'Invalid email' });
  if (!validator.isISO8601(dob))
    return res.status(400).json({ error: 'invalid_data', message: 'Invalid date of birth' });
  if (!['male', 'female', 'other'].includes(gender))
    return res.status(400).json({ error: 'invalid_data', message: 'Invalid gender' });

  try {
    const parts     = fullName.trim().split(/\s+/);
    const firstName = parts[0];
    const lastName  = parts.slice(1).join(' ') || parts[0];
    await pool.query(
      `UPDATE patients SET
        first_name=$1, last_name=$2, birthdate=$3, sex=$4, home_address=$5,
        religion=$6, nationality=$7, home_no=$8, mobile_no=$9, email=$10
       WHERE id=$11`,
      [
        encrypt(firstName), encrypt(lastName), encrypt(dob),
        gender === 'male' ? 'M' : gender === 'female' ? 'F' : 'O',
        encrypt(address),
        religion && religion !== 'N/A'    ? encrypt(religion)    : null,
        nationality && nationality !== 'N/A' ? encrypt(nationality) : null,
        homeNumber && homeNumber !== 'N/A' ? encrypt(homeNumber)  : null,
        encrypt(phone),
        encrypt(email.toLowerCase()),
        req.session.userId,
      ]
    );
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    logger.error('profile PUT error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to update profile' });
  }
});

// ---------------------------------------------------------------------------
// GET /patients/allPatients  (admin only)
// ---------------------------------------------------------------------------
router.get('/allPatients', isAuthenticated, allPatientsRL, async (req, res) => {
  try {
    if (!await isAdmin(req.session.userId))
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    const r = await pool.query('SELECT * FROM patients ORDER BY id');
    const patients = r.rows.map((p) => ({
      id:               p.id,
      first_name:       decrypt(p.first_name)       || '',
      last_name:        decrypt(p.last_name)         || '',
      middle_name:      decrypt(p.middle_name)       || '',
      birthdate:        decrypt(p.birthdate)         || '',
      sex:              p.sex === 'M' ? 'Male' : p.sex === 'F' ? 'Female' : '',
      age:              calculateAge(decrypt(p.birthdate)),
      nickname:         decrypt(p.nickname)          || '',
      religion:         decrypt(p.religion)          || '',
      nationality:      decrypt(p.nationality)       || '',
      home_address:     decrypt(p.home_address)      || '',
      home_no:          decrypt(p.home_no)           || '',
      occupation:       decrypt(p.occupation)        || '',
      office_no:        decrypt(p.office_no)         || '',
      dental_insurance: decrypt(p.dental_insurance)  || '',
      fax_no:           decrypt(p.fax_no)            || '',
      mobile_no:        decrypt(p.mobile_no)         || '',
      email:            decrypt(p.email)             || '',
      effective_date:   p.effective_date,
    }));
    res.json(patients);
  } catch (err) {
    logger.error('allPatients error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch patients' });
  }
});

// ---------------------------------------------------------------------------
// PUT /patients/change-password
// ---------------------------------------------------------------------------
router.put('/change-password', isAuthenticated, changePassRL, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'missing_fields', message: 'Current and new passwords are required' });
  if (!validator.isLength(newPassword, { min: 8, max: 100 }))
    return res.status(400).json({ error: 'invalid_password', message: 'Password must be 8-100 characters' });

  try {
    const r = await pool.query('SELECT password FROM users WHERE id = $1', [req.session.userId]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found', message: 'User not found' });
    if (!await bcrypt.compare(currentPassword, r.rows[0].password))
      return res.status(401).json({ error: 'invalid_password', message: 'Current password is incorrect' });
    if (await bcrypt.compare(newPassword, r.rows[0].password))
      return res.status(400).json({ error: 'invalid_password', message: 'New password must differ from current' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.session.userId]);
    await new Promise((ok, fail) => req.session.destroy((err) => err ? fail(err) : ok()));
    res.json({ success: true, message: 'Password changed. Please log in again.' });
  } catch (err) {
    logger.error('change-password error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to change password' });
  }
});

// PUT /patients/settings  — placeholder
router.put('/settings', isAuthenticated, (_req, res) => {
  res.json({ success: true, message: 'Settings saved' });
});

// ---------------------------------------------------------------------------
// GET /patients/admin-profile
// ---------------------------------------------------------------------------
router.get('/admin-profile', isAuthenticated, adminProfileRL, async (req, res) => {
  try {
    if (!await isAdmin(req.session.userId))
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    const r = await pool.query('SELECT username FROM admin WHERE id = $1', [req.session.userId]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found', message: 'Admin not found' });
    res.json({ username: r.rows[0].username });
  } catch (err) {
    logger.error('admin-profile error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch admin profile' });
  }
});

// ---------------------------------------------------------------------------
// PUT /patients/admin-update
// ---------------------------------------------------------------------------
router.put('/admin-update', isAuthenticated, adminUpdateRL, async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;
  if (!username || !currentPassword || !newPassword)
    return res.status(400).json({ error: 'missing_fields', message: 'All fields are required' });
  if (!validator.isLength(username, { min: 3, max: 50 }))
    return res.status(400).json({ error: 'invalid_data', message: 'Username must be 3-50 characters' });
  if (!validator.isLength(newPassword, { min: 8, max: 100 }))
    return res.status(400).json({ error: 'invalid_password', message: 'Password must be 8-100 characters' });

  try {
    if (!await isAdmin(req.session.userId))
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });

    const r = await pool.query('SELECT username, password FROM admin WHERE id = $1', [req.session.userId]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found', message: 'Admin not found' });
    const adm = r.rows[0];

    if (!await bcrypt.compare(currentPassword, adm.password))
      return res.status(401).json({ error: 'invalid_password', message: 'Current password is incorrect' });
    if (await bcrypt.compare(newPassword, adm.password))
      return res.status(400).json({ error: 'invalid_password', message: 'New password must differ' });

    if (username !== adm.username) {
      const conflict = await pool.query(
        'SELECT id FROM users WHERE username = $1 UNION SELECT id FROM admin WHERE username = $1', [username]
      );
      if (conflict.rows.length)
        return res.status(400).json({ error: 'username_exists', message: 'Username already taken' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE admin SET username = $1, password = $2 WHERE id = $3', [username, hash, req.session.userId]);
    await new Promise((ok, fail) => req.session.destroy((err) => err ? fail(err) : ok()));
    res.json({ success: true, message: 'Account updated. Please log in again.' });
  } catch (err) {
    logger.error('admin-update error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to update account' });
  }
});

router.use((err, _req, res, _next) => {
  logger.error('patients route error:', err.message);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong' });
});

module.exports = { router };