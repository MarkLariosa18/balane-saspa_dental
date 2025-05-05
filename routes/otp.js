const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const validator = require('validator');
const helmet = require('helmet');
const sanitizeHtml = require('sanitize-html');
const axios = require('axios');
const csrf = require('csurf');
const cors = require('cors');
const winston = require('winston');

require('dotenv').config();

// Initialize router
const router = express.Router();

// CORS configuration
router.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://balane-saspa-dental-1.onrender.com',
      'https://your-frontend-domain.com', // Replace with actual frontend domain
      'http://localhost:3000',
      'http://localhost:8080',
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  credentials: true,
}));

// CSRF protection middleware
const csrfProtection = csrf({ cookie: { secure: process.env.NODE_ENV === 'production' } });

// Validate critical environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'ENCRYPTION_KEY',
  'EMAIL_USER',
  'EMAIL_PASSWORD',
  'REDIS_URL',
  'NODE_ENV',
  'RECAPTCHA_SECRET_KEY',
  'SESSION_SECRET'
];
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

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
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

// Verify email transporter
transporter.verify((error, success) => {
  if (error) {
    logger.error('Email transporter verification failed:', error);
    process.exit(1);
  }
  logger.info('Email transporter verified successfully');
});

// Rate limiters
const sendEmailRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'otp:sendEmail',
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

const otpRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'otp:request',
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

const verifyOtpRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'otp:verify',
  points: 10,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.isLoggedIn || !req.session.userId) {
    logger.warn(`Unauthorized access attempt: ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'unauthorized', message: 'You must be logged in to perform this action' });
  }
  next();
};

// OTP rate limiter middleware
const applyOtpRateLimiter = async (req, res, next) => {
  const key = req.body.email ? req.body.email.toLowerCase() : req.ip;
  try {
    await otpRateLimiter.consume(key);
    next();
  } catch (error) {
    logger.warn(`OTP request rate limit exceeded for: ${key}`);
    res.status(429).json({
      error: 'too_many_requests',
      message: 'Too many OTP requests, please try again later',
    });
  }
};

const applyVerifyOtpRateLimiter = async (req, res, next) => {
  const key = req.body.email ? req.body.email.toLowerCase() : req.ip;
  try {
    await verifyOtpRateLimiter.consume(key);
    next();
  } catch (error) {
    logger.warn(`OTP verification rate limit exceeded for: ${key}`);
    res.status(429).json({
      error: 'too_many_attempts',
      message: 'Too many OTP verification attempts, please try again later',
    });
  }
};

// Generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// CSRF token endpoint
router.get('/csrf-token', csrfProtection, (req, res) => {
  try {
    const csrfToken = req.csrfToken();
    logger.info('CSRF token generated successfully');
    res.status(200).json({ csrfToken });
  } catch (error) {
    logger.error('Error generating CSRF token:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to generate CSRF token' });
  }
});

// Send email route
router.post('/send-email', csrfProtection, async (req, res) => {
  const { name, email, subject, message, 'g-recaptcha-response': recaptchaResponse } = req.body;

  // Server-side validation
  if (!name || !email || !subject || !message || !recaptchaResponse) {
    logger.warn('Missing required fields in send-email request');
    return res.status(400).json({ success: false, error: 'missing_fields', message: 'All fields are required, including reCAPTCHA.' });
  }

  // Sanitize inputs
  const sanitizedName = sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} });
  const sanitizedEmail = sanitizeHtml(email, { allowedTags: [], allowedAttributes: {} });
  const sanitizedSubject = sanitizeHtml(subject, { allowedTags: [], allowedAttributes: {} });
  const sanitizedMessage = sanitizeHtml(message, { allowedTags: [], allowedAttributes: {} });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitizedEmail)) {
    logger.warn(`Invalid email format: ${sanitizedEmail}`);
    return res.status(400).json({ success: false, error: 'invalid_email', message: 'Invalid email address.' });
  }

  // Apply rate limiter
  const rateLimitKey = sanitizedEmail.toLowerCase();
  try {
    await sendEmailRateLimiter.consume(rateLimitKey);
  } catch (error) {
    logger.warn(`Send email rate limit exceeded for: ${rateLimitKey}`);
    return res.status(429).json({
      success: false,
      error: 'too_many_requests',
      message: 'Too many email submissions. Please try again later.',
    });
  }

  // Verify reCAPTCHA
  try {
    const recaptchaVerifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const response = await axios.post(recaptchaVerifyUrl, null, {
      params: {
        secret: process.env.RECAPTCHA_SECRET_KEY,
        response: recaptchaResponse,
        remoteip: req.ip,
      },
    });

    const { success, 'error-codes': errorCodes } = response.data;

    if (!success) {
      logger.warn(`reCAPTCHA verification failed: ${JSON.stringify(errorCodes)}`);
      return res.status(400).json({
        success: false,
        error: 'recaptcha_error',
        message: 'reCAPTCHA verification failed. Please try again.',
      });
    }
  } catch (error) {
    logger.error('Error verifying reCAPTCHA:', error);
    return res.status(500).json({
      success: false,
      error: 'recaptcha_error',
      message: 'Failed to verify reCAPTCHA. Please try again later.',
    });
  }

  // Email options
  const mailOptions = {
    from: `"Balane-Saspa Dental Clinic" <${process.env.EMAIL_USER}>`,
    to: 'dmdannsaspa@yahoo.com',
    replyTo: sanitizedEmail,
    subject: `Contact Form: ${sanitizedSubject}`,
    text: `
      Name: ${sanitizedName}
      Email: ${sanitizedEmail}
      Subject: ${sanitizedSubject}
      Message: ${sanitizedMessage}
    `,
    html: `
      <h3>New Contact Form Submission</h3>
      <p><strong>Name:</strong> ${sanitizedName}</p>
      <p><strong>Email:</strong> ${sanitizedEmail}</p>
      <p><strong>Subject:</strong> ${sanitizedSubject}</p>
      <p><strong>Message:</strong> ${sanitizedMessage}</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully from: ${sanitizedEmail}`);
    res.status(200).json({ success: true, message: 'Email sent successfully.' });
  } catch (error) {
    logger.error('Error sending email:', error);
    res.status(500).json({ success: false, error: 'server_error', message: 'Failed to send email. Please try again later.' });
  }
});

// Send OTP route for signup
router.post('/send-otp', applyOtpRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validator.isEmail(email)) {
      logger.warn(`Invalid email for OTP request: ${email}`);
      return res.status(400).json({ error: 'invalid_email', message: 'Please provide a valid email address' });
    }

    const emailToCheck = email.toLowerCase();

    const { data, error } = await supabase
      .from('patients')
      .select('email');

    if (error) {
      logger.error('Supabase error fetching emails:', error);
      return res.status(500).json({ error: 'database_error', message: 'Error checking email in database' });
    }

    for (const patient of data) {
      if (patient.email) {
        const decryptedEmail = decrypt(patient.email);
        if (decryptedEmail === emailToCheck) {
          logger.warn(`Email already exists for signup OTP: ${emailToCheck}`);
          return res.status(400).json({ error: 'email_exists', message: 'Email already exists in our system' });
        }
      }
    }

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

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailToCheck,
      subject: 'Balane-Saspa Dental Clinic - Email Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #4154f1;">Balane-Saspa Dental Clinic</h2>
          </div>
          <p>Dear Patient,</p>
          <p>Thank you for registering with Balane-Saspa Dental Clinic. To complete your registration, please use the following verification code:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background-color: #f5f5f5; padding: 15px; border-radius: 5px;">${otp}</div>
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you did not request this verification, please ignore this email.</p>
          <p>Best regards,<br>Balane-Saspa Dental Clinic Team</p>
        </div>
      `,
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
router.post('/send-otp-password-change-admin', applyOtpRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;

    const { data: adminData, error: adminError } = await supabase
      .from('admin')
      .select('id')
      .eq('id', userId)
      .single();

    if (adminError || !adminData) {
      logger.warn(`Unauthorized admin OTP request: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'You are not authorized to perform this action' });
    }

    const email = process.env.EMAIL_USER;
    if (!email) {
      logger.error('Admin email not configured in environment variables');
      return res.status(500).json({ error: 'server_error', message: 'Admin email not configured' });
    }

    const emailToCheck = email.toLowerCase();
    const otp = generateOTP();

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
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
          <p>Dear Admin,</p>
          <p>We received a request to change your password. Please use the following OTP to verify your request:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background-color: #f5f5f5; padding: 15px; border-radius: 5px;">${otp}</div>
          </div>
          <p>This code expires in 15 minutes. If you did not request this change, please contact support.</p>
          <p>Best regards,<br>Balane-Saspa Dental Clinic Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Admin password change OTP sent to: ${emailToCheck}`);
    res.status(200).json({ success: true, message: 'OTP sent successfully to admin email' });
  } catch (error) {
    logger.error('Error sending admin password change OTP:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to send OTP for admin password change' });
  }
});

// Send OTP route for user password change
router.post('/send-otp-password-change-user', applyOtpRateLimiter, isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;

    const { data: userData, error: userError } = await supabase
      .from('patients')
      .select('email')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      logger.warn(`User not found for OTP request: userId ${userId}`);
      return res.status(403).json({ error: 'forbidden', message: 'You are not authorized to perform this action' });
    }

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

    const emailToCheck = email.toLowerCase();
    const otp = generateOTP();

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
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #4154f1; text-align: center;">Balane-Saspa Dental Clinic</h2>
          <p>Dear Patient,</p>
          <p>We received a request to change your password. Please use the following OTP to verify your request:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background-color: #f5f5f5; padding: 15px; border-radius: 5px;">${otp}</div>
          </div>
          <p>This code expires in 15 minutes. If you did not request this change, please contact support.</p>
          <p>Best regards,<br>Balane-Saspa Dental Clinic Team</p>
        </div>
      `,
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
router.post('/verify-otp', applyVerifyOtpRateLimiter, async (req, res) => {
  try {
    const { email: providedEmail, otp, purpose } = req.body;

    if (!otp || !purpose) {
      logger.warn('OTP verification attempt with missing fields');
      return res.status(400).json({ error: 'missing_fields', message: 'OTP and purpose are required' });
    }
    if (!validator.isNumeric(otp) || otp.length !== 6) {
      logger.warn(`Invalid OTP format: ${otp}`);
      return res.status(400).json({ error: 'invalid_otp', message: 'OTP must be a 6-digit number' });
    }
    if (!['signup', 'password_change_user', 'password_change_admin'].includes(purpose)) {
      logger.warn(`Invalid OTP purpose: ${purpose}`);
      return res.status(400).json({ error: 'invalid_purpose', message: 'Invalid OTP purpose' });
    }

    const email = providedEmail || process.env.EMAIL_USER;
    if (!email || !validator.isEmail(email)) {
      logger.warn('OTP verification attempt with invalid or missing email');
      return res.status(400).json({ error: 'missing_email', message: 'Valid email is required' });
    }

    const lowerEmail = email.toLowerCase();
    const storedOTPDataRaw = await redis.get(`otp:${lowerEmail}`);

    if (!storedOTPDataRaw) {
      logger.warn(`No OTP found for email: ${lowerEmail}`);
      return res.status(400).json({ error: 'invalid_otp', message: 'Invalid or expired OTP' });
    }

    const storedOTPData = JSON.parse(storedOTPDataRaw);

    if (Date.now() > storedOTPData.expiry) {
      await redis.del(`otp:${lowerEmail}`);
      logger.warn(`Expired OTP for email: ${lowerEmail}`);
      return res.status(400).json({ error: 'expired_otp', message: 'OTP has expired. Please request a new one' });
    }

    if (storedOTPData.purpose !== purpose) {
      logger.warn(`OTP purpose mismatch for email: ${lowerEmail}, expected: ${storedOTPData.purpose}, got: ${purpose}`);
      return res.status(400).json({ error: 'invalid_purpose', message: 'OTP purpose does not match the requested action' });
    }

    if (storedOTPData.otp !== otp) {
      logger.warn(`Invalid OTP for email: ${lowerEmail}`);
      return res.status(400).json({ error: 'invalid_otp', message: 'Invalid OTP' });
    }

    await redis.del(`otp:${lowerEmail}`);
    logger.info(`OTP verified successfully for email: ${lowerEmail}, purpose: ${purpose}`);
    res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    logger.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to verify OTP' });
  }
});

// Apply helmet
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
  if (err.code === 'EBADCSRFTOKEN') {
    logger.warn(`CSRF token validation failed: ${req.path}`);
    return res.status(403).json({ error: 'invalid_csrf_token', message: 'Invalid CSRF token. Please refresh the page and try again.' });
  }
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
  otpRoutes: router,
};