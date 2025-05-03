const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible'); // Upgraded rate limiting
const validator = require('validator'); // Added for input validation
const helmet = require('helmet'); // Added for security headers
const winston = require('winston'); // Added for structured logging

require('dotenv').config();

// Initialize router
const router = express.Router();
router.use(express.json({ limit: '10kb' })); // Limit payload size for security

// Validate critical environment variables
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'REDIS_URL', 'NODE_ENV'];
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

// Rate limiters using RateLimiterRedis
const getServicesLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:services:get',
  points: 100, // 100 requests per 15 minutes
  duration: 15 * 60,
  blockDuration: 15 * 60,
  keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
});

const getAllServicesLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:services:all',
  points: 100, // 100 requests per 15 minutes
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

const addServiceLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:services:add',
  points: 10, // 10 requests per hour
  duration: 60 * 60,
  blockDuration: 60 * 60,
  keyGenerator: (req) => `user:${req.session?.userId || 'unknown'}`,
});

const deleteServiceLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:services:delete',
  points: 10, // 10 requests per hour
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
      success: false,
      message: 'Too many requests, please try again later',
    });
  }
};

// Middleware to check authentication
const isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.isLoggedIn || !req.session.userId) {
    logger.warn(`Unauthorized access attempt: ${req.method} ${req.path}`);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  logger.info(`Authenticated request by userId: ${req.session.userId} for ${req.method} ${req.path}`);
  next();
};

// Middleware to check admin role
const isAdmin = async (req, res, next) => {
  try {
    logger.info(`Checking admin role for userId: ${req.session.userId}`);
    const { data, error } = await supabase
      .from('admin')
      .select('id')
      .eq('id', req.session.userId)
      .single();
    if (error || !data) {
      logger.warn(`Admin access denied for userId: ${req.session.userId}`);
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    logger.info(`Admin access granted for userId: ${req.session.userId}`);
    next();
  } catch (error) {
    logger.error('Error checking admin role:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Socket.IO handlers
const handleServiceAdded = (io, data) => {
  try {
    logger.info('Emitting service_added via Socket.IO:', data);
    io.emit('service_added', {
      service: {
        id: data.service.id,
        name: data.service.name,
        description: data.service.description,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error in service_added handler:', error);
  }
};

const handleServiceDeleted = (io, data) => {
  try {
    logger.info('Emitting service_deleted via Socket.IO:', data);
    io.emit('service_deleted', {
      serviceId: data.serviceId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error in service_deleted handler:', error);
  }
};

// GET /api/services - Fetch services for the logged-in user
router.get('/', isAuthenticated, applyRateLimiter(getServicesLimiter), async (req, res) => {
  try {
    logger.info(`Fetching services for userId: ${req.session.userId}`);
    const { data: appointments, error: appointmentError } = await supabase
      .from('appointments')
      .select('service_id')
      .eq('user_id', req.session.userId);

    if (appointmentError) {
      logger.error('Supabase appointment error:', appointmentError);
      throw new Error('Failed to fetch appointments');
    }

    if (!appointments || appointments.length === 0) {
      logger.info(`No appointments found for userId: ${req.session.userId}`);
      return res.status(200).json({ success: true, services: [] });
    }

    const serviceIds = [...new Set(appointments.map((app) => app.service_id))];
    const { data: services, error: serviceError } = await supabase
      .from('services')
      .select('id, name, description')
      .in('id', serviceIds)
      .order('name', { ascending: true });

    if (serviceError) {
      logger.error('Supabase service error:', serviceError);
      throw new Error('Failed to fetch services');
    }

    logger.info(`Fetched ${services.length} services for userId: ${req.session.userId}`);
    res.status(200).json({ success: true, services: services || [] });
  } catch (error) {
    logger.error('Error fetching user services:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user services' });
  }
});

// GET /api/services/all - Public services list
router.get('/all', applyRateLimiter(getAllServicesLimiter), async (req, res) => {
  try {
    logger.info('Fetching all services');
    const { data, error } = await supabase
      .from('services')
      .select('id, name, description')
      .order('name', { ascending: true });

    if (error) {
      logger.error('Supabase error:', error);
      throw new Error('Failed to fetch services');
    }

    logger.info(`Fetched ${data.length} services`);
    res.status(200).json({ success: true, services: data || [] });
  } catch (error) {
    logger.error('Error fetching all services:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch all services' });
  }
});

// POST /api/services - Add a new service
router.post('/', isAuthenticated, isAdmin, applyRateLimiter(addServiceLimiter), async (req, res) => {
  try {
    const { name, description } = req.body;

    // Validate inputs
    if (!name || !description) {
      logger.warn('Missing name or description for service addition');
      return res.status(400).json({ success: false, message: 'Name and description are required' });
    }
    if (!validator.isLength(name, { min: 1, max: 100 })) {
      logger.warn(`Invalid service name length: ${name}`);
      return res.status(400).json({ success: false, message: 'Service name must be 1-100 characters' });
    }
    if (!validator.isLength(description, { min: 1, max: 500 })) {
      logger.warn(`Invalid service description length: ${description.length}`);
      return res.status(400).json({ success: false, message: 'Service description must be 1-500 characters' });
    }

    // Check for duplicate service name
    const { data: existingService, error: checkError } = await supabase
      .from('services')
      .select('id')
      .eq('name', name)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116: no rows found
      logger.error('Supabase error checking service:', checkError);
      throw new Error('Failed to check existing service');
    }
    if (existingService) {
      logger.warn(`Service name already exists: ${name}`);
      return res.status(400).json({ success: false, message: 'Service name already exists' });
    }

    // Insert new service
    const { data, error } = await supabase
      .from('services')
      .insert([{ name, description }])
      .select()
      .single();

    if (error) {
      logger.error('Supabase error inserting service:', error);
      throw new Error('Failed to add service');
    }

    // Emit Socket.IO event
    const io = req.app.get('socketio');
    handleServiceAdded(io, { service: data });

    logger.info(`Service added: ${name} by userId: ${req.session.userId}`);
    res.status(201).json({
      success: true,
      message: 'Service added successfully',
      service: data,
    });
  } catch (error) {
    logger.error('Error adding service:', error);
    res.status(500).json({ success: false, message: 'Failed to add service' });
  }
});

// DELETE /api/services/:id - Delete a service
router.delete('/:id', isAuthenticated, isAdmin, applyRateLimiter(deleteServiceLimiter), async (req, res) => {
  try {
    const { id } = req.params;

    // Validate service ID
    if (!validator.isInt(id, { min: 1 })) {
      logger.warn(`Invalid service ID: ${id}`);
      return res.status(400).json({ success: false, message: 'Invalid service ID' });
    }

    // Check if service exists
    const { data: service, error: checkError } = await supabase
      .from('services')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !service) {
      logger.warn(`Service not found: ${id}`);
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    // Check if service is linked to appointments
    const { data: appointments, error: appointmentError } = await supabase
      .from('appointments')
      .select('id')
      .eq('service_id', id)
      .limit(1);

    if (appointmentError) {
      logger.error('Supabase error checking appointments:', appointmentError);
      throw new Error('Failed to check appointments');
    }
    if (appointments && appointments.length > 0) {
      logger.warn(`Service ${id} cannot be deleted due to existing appointments`);
      return res.status(400).json({ success: false, message: 'Cannot delete service with existing appointments' });
    }

    // Delete service
    const { error: deleteError } = await supabase
      .from('services')
      .delete()
      .eq('id', id);

    if (deleteError) {
      logger.error('Supabase delete error:', deleteError);
      throw new Error('Failed to delete service');
    }

    // Emit Socket.IO event
    const io = req.app.get('socketio');
    handleServiceDeleted(io, { serviceId: id });

    logger.info(`Service deleted: ${id} by userId: ${req.session.userId}`);
    res.status(200).json({
      success: true,
      message: 'Service deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting service:', error);
    res.status(500).json({ success: false, message: 'Failed to delete service' });
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
  res.status(500).json({ success: false, message: 'Something went wrong on the server' });
});

// Graceful shutdown for Redis
process.on('SIGTERM', () => {
  logger.info('Shutting down Redis connection');
  redis.quit(() => {
    logger.info('Redis connection closed');
    process.exit(0);
  });
});

// Exports
module.exports = {
  router,
  handleServiceAdded,
  handleServiceDeleted,
};