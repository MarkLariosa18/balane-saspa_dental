const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key';

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password, remember } = req.body;

  try {
    // Step 1: Check admin table first
    let user = null;
    let role = null;
    let table = null;

    const { data: admin, error: adminError } = await supabase
      .from('admin')
      .select('id, username, password')
      .eq('username', username)
      .single();

    if (admin && !adminError) {
      const passwordMatch = await bcrypt.compare(password, admin.password);
      if (!passwordMatch) {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
      }
      user = admin;
      role = 'admin';
      table = 'admin';
    } else {
      // Step 2: Check users table if no admin found
      const { data: patient, error: userError } = await supabase
        .from('users')
        .select('id, username, password')
        .eq('username', username)
        .single();

      if (userError || !patient) {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
      }

      const passwordMatch = await bcrypt.compare(password, patient.password);
      if (!passwordMatch) {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
      }
      user = patient;
      role = 'patient';
      table = 'users';
    }

    // Step 3: Set session
    req.session.isLoggedIn = true;
    req.session.userId = user.id;
    req.session.role = role; // Store role in session

    // Step 4: Handle "Remember Me"
    if (remember) {
      const rememberToken = crypto.randomBytes(32).toString('hex');
      const { error: tokenError } = await supabase
        .from(table) // Update the correct table (admin or users)
        .update({ remember_token: rememberToken })
        .eq('id', user.id);

      if (tokenError) throw tokenError;

      // Long-lived session (30 days)
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      res.cookie('remember_token', rememberToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } else {
      // Short-lived session (1 hour, adjusted for practicality)
      req.session.cookie.maxAge = 60 * 60 * 1000; // 1 hour
      const { error: clearTokenError } = await supabase
        .from(table) // Update the correct table
        .update({ remember_token: null })
        .eq('id', user.id);

      if (clearTokenError) throw clearTokenError;
      res.clearCookie('remember_token');
    }

    res.json({ success: true, message: 'Login successful', role, remember: !!remember });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Check authentication status
router.get('/check-auth', (req, res) => {
  if (req.session.isLoggedIn) {
    return res.json({ isLoggedIn: true, userId: req.session.userId, role: req.session.role || 'patient' });
  }
  res.json({ isLoggedIn: false });
});

// Auto-login with remember token
router.post('/auto-login', async (req, res) => {
  const rememberToken = req.cookies?.remember_token;

  if (!rememberToken) {
    return res.status(401).json({ success: false, message: 'No remember token found' });
  }

  try {
    // Step 1: Check admin table first
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
      // Step 2: Check users table
      const { data: patient, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('remember_token', rememberToken)
        .single();

      if (userError || !patient) {
        res.clearCookie('remember_token');
        return res.status(401).json({ success: false, message: 'Invalid remember token' });
      }
      user = patient;
      role = 'patient';
      table = 'users';
    }

    // Step 3: Set session
    req.session.isLoggedIn = true;
    req.session.userId = user.id;
    req.session.role = role;
    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // Extend to 30 days

    res.json({ success: true, message: 'Auto-login successful', role });
  } catch (error) {
    console.error('Auto-login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  const userId = req.session.userId;
  const role = req.session.role || 'patient'; // Default to patient if role not set
  const table = role === 'admin' ? 'admin' : 'users';

  req.session.destroy(async (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }

    const { error: clearTokenError } = await supabase
      .from(table)
      .update({ remember_token: null })
      .eq('id', userId);

    if (clearTokenError) {
      console.error('Error clearing remember token:', clearTokenError);
    }

    res.clearCookie('remember_token');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

module.exports = router;