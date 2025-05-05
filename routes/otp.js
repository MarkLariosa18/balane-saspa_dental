const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');
const RateLimitRedisStore = require('rate-limit-redis');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const helmet = require('helmet');
const winston = require('winston');
const sanitizeHtml = require('sanitize-html');

require('dotenv').config();

// Initialize router
const router = express.Router();

// Validate critical environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'ENCRYPTION_KEY', 'EMAIL_USER', 'EMAIL_PASSWORD', 'REDIS_URL', 'NODE_ENV'];
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

// Initialize Redis (shared with server.js, but included for completeness)
const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 10,
});

// Handle Redis errors
redis.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// Validate encryption key
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const encryptionKey = Buffer.from(ENCRYPTION_KEY, 'hex');
if (encryptionKey.length !== 32) {
  logger.error(`Invalid ENCRYPTION_KEY length: expected 32 bytes, got ${encryptionKey.length}`);
  process.exit(1);
}
logger.info('Encryption key initialized');

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

// Configure nodemailer with secure options
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
  pool: true,
  maxConnections: 5,
  rateLimit: 14,
  rateDelta: 1000,
  secure: true,
});

// Monitor nodemailer errors
transporter.on('error', (error) => {
  logger.error('Nodemailer error:', error);
});

// Verify email transporter on startup
transporter.verify((error, success) => {
  if (error) {
    logger.error('Email transporter verification failed:', error);
    process.exit(1);
  }
  logger.info('Email transporter verified successfully');
});

// Rate limiters with rate-limit-redis
const createRateLimiter = (prefix, windowMs, max, message) =>
  rateLimit({
    store: new RateLimitRedisStore.default({
      sendCommand: (...args) => redis.call(...args),
      prefix: `ratelimit:${prefix}`,
    }),
    windowMs,
    max,
    message: { error: 'too_many_requests', message },
    standardHeaders: true,
    legacyHeaders: false,
  });

const sendEmailRateLimiter = createRateLimiter('otp:sendEmail:', 15 * 60 * 1000, 5, 'Too many contact form submissions. Try again later.');
const otpRateLimiter = createRateLimiter('otp:request:', 15 * 60 * 1000, 5, 'Too many OTP requests. Try again later.');
const verifyOtpRateLimiter = createRateLimiter('otp:verify:', 15 * 60 * 1000, 10, 'Too many OTP verification attempts. Try again later.');

// Middleware for authentication
const isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.isLoggedIn || !req.session.userId) {
    logger.warn(`Unauthorized access attempt: ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'unauthorized', message: 'You must be logged in to perform this action' });
  }
  next();
};

// Generate OTP
const OTP_LENGTH = 6;
function generateOTP() {
  return Math.floor(Math.pow(10, OTP_LENGTH - 1) + Math.random() * 9 * Math.pow(10, OTP_LENGTH - 1)).toString();
}

// Reusable OTP email template
function createOtpEmailTemplate(otp, subject, greeting, actionText) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
      <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
      <p>${greeting},</p>
      <p>${actionText}</p>
      <div style="text-align: center; margin: 30px 0;">
        <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background-color: #f5f5f5; padding: 15px; border-radius: 5px;">${otp}</div>
      </div>
      <p>This code expires in 15 minutes. If you did not request this change, please contact support.</p>
      <p>Best regards,<br>Balane-Saspa Dental Clinic Team</p>
    </div>
  `;
}

// Contact Us form submission route
router.post('/send-email', sendEmailRateLimiter, async (req, res) => {
  const { name, email, subject, message, _csrf } = req.body;

  // Validate CSRF token
  if (!_csrf || req.csrfToken() !== _csrf) {
    logger.warn('Invalid CSRF token in contact form submission', { ip: req.ip });
    return res.status(403).json({ success: false, error: 'csrf_error', message: 'Invalid CSRF token.' });
  }

  // Validate required fields
  if (!name || !email || !subject || !message) {
    logger.warn('Contact form submission with missing fields', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  // Normalize and validate email
  const emailToCheck = validator.normalizeEmail(email);
  if (!emailToCheck || !validator.isEmail(emailToCheck)) {
    logger.warn(`Invalid email in contact form: ${email}`, { ip: req.ip });
    return res.status(400).json({ success: false, message: 'Invalid email address.' });
  }

  // Sanitize inputs to prevent XSS or injection
  const cleanName = sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} });
  const cleanSubject = sanitizeHtml(subject, { allowedTags: [], allowedAttributes: {} });
  const cleanMessage = sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} });

  // Validate sanitized inputs
  if (!cleanName || !cleanSubject || !cleanMessage) {
    logger.warn('Invalid sanitized input in contact form', { ip: req.ip });
    return res.status(400).json({ success: false, message: 'Invalid input provided.' });
  }

  // Email options
  const mailOptions = {
    from: `"Balane-Saspa Dental Clinic" <${process.env.EMAIL_USER}>`,
    to: 'dmdannsaspa@yahoo.com',
    replyTo: emailToCheck,
    subject: `Contact Form: ${cleanSubject}`,
    text: `
      Name: ${cleanName}
      Email: ${emailToCheck}
      Subject: ${cleanSubject}
      Message: ${cleanMessage}
    `,
    html: `
      <h3>New Contact Form Submission</h3>
      <p><strong>Name:</strong> ${cleanName}</p>
      <p><strong>Email:</strong> ${emailToCheck}</p>
      <p><strong>Subject:</strong> ${cleanSubject}</p>
      <p><strong>Message:</strong> ${cleanMessage}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Contact form email sent successfully to: dmdannsaspa@yahoo.com`, { email: emailToCheck, ip: req.ip });
    res.status(200).json({ success: true, message: 'Your message has been sent successfully.' });
  } catch (error) {
    logger.error('Error sending contact form email:', { error: error.message, email: emailToCheck, ip: req.ip });
    res.status(500).json({ success: false, message: 'Failed to send your message. Please try again later.' });
  }
});

// Send OTP route for signup
router.post('/send-otp', otpRateLimiter, async (req, res) => {
  try {
    const { email, _csrf } = req.body;

    // Validate CSRF token
    if (!_csrf || req.csrfToken() !== _csrf) {
      logger.warn('Invalid CSRF token in OTP request', { ip: req.ip });
      return res.status(403).json({ error: 'csrf_error', message: 'Invalid CSRF token.' });
    }

    // Validate email
    if (!email || !validator.isEmail(email)) {
      logger.warn(`Invalid email for OTP request: ${email}`);
      return res.status(400).json({ error: 'invalid_email', message: 'Please provide a valid email address' });
    }

    const emailToCheck = validator.normalizeEmail(email);

    // Check if email exists in the database
    const { data, error } = await supabase
      .from('patients')
      .select('email');

    if (error) {
      logger.error('Supabase error fetching emails:', error);
      return res.status(500).json({ error: 'database_error', message: 'Error checking email in database' });
    }

    for (const patient of data) {
      if (patient.email) {
        let decryptedEmail;
        try {
          decryptedEmail = decrypt(patient.email);
          if (!decryptedEmail || decryptedEmail === patient.email) {
            logger.warn(`Failed to decrypt email for patient: ${patient.email}`);
            continue;
          }
          if (decryptedEmail === emailToCheck) {
            logger.warn(`Email already exists for signup OTP: ${emailToCheck}`);
            return res.status(400).json({ error: 'email_exists', message: 'Email already exists in our system' });
          }
        } catch (err) {
          logger.warn(`Decryption error for patient email: ${patient.email}`);
          continue;
        }
      }
    }

    // Generate and store OTP
    const otp = generateOTP();
    const otpData = {
      otp,
      expiry: Date.now() + 15 * 60 * 1000,
      purpose: 'signup',
    };
    await redis.set(
      `otp:${emailToCheck}`,
      JSON.stringify(otpData),
      'PX',
      15 * 60 * 1000
    );

    // Send email with OTP
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailToCheck,
      subject: 'Balane-Saspa Dental Clinic - Email Verification',
      html: createOtpEmailTemplate(
        otp,
        'Balane-Saspa Dental Clinic - Email Verification',
        'Dear Patient',
        'Thank you for registering with Balane-Saspa Dental Clinic. To complete your registration, please use the following verification code:'
      ),
    };

    await transporter.sendMail(mailOptions);
    logger.info(`OTP sent for signup to: ${emailToCheck}`);
    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    logger.error('Error sending signup OTP:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to send OTP' });
  }
});

// Send OTP route for admin password change
router.post('/send-otp-password-change-admin', otpRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const { _csrf } = req.body;
    const userId = req.session.userId;

    // Validate CSRF token
    if (!_csrf || req.csrfToken() !== _csrf) {
      logger.warn('Invalid CSRF token in admin OTP request', { ip: req.ip });
      return res.status(403).json({ error: 'csrf_error', message: 'Invalid CSRF token.' });
    }

    // Verify the user is an admin
    const { data: adminData, error: adminError } = await supabase
      .from('admin')
      .select('id')
      .eq('id', userId)
      .single();

    if (adminError || !adminData) {
      logger.warn(`Unauthorized admin OTP request: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'You are not authorized to perform this action' });
    }

    // Use admin email from environment
    const email = process.env.EMAIL_USER;
    if (!email) {
      logger.error('Admin email not configured in environment variables');
      return res.status(500).json({ error: 'server_error', message: 'Admin email not configured' });
    }

    const emailToCheck = validator.normalizeEmail(email);
    const otp = generateOTP();

    // Store OTP in Redis
    const otpData = {
      otp,
      expiry: Date.now() + 15 * 60 * 1000,
      purpose: 'password_change_admin',
    };
    await redis.set(
      `otp:${emailToCheck}`,
      JSON.stringify(otpData),
      'PX',
      15 * 60 * 1000
    );

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailToCheck,
      subject: 'Balane-Saspa Dental Clinic - Admin Password Change Verification',
      html: createOtpEmailTemplate(
        otp,
        'Balane-Saspa Dental Clinic - Admin Password Change Verification',
        'Dear Admin',
        'We received a request to change your password. Please use the following OTP to verify your request:'
      ),
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Admin password change OTP sent to: ${emailToCheck}`);
    res.status(200).json({ success: true, message: 'OTP sent successfully to admin email' });
  } catch (error) {
    logger.error('Error sending admin password change OTP:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to send OTP for admin password change' });
  }
});

// Send OTP route for user (patient) password change
router.post('/send-otp-password-change-user', otpRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const { _csrf } = req.body;
    const userId = req.session.userId;

    // Validate CSRF token
    if (!_csrf || req.csrfToken() !== _csrf) {
      logger.warn('Invalid CSRF token in user OTP request', { ip: req.ip });
      return res.status(403).json({ error: 'csrf_error', message: 'Invalid CSRF token.' });
    }

    // Fetch user email from patients table
    const { data: userData, error: userError } = await supabase
      .from('patients')
      .select('email')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      logger.warn(`User not found for OTP request: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'You are not authorized to perform this action' });
    }

    // Verify the user is a patient
    const { data: patientData, error: patientError } = await supabase
      .from('patients')
      .select('id')
      .eq('id', userId)
      .single();

    if (patientError || !patientData) {
      logger.warn(`Patient not found for OTP request: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'You are not authorized to perform this action' });
    }

    const email = decrypt(userData.email);
    if (!email || !validator.isEmail(email)) {
      logger.error(`Invalid or missing email for userId ${userId}`);
      return res.status(500).json({ error: 'server_error', message: 'User email not found or decryption failed' });
    }

    const emailToCheck = validator.normalizeEmail(email);
    const otp = generateOTP();

    // Store OTP in Redis
    const otpData = {
      otp,
      expiry: Date.now() + 15 * 60 * 1000,
      purpose: 'password_change_user',
    };
    await redis.set(
      `otp:${emailToCheck}`,
      JSON.stringify(otpData),
      'PX',
      15 * 60 * 1000
    );

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailToCheck,
      subject: 'Balane-Saspa Dental Clinic - Password Change Verification',
      html: createOtpEmailTemplate(
        otp,
        'Balane-Saspa Dental Clinic - Password Change Verification',
        'Dear Patient',
        'We received a request to change your password. Please use the following OTP to verify your request:'
      ),
    };

    await transporter.sendMail(mailOptions);
    logger.info(`User password change OTP sent to: ${emailToCheck}`);
    res.status(200).json({ success: true, message: 'OTP sent successfully to your email' });
  } catch (error) {
    logger.error('Error sending user password change OTP:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to send OTP for user password change' });
  }
});

// Verify OTP route
router.post('/verify-otp', verifyOtpRateLimiter, async (req, res) => {
  try {
    const { email: providedEmail, otp, purpose, _csrf } = req.body;

    // Validate CSRF token
    if (!_csrf || req.csrfToken() !== _csrf) {
      logger.warn('Invalid CSRF token in OTP verification', { ip: req.ip });
      return res.status(403).json({ error: 'csrf_error', message: 'Invalid CSRF token.' });
    }

    // Validate inputs
    if (!otp || !purpose) {
      logger.warn('OTP verification attempt with missing fields');
      return res.status(400).json({ error: 'missing_fields', message: 'OTP and purpose are required' });
    }
    if (!validator.isNumeric(otp) || otp.length !== OTP_LENGTH) {
      logger.warn(`Invalid OTP format: ${otp}`);
      return res.status(400).json({ error: 'invalid_otp', message: `OTP must be a ${OTP_LENGTH}-digit number` });
    }
    if (!['signup', 'password_change_user', 'password_change_admin'].includes(purpose)) {
      logger.warn(`Invalid OTP purpose: ${purpose}`);
      return res.status(400).json({ error: 'invalid_purpose', message: 'Invalid OTP purpose' });
    }

    // Use EMAIL_USER from .env if email is null (for admin)
    const email = providedEmail || process.env.EMAIL_USER;
    if (!email || !validator.isEmail(email)) {
      logger.warn('OTP verification attempt with invalid or missing email');
      return res.status(400).json({ error: 'missing_email', message: 'Valid email is required' });
    }

    const lowerEmail = validator.normalizeEmail(email);
    const storedOTPDataRaw = await redis.get(`otp:${lowerEmail}`);

    if (!storedOTPDataRaw) {
      logger.warn(`No OTP found for email: ${lowerEmail}`);
      return res.status(400).json({ error: 'invalid_otp', message: 'Invalid or expired OTP' });
    }

    const storedOTPData = JSON.parse(storedOTPDataRaw);

    // Check if OTP is expired
    if (Date.now() > storedOTPData.expiry) {
      await redis.del(`otp:${lowerEmail}`);
      logger.warn(`Expired OTP for email: ${lowerEmail}`);
      return res.status(400).json({ error: 'expired_otp', message: 'OTP has expired. Please request a new one' });
    }

    // Check if OTP purpose matches
    if (storedOTPData.purpose !== purpose) {
      logger.warn(`OTP purpose mismatch for email: ${lowerEmail}, expected: ${storedOTPData.purpose}, got: ${purpose}`);
      return res.status(400).json({ error: 'invalid_purpose', message: 'OTP purpose does not match the requested action' });
    }

    // Verify OTP
    if (storedOTPData.otp !== otp) {
      logger.warn(`Invalid OTP for email: ${lowerEmail}`);
      return res.status(400).json({ error: 'invalid_otp', message: 'Invalid OTP' });
    }

    // OTP is valid, remove it from Redis
    await redis.del(`otp:${lowerEmail}`);
    logger.info(`OTP verified successfully for email: ${lowerEmail}, purpose: ${purpose}`);
    res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    logger.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to verify OTP' });
  }
});

// Apply helmet for security headers (redundant with server.js, but kept for completeness)
router.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"],
      styleSrc: ["'self'"],
      connectSrc: ["'self'", "https://www.google.com/recaptcha/"],
    },
  },
}));

// Error handling middleware
router.use((err, req, res, next) => {
  logger.error('Route error:', { error: err.message, stack: err.stack, path: req.path });
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server' });
});

// Graceful shutdown for Redis (handled in server.js, but included for completeness)
process.on('SIGTERM', () => {
  logger.info('Shutting down Redis connection');
  redis.quit(() => {
    logger.info('Redis connection closed');
    process.exit(0);
  });
});

module.exports = {
  otpRoutes: router,
};