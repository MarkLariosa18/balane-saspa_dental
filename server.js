const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const path = require('path');
const session = require('express-session');
const SessionRedisStore = require('connect-redis').default; // For session store
const RateLimitRedisStore = require('rate-limit-redis'); // For rate limiter
const Redis = require('ioredis');
const cookieParser = require('cookie-parser');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const csurf = require('csurf');
const compression = require('compression');
const cron = require('node-cron');
const axios = require('axios');

// Load environment variables
dotenv.config();

// Validate critical environment variables
const requiredEnvVars = ['SESSION_SECRET', 'REDIS_URL', 'NODE_ENV', 'FRONTEND_URL'];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

console.log('RateLimitRedisStore:', RateLimitRedisStore);
console.log('Typeof RateLimitRedisStore:', typeof RateLimitRedisStore);
console.log('RateLimitRedisStore prototype:', RateLimitRedisStore && RateLimitRedisStore.prototype);

// Import routes and their Socket.IO handlers
const patientRoutes = require('./routes/patients');
const userRoutes = require('./routes/users');
const appointmentRoutes = require('./routes/appointments');
const serviceRoutes = require('./routes/services');
const { otpRoutes } = require('./routes/otp');
const authRoutes = require('./routes/auth');

// Initialize Redis with enhanced configuration
const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 10,
});

redis.ping().then((result) => {
  console.log('Redis ping:', result); // Should log 'PONG'
}).catch((err) => {
  console.error('Redis connection error:', err);
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for Express and Socket.IO
const server = createServer(app);

// Initialize Socket.IO server with enhanced security
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = process.env.NODE_ENV === 'production'
        ? [process.env.FRONTEND_URL]
        : [process.env.FRONTEND_URL, 'http://localhost:3000'];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  pingTimeout: 20000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
});

// Share Socket.IO instance with routes
app.set('socketio', io);

// Rate limiters with Redis store
const createRateLimiter = (prefix, windowMs, max, message) =>
  rateLimit({
    store: new RateLimitRedisStore.default({
      sendCommand: (...args) => redis.call(...args), // Use ioredis call method
      prefix: `ratelimit:${prefix}`,
    }),
    windowMs,
    max,
    message: { error: 'too_many_requests', message },
    standardHeaders: true,
    legacyHeaders: false,
  });

const checkAuthLimiter = createRateLimiter('rl:check-auth:', 15 * 60 * 1000, 100, 'Too many auth checks. Try again later.');
const checkUsernameLimiter = createRateLimiter('rl:check-username:', 60 * 60 * 1000, 50, 'Too many username checks. Try again later.');
const logoutLimiter = createRateLimiter('rl:logout:', 15 * 60 * 1000, 50, 'Too many logout attempts. Try again later.');
const staticFileLimiter = createRateLimiter('rl:static:', 15 * 60 * 1000, 1000, 'Too many requests for static files. Try again later.');

// Session configuration
const sessionMiddleware = session({
  store: new SessionRedisStore({ client: redis, prefix: 'session:' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 1000,
  },
  rolling: true,
});

// Socket.IO session middleware
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const session = socket.request.session;
  if (!session || !session.isLoggedIn || !session.userId) {
    return next(new Error('Unauthorized'));
  }
  socket.userId = session.userId;
  next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`New Socket.IO client connected: ${socket.id}, userId: ${socket.userId}`);
  socket.join(`user:${socket.userId}`);
  socket.emit('welcome', {
    message: 'Connected to Socket.IO server',
    timestamp: new Date().toISOString(),
  });
  socket.on('disconnect', () => {
    console.log(`Socket.IO client disconnected: ${socket.id}, userId: ${socket.userId}`);
  });
  socket.on('error', (error) => {
    console.error(`Socket.IO error for ${socket.id}:`, error);
  });
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'wss://balane-saspa-dental-1.onrender.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.socket.io", "https://code.jquery.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Temporary for debugging inline handlers
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = process.env.NODE_ENV === 'production'
      ? [process.env.FRONTEND_URL]
      : [process.env.FRONTEND_URL, 'http://localhost:3000'];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(morgan('combined', {
  skip: (req, res) => res.statusCode < 400 && process.env.NODE_ENV === 'production',
}));
app.use(sessionMiddleware);
app.use(cookieParser());
app.use(csurf({ cookie: true }));

// Serve static files with rate limiting
app.use(staticFileLimiter, express.static(path.join(__dirname, 'front')));
app.use('/admin', staticFileLimiter, express.static(path.join(__dirname, 'front', 'admin')));
app.use('/assets', staticFileLimiter, express.static(path.join(__dirname, 'assets')));

// Ping endpoint to keep server active
app.get('/ping', (req, res) => {
  res.json({ status: 'ok' });
});

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  const publicPaths = [
    '/', '/index.html', '/pages-login.html', '/check-auth', '/check-username', '/logout', '/ping',
  ];
  const publicApiPaths = [
    '/api', // OTP routes
    '/auth', // Authentication routes
    '/services', // Service routes
    '/patients', // Patient registration
  ];

  if (
    publicPaths.includes(req.path) ||
    publicApiPaths.some((path) => req.path.startsWith(path)) ||
    (req.path === '/patients' && req.method === 'POST')
  ) {
    return next();
  }

  if (!req.session.isLoggedIn || !req.session.userId) {
    if (req.path.startsWith('/api/') || req.path.startsWith('/patients') || req.path.startsWith('/users')) {
      return res.status(401).json({ error: 'unauthorized', message: 'Unauthorized' });
    }
    console.log(`Redirecting unauthenticated request: ${req.method} ${req.path}`);
    return res.redirect('/pages-login.html');
  }

  console.log(`Authenticated request: ${req.method} ${req.path}, userId: ${req.session.userId}`);
  next();
};

// Apply authentication middleware
app.use(isAuthenticated);

// API Routes
app.use('/api', otpRoutes);
app.use('/patients', patientRoutes.router || patientRoutes);
app.use('/users', userRoutes.router || userRoutes);
app.use('/api/appointments', appointmentRoutes.router || appointmentRoutes);
app.use('/api/services', serviceRoutes.router || serviceRoutes);
app.use('/auth', authRoutes);

// Check auth status endpoint
app.get('/check-auth', checkAuthLimiter, (req, res) => {
  if (req.session && req.session.isLoggedIn && req.session.userId) {
    res.json({
      isLoggedIn: true,
      userId: req.session.userId,
      role: req.session.role || 'patient',
    });
  } else {
    res.json({ isLoggedIn: false });
  }
});

// Protected routes for HTML pages
app.get('/profile.html', staticFileLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'profile.html'));
});

app.get('/make-appointment.html', staticFileLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'make-appointment.html'));
});

app.get('/admin/index.html', staticFileLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'admin', 'index.html'));
});

// Logout route
app.get('/logout', logoutLimiter, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'server_error', message: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.redirect('/pages-login.html');
  });
});

// Username checking endpoint
app.get('/check-username', checkUsernameLimiter, async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'bad_request', message: 'Username is required' });
  }
  try {
    const exists = ['admin', 'test'].includes(username); // Replace with Supabase check
    return res.json({ exists });
  } catch (error) {
    console.error('Error checking username:', error);
    return res.status(500).json({ error: 'server_error', message: 'Error checking username' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'csrf_error', message: 'Invalid CSRF token' });
  }
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server' });
});

// Serve the main HTML file for the root route
app.get('/', staticFileLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'front', 'index.html'));
});

// Handle other HTML file requests in 'front'
app.get('/*.html', staticFileLimiter, (req, res) => {
  const filePath = path.join(__dirname, 'front', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).sendFile(path.join(__dirname, 'front', 'index.html'));
    }
  });
});

// Catch-all 404 handler
app.use((req, res) => {
  console.log(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'not_found', message: `Cannot ${req.method} ${req.path}` });
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down server...');
  server.close(() => {
    redis.quit(() => {
      console.log('Redis connection closed');
      process.exit(0);
    });
  });
};

app.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Periodic cleanup task
setInterval(async () => {
  try {
    console.log('Running periodic cleanup:', new Date().toISOString());
    // Add cleanup logic (e.g., remove expired sessions)
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 24 * 60 * 60 * 1000);

// Schedule ping every 14 minutes to prevent spin-down
cron.schedule('*/14 * * * *', async () => {
  try {
    const response = await axios.get('https://balane-saspa-dental-1.onrender.com/ping');
    console.log(`Ping successful at ${new Date().toISOString()}: ${response.data.status}`);
  } catch (error) {
    console.error(`Ping failed at ${new Date().toISOString()}:`, error.message);
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access your app at: http://localhost:${PORT}`);
  console.log(`Socket.IO server running at: ws://localhost:${PORT}`);
});