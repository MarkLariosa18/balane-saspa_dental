const express = require('express');
const supabase = require('./supabase');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible'); // Added for advanced rate limiting
const validator = require('validator'); // Added for input validation
const helmet = require('helmet'); // Added for security headers
const winston = require('winston'); // Added for structured logging

// Load environment variables
require('dotenv').config();

// Validate critical environment variables
const requiredEnvVars = ['ENCRYPTION_KEY', 'EMAIL_USER', 'EMAIL_PASSWORD', 'REDIS_URL', 'NODE_ENV'];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

// Initialize Winston logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Initialize Redis with enhanced configuration
const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 10,
});

// Encryption settings
const ALGORITHM = 'aes-256-gcm'; // Upgraded to GCM for authenticated encryption
const IV_LENGTH = 12; // GCM recommends 12 bytes for IV
const AUTH_TAG_LENGTH = 16; // GCM auth tag length

// Validate encryption key
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const encryptionKey = Buffer.from(ENCRYPTION_KEY, 'hex');
if (encryptionKey.length !== 32) {
  logger.error(`Invalid ENCRYPTION_KEY length: expected 32 bytes, got ${encryptionKey.length}`);
  process.exit(1);
}
logger.info('Encryption key initialized successfully');

// Configure nodemailer with secure options
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  pool: true, // Use connection pooling for performance
  maxConnections: 5,
  rateLimit: 14, // Gmail limit: ~14 emails/second
  rateDelta: 1000,
  secure: true, // Enforce TLS
});

// Verify email transporter on startup
transporter.verify((error, success) => {
  if (error) {
    logger.error('Email transporter verification failed:', error);
    process.exit(1);
  }
  logger.info('Email transporter verified successfully');
});

// Advanced rate limiter for appointments
const appointmentRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'appointment:limit',
  points: 999, // 5 appointments per day
  duration: 24 * 60 * 60, // 24 hours
  blockDuration: 24 * 60 * 60, // Block for 24 hours if limit exceeded
});

// Cooldown rate limiter for cancel/reschedule
const cooldownRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'appointment:cooldown',
  points: 1, // 1 action per 24 hours
  duration: 24 * 60 * 60,
  blockDuration: 24 * 60 * 60,
});

// Middleware for authentication
const isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.isLoggedIn || !req.session.userId) {
    logger.warn(`Unauthorized access attempt: ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'unauthorized', message: 'Unauthorized' });
  }
  next();
};

// Middleware for admin role
const isAdmin = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('admin')
      .select('id')
      .eq('id', req.session.userId)
      .single();
    if (error) throw error;
    if (!data) {
      logger.warn(`Admin access denied for userId: ${req.session.userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    }
    next();
  } catch (error) {
    logger.error('Error checking admin role:', error);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
};

// Rate limiter middleware for appointments
const rateLimitAppointments = async (req, res, next) => {
  const userId = req.session.userId;
  const key = `${userId}`;
  try {
    await appointmentRateLimiter.consume(key);
    next();
  } catch (error) {
    logger.warn(`Appointment rate limit exceeded for userId: ${userId}`);
    res.status(429).json({ error: 'too_many_requests', message: 'Maximum 5 appointments per day reached' });
  }
};

// Cooldown middleware for cancel/reschedule
const cooldownCheck = async (req, res, next) => {
  const userId = req.session.userId;
  const action = req.path.includes('reschedule') ? 'reschedule' : 'cancel';
  const key = `${action}:${userId}`;
  try {
    await cooldownRateLimiter.consume(key);
    next();
  } catch (error) {
    logger.warn(`Cooldown limit exceeded for ${action} by userId: ${userId}`);
    const remaining = error.msBeforeNext / 3600000;
    res.status(429).json({
      error: 'too_many_requests',
      message: `Please wait ${Math.ceil(remaining)} hours before submitting another ${action} request`,
    });
  }
};

// Encryption functions with GCM
function encrypt(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  } catch (error) {
    logger.error('Encryption error:', error);
    throw new Error('Encryption failed');
  }
}

function decrypt(text) {
  if (!text) return null;
  
  const [ivText, encryptedText, authTagText] = text.split(':');
  if (!ivText || !encryptedText || !authTagText) {
    logger.warn(`Invalid encrypted format: "${text}"`);
    return text;
  }
  try {
    const iv = Buffer.from(ivText, 'hex');
    const authTag = Buffer.from(authTagText, 'hex');
    if (iv.length !== IV_LENGTH || authTag.length !== AUTHsides_tag_length) {
      throw new Error(`Invalid IV or auth tag length`);
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(Buffer.from(encryptedText, 'hex'));
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const decryptedString = decrypted.toString('utf8');

    if (!decryptedString || /[^ -~]/.test(decryptedString)) {
      logger.warn(`Invalid decryption result: "${decryptedString}"`);
      return text;
    }
    return decryptedString;
  } catch (error) {
    logger.error('Decryption failed:', { error: error.message, input: text });
    return text;
  }
}

// Socket.IO handlers with authentication
const handleSocketIOEvents = (io) => {
  io.on('connection', (socket) => {
    if (!socket.request.session || !socket.request.session.isLoggedIn || !socket.request.session.userId) {
      logger.warn(`Unauthorized Socket.IO connection attempt: ${socket.id}`);
      socket.disconnect(true);
      return;
    }
    const userId = socket.request.session.userId;
    logger.info(`New Socket.IO client connected: ${socket.id}, userId: ${userId}`);
    socket.join(`user:${userId}`);

    socket.on('reschedule_request', (data) => {
      if (!data || !data.request || typeof data.request !== 'object') {
        logger.warn(`Invalid reschedule_request data from ${socket.id}`);
        return;
      }
      logger.info(`Broadcasting reschedule request from userId: ${userId}`);
      io.to('admin').emit('reschedule_request', {
        type: 'reschedule_request',
        request: data.request,
        userId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('cancel_request', (data) => {
      if (!data || !data.request || typeof data.request !== 'object') {
        logger.warn(`Invalid cancel_request data from ${socket.id}`);
        return;
      }
      logger.info(`Broadcasting cancel request from userId: ${userId}`);
      io.to('admin').emit('cancel_request', {
        type: 'cancel_request',
        request: data.request,
        userId,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('request_response', (data) => {
      if (!data || !data.type || !data.requestId || !data.status) {
        logger.warn(`Invalid request_response data from ${socket.id}`);
        return;
      }
      logger.info(`Broadcasting ${data.type} from userId: ${userId}`);
      io.to(`user:${data.userId}`).emit(data.type, {
        type: data.type,
        requestId: data.requestId,
        status: data.status,
        reject_reason: data.reject_reason || null,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Socket.IO client disconnected: ${socket.id}, userId: ${userId}`);
    });

    socket.on('error', (error) => {
      logger.error(`Socket.IO error for ${socket.id}:`, error);
    });
  });
};

// Apply helmet for security headers
router.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// GET /api/appointments/booked
router.get('/booked', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, appointment_date, notes, status, cancel_reason')
      .neq('status', 'cancelled')
      .neq('status', 'rejected')
      .order('appointment_date', { ascending: true });

    if (error) throw new Error(`Supabase error: ${error.message}`);

    const decryptedAry = data.map((appointment) => ({
      ...appointment,
      notes: appointment.notes ? decrypt(appointment.notes) : null,
      cancel_reason: appointment.cancel_reason ? decrypt(appointment.cancel_reason) : null,
    }));

    res.status(200).json({ success: true, appointments: decryptedAry });
  } catch (error) {
    logger.error('Error fetching booked appointments:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch booked appointments' });
  }
});

// POST /api/appointments
router.post('/', isAuthenticated, rateLimitAppointments, async (req, res) => {
  const { user_id, appointment_date, service_id, notes } = req.body;

  try {
    if (!user_id || !appointment_date || !service_id) {
      return res.status(400).json({ error: 'bad_request', message: 'User ID, appointment date, and service ID are required' });
    }
    if (!validator.isInt(user_id) || !validator.isISO8601(appointment_date)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid user ID or appointment date format' });
    }
    if (notes && !validator.isLength(notes, { max: 500 })) {
      return res.status(400).json({ error: 'bad_request', message: 'Notes must be less than 500 characters' });
    }

    const { data: serviceCheck, error: serviceError } = await supabase
      .from('services')
      .select('id, name')
      .eq('id', service_id)
      .single();
    if (serviceError) throw new Error(`Service fetch error: ${serviceError.message}`);
    if (!serviceCheck) {
      return res.status(404).json({ error: 'not_found', message: 'Selected service does not exist' });
    }

    const { data: existing, error: existingError } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('appointment_date', appointment_date)
      .neq('status', 'cancelled')
      .neq('status', 'rejected');
    if (existingError) throw new Error(`Conflict check error: ${existingError.message}`);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'conflict', message: 'This time slot is already booked' });
    }

    const encryptedNotes = notes ? encrypt(notes) : null;
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .insert([
        {
          user_id,
          appointment_date,
          service_id,
          notes: encryptedNotes,
          status: 'pending',
        },
      ])
      .select()
      .single();
    if (appointmentError) throw new Error(`Appointment insert error: ${appointmentError.message}`);

    const appointmentId = appointment.id;

    const { error: requestError } = await supabase
      .from('appointment_requests')
      .insert([{ appointment_id: appointmentId, user_id, action: 'confirm', status: 'pending' }]);
    if (requestError) throw new Error(`Request insert error: ${requestError.message}`);

    const { error: updateError } = await supabase
      .from('appointments')
      .update({ pending_action: 'confirm' })
      .eq('id', appointmentId);
    if (updateError) throw new Error(`Update error: ${updateError.message}`);

    const { data: patientRaw, error: patientError } = await supabase
      .from('patients')
      .select('first_name, last_name')
      .eq('id', user_id)
      .single();
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patient = {
      first_name: decrypt(patientRaw.first_name),
      last_name: decrypt(patientRaw.last_name),
    };
    const patientName = `${patient.first_name} ${patient.last_name}`;

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'New Appointment Request - Balane-Saspa Dental Clinic',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
          <p>Dear Admin,</p>
          <p>A new appointment request has been submitted:</p>
          <ul>
            <li><strong>Patient:</strong> ${patientName}</li>
            <li><strong>Appointment Date:</strong> ${new Date(appointment.appointment_date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</li>
            <li><strong>Service:</strong> ${serviceCheck.name}</li>
            <li><strong>Notes:</strong> ${notes || 'None'}</li>
          </ul>
          <p>Please review and confirm this request in the admin panel.</p>
          <p>Best regards,<br>Balane-Saspa Dental Clinic System</p>
        </div>
      `,
    };

    await transporter.sendMail(adminMailOptions);
    logger.info(`New appointment request email sent for appointmentId: ${appointmentId}`);
    res.status(201).json({
      success: true,
      message: 'Appointment booked successfully, awaiting admin confirmation',
      appointment: {
        ...appointment,
        notes: appointment.notes ? decrypt(appointment.notes) : null,
      },
    });
  } catch (error) {
    logger.error('Error booking appointment:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to book appointment' });
  }
});

// GET /api/appointments
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const isPast = req.query.past === 'true';
    const fetchAll = req.query.all === 'true';
    const dateFilter = req.query.date ? validator.isISO8601(req.query.date) ? req.query.date : new Date().toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    let query = supabase
      .from('appointments')
      .select(`
        id,
        appointment_date,
        status,
        notes,
        cancel_reason,
        reject_reason,
        pending_action,
        services (name)
      `)
      .eq('user_id', req.session.userId);

    if (fetchAll) {
      query = query.order('appointment_date', { ascending: false });
    } else if (isPast) {
      query = query.lte('appointment_date', dateFilter).order('appointment_date', { ascending: false });
    } else {
      query = query
        .gte('appointment_date', dateFilter)
        .in('status', ['pending', 'confirmed'])
        .order('appointment_date', { ascending: true });
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase error: ${error.message}`);

    const decryptedAry = data.map((appointment) => ({
      ...appointment,
      notes: appointment.notes ? decrypt(appointment.notes) : null,
      cancel_reason: appointment.cancel_reason ? decrypt(appointment.cancel_reason) : null,
      reject_reason: appointment.reject_reason ? decrypt(appointment.reject_reason) : null,
    }));

    res.status(200).json({ success: true, appointments: decryptedAry });
  } catch (error) {
    logger.error('Error fetching appointments:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch appointments' });
  }
});

// GET /api/appointments/history/:userId
router.get('/history/:userId?', isAuthenticated, async (req, res) => {
  const { userId } = req.params;
  try {
    const { data: isAdminUser, error: adminError } = await supabase
      .from('admin')
      .select('id')
      .eq('id', req.session.userId)
      .single();
    if (adminError) throw new Error(`Admin check error: ${adminError.message}`);

    let query = supabase
      .from('appointments')
      .select(`
        id,
        user_id,
        appointment_date,
        status,
        notes,
        cancel_reason,
        reject_reason,
        pending_action,
        services (name, description)
      `)
      .order('appointment_date', { ascending: false });

    if (!isAdminUser && userId && userId !== req.session.userId) {
      logger.warn(`Forbidden history access attempt by userId: ${req.session.userId} for userId: ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'Cannot view other users\' history' });
    }
    if (userId) {
      if (!validator.isInt(userId)) {
        return res.status(400).json({ error: 'bad_request', message: 'Invalid user ID' });
      }
      query = query.eq('user_id', userId);
    }

    const { data: appointments, error } = await query;
    if (error) throw new Error(`Supabase error: ${error.message}`);

    const patientIds = [...new Set(appointments.map((app) => app.user_id))];
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patientMap = new Map(
      patients.map((p) => [
        p.id,
        {
          first_name: decrypt(p.first_name),
          last_name: decrypt(p.last_name),
        },
      ])
    );

    const history = appointments.map((app) => ({
      ...app,
      notes: app.notes ? decrypt(app.notes) : null,
      cancel_reason: app.cancel_reason ? decrypt(app.cancel_reason) : null,
      reject_reason: app.reject_reason ? decrypt(app.reject_reason) : null,
      patients: patientMap.get(app.user_id) || { first_name: null, last_name: null },
    }));

    res.status(200).json({ success: true, history });
  } catch (error) {
    logger.error('Error fetching appointment history:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch appointment history' });
  }
});

// POST /api/appointments/:id/reschedule
router.post('/:id/reschedule', isAuthenticated, cooldownCheck, async (req, res) => {
  const { id } = req.params;
  const { appointment_date, cancel_reason, notes } = req.body;

  try {
    if (!validator.isInt(id)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid appointment ID' });
    }
    if (!appointment_date || !cancel_reason) {
      return res.status(400).json({ error: 'bad_request', message: 'Appointment date and reason for rescheduling are required' });
    }
    if (!validator.isISO8601(appointment_date)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid appointment date format' });
    }
    if (!validator.isLength(cancel_reason, { min: 1, max: 500 })) {
      return res.status(400).json({ error: 'bad_request', message: 'Cancel reason must be between 1 and 500 characters' });
    }
    if (notes && !validator.isLength(notes, { max: 500 })) {
      return res.status(400).json({ error: 'bad_request', message: 'Notes must be less than 500 characters' });
    }

    const { data: appointmentCheck, error: checkError } = await supabase
      .from('appointments')
      .select('id, user_id, appointment_date, cancel_reason, notes, status, pending_action, services (name)')
      .eq('id', id)
      .eq('user_id', req.session.userId)
      .single();
    if (checkError) throw new Error(`Supabase error: ${checkError.message}`);
    if (!appointmentCheck) {
      return res.status(404).json({ error: 'not_found', message: 'Appointment not found or not authorized' });
    }

    if (!['pending', 'confirmed'].includes(appointmentCheck.status)) {
      return res.status(400).json({ error: 'bad_request', message: 'Cannot reschedule completed or cancelled appointment' });
    }

    if (appointmentCheck.pending_action) {
      return res.status(400).json({ error: 'bad_request', message: `A ${appointmentCheck.pending_action} request is already pending` });
    }

    const { data: conflictCheck, error: conflictError } = await supabase
      .from('appointments')
      .select('id')
      .eq('appointment_date', appointment_date)
      .neq('status', 'cancelled')
      .neq('status', 'rejected');
    if (conflictError) throw new Error(`Conflict check error: ${conflictError.message}`);
    if (conflictCheck.length > 0) {
      return res.status(409).json({ error: 'conflict', message: 'Requested time slot is already booked' });
    }

    const encryptedReason = encrypt(cancel_reason);
    const encryptedNotes = notes ? encrypt(notes) : appointmentCheck.notes;

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        pending_action: 'reschedule',
        cancel_reason: encryptedReason,
        notes: encryptedNotes,
      })
      .eq('id', id);
    if (updateError) throw new Error(`Update error: ${updateError.message}`);

    const { error: requestError } = await supabase
      .from('appointment_requests')
      .insert([
        {
          appointment_id: id,
          user_id: req.session.userId,
          action: 'reschedule',
          status: 'pending',
          details: JSON.stringify({
            new_appointment_date: appointment_date,
            new_cancel_reason: encryptedReason,
            new_notes: encryptedNotes,
            original_appointment_date: appointmentCheck.appointment_date,
            original_cancel_reason: appointmentCheck.cancel_reason,
            original_notes: appointmentCheck.notes,
          }),
        },
      ]);
    if (requestError) throw new Error(`Request insert error: ${requestError.message}`);

    const { data: patientRaw, error: patientError } = await supabase
      .from('patients')
      .select('first_name, last_name')
      .eq('id', req.session.userId)
      .single();
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patient = {
      first_name: decrypt(patientRaw.first_name),
      last_name: decrypt(patientRaw.last_name),
    };
    const patientName = `${patient.first_name} ${patient.last_name}`;

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'Reschedule Request - Balane-Saspa Dental Clinic',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
          <p>Dear Admin,</p>
          <p>A reschedule request has been submitted:</p>
          <ul>
            <li><strong>Patient:</strong> ${patientName}</li>
            <li><strong>Original Appointment Date:</strong> ${new Date(appointmentCheck.appointment_date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</li>
            <li><strong>New Appointment Date:</strong> ${new Date(appointment_date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</li>
            <li><strong>Service:</strong> ${appointmentCheck.services.name}</li>
            <li><strong>Reason for Rescheduling:</strong> ${cancel_reason}</li>
            <li><strong>Notes:</strong> ${notes || (appointmentCheck.notes ? decrypt(appointmentCheck.notes) : 'None')}</li>
          </ul>
          <p>Please review and approve/reject this request in the admin panel.</p>
          <p>Best regards,<br>Balane-Saspa Dental Clinic System</p>
        </div>
      `,
    };

    await transporter.sendMail(adminMailOptions);
    logger.info(`Reschedule request email sent for appointmentId: ${id}`);
    res.status(200).json({ success: true, message: 'Reschedule request submitted, awaiting admin approval' });
  } catch (error) {
    logger.error('Error requesting reschedule:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to request reschedule' });
  }
});

// PUT /api/appointments/:id
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { appointment_date, notes, status, cancel_reason } = req.body;

  try {
    if (!validator.isInt(id)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid appointment ID' });
    }
    if (!appointment_date) {
      return res.status(400).json({ error: 'bad_request', message: 'Appointment date is required' });
    }
    if (!validator.isISO8601(appointment_date)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid appointment date format' });
    }
    if (notes && !validator.isLength(notes, { max: 500 })) {
      return res.status(400).json({ error: 'bad_request', message: 'Notes must be less than 500 characters' });
    }
    if (cancel_reason && !validator.isLength(cancel_reason, { max: 500 })) {
      return res.status(400).json({ error: 'bad_request', message: 'Cancel reason must be less than 500 characters' });
    }
    if (status && !['pending', 'confirmed', 'cancelled', 'rejected', 'expired'].includes(status)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid status' });
    }

    const { data: appointmentCheck, error: checkError } = await supabase
      .from('appointments')
      .select('id, user_id, appointment_date, notes, cancel_reason, status, pending_action')
      .eq('id', id)
      .single();
    if (checkError) throw new Error(`Supabase error: ${checkError.message}`);
    if (!appointmentCheck) {
      return res.status(404).json({ error: 'not_found', message: 'Appointment not found' });
    }

    const { data: conflictCheck, error: conflictError } = await supabase
      .from('appointments')
      .select('id')
      .eq('appointment_date', appointment_date)
      .neq('status', 'cancelled')
      .neq('status', 'rejected')
      .neq('id', id);
    if (conflictError) throw new Error(`Conflict check error: ${conflictError.message}`);
    if (conflictCheck.length > 0) {
      return res.status(409).json({ error: 'conflict', message: 'Time slot already booked' });
    }

    const encryptedNotes = notes ? encrypt(notes) : appointmentCheck.notes;
    const encryptedCancelReason = cancel_reason ? encrypt(cancel_reason) : appointmentCheck.cancel_reason;

    const updatedData = {
      appointment_date,
      notes: encryptedNotes,
      cancel_reason: encryptedCancelReason,
      status: status || appointmentCheck.status,
      pending_action: null,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedAppointment, error: updateError } = await supabase
      .from('appointments')
      .update(updatedData)
      .eq('id', id)
      .select('id, user_id, appointment_date, notes, cancel_reason, status, services (name)')
      .single();
    if (updateError) throw new Error(`Update error: ${updateError.message}`);

    const decryptedAppointment = {
      ...updatedAppointment,
      notes: updatedAppointment.notes ? decrypt(updatedAppointment.notes) : null,
      cancel_reason: updatedAppointment.cancel_reason ? decrypt(updatedAppointment.cancel_reason) : null,
    };

    logger.info(`Appointment updated by admin: ${id}`);
    res.status(200).json({
      success: true,
      message: 'Appointment updated successfully by admin',
      appointment: decryptedAppointment,
    });
  } catch (error) {
    logger.error('Error updating appointment:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to update appointment' });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', isAuthenticated, cooldownCheck, async (req, res) => {
  const { id } = req.params;
  const { cancel_reason } = req.body;

  try {
    if (!validator.isInt(id)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid appointment ID' });
    }
    if (!cancel_reason) {
      return res.status(400).json({ error: 'bad_request', message: 'Cancellation reason is required' });
    }
    if (!validator.isLength(cancel_reason, { min: 1, max: 500 })) {
      return res.status(400).json({ error: 'bad_request', message: 'Cancel reason must be between 1 and 500 characters' });
    }

    const { data: appointmentCheck, error: checkError } = await supabase
      .from('appointments')
      .select('id, user_id, appointment_date, notes, cancel_reason, status, pending_action, services (name)')
      .eq('id', id)
      .eq('user_id', req.session.userId)
      .single();
    if (checkError) throw new Error(`Supabase error: ${checkError.message}`);
    if (!appointmentCheck) {
      return res.status(404).json({ error: 'not_found', message: 'Appointment not found or not authorized' });
    }

    if (appointmentCheck.pending_action) {
      return res.status(400).json({ error: 'bad_request', message: `A ${appointmentCheck.pending_action} request is already pending` });
    }
    if (!['pending', 'confirmed'].includes(appointmentCheck.status)) {
      return res.status(400).json({ error: 'bad_request', message: 'This appointment cannot be cancelled' });
    }

    const encryptedCancelReason = encrypt(cancel_reason);

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        pending_action: 'cancel',
        cancel_reason: encryptedCancelReason,
      })
      .eq('id', id);
    if (updateError) throw new Error(`Update error: ${updateError.message}`);

    const { error: requestError } = await supabase
      .from('appointment_requests')
      .insert([
        {
          appointment_id: id,
          user_id: req.session.userId,
          action: 'cancel',
          status: 'pending',
          details: JSON.stringify({ cancel_reason: encryptedCancelReason }),
        },
      ]);
    if (requestError) throw new Error(`Request insert error: ${requestError.message}`);

    const { data: patientRaw, error: patientError } = await supabase
      .from('patients')
      .select('first_name, last_name')
      .eq('id', req.session.userId)
      .single();
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patient = {
      first_name: decrypt(patientRaw.first_name),
      last_name: decrypt(patientRaw.last_name),
    };
    const patientName = `${patient.first_name} ${patient.last_name}`;

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: 'Cancellation Request - Balane-Saspa Dental Clinic',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
          <p>Dear Admin,</p>
          <p>A cancellation request has been submitted:</p>
          <ul>
            <li><strong>Patient:</strong> ${patientName}</li>
            <li><strong>Appointment Date:</strong> ${new Date(appointmentCheck.appointment_date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</li>
            <li><strong>Service:</strong> ${appointmentCheck.services.name}</li>
            <li><strong>Reason:</strong> ${cancel_reason}</li>
            <li><strong>Notes:</strong> ${appointmentCheck.notes ? decrypt(appointmentCheck.notes) : 'None'}</li>
          </ul>
          <p>Please review and approve/reject this request in the admin panel.</p>
          <p>Best regards,<br>Balane-Saspa Dental Clinic System</p>
        </div>
      `,
    };

    await transporter.sendMail(adminMailOptions);
    logger.info(`Cancellation request email sent for appointmentId: ${id}`);
    res.status(200).json({ success: true, message: 'Cancellation request submitted, awaiting admin approval' });
  } catch (error) {
    logger.error('Error requesting cancellation:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to request cancellation' });
  }
});

// GET /api/appointments/requests
router.get('/requests', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { data: requests, error } = await supabase
      .from('appointment_requests')
      .select(`
        id,
        appointment_id,
        user_id,
        action,
        status,
        details,
        created_at,
        appointments (appointment_date, notes, cancel_reason, status, pending_action, services (name))
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Supabase error: ${error.message}`);

    const patientIds = [...new Set(requests.map((req) => req.user_id))];
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patientMap = new Map(
      patients.map((p) => [
        p.id,
        {
          first_name: decrypt(p.first_name),
          last_name: decrypt(p.last_name),
        },
      ])
    );

    const enrichedRequests = requests.map((req) => {
      const details = req.details ? JSON.parse(req.details) : {};
      return {
        ...req,
        appointments: {
          ...req.appointments,
          notes: req.appointments.notes ? decrypt(req.appointments.notes) : null,
          cancel_reason: req.appointments.cancel_reason ? decrypt(req.appointments.cancel_reason) : null,
        },
        new_appointment_date: details.new_appointment_date || null,
        new_notes: details.new_notes ? decrypt(details.new_notes) : null,
        new_cancel_reason: details.new_cancel_reason ? decrypt(details.new_cancel_reason) : null,
        patients: patientMap.get(req.user_id) || { first_name: null, last_name: null },
      };
    });

    res.status(200).json({ success: true, requests: enrichedRequests });
  } catch (error) {
    logger.error('Error fetching appointment requests:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch appointment requests' });
  }
});

// POST /api/appointments/requests/:requestId/approve
router.post('/requests/:requestId/approve', isAuthenticated, isAdmin, async (req, res) => {
  const { requestId } = req.params;
  try {
    if (!validator.isInt(requestId)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid request ID' });
    }

    const { data: requestCheck, error: checkError } = await supabase
      .from('appointment_requests')
      .select('*, appointments (id, user_id, appointment_date, notes, cancel_reason, status, services (name))')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();
    if (checkError) throw new Error(`Supabase error: ${checkError.message}`);
    if (!requestCheck) {
      return res.status(404).json({ error: 'not_found', message: 'Request not found or already processed' });
    }

    const request = requestCheck;
    const details = request.details ? JSON.parse(request.details) : {};
    const cancellationDate = new Date();

    const { data: patientRaw, error: patientError } = await supabase
      .from('patients')
      .select('first_name, last_name, email')
      .eq('id', request.appointments.user_id)
      .single();
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patient = {
      first_name: decrypt(patientRaw.first_name),
      last_name: decrypt(patientRaw.last_name),
      email: patientRaw.email ? decrypt(patientRaw.email) : null,
    };
    const patientName = `${patient.first_name} ${patient.last_name}`;
    const patientEmail = patient.email;

    let updatedAppointmentDate = request.appointments.appointment_date;

    if (request.action === 'cancel') {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          pending_action: null,
          cancel_reason: details.new_cancel_reason || request.appointments.cancel_reason,
        })
        .eq('id', request.appointment_id);
      if (updateError) throw new Error(`Update error: ${updateError.message}`);
    } else if (request.action === 'confirm') {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'confirmed', pending_action: null })
        .eq('id', request.appointment_id);
      if (updateError) throw new Error(`Update error: ${updateError.message}`);
    } else if (request.action === 'reschedule') {
      const { new_appointment_date, new_notes, new_cancel_reason } = details;

      const { data: conflictCheck, error: conflictError } = await supabase
        .from('appointments')
        .select('id, status')
        .eq('appointment_date', new_appointment_date)
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .neq('id', request.appointment_id);
      if (conflictError) throw new Error(`Conflict check error: ${conflictError.message}`);
      if (conflictCheck.length > 0) {
        return res.status(409).json({
          error: 'conflict',
          message: 'The requested new time slot is already booked.',
        });
      }

      const { data: updatedAppointment, error: updateError } = await supabase
        .from('appointments')
        .update({
          appointment_date: new_appointment_date,
          notes: new_notes || request.appointments.notes,
          cancel_reason: new_cancel_reason || request.appointments.cancel_reason,
          status: 'confirmed',
          pending_action: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.appointment_id)
        .select()
        .single();
      if (updateError) throw new Error(`Update error: ${updateError.message}`);

      updatedAppointmentDate = new_appointment_date;
    }

    const { error: requestUpdateError } = await supabase
      .from('appointment_requests')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    if (requestUpdateError) throw new Error(`Request update error: ${requestUpdateError.message}`);

    if (patientEmail) {
      const actionText = request.action === 'confirm' ? 'confirmed' : request.action === 'reschedule' ? 'rescheduled' : 'cancelled';
      const subject = request.action === 'cancel' ? 'Appointment Cancellation Confirmed' : 'Appointment Request Approved';
      const userMailOptions = {
 Agreements: process.env.EMAIL_USER,
        to: patientEmail,
        subject: `${subject} - Balane-Saspa Dental Clinic`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
            <p>Dear ${patientName},</p>
            <p>Your ${request.action} request has been approved:</p>
            <ul>
              <li><strong>Status:</strong> Appointment ${actionText}</li>
              ${request.action === 'cancel' ?
                `<li><strong>Original Date:</strong> ${new Date(request.appointments.appointment_date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</li>
                <li><strong>Cancelled On:</strong> ${cancellationDate.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</li>` :
                `<li><strong>Date:</strong> ${new Date(updatedAppointmentDate).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</li>`
              }
              <li><strong>Service:</strong> ${request.appointments.services.name}</li>
            </ul>
            <p>${request.action === 'cancel' ? 'We hope to assist you again in the future.' : 'We look forward to seeing you!'}</p>
            <p>Best regards,<br>Balane-Saspa Dental Clinic Team</p>
          </div>
        `,
      };

      await transporter.sendMail(userMailOptions);
      logger.info(`Approval notification sent to ${patientEmail} for requestId: ${requestId}`);
    }

    res.status(200).json({ success: true, message: `${request.action} request approved successfully` });
  } catch (error) {
    logger.error('Error approving request:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to approve request' });
  }
});

// POST /api/appointments/requests/:requestId/reject
router.post('/requests/:requestId/reject', isAuthenticated, isAdmin, async (req, res) => {
  const { requestId } = req.params;
  const { reject_reason } = req.body;
  try {
    if (!validator.isInt(requestId)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid request ID' });
    }
    if (!reject_reason) {
      return res.status(400).json({ error: 'bad_request', message: 'Rejection reason is required' });
    }
    if (!validator.isLength(reject_reason, { min: 1, max: 500 })) {
      return res.status(400).json({ error: 'bad_request', message: 'Rejection reason must be between 1 and 500 characters' });
    }

    const { data: requestCheck, error: checkError } = await supabase
      .from('appointment_requests')
      .select('*, appointments (id, user_id, appointment_date, notes, cancel_reason, reject_reason, status, services (name))')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();
    if (checkError) throw new Error(`Supabase error: ${checkError.message}`);
    if (!requestCheck) {
      return res.status(404).json({ error: 'not_found', message: 'Request not found or already processed' });
    }

    const request = requestCheck;
    const encryptedRejectReason = encrypt(reject_reason);

    const newStatus = request.action === 'confirm' ? 'rejected' : 'confirmed';

    const { error: updateError } = await supabase
      .from('appointments')
      .update({
        status: newStatus,
        pending_action: null,
        reject_reason: encryptedRejectReason,
      })
      .eq('id', request.appointment_id);
    if (updateError) throw new Error(`Update error: ${updateError.message}`);

    const { error: requestUpdateError } = await supabase
      .from('appointment_requests')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
        details: JSON.stringify({ ...JSON.parse(request.details || '{}'), reject_reason: encryptedRejectReason }),
      })
      .eq('id', requestId);
    if (requestUpdateError) throw new Error(`Request update error: ${requestUpdateError.message}`);

    const { data: patientRaw, error: patientError } = await supabase
      .from('patients')
      .select('first_name, last_name, email')
      .eq('id', request.appointments.user_id)
      .single();
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patient = {
      first_name: decrypt(patientRaw.first_name),
      last_name: decrypt(patientRaw.last_name),
      email: patientRaw.email ? decrypt(patientRaw.email) : null,
    };
    const patientName = `${patient.first_name} ${patient.last_name}`;
    const patientEmail = patient.email;

    if (patientEmail) {
      const parsedDate = new Date(request.appointments.appointment_date);
      const userMailOptions = {
        from: process.env.EMAIL_USER,
        to: patientEmail,
        subject: 'Appointment Request Rejected - Balane-Saspa Dental Clinic',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
            <p>Dear ${patientName},</p>
            <p>Your ${request.action} request has been rejected by the admin:</p>
            <ul>
              <li><strong>Date:</strong> ${new Intl.DateTimeFormat('en-PH', {
                timeZone: 'Asia/Manila',
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(parsedDate)}</li>
              <li><strong>Service:</strong> ${request.appointments.services.name}</li>
              <li><strong>Reason for Rejection:</strong> ${reject_reason}</li>
            </ul>
            <p>If you have any questions or need further assistance, please contact us.</p>
            <p>Best regards,<br>Balane-Saspa Dental Clinic Team</p>
          </div>
        `,
      };

      await transporter.sendMail(userMailOptions);
      logger.info(`Rejection notification sent to ${patientEmail} for requestId: ${requestId}`);
    }

    res.status(200).json({ success: true, message: `${request.action} request rejected successfully` });
  } catch (error) {
    logger.error('Error rejecting request:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to reject request' });
  }
});

// POST /api/appointments/bulk-update
router.post('/bulk-update', isAuthenticated, isAdmin, async (req, res) => {
  const { updates } = req.body;

  try {
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid or empty updates array' });
    }

    const validUpdates = updates.every(
      (update) =>
        validator.isInt(update.id) &&
        ['pending', 'confirmed', 'cancelled', 'rejected', 'expired'].includes(update.status)
    );
    if (!validUpdates) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid update format' });
    }

    const { error } = await supabase
      .from('appointments')
      .upsert(
        updates.map((update) => ({
          id: update.id,
          status: update.status,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'id' }
      );
    if (error) throw new Error(`Supabase error: ${error.message}`);

    logger.info(`Bulk updated ${updates.length} appointments by admin`);
    res.status(200).json({ success: true, message: `Successfully updated ${updates.length} appointments` });
  } catch (error) {
    logger.error('Error in bulk update:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to update appointments' });
  }
});

// GET /api/appointments/all
router.get('/all', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'expired', updated_at: now })
      .eq('status', 'pending')
      .lt('appointment_date', now);
    if (updateError) logger.error('Error updating expired appointments:', updateError);

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        user_id,
        appointment_date,
        status,
        notes,
        cancel_reason,
        reject_reason,
        pending_action,
        services (name)
      `)
      .order('appointment_date', { ascending: true });
    if (error) throw new Error(`Supabase error: ${error.message}`);

    const patientIds = [...new Set(appointments.map((app) => app.user_id))];
    const { data: patients, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patientMap = new Map(
      patients.map((p) => [
        p.id,
        {
          first_name: decrypt(p.first_name),
          last_name: decrypt(p.last_name),
        },
      ])
    );

    const enrichedAppointments = appointments.map((app) => ({
      ...app,
      notes: app.notes ? decrypt(app.notes) : null,
      cancel_reason: app.cancel_reason ? decrypt(app.cancel_reason) : null,
      reject_reason: app.reject_reason ? decrypt(app.reject_reason) : null,
      patients: patientMap.get(app.user_id) || { first_name: null, last_name: null },
    }));

    res.status(200).json({ success: true, appointments: enrichedAppointments });
  } catch (error) {
    logger.error('Error fetching all appointments:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch appointments' });
  }
});

// Test encryption/decryption route (restricted to development)
router.get('/test-encryption', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'forbidden', message: 'Test route disabled in production' });
  }
  try {
    const originalText = 'John Smith';
    const encrypted = encrypt(originalText);
    const decrypted = decrypt(encrypted);
    res.status(200).json({
      original: originalText,
      encrypted,
      decrypted,
      success: originalText === decrypted,
    });
  } catch (error) {
    logger.error('Test encryption error:', error);
    res.status(500).json({ error: 'server_error', message: 'Test encryption failed' });
  }
});

// Admin schedule reminder function
async function sendAdminScheduleReminder(targetDay = 'today') {
  try {
    const today = new Date();
    const targetDate = new Date(today);
    if (targetDay === 'tomorrow') {
      targetDate.setDate(today.getDate() + 1);
    }

    const dateString = targetDate.toISOString().split('T')[0];
    const appointmentTimes = Array.from({ length: 24 }, (_, h) => `${dateString}T${h.toString().padStart(2, '0')}:00:00+00`);

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        user_id,
        appointment_date,
        status,
        notes,
        services (name)
      `)
      .in('status', ['pending', 'confirmed'])
      .in('appointment_date', appointmentTimes)
      .order('appointment_date', { ascending: true });
    if (error) throw new Error(`Supabase error: ${error.message}`);

    if (!appointments.length) {
      logger.info(`No appointments found for admin ${targetDay} schedule reminder`);
      return;
    }

    const patientIds = [...new Set(appointments.map((app) => app.user_id))];
    const { data: patientsRaw, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .in('id', patientIds);
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patientMap = new Map(patientsRaw.map((p) => [p.id, `${decrypt(p.first_name)} ${decrypt(p.last_name)}`]));

    const scheduleList = appointments
      .map(
        (app) => `
      <li>
        <strong>Time:</strong> ${new Date(app.appointment_date).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' })}<br>
        <strong>Patient:</strong> ${patientMap.get(app.user_id) || 'Unknown'}<br>
        <strong>Service:</strong> ${app.services.name}<br>
        <strong>Status:</strong> ${app.status}<br>
        <strong>Notes:</strong> ${app.notes ? decrypt(app.notes) : 'None'}
      </li>
    `
      )
      .join('');

    const adminScheduleMail = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `Appointment Schedule for ${targetDay === 'today' ? 'Today' : 'Tomorrow'} - Balane-Saspa Dental Clinic`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
          <p>Dear Admin,</p>
          <p>Here is the appointment schedule for ${targetDay === 'today' ? 'today' : 'tomorrow'} (${targetDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}):</p>
          <ul style="list-style-type: none; padding-left: 0;">
            ${scheduleList}
          </ul>
          <p>Please prepare accordingly for these appointments.</p>
          <p>Best regards,<br>Balane-Saspa Dental Clinic System</p>
        </div>
      `,
    };

    await transporter.sendMail(adminScheduleMail);
    logger.info(`Admin schedule reminder for ${targetDay} sent to: ${process.env.EMAIL_USER}`);
  } catch (error) {
    logger.error(`Error in admin ${targetDay} schedule reminder:`, error);
  }
}

// User appointment reminder function
async function sendAppointmentReminders(targetDay = 'today') {
  try {
    const today = new Date();
    const targetDate = new Date(today);
    if (targetDay === 'tomorrow') {
      targetDate.setDate(today.getDate() + 1);
    }

    const dateString = targetDate.toISOString().split('T')[0];
    const appointmentDates = Array.from({ length: 24 }, (_, h) => `${dateString}T${h.toString().padStart(2, '0')}:00:00+00`);

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        user_id,
        appointment_date,
        notes,
        services (name)
      `)
      .eq('status', 'confirmed')
      .in('appointment_date', appointmentDates);
    if (error) throw new Error(`Supabase error: ${error.message}`);

    if (!appointments.length) {
      logger.info(`No upcoming appointments found for ${targetDay} reminder`);
      return;
    }

    const patientIds = [...new Set(appointments.map((app) => app.user_id))];
    const { data: patientsRaw, error: patientError } = await supabase
      .from('patients')
      .select('id, first_name, last_name, email')
      .in('id', patientIds);
    if (patientError) throw new Error(`Patient fetch error: ${patientError.message}`);

    const patients = patientsRaw.map((p) => ({
      id: p.id,
      first_name: decrypt(p.first_name),
      last_name: decrypt(p.last_name),
      email: p.email ? decrypt(p.email) : null,
    }));

    const patientMap = new Map(patients.map((p) => [p.id, { name: `${p.first_name} ${p.last_name}`, email: p.email }]));

    for (const appointment of appointments) {
      const patient = patientMap.get(appointment.user_id);
      if (!patient || !patient.email) {
        logger.warn(`No valid email for patient (user_id: ${appointment.user_id}), skipping reminder`);
        continue;
      }

      const timingText = targetDay === 'today' ? 'Today' : 'Tomorrow';
      logger.info(`Sending ${timingText} reminder for appointment ${appointment.id} to ${patient.email}`);

      const reminderMailOptions = {
        from: process.env.EMAIL_USER,
        to: patient.email,
        subject: `Upcoming Appointment Reminder (${timingText}) - Balane-Saspa Dental Clinic`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
            <p>Dear ${patient.name},</p>
            <p>This is a reminder for your upcoming appointment scheduled for ${timingText.toLowerCase()}:</p>
            <ul>
              <li><strong>Date:</strong> ${new Date(appointment.appointment_date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</li>
              <li><strong>Service:</strong> ${appointment.services.name}</li>
              <li><strong>Notes:</strong> ${appointment.notes ? decrypt(appointment.notes) : 'None'}</li>
            </ul>
            <p>We look forward to seeing you! If you need to reschedule or cancel, please contact us.</p>
            <p>Best regards,<br>Balane-Saspa Dental Clinic Team</p>
          </div>
        `,
      };

      await transporter.sendMail(reminderMailOptions);
      logger.info(`Upcoming appointment reminder (${timingText}) sent to: ${patient.email}`);
    }
  } catch (error) {
    logger.error(`Error in ${targetDay} appointment reminder cron job:`, error);
  }
}

// Cron scheduling with error handling
const cronJobs = cron.schedule(
  '0 23 * * *',
  async () => {
    logger.info('Running daily reminders at 11 PM Asia/Manila');
    try {
      await Promise.all([
        sendAdminScheduleReminder('today'),
        sendAdminScheduleReminder('tomorrow'),
        sendAppointmentReminders('today'),
        sendAppointmentReminders('tomorrow'),
      ]);
      logger.info('Daily reminders completed successfully');
    } catch (error) {
      logger.error('Error in daily reminders cron job:', error);
    }
  },
  {
    timezone: 'Asia/Manila',
    runOnInit: false,
  }
);

// Graceful shutdown for cron
process.on('SIGTERM', () => {
  logger.info('Shutting down cron jobs');
  cronJobs.stop();
  redis.quit(() => {
    logger.info('Redis connection closed');
    process.exit(0);
  });
});

// Error handling middleware
router.use((err, req, res, next) => {
  logger.error('Route error:', { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server' });
});

module.exports = {
  router,
  handleSocketIOEvents,
};