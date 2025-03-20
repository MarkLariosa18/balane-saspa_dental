// Required packages
const express = require('express');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');

require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Encryption settings
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

if (!ENCRYPTION_KEY) {
  console.error('Missing ENCRYPTION_KEY in environment variables');
  process.exit(1);
}

const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
if (keyBuffer.length !== 32) {
  console.error(`Invalid ENCRYPTION_KEY length: expected 32 bytes (64 hex chars), got ${keyBuffer.length} bytes`);
  process.exit(1);
}

// Decrypt function
function decrypt(text) {
  if (!text) return null;
  const [ivText, encryptedText] = text.split(':');
  if (!ivText || !encryptedText) {
    throw new Error(`Invalid encrypted format: ${text}`);
  }
  const iv = Buffer.from(ivText, 'hex');
  const encrypted = Buffer.from(encryptedText, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Initialize router
const router = express.Router();

// Store OTPs temporarily (in production, consider using Redis)
const otpStore = new Map();

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Rate limiter for OTP requests
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 requests per window
  message: { success: false, error: 'too_many_requests', message: 'Too many OTP requests, please try again later' },
});

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (!req.session.isLoggedIn) {
    return res.status(401).json({ success: false, error: 'unauthorized', message: 'You must be logged in to perform this action' });
  }
  next();
};

// Send OTP route for signup
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ success: false, error: 'invalid_email', message: 'Please provide a valid email address' });
    }

    const emailToCheck = email.toLowerCase();
    console.log('Checking email for OTP:', emailToCheck);

    // Check if email exists in the database (decrypting stored emails)
    const { data, error } = await supabase
      .from('patients')
      .select('email');

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ success: false, error: 'database_error', message: 'Error checking email in database' });
    }

    console.log('Fetched emails:', data);
    for (const patient of data) {
      if (patient.email) {
        const decryptedEmail = decrypt(patient.email);
        console.log('Comparing:', { stored: decryptedEmail, input: emailToCheck });
        if (decryptedEmail === emailToCheck) {
          console.log('Email already exists:', emailToCheck);
          return res.status(400).json({ success: false, error: 'email_exists', message: 'Email already exists in our system' });
        }
      }
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP with expiration (15 minutes)
    otpStore.set(emailToCheck, {
      otp,
      expiry: Date.now() + 15 * 60 * 1000, // 15 minutes in milliseconds
      purpose: 'signup', // Add purpose to distinguish between signup and password change
    });

    // Send email with OTP
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
    console.log('OTP sent to:', emailToCheck);

    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ success: false, error: 'server_error', message: 'Failed to send OTP' });
  }
});

// Send OTP route for password change
router.post('/send-otp-password-change', otpLimiter, isAuthenticated, async (req, res) => {
  try {
    // Fetch the user's email from the database using their session ID
    const { data, error } = await supabase
      .from('patients')
      .select('email')
      .eq('id', req.session.userId) // Assuming userId is stored in session
      .single();

    if (error || !data) {
      console.error('Supabase error:', error);
      return res.status(500).json({ success: false, error: 'database_error', message: 'Error fetching user email' });
    }

    const decryptedEmail = decrypt(data.email);
    if (!decryptedEmail) {
      return res.status(500).json({ success: false, error: 'decryption_error', message: 'Failed to decrypt user email' });
    }

    const emailToCheck = decryptedEmail.toLowerCase();

    // Generate OTP
    const otp = generateOTP();

    // Store OTP with expiration (15 minutes) and purpose
    otpStore.set(emailToCheck, {
      otp,
      expiry: Date.now() + 15 * 60 * 1000, // 15 minutes in milliseconds
      purpose: 'password_change', // Distinguish this OTP for password change
    });

    // Send email with OTP
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emailToCheck,
      subject: 'Balane-Saspa Dental Clinic - Password Change Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #4154f1;">Balane-Saspa Dental Clinic</h2>
          </div>
          <p>Dear Patient,</p>
          <p>We received a request to change your password. To proceed, please use the following verification code:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 24px; font-weight: bold; letter-spacing: 5px; background-color: #f5f5f5; padding: 15px; border-radius: 5px;">${otp}</div>
          </div>
          <p>This code will expire in 15 minutes.</p>
          <p>If you did not request this change, please ignore this email or contact our support team immediately.</p>
          <p>Best regards,<br>Balane-Saspa Dental Clinic Team</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Password change OTP sent to:', emailToCheck);

    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending OTP for password change:', error);
    res.status(500).json({ success: false, error: 'server_error', message: 'Failed to send OTP' });
  }
});

// Verify OTP route (updated to support both signup and password change)
router.post('/verify-otp', (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    // Validate email and OTP
    if (!email || !otp || !purpose) {
      return res.status(400).json({ success: false, error: 'missing_fields', message: 'Email, OTP, and purpose are required' });
    }

    const lowerEmail = email.toLowerCase();
    const storedOTPData = otpStore.get(lowerEmail);

    // Check if OTP exists for this email
    if (!storedOTPData) {
      return res.status(400).json({ success: false, error: 'invalid_otp', message: 'Invalid or expired OTP' });
    }

    // Check if OTP is expired
    if (Date.now() > storedOTPData.expiry) {
      otpStore.delete(lowerEmail);
      return res.status(400).json({ success: false, error: 'expired_otp', message: 'OTP has expired. Please request a new one' });
    }

    // Check if OTP purpose matches
    if (storedOTPData.purpose !== purpose) {
      return res.status(400).json({ success: false, error: 'invalid_purpose', message: 'OTP purpose does not match the requested action' });
    }

    // Verify OTP
    if (storedOTPData.otp !== otp) {
      return res.status(400).json({ success: false, error: 'invalid_otp', message: 'Invalid OTP' });
    }

    // If OTP is valid, remove it from store (one-time use)
    otpStore.delete(lowerEmail);

    res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ success: false, error: 'server_error', message: 'Failed to verify OTP' });
  }
});

// Clean up expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiry) {
      otpStore.delete(email);
    }
  }
}, 15 * 60 * 1000); // Run every 15 minutes

module.exports = {
  otpRoutes: router,
};