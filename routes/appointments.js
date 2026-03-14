const express   = require('express');
const router    = express.Router();
const crypto    = require('crypto');
const validator = require('validator');
const winston   = require('winston');
const pool      = require('../db');

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
// Simple in-memory rate limiters (replace Redis-backed ones)
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

// Per-user per-day appointment booking limit
const apptDailyRL    = makeSimpleRL(5, 24 * 60 * 60);
// Per-user per-day cancel/reschedule cooldown
const cooldownDayRL  = makeSimpleRL(1, 24 * 60 * 60);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
const isAuthenticated = (req, res, next) => {
  if (!req.session?.isLoggedIn || !req.session?.userId)
    return res.status(401).json({ error: 'unauthorized', message: 'Unauthorized' });
  next();
};

const isAdmin = async (req, res, next) => {
  try {
    const r = await pool.query('SELECT id FROM admin WHERE id = $1', [req.session.userId]);
    if (!r.rows.length) return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    next();
  } catch (err) {
    logger.error('isAdmin error:', err);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
};

const rateLimitAppointments = (req, res, next) => {
  try { apptDailyRL.consume(`${req.session.userId}`); next(); }
  catch { res.status(429).json({ error: 'too_many_requests', message: 'Max 5 appointment bookings per day' }); }
};

const cooldownCheck = (req, res, next) => {
  const action = req.path.includes('reschedule') ? 'reschedule' : 'cancel';
  try { cooldownDayRL.consume(`${action}:${req.session.userId}`); next(); }
  catch { res.status(429).json({ error: 'too_many_requests', message: `Only 1 ${action} request per day` }); }
};

// ---------------------------------------------------------------------------
// Email stub — logs to console in dev, skips sending
// ---------------------------------------------------------------------------
function sendMail(options) {
  logger.info('[DEV] Email suppressed — would have sent:', {
    to: options.to, subject: options.subject,
  });
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function getPatient(userId) {
  const r = await pool.query('SELECT first_name, last_name, email FROM patients WHERE id = $1', [userId]);
  if (!r.rows[0]) return null;
  const p = r.rows[0];
  return {
    first_name: decrypt(p.first_name),
    last_name:  decrypt(p.last_name),
    email:      decrypt(p.email),
    fullName:   `${decrypt(p.first_name)} ${decrypt(p.last_name)}`,
  };
}

// ---------------------------------------------------------------------------
// GET /api/appointments/booked  — public calendar slots
// ---------------------------------------------------------------------------
router.get('/booked', async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, appointment_date, notes, status, cancel_reason FROM appointments WHERE status NOT IN ('cancelled','rejected') ORDER BY appointment_date ASC"
    );
    res.json({ success: true, appointments: r.rows.map((a) => ({
      ...a,
      notes:         a.notes         ? decrypt(a.notes)         : null,
      cancel_reason: a.cancel_reason ? decrypt(a.cancel_reason) : null,
    }))});
  } catch (err) {
    logger.error('Booked error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch booked slots' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/appointments  — book
// ---------------------------------------------------------------------------
router.post('/', isAuthenticated, rateLimitAppointments, async (req, res) => {
  const { user_id, appointment_date, service_id, notes } = req.body;

  if (!user_id || !appointment_date || !service_id)
    return res.status(400).json({ error: 'bad_request', message: 'user_id, appointment_date, and service_id are required' });
  if (!validator.isInt(String(user_id)))
    return res.status(400).json({ error: 'bad_request', message: 'Invalid user_id' });
  if (!validator.isISO8601(appointment_date))
    return res.status(400).json({ error: 'bad_request', message: 'Invalid appointment_date' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const svc = await client.query('SELECT id, name FROM services WHERE id = $1', [service_id]);
    if (!svc.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'not_found', message: 'Service not found' }); }

    const conflict = await client.query(
      "SELECT id FROM appointments WHERE appointment_date = $1 AND status NOT IN ('cancelled','rejected')",
      [appointment_date]
    );
    if (conflict.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'conflict', message: 'Time slot already booked' }); }

    const appt = (await client.query(
      "INSERT INTO appointments (user_id, service_id, appointment_date, notes, status, pending_action, created_at, updated_at) VALUES ($1,$2,$3,$4,'pending','confirm',NOW(),NOW()) RETURNING *",
      [user_id, service_id, appointment_date, notes ? encrypt(notes) : null]
    )).rows[0];

    await client.query(
      "INSERT INTO appointment_requests (appointment_id, user_id, action, status, created_at, updated_at) VALUES ($1,$2,'confirm','pending',NOW(),NOW())",
      [appt.id, user_id]
    );
    await client.query('COMMIT');

    const patient = await getPatient(user_id);
    sendMail({ to: 'admin', subject: 'New Appointment Request', html: `Patient: ${patient?.fullName}, Date: ${appointment_date}` });

    logger.info(`Appointment booked: id=${appt.id} userId=${user_id}`);
    res.status(201).json({ success: true, message: 'Appointment booked, awaiting admin confirmation', appointment: { ...appt, notes: notes || null } });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Book error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to book appointment' });
  } finally { client.release(); }
});

// ---------------------------------------------------------------------------
// GET /api/appointments  — user's own
// ---------------------------------------------------------------------------
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const isPast   = req.query.past === 'true';
    const fetchAll = req.query.all  === 'true';
    const now      = new Date().toISOString();
    const uid      = req.session.userId;

    let q, p;
    if (fetchAll) {
      q = 'SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.user_id = $1 ORDER BY a.appointment_date DESC';
      p = [uid];
    } else if (isPast) {
      q = 'SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.user_id = $1 AND a.appointment_date <= $2 ORDER BY a.appointment_date DESC';
      p = [uid, now];
    } else {
      q = "SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.user_id = $1 AND a.appointment_date >= $2 AND a.status IN ('pending','confirmed') ORDER BY a.appointment_date ASC";
      p = [uid, now];
    }

    const r = await pool.query(q, p);
    res.json({ success: true, appointments: r.rows.map((a) => ({
      ...a,
      notes:         a.notes         ? decrypt(a.notes)         : null,
      cancel_reason: a.cancel_reason ? decrypt(a.cancel_reason) : null,
      reject_reason: a.reject_reason ? decrypt(a.reject_reason) : null,
      services: { name: a.service_name },
    }))});
  } catch (err) {
    logger.error('Fetch appointments error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch appointments' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/appointments/history/:userId?
// ---------------------------------------------------------------------------
router.get('/history/:userId?', isAuthenticated, async (req, res) => {
  const reqId     = req.params.userId;
  const sessionId = req.session.userId;
  try {
    const adminCheck  = await pool.query('SELECT id FROM admin WHERE id = $1', [sessionId]);
    const isAdminUser = adminCheck.rows.length > 0;
    if (!isAdminUser && reqId && parseInt(reqId) !== sessionId)
      return res.status(403).json({ error: 'forbidden', message: "Cannot view other users' history" });

    const q = reqId
      ? 'SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.user_id = $1 ORDER BY a.appointment_date DESC'
      : 'SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id ORDER BY a.appointment_date DESC';
    const r = await pool.query(q, reqId ? [parseInt(reqId)] : []);

    const patientIds = [...new Set(r.rows.map((row) => row.user_id))];
    const patientMap = new Map();
    if (patientIds.length) {
      const pRows = await pool.query('SELECT id, first_name, last_name FROM patients WHERE id = ANY($1)', [patientIds]);
      pRows.rows.forEach((p) => patientMap.set(p.id, { first_name: decrypt(p.first_name), last_name: decrypt(p.last_name) }));
    }

    res.json({ success: true, history: r.rows.map((a) => ({
      ...a,
      notes:         a.notes         ? decrypt(a.notes)         : null,
      cancel_reason: a.cancel_reason ? decrypt(a.cancel_reason) : null,
      reject_reason: a.reject_reason ? decrypt(a.reject_reason) : null,
      services:  { name: a.service_name },
      patients:  patientMap.get(a.user_id) || { first_name: null, last_name: null },
    }))});
  } catch (err) {
    logger.error('History error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch history' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/appointments/:id/reschedule
// ---------------------------------------------------------------------------
router.post('/:id/reschedule', isAuthenticated, cooldownCheck, async (req, res) => {
  const { id } = req.params;
  const { appointment_date, cancel_reason, notes } = req.body;
  if (!validator.isInt(id))                return res.status(400).json({ error: 'bad_request', message: 'Invalid ID' });
  if (!appointment_date || !cancel_reason) return res.status(400).json({ error: 'bad_request', message: 'appointment_date and cancel_reason are required' });
  if (!validator.isISO8601(appointment_date)) return res.status(400).json({ error: 'bad_request', message: 'Invalid date' });

  try {
    const apptR = await pool.query(
      'SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.id = $1 AND a.user_id = $2',
      [id, req.session.userId]
    );
    if (!apptR.rows.length) return res.status(404).json({ error: 'not_found', message: 'Appointment not found' });
    const appt = apptR.rows[0];
    if (!['pending','confirmed'].includes(appt.status))
      return res.status(400).json({ error: 'bad_request', message: 'Cannot reschedule this appointment' });
    if (appt.pending_action)
      return res.status(400).json({ error: 'bad_request', message: `A ${appt.pending_action} request is already pending` });

    const conflict = await pool.query(
      "SELECT id FROM appointments WHERE appointment_date = $1 AND status NOT IN ('cancelled','rejected') AND id != $2",
      [appointment_date, id]
    );
    if (conflict.rows.length) return res.status(409).json({ error: 'conflict', message: 'Time slot already booked' });

    const encReason = encrypt(cancel_reason);
    const encNotes  = notes ? encrypt(notes) : appt.notes;
    await pool.query(
      "UPDATE appointments SET pending_action='reschedule', cancel_reason=$1, notes=$2, updated_at=NOW() WHERE id=$3",
      [encReason, encNotes, id]
    );
    await pool.query(
      "INSERT INTO appointment_requests (appointment_id, user_id, action, status, details, created_at, updated_at) VALUES ($1,$2,'reschedule','pending',$3,NOW(),NOW())",
      [id, req.session.userId, JSON.stringify({ new_appointment_date: appointment_date, new_cancel_reason: encReason, new_notes: encNotes, original_appointment_date: appt.appointment_date, original_cancel_reason: appt.cancel_reason, original_notes: appt.notes })]
    );

    const patient = await getPatient(req.session.userId);
    sendMail({ to: 'admin', subject: 'Reschedule Request', html: `Patient: ${patient?.fullName}, New Date: ${appointment_date}` });
    res.json({ success: true, message: 'Reschedule request submitted, awaiting admin approval' });
  } catch (err) {
    logger.error('Reschedule error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to request reschedule' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/appointments/:id  (admin)
// ---------------------------------------------------------------------------
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { appointment_date, notes, status, cancel_reason } = req.body;
  if (!validator.isInt(id))                   return res.status(400).json({ error: 'bad_request', message: 'Invalid ID' });
  if (!appointment_date)                      return res.status(400).json({ error: 'bad_request', message: 'appointment_date is required' });
  if (!validator.isISO8601(appointment_date)) return res.status(400).json({ error: 'bad_request', message: 'Invalid date' });
  const validStatuses = ['pending','confirmed','cancelled','rejected','expired','completed'];
  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'bad_request', message: 'Invalid status' });

  try {
    const existing = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Appointment not found' });
    const appt = existing.rows[0];

    const conflict = await pool.query(
      "SELECT id FROM appointments WHERE appointment_date = $1 AND status NOT IN ('cancelled','rejected') AND id != $2",
      [appointment_date, id]
    );
    if (conflict.rows.length) return res.status(409).json({ error: 'conflict', message: 'Time slot already booked' });

    const updated = (await pool.query(
      `UPDATE appointments SET appointment_date=$1, notes=$2, cancel_reason=$3, status=$4, pending_action=NULL, updated_at=NOW()
       WHERE id=$5 RETURNING *, (SELECT name FROM services WHERE id=appointments.service_id) AS service_name`,
      [appointment_date, notes ? encrypt(notes) : appt.notes, cancel_reason ? encrypt(cancel_reason) : appt.cancel_reason, status || appt.status, id]
    )).rows[0];

    res.json({ success: true, message: 'Appointment updated', appointment: {
      ...updated,
      notes:         updated.notes         ? decrypt(updated.notes)         : null,
      cancel_reason: updated.cancel_reason ? decrypt(updated.cancel_reason) : null,
    }});
  } catch (err) {
    logger.error('Admin update error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to update' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/appointments/:id  (patient cancel request)
// ---------------------------------------------------------------------------
router.delete('/:id', isAuthenticated, cooldownCheck, async (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;
  if (!validator.isInt(id)) return res.status(400).json({ error: 'bad_request', message: 'Invalid ID' });
  if (!cancel_reason)       return res.status(400).json({ error: 'bad_request', message: 'cancel_reason is required' });

  try {
    const apptR = await pool.query(
      'SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.id = $1 AND a.user_id = $2',
      [id, req.session.userId]
    );
    if (!apptR.rows.length) return res.status(404).json({ error: 'not_found', message: 'Appointment not found' });
    const appt = apptR.rows[0];
    if (appt.pending_action) return res.status(400).json({ error: 'bad_request', message: `A ${appt.pending_action} request is already pending` });
    if (!['pending','confirmed'].includes(appt.status)) return res.status(400).json({ error: 'bad_request', message: 'Cannot cancel this appointment' });

    const encReason = encrypt(cancel_reason);
    await pool.query("UPDATE appointments SET pending_action='cancel', cancel_reason=$1, updated_at=NOW() WHERE id=$2", [encReason, id]);
    await pool.query(
      "INSERT INTO appointment_requests (appointment_id, user_id, action, status, details, created_at, updated_at) VALUES ($1,$2,'cancel','pending',$3,NOW(),NOW())",
      [id, req.session.userId, JSON.stringify({ cancel_reason: encReason })]
    );

    const patient = await getPatient(req.session.userId);
    sendMail({ to: 'admin', subject: 'Cancellation Request', html: `Patient: ${patient?.fullName}` });
    res.json({ success: true, message: 'Cancellation request submitted, awaiting admin approval' });
  } catch (err) {
    logger.error('Cancel error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to request cancellation' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/appointments/requests  (admin)
// ---------------------------------------------------------------------------
router.get('/requests', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT r.*, a.appointment_date, a.notes AS appt_notes, a.cancel_reason AS appt_cancel_reason,
             a.status AS appt_status, a.pending_action, s.name AS service_name
      FROM appointment_requests r
      JOIN appointments a ON a.id = r.appointment_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE r.status = 'pending' ORDER BY r.created_at ASC`);

    const patientIds = [...new Set(r.rows.map((row) => row.user_id))];
    const patientMap = new Map();
    if (patientIds.length) {
      const pRows = await pool.query('SELECT id, first_name, last_name FROM patients WHERE id = ANY($1)', [patientIds]);
      pRows.rows.forEach((p) => patientMap.set(p.id, { first_name: decrypt(p.first_name), last_name: decrypt(p.last_name) }));
    }

    const enriched = r.rows.map((row) => {
      const details = row.details ? JSON.parse(row.details) : {};
      return {
        ...row,
        appointments: {
          appointment_date: row.appointment_date,
          notes:            row.appt_notes        ? decrypt(row.appt_notes)        : null,
          cancel_reason:    row.appt_cancel_reason ? decrypt(row.appt_cancel_reason): null,
          status:           row.appt_status,
          pending_action:   row.pending_action,
          services:         { name: row.service_name },
        },
        new_appointment_date: details.new_appointment_date || null,
        new_notes:            details.new_notes         ? decrypt(details.new_notes)         : null,
        new_cancel_reason:    details.new_cancel_reason  ? decrypt(details.new_cancel_reason) : null,
        patients: patientMap.get(row.user_id) || { first_name: null, last_name: null },
      };
    });
    res.json({ success: true, requests: enriched });
  } catch (err) {
    logger.error('Fetch requests error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch requests' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/appointments/requests/:requestId/approve  (admin)
// ---------------------------------------------------------------------------
router.post('/requests/:requestId/approve', isAuthenticated, isAdmin, async (req, res) => {
  const { requestId } = req.params;
  if (!validator.isInt(requestId)) return res.status(400).json({ error: 'bad_request', message: 'Invalid request ID' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reqR = await client.query(`
      SELECT r.*, a.user_id AS patient_id, a.appointment_date, a.notes AS appt_notes,
             a.cancel_reason AS appt_cr, s.name AS service_name
      FROM appointment_requests r
      JOIN appointments a ON a.id = r.appointment_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE r.id = $1 AND r.status = 'pending'`, [requestId]);

    if (!reqR.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'not_found', message: 'Request not found' }); }
    const req_ = reqR.rows[0];
    const details = req_.details ? JSON.parse(req_.details) : {};
    let updatedDate = req_.appointment_date;

    if (req_.action === 'cancel') {
      await client.query("UPDATE appointments SET status='cancelled', pending_action=NULL, updated_at=NOW() WHERE id=$1", [req_.appointment_id]);
    } else if (req_.action === 'confirm') {
      await client.query("UPDATE appointments SET status='confirmed', pending_action=NULL, updated_at=NOW() WHERE id=$1", [req_.appointment_id]);
    } else if (req_.action === 'reschedule') {
      const { new_appointment_date, new_notes, new_cancel_reason } = details;
      const conflict = await client.query(
        "SELECT id FROM appointments WHERE appointment_date=$1 AND status NOT IN ('cancelled','rejected') AND id!=$2",
        [new_appointment_date, req_.appointment_id]
      );
      if (conflict.rows.length) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'conflict', message: 'New slot already booked' }); }
      await client.query(
        "UPDATE appointments SET appointment_date=$1, notes=$2, cancel_reason=$3, status='confirmed', pending_action=NULL, updated_at=NOW() WHERE id=$4",
        [new_appointment_date, new_notes || req_.appt_notes, new_cancel_reason || req_.appt_cr, req_.appointment_id]
      );
      updatedDate = new_appointment_date;
    }

    await client.query("UPDATE appointment_requests SET status='approved', updated_at=NOW() WHERE id=$1", [requestId]);
    await client.query('COMMIT');

    const patient = await getPatient(req_.patient_id);
    if (patient?.email) sendMail({ to: patient.email, subject: `Appointment ${req_.action} approved`, html: `Date: ${updatedDate}` });

    res.json({ success: true, message: `${req_.action} request approved` });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Approve error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to approve' });
  } finally { client.release(); }
});

// ---------------------------------------------------------------------------
// POST /api/appointments/requests/:requestId/reject  (admin)
// ---------------------------------------------------------------------------
router.post('/requests/:requestId/reject', isAuthenticated, isAdmin, async (req, res) => {
  const { requestId } = req.params;
  const { reject_reason } = req.body;
  if (!validator.isInt(requestId)) return res.status(400).json({ error: 'bad_request', message: 'Invalid request ID' });
  if (!reject_reason)              return res.status(400).json({ error: 'bad_request', message: 'reject_reason is required' });

  try {
    const reqR = await pool.query(`
      SELECT r.*, a.user_id AS patient_id, a.appointment_date, s.name AS service_name
      FROM appointment_requests r
      JOIN appointments a ON a.id = r.appointment_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE r.id = $1 AND r.status = 'pending'`, [requestId]);

    if (!reqR.rows.length) return res.status(404).json({ error: 'not_found', message: 'Request not found' });
    const req_ = reqR.rows[0];
    const encReason  = encrypt(reject_reason);
    const newStatus  = req_.action === 'confirm' ? 'rejected' : 'confirmed';

    await pool.query('UPDATE appointments SET status=$1, pending_action=NULL, reject_reason=$2, updated_at=NOW() WHERE id=$3', [newStatus, encReason, req_.appointment_id]);
    await pool.query("UPDATE appointment_requests SET status='rejected', updated_at=NOW() WHERE id=$1", [requestId]);

    const patient = await getPatient(req_.patient_id);
    if (patient?.email) sendMail({ to: patient.email, subject: 'Request rejected', html: `Reason: ${reject_reason}` });

    res.json({ success: true, message: `${req_.action} request rejected` });
  } catch (err) {
    logger.error('Reject error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to reject' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/appointments/all  (admin)
// ---------------------------------------------------------------------------
router.get('/all', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const now = new Date().toISOString();
    await pool.query("UPDATE appointments SET status='expired', updated_at=NOW() WHERE status='pending' AND appointment_date < $1", [now]).catch(() => {});

    const r = await pool.query('SELECT a.*, s.name AS service_name FROM appointments a LEFT JOIN services s ON s.id = a.service_id ORDER BY a.appointment_date ASC');
    const patientIds = [...new Set(r.rows.map((row) => row.user_id))];
    const patientMap = new Map();
    if (patientIds.length) {
      const pRows = await pool.query('SELECT id, first_name, last_name FROM patients WHERE id = ANY($1)', [patientIds]);
      pRows.rows.forEach((p) => patientMap.set(p.id, { first_name: decrypt(p.first_name), last_name: decrypt(p.last_name) }));
    }
    res.json({ success: true, appointments: r.rows.map((a) => ({
      ...a,
      notes:         a.notes         ? decrypt(a.notes)         : null,
      cancel_reason: a.cancel_reason ? decrypt(a.cancel_reason) : null,
      reject_reason: a.reject_reason ? decrypt(a.reject_reason) : null,
      services:  { name: a.service_name },
      patients:  patientMap.get(a.user_id) || { first_name: null, last_name: null },
    }))});
  } catch (err) {
    logger.error('All appointments error:', err);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/appointments/bulk-update  (admin)
// ---------------------------------------------------------------------------
router.post('/bulk-update', isAuthenticated, isAdmin, async (req, res) => {
  const { updates } = req.body;
  const valid = ['pending','confirmed','cancelled','rejected','expired','completed'];
  if (!Array.isArray(updates) || !updates.length) return res.status(400).json({ error: 'bad_request', message: 'Invalid updates' });
  if (!updates.every((u) => validator.isInt(String(u.id)) && valid.includes(u.status)))
    return res.status(400).json({ error: 'bad_request', message: 'Invalid update format' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const u of updates) await client.query('UPDATE appointments SET status=$1, updated_at=NOW() WHERE id=$2', [u.status, u.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: `Updated ${updates.length} appointments` });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Bulk update error:', err);
    res.status(500).json({ error: 'server_error', message: 'Bulk update failed' });
  } finally { client.release(); }
});

// ---------------------------------------------------------------------------
// Manual maintenance triggers (admin)
// ---------------------------------------------------------------------------
router.post('/update-past-appointments', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE appointments SET status='completed', updated_at=NOW() WHERE appointment_date < NOW() AND status NOT IN ('completed','cancelled','rejected') RETURNING id");
    res.json({ success: true, message: `Marked ${r.rowCount} appointments as completed` });
  } catch (err) { res.status(500).json({ error: 'server_error', message: 'Failed' }); }
});

router.post('/expire-pending-requests', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE appointment_requests SET status='expired', updated_at=NOW() WHERE status='pending' AND appointment_id IN (SELECT id FROM appointments WHERE appointment_date < NOW()) RETURNING id"
    );
    res.json({ success: true, message: `Expired ${r.rowCount} requests` });
  } catch (err) { res.status(500).json({ error: 'server_error', message: 'Failed' }); }
});

// ---------------------------------------------------------------------------
// GET /api/appointments/test-encryption  (dev only)
// ---------------------------------------------------------------------------
router.get('/test-encryption', (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'forbidden' });
  const original  = 'Test Patient Name';
  const encrypted = encrypt(original);
  const decrypted = decrypt(encrypted);
  res.json({ original, encrypted, decrypted, success: original === decrypted });
});

// Error handler
router.use((err, _req, res, _next) => {
  logger.error('appointments route error:', err);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong' });
});

module.exports = { router };