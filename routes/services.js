const express   = require('express');
const router    = express.Router();
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

const isAuthenticated = (req, res, next) => {
  if (!req.session?.isLoggedIn || !req.session?.userId)
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
};

const isAdmin = async (req, res, next) => {
  try {
    const r = await pool.query('SELECT id FROM admin WHERE id = $1', [req.session.userId]);
    if (!r.rows.length)
      return res.status(403).json({ success: false, message: 'Admin access required' });
    next();
  } catch (err) {
    logger.error('isAdmin check error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/services/all  — public
router.get('/all', makeRL(200, 15 * 60), async (_req, res) => {
  try {
    const r = await pool.query('SELECT id, name, description FROM services ORDER BY name');
    res.json({ success: true, services: r.rows });
  } catch (err) {
    logger.error('services/all error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch services' });
  }
});

// GET /api/services  — services used by current patient
router.get('/', isAuthenticated, makeRL(200, 15 * 60), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT s.id, s.name, s.description
       FROM services s
       JOIN appointments a ON a.service_id = s.id
       WHERE a.user_id = $1
       ORDER BY s.name`,
      [req.session.userId]
    );
    res.json({ success: true, services: r.rows });
  } catch (err) {
    logger.error('services GET error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch services' });
  }
});

// POST /api/services  — add (admin)
router.post('/', isAuthenticated, isAdmin, makeRL(20, 60 * 60), async (req, res) => {
  const { name, description } = req.body;
  if (!name || !description)
    return res.status(400).json({ success: false, message: 'Name and description are required' });
  if (!validator.isLength(name, { min: 1, max: 100 }))
    return res.status(400).json({ success: false, message: 'Service name must be 1-100 characters' });
  if (!validator.isLength(description, { min: 1, max: 500 }))
    return res.status(400).json({ success: false, message: 'Description must be 1-500 characters' });
  try {
    const existing = await pool.query('SELECT id FROM services WHERE name = $1', [name]);
    if (existing.rows.length)
      return res.status(400).json({ success: false, message: 'Service name already exists' });

    const r = await pool.query(
      'INSERT INTO services (name, description) VALUES ($1, $2) RETURNING *', [name, description]
    );
    logger.info(`Service added: ${name}`);
    res.status(201).json({ success: true, message: 'Service added', service: r.rows[0] });
  } catch (err) {
    logger.error('service POST error:', err);
    res.status(500).json({ success: false, message: 'Failed to add service' });
  }
});

// DELETE /api/services/:id  — delete (admin)
router.delete('/:id', isAuthenticated, isAdmin, makeRL(20, 60 * 60), async (req, res) => {
  const { id } = req.params;
  if (!validator.isInt(id, { min: 1 }))
    return res.status(400).json({ success: false, message: 'Invalid service ID' });
  try {
    const exists = await pool.query('SELECT id FROM services WHERE id = $1', [id]);
    if (!exists.rows.length)
      return res.status(404).json({ success: false, message: 'Service not found' });

    const linked = await pool.query('SELECT id FROM appointments WHERE service_id = $1 LIMIT 1', [id]);
    if (linked.rows.length)
      return res.status(400).json({ success: false, message: 'Cannot delete service with existing appointments' });

    await pool.query('DELETE FROM services WHERE id = $1', [id]);
    logger.info(`Service deleted: id=${id}`);
    res.json({ success: true, message: 'Service deleted' });
  } catch (err) {
    logger.error('service DELETE error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete service' });
  }
});

router.use((err, _req, res, _next) => {
  logger.error('services route error:', err.message);
  res.status(500).json({ success: false, message: 'Something went wrong' });
});

module.exports = { router };