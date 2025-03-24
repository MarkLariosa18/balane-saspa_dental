const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

// Import routes
const patientRoutes = require('./routes/patients');
const userRoutes = require('./routes/users');
const appointmentRoutes = require('./routes/appointments');
const serviceRoutes = require('./routes/services');
const { otpRoutes } = require('./routes/otp');
const authRoutes = require('./routes/auth');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
<<<<<<< HEAD
  origin: 'http://localhost:3000', // Adjust if frontend runs on a different port (e.g., 5500)
=======
  origin: 'http://localhost:3000',
>>>>>>> 1c897b2fa63412a13161ca82685cd35593a0dc10
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // False for local dev, true with HTTPS in production
    httpOnly: true,
    maxAge: 60 * 60 * 1000 // 1 hour
  }
}));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, 'front')));
app.use('/admin', express.static(path.join(__dirname, 'front', 'admin')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  // Skip authentication for public routes
  const publicPaths = [
    '/', '/index.html', '/pages-login.html', '/check-auth', '/check-username', '/logout'
  ];
  const publicApiPaths = [
    '/api', // OTP routes
    '/auth', // Authentication routes
    '/services', // Service routes
    '/patients' // Patient registration (POST /patients/)
  ];

<<<<<<< HEAD
  // Allow public paths and API routes (adjusted to prevent redirect for APIs)
  if (
    publicPaths.includes(req.path) ||
    publicApiPaths.some(path => req.path.startsWith(path)) ||
    (req.path === '/patients' && req.method === 'POST')
=======
  // Allow public paths and API routes
  if (
    publicPaths.includes(req.path) ||
    publicApiPaths.some(path => req.path.startsWith(path)) ||
    (req.path === '/patients' && req.method === 'POST') // Explicitly allow POST /patients
>>>>>>> 1c897b2fa63412a13161ca82685cd35593a0dc10
  ) {
    return next();
  }

  // Require authentication for protected routes
  if (!req.session.isLoggedIn || !req.session.userId) {
<<<<<<< HEAD
    // For API requests, return JSON instead of redirecting
    if (req.path.startsWith('/api/') || req.path.startsWith('/patients') || req.path.startsWith('/users')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
=======
>>>>>>> 1c897b2fa63412a13161ca82685cd35593a0dc10
    return res.redirect('/pages-login.html');
  }
  next();
};

// Apply isAuthenticated middleware to all routes
app.use(isAuthenticated);

// API Routes
app.use('/api', otpRoutes);
app.use('/patients', patientRoutes);
app.use('/users', userRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/auth', authRoutes);

// Check auth status endpoint
app.get('/check-auth', (req, res) => {
  if (req.session && req.session.isLoggedIn && req.session.userId) {
    res.json({ isLoggedIn: true, userId: req.session.userId, role: req.session.role || 'patient' });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// Protected routes for HTML pages
app.get('/profile.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'profile.html'));
});

app.get('/make-appointment.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'make-appointment.html'));
});

app.get('/admin/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'admin', 'index.html'));
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.redirect('/pages-login.html');
  });
});

// Add endpoint for username checking
app.get('/check-username', async (req, res) => {
  const { username } = req.query;
  try {
    const exists = ['admin', 'test'].includes(username); // Replace with Supabase check if needed
    return res.json({ exists });
  } catch (error) {
    console.error('Error checking username:', error);
    return res.status(500).json({ error: 'server_error', message: 'Error checking username' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server' });
});

// Serve the main HTML file for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'index.html'));
});

// Handle all other static file requests in 'front'
app.get('/*.html', (req, res) => {
  const filePath = path.join(__dirname, 'front', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).sendFile(path.join(__dirname, 'front', 'index.html'));
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access your app at: http://localhost:${PORT}`);
});