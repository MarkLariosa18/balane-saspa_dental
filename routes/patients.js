const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const { body, query, validationResult } = require('express-validator'); // Added for input validation
const helmet = require('helmet');
const winston = require('winston');

require('dotenv').config();

// Initialize router
router.use(express.json({ limit: '10kb' }));
router.use(helmet()); // Apply helmet early for all routes

// Validate environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'ENCRYPTION_KEY', 'REDIS_URL', 'NODE_ENV'];
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

// Initialize Redis
const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 10,
});

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Encryption setup
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

if (encryptionKey.length !== 32) {
  logger.error(`Invalid ENCRYPTION_KEY length: expected 32 bytes, got ${encryptionKey.length}`);
  process.exit(1);
}
logger.info('Encryption key initialized successfully');

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
  const [ivText, authTagText, encryptedText] = text.split(':');
  if (!ivText || !encryptedText || !authTagText) {
    logger.warn(`Invalid encrypted format: "${text}"`);
    return text;
  }
  try {
    const iv = Buffer.from(ivText, 'hex');
    const authTag = Buffer.from(authTagText, 'hex');
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
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

// Rate limiters
const rateLimiters = {
  checkUsername: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:username',
    points: 100, // Increased for usability
    duration: 60 * 60,
    blockDuration: 60 * 60,
  }),
  registration: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:register',
    points: 5,
    duration: 60 * 60,
    blockDuration: 60 * 60,
  }),
  profileGet: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:profile:get',
    points: 200, // Increased for frequent profile checks
    duration: 15 * 60,
    blockDuration: 15 * 60,
    keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
  }),
  profileUpdate: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:profile:update',
    points: 10,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
  }),
  allPatients: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:allpatients',
    points: 50,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
  }),
  changePassword: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:password',
    points: 5,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
  }),
  adminProfile: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:adminprofile',
    points: 100,
    duration: 15 * 60,
    blockDuration: 15 * 60,
    keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
  }),
  adminUpdate: new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: 'rl:adminupdate',
    points: 5,
    duration: 60 * 60,
    blockDuration: 60 * 60,
    keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
  }),
};

// Rate limiter middleware
const applyRateLimiter = (limiter) => async (req, res, next) => {
  try {
    const key = limiter.keyGenerator ? limiter.keyGenerator(req) : req.ip;
    await limiter.consume(key);
    next();
  } catch (error) {
    logger.warn(`Rate limit exceeded for ${key} on ${req.path}`);
    res.status(429).json({
      error: 'too_many_requests',
      message: 'Too many requests, please try again later',
      retryAfter: error.msBeforeNext / 1000,
    });
  }
};

// Authentication middleware with session validation
const isAuthenticated = async (req, res, next) => {
  if (!req.session || !req.session.isLoggedIn || !req.session.userId) {
    logger.warn(`Unauthorized access attempt: ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'unauthorized', message: 'You must be logged in to perform this action' });
  }
  // Validate session in Redis
  try {
    const sessionData = await redis.get(`sess:${req.session.id}`);
    if (!sessionData) {
      logger.warn(`Invalid session for userId: ${req.session.userId}`);
      req.session.destroy();
      return res.status(401).json({ error: 'session_expired', message: 'Session expired, please log in again' });
    }
    next();
  } catch (error) {
    logger.error('Session validation error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to validate session' });
  }
};

// Admin check
const isAdmin = async (userId) => {
  const { data, error } = await supabase
    .from('admin')
    .select('id')
    .eq('id', userId)
    .single();
  return !error && data;
};

// Socket.IO handlers
const socketHandlers = {
  patientRegistration: (io, data) => {
    try {
      logger.info('Emitting patient registration:', data);
      io.emit('patient_registration', {
        patient: {
          id: data.patient_id,
          first_name: data.first_name,
          last_name: data.last_name,
          email: data.email,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Patient registration handler error:', error);
    }
  },
  profileUpdate: (io, data) => {
    try {
      logger.info('Emitting profile update:', data);
      io.emit('profile_update', {
        patient: {
          id: data.userId,
          full_name: data.fullName,
          email: data.email,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Profile update handler error:', error);
    }
  },
  passwordChange: (io, data) => {
    try {
      logger.info('Emitting password change:', data);
      io.emit('password_change', {
        userId: data.userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Password change handler error:', error);
    }
  },
  adminUpdate: (io, data) => {
    try {
      logger.info('Emitting admin update:', data);
      io.emit('admin_update', {
        userId: data.userId,
        username: data.username,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Admin update handler error:', error);
    }
  },
};

// Username availability check
router.get(
  '/check-username',
  applyRateLimiter(rateLimiters.checkUsername),
  [
    query('username')
      .isAlphanumeric('en-US', { ignore: '_-' })
      .isLength({ min: 3, max: 50 })
      .trim()
      .escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(`Invalid username input: ${req.query.username}`);
      return res.status(400).json({ error: 'invalid_request', message: errors.array()[0].msg });
    }
    try {
      const { username } = req.query;
      logger.info(`Checking username availability: ${username}`);
      const { data, error } = await supabase
        .from('users')
        .select('username')
        .eq('username', username)
        .maybeSingle();
      if (error) throw error;
      res.status(200).json({ exists: !!data });
    } catch (error) {
      logger.error('Check-username error:', error);
      res.status(500).json({ error: 'server_error', message: 'Internal server error' });
    }
  }
);

// Patient registration
router.post(
  '/',
  applyRateLimiter(rateLimiters.registration),
  [
    body('username').isAlphanumeric('en-US', { ignore: '_-' }).isLength({ min: 3, max: 50 }).trim().escape(),
    body('password').isLength({ min: 8, max: 100 }).trim(),
    body('email').isEmail().normalizeEmail(),
    body('first_name').isLength({ max: 50 }).trim().escape(),
    body('last_name').isLength({ max: 50 }).trim().escape(),
    body('birthdate').isISO8601().toDate(),
    body('sex').isIn(['M', 'F']),
    body('home_address').isLength({ max: 200 }).trim().escape(),
    body('mobile_no').isMobilePhone('any').trim(),
    body('middle_name').optional().isLength({ max: 50 }).trim().escape(),
    body('nickname').optional().isLength({ max: 50 }).trim().escape(),
    body('religion').optional().isLength({ max: 50 }).trim().escape(),
    body('nationality').optional().isLength({ max: 50 }).trim().escape(),
    body('home_no').optional().isLength({ max: 20 }).trim().escape(),
    body('occupation').optional().isLength({ max: 100 }).trim().escape(),
    body('office_no').optional().isLength({ max: 20 }).trim().escape(),
    body('dental_insurance').optional().isLength({ max: 100 }).trim().escape(),
    body('fax_no').optional().isLength({ max: 20 }).trim().escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Registration validation errors:', errors.array());
      return res.status(400).json({ error: 'invalid_data', message: errors.array()[0].msg });
    }
    try {
      const {
        username,
        password,
        last_name,
        first_name,
        middle_name,
        birthdate,
        sex,
        nickname,
        religion,
        nationality,
        home_address,
        home_no,
        occupation,
        office_no,
        dental_insurance,
        fax_no,
        mobile_no,
        email,
      } = req.body;

      // Check for existing username
      const { data: usernameCheck, error: usernameError } = await supabase
        .from('users')
        .select('username')
        .eq('username', username)
        .maybeSingle();
      if (usernameError) throw usernameError;
      if (usernameCheck) {
        logger.warn(`Username already exists: ${username}`);
        return res.status(400).json({ error: 'username_exists', message: 'Username already exists' });
      }

      // Check for existing email
      const emailToCheck = email.toLowerCase();
      const { data: emailCheck, error: emailError } = await supabase
        .from('patients')
        .select('email');
      if (emailError) throw emailError;
      for (const patient of emailCheck) {
        if (patient.email && decrypt(patient.email) === emailToCheck) {
          logger.warn(`Email already exists: ${emailToCheck}`);
          return res.status(400).json({ error: 'email_exists', message: 'Email already exists' });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Encrypt patient data
      const encryptedData = {
        last_name: encrypt(last_name),
        first_name: encrypt(first_name),
        middle_name: middle_name ? encrypt(middle_name) : null,
        birthdate: encrypt(birthdate),
        sex,
        nickname: nickname ? encrypt(nickname) : null,
        religion: religion ? encrypt(religion) : null,
        nationality: nationality ? encrypt(nationality) : null,
        home_address: encrypt(home_address),
        home_no: home_no ? encrypt(home_no) : null,
        occupation: occupation ? encrypt(occupation) : null,
        office_no: office_no ? encrypt(office_no) : null,
        dental_insurance: dental_insurance ? encrypt(dental_insurance) : null,
        fax_no: fax_no ? encrypt(fax_no) : null,
        mobile_no: encrypt(mobile_no),
        email: encrypt(emailToCheck),
      };

      // Insert user
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert([{ username, password: hashedPassword, created_at: new Date().toISOString() }])
        .select('id')
        .single();
      if (userError) {
        logger.error('User insertion error:', userError);
        if (userError.code === '23505') {
          return res.status(400).json({ error: 'username_exists', message: 'Username already exists' });
        }
        throw userError;
      }

      // Insert patient
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .insert([{ id: userData.id, ...encryptedData, effective_date: new Date().toISOString() }])
        .select('id')
        .single();
      if (patientError) {
        logger.error('Patient insertion error:', patientError);
        await supabase.from('users').delete().eq('id', userData.id);
        if (patientError.code === '23505') {
          return res.status(400).json({ error: 'email_exists', message: 'Email already exists' });
        }
        throw patientError;
      }

      // Emit Socket.IO event
      const io = req.app.get('socketio');
      socketHandlers.patientRegistration(io, {
        patient_id: patientData.id,
        first_name,
        last_name,
        email: emailToCheck,
      });

      logger.info(`Patient registered: userId ${userData.id}`);
      res.status(201).json({ success: true, message: 'Patient registered successfully', patient_id: patientData.id });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({ error: 'server_error', message: 'Failed to register patient' });
    }
  }
);

// Fetch profile
router.get('/profile', isAuthenticated, applyRateLimiter(rateLimiters.profileGet), async (req, res) => {
  try {
    const userId = req.session.userId;
    logger.info(`Fetching profile for userId: ${userId}`);

    const { data, error } = await supabase
      .from('patients')
      .select('id, first_name, last_name, email, mobile_no, birthdate, sex, home_address, religion, nationality, home_no')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (!data) {
      logger.warn(`No patient found for userId: ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'Patient profile not found' });
    }

    const safeDecrypt = (value) => decrypt(value) || 'Not provided';

    const profileData = {
      full_name: `${safeDecrypt(data.first_name)} ${safeDecrypt(data.last_name)}`,
      email: safeDecrypt(data.email),
      phone: safeDecrypt(data.mobile_no),
      dob: safeDecrypt(data.birthdate),
      gender: data.sex === 'M' ? 'male' : data.sex === 'F' ? 'female' : 'other',
      address: safeDecrypt(data.home_address),
      religion: safeDecrypt(data.religion) || 'N/A',
      nationality: safeDecrypt(data.nationality) || 'N/A',
      home_number: safeDecrypt(data.home_no) || 'N/A',
      blood_type: 'N/A',
      allergies: 'None',
      medical_conditions: 'None',
      emergency_contact: 'N/A',
    };

    logger.info(`Profile retrieved for userId: ${userId}`);
    res.status(200).json(profileData);
  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch profile' });
  }
});

// Fetch all patients (admin-only)
router.get('/allPatients', isAuthenticated, applyRateLimiter(rateLimiters.allPatients), async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!(await isAdmin(userId))) {
      logger.warn(`Non-admin access attempt: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    }

    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      logger.info('No patients found');
      return res.status(200).json([]);
    }

    const decryptedPatients = data.map((patient) => ({
      id: patient.id,
      first_name: decrypt(patient.first_name),
      last_name: decrypt(patient.last_name),
      middle_name: decrypt(patient.middle_name) || '',
      birthdate: decrypt(patient.birthdate),
      sex: patient.sex === 'M' ? 'Male' : patient.sex === 'F' ? 'Female' : 'Other',
      age: calculateAge(decrypt(patient.birthdate)),
      nickname: decrypt(patient.nickname) || '',
      religion: decrypt(patient.religion) || '',
      nationality: decrypt(patient.nationality) || '',
      home_address: decrypt(patient.home_address),
      home_no: decrypt(patient.home_no) || '',
      occupation: decrypt(patient.occupation) || '',
      office_no: decrypt(patient.office_no) || '',
      dental_insurance: decrypt(patient.dental_insurance) || '',
      fax_no: decrypt(patient.fax_no) || '',
      mobile_no: decrypt(patient.mobile_no),
      email: decrypt(patient.email),
      effective_date: patient.effective_date,
    }));

    logger.info(`Fetched ${decryptedPatients.length} patients`);
    res.status(200).json(decryptedPatients);
  } catch (error) {
    logger.error('All patients fetch error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch patients' });
  }
});

function calculateAge(birthdate) {
  try {
    const today = new Date();
    const birth = new Date(birthdate);
    const age = Math.floor((today - birth) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= 0 ? age : 0;
  } catch (error) {
    logger.warn(`Invalid birthdate: ${birthdate}`);
    return 0;
  }
}

// Update profile
router.put(
  '/profile',
  isAuthenticated,
  applyRateLimiter(rateLimiters.profileUpdate),
  [
    body('fullName').isLength({ min: 2, max: 100 }).trim().escape(),
    body('dob').isISO8601().toDate(),
    body('gender').isIn(['male', 'female', 'other']),
    body('address').isLength({ max: 200 }).trim().escape(),
    body('phone').isMobilePhone('any').trim(),
    body('email').isEmail().normalizeEmail(),
    body('religion').optional().isLength({ max: 50 }).trim().escape(),
    body('nationality').optional().isLength({ max: 50 }).trim().escape(),
    body('homeNumber').optional().isLength({ max: 20 }).trim().escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Profile update validation errors:', errors.array());
      return res.status(400).json({ error: 'invalid_data', message: errors.array()[0].msg });
    }
    try {
      const userId = req.session.userId;
      const { fullName, dob, gender, address, religion, nationality, homeNumber, phone, email } = req.body;

      const [first_name, ...lastNameParts] = fullName.trim().split(/\s+/);
      const last_name = lastNameParts.join(' ');

      const encryptedData = {
        first_name: encrypt(first_name),
        last_name: encrypt(last_name),
        birthdate: encrypt(dob),
        sex: gender === 'male' ? 'M' : gender === 'female' ? 'F' : 'O',
        home_address: encrypt(address),
        religion: religion && religion !== 'N/A' ? encrypt(religion) : null,
        nationality: nationality && nationality !== 'N/A' ? encrypt(nationality) : null,
        home_no: homeNumber && homeNumber !== 'N/A' ? encrypt(homeNumber) : null,
        mobile_no: encrypt(phone),
        email: encrypt(email.toLowerCase()),
      };

      const { data, error } = await supabase
        .from('patients')
        .update(encryptedData)
        .eq('id', userId)
        .select('id')
        .single();

      if (error) throw error;

      const io = req.app.get('socketio');
      socketHandlers.profileUpdate(io, { userId, fullName, email });

      logger.info(`Profile updated for userId: ${userId}`);
      res.status(200).json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
      logger.error('Profile update error:', error);
      res.status(500).json({ error: 'server_error', message: 'Failed to update profile' });
    }
  }
);

// Update settings
router.put('/settings', isAuthenticated, async (req, res) => {
  try {
    logger.info(`Settings update for userId: ${req.session.userId}`);
    res.status(200).json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    logger.error('Settings update error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to save settings' });
  }
});

// Change password
router.put(
  '/change-password',
  isAuthenticated,
  applyRateLimiter(rateLimiters.changePassword),
  [
    body('currentPassword').notEmpty().trim(),
    body('newPassword')
      .isLength({ min: 8, max: 100 })
      .matches(/[0-9]/)
      .matches(/[!@#$%^&*]/)
      .matches(/[A-Z]/)
      .matches(/[a-z]/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Password change validation errors:', errors.array());
      return res.status(400).json({ error: 'invalid_data', message: errors.array()[0].msg });
    }
    try {
      const userId = req.session.userId;
      const { currentPassword, newPassword } = req.body;

      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('password')
        .eq('id', userId)
        .single();

      if (fetchError) throw fetchError;
      if (!userData) {
        logger.warn(`User not found: userId ${userId}`);
        return res.status(404).json({ error: 'not_found', message: 'User not found' });
      }

      const passwordMatch = await bcrypt.compare(currentPassword, userData.password);
      if (!passwordMatch) {
        logger.warn(`Incorrect password for userId: ${userId}`);
        return res.status(401).json({ error: 'invalid_password', message: 'Current password is incorrect' });
      }

      if (await bcrypt.compare(newPassword, userData.password)) {
        logger.warn(`New password same as current: userId ${userId}`);
        return res.status(400).json({ error: 'invalid_password', message: 'New password must be different' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashedPassword })
        .eq('id', userId);

      if (updateError) throw updateError;

      const io = req.app.get('socketio');
      socketHandlers.passwordChange(io, { userId });

      await new Promise((resolve, reject) => {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Session destroy error:', err);
            reject(err);
            return;
          }
          resolve();
        });
      });

      logger.info(`Password changed for userId: ${userId}`);
      res.status(200).json({ success: true, message: 'Password changed successfully. Please log in again.' });
    } catch (error) {
      logger.error('Password change error:', error);
      res.status(500).json({ error: 'server_error', message: 'Failed to change password' });
    }
  }
);

// Fetch admin profile
router.get('/admin-profile', isAuthenticated, applyRateLimiter(rateLimiters.adminProfile), async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!(await isAdmin(userId))) {
      logger.warn(`Non-admin access attempt: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    }

    const { data, error } = await supabase
      .from('admin')
      .select('username, email')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (!data) {
      logger.warn(`Admin profile not found: userId ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'Admin profile not found' });
    }

    logger.info(`Admin profile fetched: userId ${userId}`);
    res.status(200).json({
      username: data.username,
      email: decrypt(data.email) || 'Not provided',
    });
  } catch (error) {
    logger.error('Admin profile fetch error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch admin profile' });
  }
});

// Update admin account
router.put(
  '/admin-update',
  isAuthenticated,
  applyRateLimiter(rateLimiters.adminUpdate),
  [
    body('username').isAlphanumeric('en-US', { ignore: '_-' }).isLength({ min: 3, max: 50 }).trim().escape(),
    body('currentPassword').notEmpty().trim(),
    body('newPassword')
      .isLength({ min: 8, max: 100 })
      .matches(/[0-9]/)
      .matches(/[!@#$%^&*]/)
      .matches(/[A-Z]/)
      .matches(/[a-z]/),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Admin update validation errors:', errors.array());
      return res.status(400).json({ error: 'invalid_data', message: errors.array()[0].msg });
    }
    try {
      const userId = req.session.userId;
      if (!(await isAdmin(userId))) {
        logger.warn(`Non-admin access attempt: userId ${userId}`);
        return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
      }

      const { username, currentPassword, newPassword } = req.body;

      const { data: adminData, error: fetchError } = await supabase
        .from('admin')
        .select('username, password')
        .eq('id', userId)
        .single();

      if (fetchError) throw fetchError;
      if (!adminData) {
        logger.warn(`Admin not found: userId ${userId}`);
        return res.status(404).json({ error: 'not_found', message: 'Admin not found' });
      }

      const passwordMatch = await bcrypt.compare(currentPassword, adminData.password);
      if (!passwordMatch) {
        logger.warn(`Incorrect password for admin: userId ${userId}`);
        return res.status(401).json({ error: 'invalid_password', message: 'Current password is incorrect' });
      }

      if (await bcrypt.compare(newPassword, adminData.password)) {
        logger.warn(`New password same as current: userId ${userId}`);
        return res.status(400).json({ error: 'invalid_password', message: 'New password must be different' });
      }

      if (username !== adminData.username) {
        const { data: adminCheck, error: adminError } = await supabase
          .from('admin')
          .select('id')
          .eq('username', username);
        const { data: userCheck, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('username', username);
        if (adminError || userError) throw adminError || userError;
        if ((adminCheck && adminCheck.length > 0) || (userCheck && userCheck.length > 0)) {
          logger.warn(`Username taken: ${username}`);
          return res.status(400).json({ error: 'username_exists', message: 'Username is already taken' });
        }
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const { error: updateError } = await supabase
        .from('admin')
        .update({ username, password: hashedPassword })
        .eq('id', userId);

      if (updateError) throw updateError;

      const io = req.app.get('socketio');
      socketHandlers.adminUpdate(io, { userId, username });

      await new Promise((resolve, reject) => {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Session destroy error:', err);
            reject(err);
            return;
          }
          resolve();
        });
      });

      logger.info(`Admin updated: userId ${userId}`);
      res.status(200).json({ success: true, message: 'Account updated successfully. Please log in again.' });
    } catch (error) {
      logger.error('Admin update error:', error);
      res.status(500).json({ error: 'server_error', message: 'Failed to update account' });
    }
  }
);

// Error handling middleware
router.use((err, req, res, next) => {
  logger.error('Route error:', { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Shutting down Redis connection');
  redis.quit(() => {
    logger.info('Redis connection closed');
    process.exit(0);
  });
});

module.exports = {
  router,
  ...socketHandlers,
};