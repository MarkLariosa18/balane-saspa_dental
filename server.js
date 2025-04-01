const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const http = require('http');
const WebSocket = require('ws');

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

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });
app.set('wss', wss);

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  ws.on('message', (message) => {
    console.log('WebSocket message received:', message.toString());
    try {
      const data = JSON.parse(message);
      if (data.type === 'cancel_response') {
        console.log('Received cancel response:', data);
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'cancel_response',
              requestId: data.requestId,
              status: data.status
            }));
          }
        });
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
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
  const publicPaths = [
    '/', '/index.html', '/pages-login.html', '/check-auth', '/check-username', '/logout'
  ];
  const publicApiPaths = [
    '/api', // OTP routes
    '/auth', // Authentication routes
    '/services', // Service routes
    '/patients' // Patient registration
  ];

  // Allow public paths and specific API routes
  if (
    publicPaths.includes(req.path) ||
    publicApiPaths.some(path => req.path.startsWith(path)) ||
    (req.path === '/patients' && req.method === 'POST')
  ) {
    return next();
  }

  // Require authentication for protected routes
  if (!req.session.isLoggedIn || !req.session.userId) {
    // For API requests, return JSON instead of redirecting
    if (req.path.startsWith('/api/') || req.path.startsWith('/patients') || req.path.startsWith('/users')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    console.log(`Redirecting unauthenticated request: ${req.method} ${req.path}`);
    return res.redirect('/pages-login.html');
  }
  console.log(`Authenticated request: ${req.method} ${req.path}, userId: ${req.session.userId}`);
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
    res.json({ 
      isLoggedIn: true, 
      userId: req.session.userId, 
      role: req.session.role || 'patient' 
    });
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
  console.error('Server error:', err.stack);
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

// Catch-all 404 handler
app.use((req, res, next) => {
  console.log(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'not_found', message: `Cannot ${req.method} ${req.path}` });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access your app at: http://localhost:${PORT}`);
  console.log(`WebSocket server running at ws://localhost:${PORT}`);
});