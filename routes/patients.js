const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible'); // Upgraded rate limiting
const validator = require('validator'); // Added for input validation
const helmet = require('helmet'); // Added for security headers
const winston = require('winston'); // Added for structured logging

require('dotenv').config();

// Initialize router
router.use(express.json({ limit: '10kb' })); // Limit payload size for security

// Validate critical environment variables
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

// Initialize Redis with enhanced configuration
const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 10,
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Encryption setup with AES-256-GCM for authenticated encryption
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommends 12 bytes
const AUTH_TAG_LENGTH = 16;

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const encryptionKey = Buffer.from(ENCRYPTION_KEY, 'hex');
if (encryptionKey.length !== 32) {
  logger.error(`Invalid ENCRYPTION_KEY length: expected 32 bytes, got ${encryptionKey.length}`);
  process.exit(1);
}
logger.info('Encryption key initialized successfully');

// Encryption functions
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

// Rate limiters using RateLimiterRedis
const checkUsernameLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:username',
  points: 50, // 50 requests per hour
  duration: 60 * 60,
  blockDuration: 60 * 60,
});

const registrationLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:register',
  points: 5, // 5 requests per hour
  duration: 60 * 60,
  blockDuration: 60 * 60,
});

const profileGetLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:profile:get',
  points: 100, // 100 requests per 15 minutes
  duration: 15 * 60,
  blockDuration: 15 * 60,
  keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
});

const profileUpdateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:profile:update',
  points: 10, // 10 requests per hour
  duration: 60 * 60,
  blockDuration: 60 * 60,
  keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
});

const allPatientsLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:allpatients',
  points: 50, // 50 requests per hour
  duration: 60 * 60,
  blockDuration: 60 * 60,
  keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
});

const changePasswordLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:password',
  points: 5, // 5 requests per hour
  duration: 60 * 60,
  blockDuration: 60 * 60,
  keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
});

const adminProfileLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:adminprofile',
  points: 100, // 100 requests per 15 minutes
  duration: 15 * 60,
  blockDuration: 15 * 60,
  keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
});

const adminUpdateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:adminupdate',
  points: 5, // 5 requests per hour
  duration: 60 * 60,
  blockDuration: 60 * 60,
  keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
});

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
      message: error.message || 'Too many requests, please try again later',
    });
  }
};

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.isLoggedIn || !req.session.userId) {
    logger.warn(`Unauthorized access attempt: ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'unauthorized', message: 'You must be logged in to perform this action' });
  }
  next();
};

// Check if user is admin
const isAdmin = async (userId) => {
  const { data, error } = await supabase
    .from('admin')
    .select('id')
    .eq('id', userId)
    .single();
  return !error && data;
};

// Socket.IO handlers
const handlePatientRegistration = (io, data) => {
  try {
    logger.info('Emitting patient registration via Socket.IO:', data);
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
    logger.error('Error in patient registration handler:', error);
  }
};

const handleProfileUpdate = (io, data) => {
  try {
    logger.info('Emitting profile update via Socket.IO:', data);
    io.emit('profile_update', {
      patient: {
        id: data.userId,
        full_name: data.fullName,
        email: data.email,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error in profile update handler:', error);
  }
};

const handlePasswordChange = (io, data) => {
  try {
    logger.info('Emitting password change via Socket.IO:', data);
    io.emit('password_change', {
      userId: data.userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error in password change handler:', error);
  }
};

const handleAdminUpdate = (io, data) => {
  try {
    logger.info('Emitting admin account update via Socket.IO:', data);
    io.emit('admin_update', {
      userId: data.userId,
      username: data.username,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error in admin account update handler:', error);
  }
};

// Username availability check endpoint (public)
router.get('/check-username', applyRateLimiter(checkUsernameLimiter), async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || !validator.isAlphanumeric(username, 'en-US', { ignore: '_-' }) || !validator.isLength(username, { min: 3, max: 50 })) {
      logger.warn(`Invalid username parameter: ${username}`);
      return res.status(400).json({ error: 'invalid_request', message: 'Username must be 3-50 alphanumeric characters' });
    }
    logger.info(`Checking username availability: ${username}`);
    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', username);
    if (error) throw error;
    const exists = data && data.length > 0;
    logger.info(`Username exists: ${exists}`);
    res.status(200).json({ exists });
  } catch (error) {
    logger.error('Error in check-username:', error);
    res.status(500).json({ error: 'server_error', message: 'Internal server error' });
  }
});

// Full patient registration endpoint (public)
router.post('/', applyRateLimiter(registrationLimiter), async (req, res) => {
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

    // Validate required fields
    const requiredFields = { username, password, last_name, first_name, birthdate, sex, home_address, mobile_no, email };
    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        logger.warn(`Missing required field: ${key}`);
        return res.status(400).json({ error: 'missing_fields', message: `${key} is required` });
      }
    }

    // Validate data types and formats
    if (!validator.isAlphanumeric(username, 'en-US', { ignore: '_-' }) || !validator.isLength(username, { min: 3, max: 50 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Username must be 3-50 alphanumeric characters' });
    }
    if (!validator.isLength(password, { min: 8, max: 100 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Password must be 8-100 characters' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'invalid_data', message: 'Invalid email format' });
    }
    if (!['M', 'F'].includes(sex)) {
      return res.status(400).json({ error: 'invalid_data', message: 'Sex must be M or F' });
    }
    if (!validator.isISO8601(birthdate)) {
      return res.status(400).json({ error: 'invalid_data', message: 'Invalid birthdate format' });
    }
    if (!validator.isMobilePhone(mobile_no, 'any')) {
      return res.status(400).json({ error: 'invalid_data', message: 'Invalid mobile number' });
    }
    if (middle_name && !validator.isLength(middle_name, { max: 50 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Middle name too long' });
    }
    if (nickname && !validator.isLength(nickname, { max: 50 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Nickname too long' });
    }
    if (religion && !validator.isLength(religion, { max: 50 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Religion too long' });
    }
    if (nationality && !validator.isLength(nationality, { max: 50 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Nationality too long' });
    }
    if (!validator.isLength(home_address, { max: 200 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Home address too long' });
    }
    if (home_no && !validator.isLength(home_no, { max: 20 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Home number too long' });
    }
    if (occupation && !validator.isLength(occupation, { max: 100 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Occupation too long' });
    }
    if (office_no && !validator.isLength(office_no, { max: 20 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Office number too long' });
    }
    if (dental_insurance && !validator.isLength(dental_insurance, { max: 100 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Dental insurance too long' });
    }
    if (fax_no && !validator.isLength(fax_no, { max: 20 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Fax number too long' });
    }

    // Check for existing username
    const { data: usernameCheck, error: usernameCheckError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username);
    if (usernameCheckError) throw usernameCheckError;
    if (usernameCheck && usernameCheck.length > 0) {
      logger.warn(`Username already exists: ${username}`);
      return res.status(400).json({ error: 'username_exists', message: 'Username already exists' });
    }

    // Check for existing email
    const emailToCheck = email.toLowerCase();
    const { data: emailCheck, error: emailCheckError } = await supabase
      .from('patients')
      .select('email');
    if (emailCheckError) throw emailCheckError;
    for (const patient of emailCheck) {
      if (patient.email) {
        const decryptedEmail = decrypt(patient.email);
        if (decryptedEmail === emailToCheck) {
          logger.warn(`Email already exists: ${emailToCheck}`);
          return res.status(400).json({ error: 'email_exists', message: 'Email already exists' });
        }
      }
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

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

    // Insert user into users table
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

    // Insert patient into patients table
    const { data: patientData, error: patientError } = await supabase
      .from('patients')
      .insert([
        {
          id: userData.id,
          ...encryptedData,
          effective_date: new Date().toISOString(),
        },
      ])
      .select('id')
      .single();
    if (patientError) {
      logger.error('Patient insertion error:', patientError);
      // Rollback user insertion
      await supabase.from('users').delete().eq('id', userData.id);
      if (patientError.code === '23505') {
        return res.status(400).json({ error: 'email_exists', message: 'Email already exists' });
      }
      throw patientError;
    }

    // Emit Socket.IO event
    const io = req.app.get('socketio');
    handlePatientRegistration(io, {
      patient_id: patientData.id,
      first_name,
      last_name,
      email: emailToCheck,
    });

    logger.info(`Patient registered successfully: userId ${userData.id}`);
    res.status(201).json({ success: true, message: 'Patient registered successfully', patient_id: patientData.id });
  } catch (error) {
    logger.error('Error registering patient:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to register patient' });
  }
});

// Fetch profile data (protected)
router.get('/profile', isAuthenticated, applyRateLimiter(profileGetLimiter), async (req, res) => {
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

    logger.info(`Profile data retrieved for userId: ${userId}`);
    res.status(200).json(profileData);
  } catch (error) {
    logger.error('Error fetching profile:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch profile' });
  }
});

// Fetch all patients (protected, admin-only)
router.get('/allPatients', isAuthenticated, applyRateLimiter(allPatientsLimiter), async (req, res) => {
  try {
    const userId = req.session.userId;
    logger.info(`Fetching all patients for userId: ${userId}`);

    if (!(await isAdmin(userId))) {
      logger.warn(`Non-admin attempted to fetch all patients: userId ${userId}`);
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
    logger.error('Error fetching all patients:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch patients' });
  }
});

// Helper function to calculate age
function calculateAge(birthdate) {
  try {
    const today = new Date();
    const birth = new Date(birthdate);
    const age = Math.floor((today - birth) / (365.25 * 24 * 60 * 60 * 1000));
    return age >= 0 ? age : 0;
  } catch (error) {
    logger.warn(`Invalid birthdate for age calculation: ${birthdate}`);
    return 0;
  }
}

// Update profile (protected)
router.put('/profile', isAuthenticated, applyRateLimiter(profileUpdateLimiter), async (req, res) => {
  try {
    const userId = req.session.userId;
    const { fullName, dob, gender, address, religion, nationality, homeNumber, phone, email } = req.body;

    // Validate inputs
    if (!fullName || !dob || !gender || !address || !phone || !email) {
      logger.warn(`Missing required fields for profile update: userId ${userId}`);
      return res.status(400).json({ error: 'missing_fields', message: 'All required fields must be provided' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'invalid_data', message: 'Invalid email format' });
    }
    if (!validator.isISO8601(dob)) {
      return res.status(400).json({ error: 'invalid_data', message: 'Invalid date of birth format' });
    }
    if (!['male', 'female', 'other'].includes(gender)) {
      return res.status(400).json({ error: 'invalid_data', message: 'Invalid gender' });
    }
    if (!validator.isMobilePhone(phone, 'any')) {
      return res.status(400).json({ error: 'invalid_data', message: 'Invalid phone number' });
    }
    if (!validator.isLength(fullName, { min: 2, max: 100 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Full name must be 2-100 characters' });
    }
    if (!validator.isLength(address, { max: 200 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Address too long' });
    }
    if (religion && !validator.isLength(religion, { max: 50 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Religion too long' });
    }
    if (nationality && !validator.isLength(nationality, { max: 50 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Nationality too long' });
    }
    if (homeNumber && !validator.isLength(homeNumber, { max: 20 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Home number too long' });
    }

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

    // Emit Socket.IO event
    const io = req.app.get('socketio');
    handleProfileUpdate(io, { userId, fullName, email });

    logger.info(`Profile updated for userId: ${userId}`);
    res.status(200).json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    logger.error('Error updating profile:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to update profile' });
  }
});

// Update settings (protected, placeholder)
router.put('/settings', isAuthenticated, async (req, res) => {
  try {
    logger.info(`Settings update received for userId: ${req.session.userId}`);
    res.status(200).json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    logger.error('Error saving settings:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to save settings' });
  }
});

// Change password (protected)
router.put('/change-password', isAuthenticated, applyRateLimiter(changePasswordLimiter), async (req, res) => {
  try {
    const userId = req.session.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      logger.warn(`Missing password fields for userId: ${userId}`);
      return res.status(400).json({ error: 'missing_fields', message: 'Current and new passwords are required' });
    }

    // Validate new password
    const passwordErrors = [];
    if (!validator.isLength(newPassword, { min: 8, max: 100 })) {
      passwordErrors.push('Password must be 8-100 characters long');
    }
    if (!/[0-9]/.test(newPassword)) {
      passwordErrors.push('Password must include at least one number');
    }
    if (!/[!@#$%^&*]/.test(newPassword)) {
      passwordErrors.push('Password must include at least one special character');
    }
    if (!/[A-Z]/.test(newPassword)) {
      passwordErrors.push('Password must include at least one uppercase letter');
    }
    if (!/[a-z]/.test(newPassword)) {
      passwordErrors.push('Password must include at least one lowercase letter');
    }
    if (passwordErrors.length > 0) {
      logger.warn(`Invalid new password for userId: ${userId}`);
      return res.status(400).json({ error: 'invalid_password', message: 'Password does not meet security requirements', details: passwordErrors });
    }

    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('password')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;
    if (!userData) {
      logger.warn(`User not found for userId: ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'User not found' });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, userData.password);
    if (!passwordMatch) {
      logger.warn(`Incorrect current password for userId: ${userId}`);
      return res.status(401).json({ error: 'invalid_password', message: 'Current password is incorrect' });
    }

    if (await bcrypt.compare(newPassword, userData.password)) {
      logger.warn(`New password same as current for userId: ${userId}`);
      return res.status(400).json({ error: 'invalid_password', message: 'New password must not be the same as the current password' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const { error: updateError } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', userId);

    if (updateError) throw updateError;

    // Emit Socket.IO event
    const io = req.app.get('socketio');
    handlePasswordChange(io, { userId });

    // Destroy session
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Error destroying session:', err);
          reject(err);
          return;
        }
        resolve();
      });
    });

    logger.info(`Password changed for userId: ${userId}`);
    res.status(200).json({ success: true, message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    logger.error('Error changing password:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to change password' });
  }
});

// Fetch admin profile (protected, admin-specific)
router.get('/admin-profile', isAuthenticated, applyRateLimiter(adminProfileLimiter), async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!(await isAdmin(userId))) {
      logger.warn(`Non-admin attempted to fetch admin profile: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    }

    const { data, error } = await supabase
      .from('admin')
      .select('username, email')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (!data) {
      logger.warn(`Admin profile not found for userId: ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'Admin profile not found' });
    }

    logger.info(`Admin profile fetched for userId: ${userId}`);
    res.status(200).json({
      username: data.username,
      email: decrypt(data.email) || 'Not provided',
    });
  } catch (error) {
    logger.error('Error fetching admin profile:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to fetch admin profile' });
  }
});

// Update admin account (protected, admin-specific)
router.put('/admin-update', isAuthenticated, applyRateLimiter(adminUpdateLimiter), async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!(await isAdmin(userId))) {
      logger.warn(`Non-admin attempted to update admin account: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'Admin access required' });
    }

    const { username, currentPassword, newPassword } = req.body;

    if (!username || !currentPassword || !newPassword) {
      logger.warn(`Missing fields for admin update: userId ${userId}`);
      return res.status(400).json({ error: 'missing_fields', message: 'All fields are required' });
    }

    if (!validator.isAlphanumeric(username, 'en-US', { ignore: '_-' }) || !validator.isLength(username, { min: 3, max: 50 })) {
      return res.status(400).json({ error: 'invalid_data', message: 'Username must be 3-50 alphanumeric characters' });
    }

    // Validate new password
    const passwordErrors = [];
    if (!validator.isLength(newPassword, { min: 8, max: 100 })) {
      passwordErrors.push('Password must be 8-100 characters long');
    }
    if (!/[0-9]/.test(newPassword)) {
      passwordErrors.push('Password must include at least one number');
    }
    if (!/[!@#$%^&*]/.test(newPassword)) {
      passwordErrors.push('Password must include at least one special character');
    }
    if (!/[A-Z]/.test(newPassword)) {
      passwordErrors.push('Password must include at least one uppercase letter');
    }
    if (!/[a-z]/.test(newPassword)) {
      passwordErrors.push('Password must include at least one lowercase letter');
    }
    if (passwordErrors.length > 0) {
      logger.warn(`Invalid new password for admin userId: ${userId}`);
      return res.status(400).json({ error: 'invalid_password', message: 'Password does not meet security requirements', details: passwordErrors });
    }

    // Fetch current admin data
    const { data: adminData, error: fetchError } = await supabase
      .from('admin')
      .select  .select('username, password')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;
    if (!adminData) {
      logger.warn(`Admin not found for userId: ${userId}`);
      return res.status(404).json({ error: 'not_found', message: 'Admin not found' });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, adminData.password);
    if (!passwordMatch) {
      logger.warn(`Incorrect current password for admin userId: ${userId}`);
      return res.status(401).json({ error: 'invalid_password', message: 'Current password is incorrect' });
    }

    if (await bcrypt.compare(newPassword, adminData.password)) {
      logger.warn(`New password same as current for admin userId: ${userId}`);
      return res.status(400).json({ error: 'invalid_password', message: 'New password must not be the same as the current password' });
    }

    // Check if username is taken
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
        logger.warn(`Username already taken: ${username}`);
        return res.status(400).json({ error: 'username_exists', message: 'Username is already taken' });
      }
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update admin data
    const { error: updateError } = await supabase
      .from('admin')
      .update({ username, password: hashedPassword })
      .eq('id', userId);

    if (updateError) throw updateError;

    // Emit Socket.IO event
    const io = req.app.get('socketio');
    handleAdminUpdate(io, { userId, username });

    // Destroy session
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) {
          logger.error('Error destroying session:', err);
          reject(err);
          return;
        }
        resolve();
      });
    });

    logger.info(`Admin account updated for userId: ${userId}`);
    res.status(200).json({ success: true, message: 'Account updated successfully. Please log in again.' });
  } catch (error) {
    logger.error('Error updating admin account:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to update account' });
  }
});

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

// Error handling middleware
router.use((err, req, res, next) => {
  logger.error('Route error:', { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server' });
});

// Graceful shutdown for Redis
process.on('SIGTERM', () => {
  logger.info('Shutting down Redis connection');
  redis.quit(() => {
    logger.info('Redis connection closed');
    process.exit(0);
  });
});

module.exports = {
  router,
  handlePatientRegistration,
  handleProfileUpdate,
  handlePasswordChange,
  handleAdminUpdate,
};