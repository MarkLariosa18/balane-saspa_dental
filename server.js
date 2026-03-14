const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const dotenv       = require('dotenv');
const morgan       = require('morgan');
const path         = require('path');
const session      = require('express-session');
const compression  = require('compression');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');

dotenv.config();

const requiredEnvVars = ['SESSION_SECRET', 'NODE_ENV'];
requiredEnvVars.forEach((v) => {
  if (!process.env[v]) { console.error(`Missing: ${v}`); process.exit(1); }
});

const patientRoutes     = require('./routes/patients');
const userRoutes        = require('./routes/users');
const appointmentRoutes = require('./routes/appointments');
const serviceRoutes     = require('./routes/services');
const { otpRoutes }     = require('./routes/otp');
const authRoutes        = require('./routes/auth');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Allowed origins (Express CORS + Socket.io CORS share the same list)
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
];

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Use both polling and websocket so the browser can always connect
  transports: ['polling', 'websocket'],
});

// Share the express-session with Socket.io so you can read session data
// inside socket event handlers via  socket.request.session
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 1000 },
  rolling: true,
});

app.use(sessionMiddleware);

// Let Socket.io use the same session middleware
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// ---------------------------------------------------------------------------
// Socket.io connection handler
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  const session = socket.request.session;
  const userId  = session?.userId;

  console.log(`[socket.io] connected  id=${socket.id}  userId=${userId ?? 'guest'}`);

  // Join a private room keyed by userId so you can push to a specific user:
  //   io.to(`user:${userId}`).emit('event', data)
  if (userId) socket.join(`user:${userId}`);

  // Admin room — join if the session role is admin
  if (session?.role === 'admin') socket.join('admin');

  socket.on('disconnect', (reason) => {
    console.log(`[socket.io] disconnected id=${socket.id} reason=${reason}`);
  });

  // Example ping/pong — useful for testing the connection from the browser
  socket.on('ping', (cb) => {
    if (typeof cb === 'function') cb({ status: 'pong', ts: Date.now() });
  });
});

// Export io so route files can emit events:
//   const { io } = require('../server');
//   io.to('admin').emit('new_appointment', { ... });
module.exports.io = io;

// ---------------------------------------------------------------------------
// Helmet / CSP
// ---------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      connectSrc:     ["'self'",
                       'ws://localhost:3000', 'wss://localhost:3000',
                       'http://localhost:3000', 'http://localhost:5173'],
      scriptSrc:      ["'self'", "'unsafe-inline'", "'unsafe-eval'",
                       'https://cdn.jsdelivr.net', 'https://cdn.socket.io',
                       'https://code.jquery.com', 'https://cdn.tailwindcss.com',
                       'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'https://cdn.tiny.cloud'],
      scriptSrcAttr:  ["'unsafe-inline'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net',
                       'https://cdn.tailwindcss.com', 'https://fonts.googleapis.com',
                       'https://unpkg.com', 'https://cdnjs.cloudflare.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'data:'],
      imgSrc:         ["'self'", 'data:'],
      formAction:     ["'self'"],
      frameSrc:       ["'self'", 'https://www.google.com'],
      frameAncestors: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ---------------------------------------------------------------------------
// Standard middleware
// ---------------------------------------------------------------------------
app.use(compression());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(morgan('dev'));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'front')));
app.use('/admin',  express.static(path.join(__dirname, 'front', 'admin')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.get('/ping', (_req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------
const PUBLIC_PATHS    = ['/', '/index.html', '/pages-login.html', '/ping'];
const PUBLIC_PREFIXES = [
  '/api/send-otp', '/api/verify-otp', '/auth/', '/api/services/all',
  '/patients/check-username', '/check-username',
];

app.use((req, res, next) => {
  if (PUBLIC_PATHS.includes(req.path)) return next();
  if (PUBLIC_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  if (req.path === '/patients' && req.method === 'POST') return next();
  if (!req.session?.isLoggedIn || !req.session?.userId) {
    if (req.path.startsWith('/api/') || req.path.startsWith('/patients') || req.path.startsWith('/users'))
      return res.status(401).json({ error: 'unauthorized', message: 'Unauthorized' });
    return res.redirect('/pages-login.html');
  }
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api',              otpRoutes);
app.use('/patients',         patientRoutes.router || patientRoutes);
app.use('/users',            userRoutes.router    || userRoutes);
app.use('/api/appointments', appointmentRoutes.router || appointmentRoutes);
app.use('/api/services',     serviceRoutes.router  || serviceRoutes);
app.use('/auth',             authRoutes);

// ---------------------------------------------------------------------------
// Utility endpoints
// ---------------------------------------------------------------------------
app.get('/check-auth', (req, res) => {
  if (req.session?.isLoggedIn && req.session?.userId)
    return res.json({ isLoggedIn: true, userId: req.session.userId, role: req.session.role || 'patient' });
  res.json({ isLoggedIn: false });
});

app.get('/check-username', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'bad_request', message: 'Username is required' });
  try {
    const result = await require('./db').query('SELECT id FROM users WHERE username = $1', [username]);
    res.json({ exists: result.rows.length > 0 });
  } catch (err) {
    console.error('check-username error:', err);
    res.status(500).json({ error: 'server_error', message: 'Error checking username' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'server_error', message: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.redirect('/pages-login.html');
  });
});

app.get('/profile.html',         (_req, res) => res.sendFile(path.join(__dirname, 'front', 'profile.html')));
app.get('/make-appointment.html', (_req, res) => res.sendFile(path.join(__dirname, 'front', 'make-appointment.html')));
app.get('/admin/index.html',      (_req, res) => res.sendFile(path.join(__dirname, 'front', 'admin', 'index.html')));
app.get('/',                      (_req, res) => res.sendFile(path.join(__dirname, 'front', 'index.html')));

app.get('/*.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'front', req.path), (err) => {
    if (err) res.status(404).sendFile(path.join(__dirname, 'front', 'index.html'));
  });
});

// ---------------------------------------------------------------------------
// Error handlers
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong' });
});

app.use((req, res) => res.status(404).json({ error: 'not_found', message: `Cannot ${req.method} ${req.path}` }));

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
const shutdown = () => {
  io.close(() => console.log('Socket.io closed'));
  require('./db').end(() => { console.log('DB pool closed'); process.exit(0); });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// ---------------------------------------------------------------------------
// Start (use server.listen, NOT app.listen)
// ---------------------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`\n🦷  Dental Clinic API  →  http://localhost:${PORT}`);
  console.log(`🔌  Socket.io          →  ws://localhost:${PORT}`);
  console.log(`🌿  NODE_ENV = ${process.env.NODE_ENV}\n`);
});