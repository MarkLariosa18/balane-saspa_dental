const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const validator = require('validator');
const helmet = require('helmet');
const winston = require('winston');

require('dotenv').config();

// Validate critical environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'SESSION_SECRET', 'REDIS_URL', 'NODE_ENV'];
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

// Rate limiters
const loginRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'login:attempt',
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

const forgotPasswordRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'forgot-password:attempt',
  points: 5,
  duration: 15 * 60,
  blockDuration: 15 * 60,
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

// Placeholder email sending function
async function sendEmail(to, subject, text) {
  logger.info(`Simulated email sent to ${to}: ${subject} - ${text}`);
  return true;
}

// Rate limiter middleware
const applyLoginRateLimiter = async (req, res, next) => {
  const ipAddress = req.ip;
  try {
    await loginRateLimiter.consume(ipAddress);
    next();
  } catch (error) {
    logger.warn(`Login rate limit exceeded for IP: ${ipAddress}`);
    res.status(429).json({
      error: 'too_many_requests',
      message: 'Too many login attempts. Please try again later.',
    });
  }
};

const applyForgotPasswordRateLimiter = async (req, res, next) => {
  const ipAddress = req.ip;
  try {
    await forgotPasswordRateLimiter.consume(ipAddress);
    next();
  } catch (error) {
    logger.warn(`Forgot password rate limit exceeded for IP: ${ipAddress}`);
    res.status(429).json({
      error: 'too_many_requests',
      message: 'Too many forgot password requests. Please try again later.',
    });
  }
};

// CSRF token endpoint
router.get('/csrf-token', (req, res) => {
  try {
    const csrfToken = req.csrfToken(); // Provided by csurf middleware
    logger.info('CSRF token requested');
    res.json({ csrfToken });
  } catch (error) {
    logger.error('CSRF token error:', error);
    res.status(500).json({ error: 'server_error', message: 'Failed to generate CSRF token' });
  }
});

// Login endpoint
router.post('/login', applyLoginRateLimiter, async (req, res) => {
  const { identifier, password, remember } = req.body;

  try {
    if (!identifier || !password) {
      logger.warn(`Login attempt with missing credentials: ${identifier || 'unknown'}`);
      return res.status(400).json({ error: 'bad_request', message: 'Username/email and password are required' });
    }

    let user = null;
    let role = null;
    let table = null;

    // Check admin table (username only)
    const { data: adminByUsername, error: adminError } = await supabase
      .from('admin')
      .select('id, username, password')
      .eq('username', identifier)
      .single();

    if (adminByUsername && !adminError) {
      const passwordMatch = await bcrypt.compare(password, adminByUsername.password);
      if (!passwordMatch) {
        logger.warn(`Failed login attempt for admin: ${identifier}`);
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
      }
      user = adminByUsername;
      role = 'admin';
      table = 'admin';
    } else {
      // Check users table (username or email via patients table)
      // First, try username in users table
      const { data: userByUsername, error: userUsernameError } = await supabase
        .from('users')
        .select('id, username, password')
        .eq('username', identifier)
        .single();

      if (userByUsername && !userUsernameError) {
        const passwordMatch = await bcrypt.compare(password, userByUsername.password);
        if (!passwordMatch) {
          logger.warn(`Failed login attempt for user: ${identifier}`);
          return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
        }
        // Verify the user is a patient
        const { data: patientData, error: patientError } = await supabase
          .from('patients')
          .select('id, email')
          .eq('id', userByUsername.id)
          .single();

        if (!patientData || patientError) {
          logger.warn(`Login attempt for non-patient user: ${identifier}`);
          return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
        }
        user = { ...userByUsername, email: patientData.email };
      } else if (validator.isEmail(identifier)) {
        // If identifier is an email, query patients table and join with users
        const { data: patientByEmail, error: patientEmailError } = await supabase
          .from('patients')
          .select('id, email')
          .eq('email', identifier)
          .single();

        if (patientByEmail && !patientEmailError) {
          // Fetch corresponding user from users table
          const { data: userById, error: userIdError } = await supabase
            .from('users')
            .select('id, username, password')
            .eq('id', patientByEmail.id)
            .single();

          if (userById && !userIdError) {
            const passwordMatch = await bcrypt.compare(password, userById.password);
            if (!passwordMatch) {
              logger.warn(`Failed login attempt for user: ${identifier}`);
              return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
            }
            user = { ...userById, email: patientByEmail.email };
          }
        }
      }

      if (!user) {
        logger.warn(`Failed login attempt for user: ${identifier}`);
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid username/email or password' });
      }
      role = 'patient';
      table = 'users';
    }

    req.session.isLoggedIn = true;
    req.session.userId = user.id;

    if (remember) {
      const rememberToken = crypto.randomBytes(32).toString('hex');
      const { error: tokenError } = await supabase
        .from(table)
        .update({ remember_token: rememberToken })
        .eq('id', user.id);

      if (tokenError) throw tokenError;

      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      res.cookie('remember_token', rememberToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } else {
      req.session.cookie.maxAge = 60 * 60 * 1000;
      const { error: clearTokenError } = await supabase
        .from(table)
        .update({ remember_token: null })
        .eq('id', user.id);

      if (clearTokenError) throw clearTokenError;
      res.clearCookie('remember_token', { path: '/', sameSite: 'strict' });
    }

    logger.info(`Successful login for ${role}: ${identifier} (userId: ${user.id})`);
    res.json({ success: true, message: 'Login successful', role, remember: !!remember });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// Check authentication status
router.get('/check-auth', async (req, res) => {
  try {
    if (!req.session.isLoggedIn || !req.session.userId) {
      logger.info('Unauthenticated session check');
      return res.status(401).json({ isLoggedIn: false, error: 'unauthorized' });
    }

    const userId = req.session.userId;

    const { data: adminData, error: adminError } = await supabase
      .from('admin')
      .select('id')
      .eq('id', userId)
      .single();

    if (adminData && !adminError) {
      logger.info(`Auth check: Admin userId ${userId}`);
      return res.status(200).json({ isLoggedIn: true, userId, role: 'admin' });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', userId)
      .single();

    if (userData && !userError) {
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('id', userId)
        .single();

      if (patientData && !patientError) {
        logger.info(`Auth check: Patient userId ${userId}`);
        return res.status(200).json({ isLoggedIn: true, userId, role: 'patient' });
      }

      logger.info(`Auth check: Non-patient userId ${userId}`);
      return res.status(200).json({ isLoggedIn: true, userId, role: 'user' });
    }

    logger.warn(`Auth check failed: UserId ${userId} not found`);
    return res.status(401).json({ isLoggedIn: false, error: 'unauthorized', message: 'User not found' });
  } catch (error) {
    logger.error('Error checking auth:', error);
    res.status(500).json({ isLoggedIn: false, error: 'server_error', message: 'Server error' });
  }
});

// Auto-login with remember token
router.post('/auto-login', async (req, res) => {
  const rememberToken = req.cookies?.remember_token;

  if (!rememberToken || !validator.isHexadecimal(rememberToken) || rememberToken.length !== 64) {
    logger.warn('Auto-login attempt with invalid or missing remember token');
    res.clearCookie('remember_token', { path: '/', sameSite: 'strict' });
    return res.status(401).json({ error: 'unauthorized', message: 'No valid remember token found' });
  }

  try {
    let user = null;
    let role = null;
    let table = null;

    const { data: admin, error: adminError } = await supabase
      .from('admin')
      .select('id')
      .eq('remember_token', rememberToken)
      .single();

    if (admin && !adminError) {
      user = admin;
      role = 'admin';
      table = 'admin';
    } else {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('remember_token', rememberToken)
        .single();

      if (userError || !userData) {
        logger.warn('Auto-login failed: Invalid remember token');
        res.clearCookie('remember_token', { path: '/', sameSite: 'strict' });
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid remember token' });
      }

      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('id', userData.id)
        .single();

      if (patientError || !patientData) {
        logger.warn('Auto-login failed: User is not a patient');
        res.clearCookie('remember_token', { path: '/', sameSite: 'strict' });
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid remember token' });
      }

      user = userData;
      role = 'patient';
      table = 'users';
    }

    req.session.isLoggedIn = true;
    req.session.userId = user.id;
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

    logger.info(`Successful auto-login for ${role}: userId ${user.id}`);
    res.json({ success: true, message: 'Auto-login successful', role });
  } catch (error) {
    logger.error('Auto-login error:', error);
    res.clearCookie('remember_token', { path: '/', sameSite: 'strict' });
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// Forgot password endpoint
router.post('/forgot-password', applyForgotPasswordRateLimiter, async (req, res) => {
  const { identifier } = req.body;

  try {
    if (!identifier) {
      logger.warn('Forgot password attempt with missing identifier');
      return res.status(400).json({ error: 'bad_request', message: 'Email or username is required' });
    }

    let user = null;
    let table = 'users';

    // Check if identifier is an email (query patients table)
    if (validator.isEmail(identifier)) {
      const { data: patientByEmail, error: patientEmailError } = await supabase
        .from('patients')
        .select('id, email')
        .eq('email', identifier)
        .single();

      if (patientByEmail && !patientEmailError) {
        // Fetch corresponding user from users table
        const { data: userById, error: userIdError } = await supabase
          .from('users')
          .select('id, username')
          .eq('id', patientByEmail.id)
          .single();

        if (userById && !userIdError) {
          user = { ...userById, email: patientByEmail.email };
        }
      }
    } else {
      // Assume identifier is a username (query users table)
      const { data: userByUsername, error: userUsernameError } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', identifier)
        .single();

      if (userByUsername && !userUsernameError) {
        // Fetch email from patients table
        const { data: patientById, error: patientIdError } = await supabase
          .from('patients')
          .select('id, email')
          .eq('id', userByUsername.id)
          .single();

        if (patientById && !patientIdError) {
          user = { ...userByUsername, email: patientById.email };
        }
      }
    }

    if (!user) {
      logger.warn(`Forgot password attempt for non-existent user: ${identifier}`);
      return res.status(404).json({ error: 'not_found', message: 'User not found' });
    }

    if (!user.email) {
      logger.warn(`Forgot password attempt for user without email: ${user.username}`);
      return res.status(400).json({ error: 'bad_request', message: 'No email associated with this account' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpKey = `otp:${user.id}:password_reset`;
    await redis.set(otpKey, otp, 'EX', 10 * 60);

    const emailSent = await sendEmail(
      user.email,
      'Password Reset OTP',
      `Your OTP for password reset is: ${otp}. It expires in 10 minutes.`
    );

    if (!emailSent) {
      logger.error(`Failed to send OTP email to ${user.email}`);
      return res.status(500).json({ error: 'server_error', message: 'Failed to send OTP' });
    }

    logger.info(`OTP sent for password reset: userId ${user.id}, email ${user.email}`);
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// Verify OTP endpoint
router.post('/verify-otp', async (req, res) => {
  const { identifier, otp, purpose } = req.body;

  try {
    if (!identifier || !otp || !purpose) {
      logger.warn('OTP verification attempt with missing fields');
      return res.status(400).json({ error: 'bad_request', message: 'Identifier, OTP, and purpose are required' });
    }
    if (!/^\d{6}$/.test(otp)) {
      logger.warn('Invalid OTP format');
      return res.status(400).json({ error: 'bad_request', message: 'Invalid OTP format' });
    }
    if (purpose !== 'password_reset') {
      logger.warn(`Invalid OTP purpose: ${purpose}`);
      return res.status(400).json({ error: 'bad_request', message: 'Invalid OTP purpose' });
    }

    let user = null;

    // Check if identifier is an email
    if (validator.isEmail(identifier)) {
      const { data: patientByEmail, error: patientEmailError } = await supabase
        .from('patients')
        .select('id, email')
        .eq('email', identifier)
        .single();

      if (patientByEmail && !patientEmailError) {
        const { data: userById, error: userIdError } = await supabase
          .from('users')
          .select('id, username')
          .eq('id', patientByEmail.id)
          .single();

        if (userById && !userIdError) {
          user = { ...userById, email: patientByEmail.email };
        }
      }
    } else {
      // Assume identifier is a username
      const { data: userByUsername, error: userUsernameError } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', identifier)
        .single();

      if (userByUsername && !userUsernameError) {
        const { data: patientById, error: patientIdError } = await supabase
          .from('patients')
          .select('id, email')
          .eq('id', userByUsername.id)
          .single();

        if (patientById && !patientIdError) {
          user = { ...userByUsername, email: patientById.email };
        }
      }
    }

    if (!user) {
      logger.warn(`OTP verification attempt for non-existent user: ${identifier}`);
      return res.status(404).json({ error: 'not_found', message: 'User not found' });
    }

    const otpKey = `otp:${user.id}:password_reset`;
    const storedOtp = await redis.get(otpKey);

    if (!storedOtp || storedOtp !== otp) {
      logger.warn(`Invalid OTP for userId ${user.id}`);
      return res.status(400).json({ error: 'invalid_otp', message: 'Invalid or expired OTP' });
    }

    await redis.del(otpKey);

    logger.info(`OTP verified for userId ${user.id}`);
    res.json({ success: true, message: 'OTP verified' });
  } catch (error) {
    logger.error('OTP verification error:', error);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  const { identifier, otp, newPassword } = req.body;

  try {
    if (!identifier || !otp || !newPassword) {
      logger.warn('Password reset attempt with missing fields');
      return res.status(400).json({ error: 'bad_request', message: 'Identifier, OTP, and new password are required' });
    }
    if (!/^\d{6}$/.test(otp)) {
      logger.warn('Invalid OTP format');
      return res.status(400).json({ error: 'bad_request', message: 'Invalid OTP format' });
    }
    if (!validator.isLength(newPassword, { min: 8, max: 100 })) {
      return res.status(400).json({ error: 'bad_request', message: 'Password must be between 8 and 100 characters' });
    }

    let user = null;
    let table = 'users';

    // Check if identifier is an email
    if (validator.isEmail(identifier)) {
      const { data: patientByEmail, error: patientEmailError } = await supabase
        .from('patients')
        .select('id, email')
        .eq('email', identifier)
        .single();

      if (patientByEmail && !patientEmailError) {
        const { data: userById, error: userIdError } = await supabase
          .from('users')
          .select('id, username')
          .eq('id', patientByEmail.id)
          .single();

        if (userById && !userIdError) {
          user = { ...userById, email: patientByEmail.email };
        }
      }
    } else {
      // Assume identifier is a username
      const { data: userByUsername, error: userUsernameError } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', identifier)
        .single();

      if (userByUsername && !userUsernameError) {
        const { data: patientById, error: patientIdError } = await supabase
          .from('patients')
          .select('id, email')
          .eq('id', userByUsername.id)
          .single();

        if (patientById && !patientIdError) {
          user = { ...userByUsername, email: patientById.email };
        }
      }
    }

    if (!user) {
      logger.warn(`Password reset attempt for non-existent user: ${identifier}`);
      return res.status(404).json({ error: 'not_found', message: 'User not found' });
    }

    const otpKey = `otp:${user.id}:password_reset`;
    const storedOtp = await redis.get(otpKey);

    if (!storedOtp || storedOtp !== otp) {
      logger.warn(`Invalid OTP for password reset: userId ${user.id}`);
      return res.status(400).json({ error: 'invalid_otp', message: 'Invalid or expired OTP' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const { error: updateError } = await supabase
      .from(table)
      .update({ password: hashedPassword, remember_token: null })
      .eq('id', user.id);

    if (updateError) {
      logger.error(`Failed to update password for userId ${user.id}:`, updateError);
      throw updateError;
    }

    await redis.del(otpKey);

    if (req.session) {
      await new Promise((resolve, reject) => {
        req.session.destroy((err) => {
          if (err) {
            logger.error('Session destroy error during password reset:', err);
            reject(err);
            return;
          }
          res.clearCookie('connect.sid', { path: '/', sameSite: 'strict' });
          resolve();
        });
      });
    }
    res.clearCookie('remember_token', { path: '/', sameSite: 'strict' });

    logger.info(`Password reset successful for userId ${user.id}`);
    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    logger.error('Password reset error:', error);
    res.status(500).json({ error: 'server_error', message: 'Server error' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  try {
    const userId = req.session.userId;

    let table = null;
    const { data: adminData, error: adminError } = await supabase
      .from('admin')
      .select('id')
      .eq('id', userId)
      .single();

    if (adminData && !adminError) {
      table = 'admin';
    } else {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (userData && !userError) {
        const { data: patientData, error: patientError } = await supabase
          .from('patients')
          .select('id')
          .eq('id', userId)
          .single();

        if (patientData && !patientError) {
          table = 'users';
        }
      }
    }

    if (userId && table) {
      const { error } = await supabase
        .from(table)
        .update({ remember_token: null })
        .eq('id', userId);

      if (error) {
        logger.error('Supabase update error during logout:', error);
        throw new Error('Failed to clear remember token');
      }
    }

    await new Promise((resolve, reject) => {
      if (!req.session) {
        resolve();
        return;
      }
      req.session.destroy((err) => {
        if (err) {
          logger.error('Session destroy error during logout:', err);
          reject(err);
          return;
        }
        res.clearCookie('remember_token', { path: '/', sameSite: 'strict' });
        res.clearCookie('connect.sid', { path: '/', sameSite: 'strict' });
        resolve();
      });
    });

    logger.info(`Successful logout for userId: ${userId || 'unknown'}`);
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.clearCookie('remember_token', { path: '/', sameSite: 'strict' });
    res.clearCookie('connect.sid', { path: '/', sameSite: 'strict' });
    res.status(500).json({ error: 'server_error', message: 'Logout failed' });
  }
});

// Error handling middleware
router.use((err, req, res, next) => {
  logger.error('Route error:', { error: err.message, stack: err.stack, path: req.path });
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'invalid_csrf_token', message: 'Invalid CSRF token' });
  }
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

module.exports = router;