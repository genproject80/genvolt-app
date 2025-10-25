// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

// Import custom modules
import { connectDB } from './config/database.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import clientRoutes from './routes/clientRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import permissionRoutes from './routes/permissionRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import hierarchyFilterRoutes from './routes/hierarchyFilterRoutes.js';
import iotDataRoutes from './routes/iotDataRoutes.js';
import deviceDetailRoutes from './routes/deviceDetailRoutes.js';
import deviceRoutes from './routes/deviceRoutes.js';
import userPreferencesRoutes from './routes/userPreferencesRoutes.js';

const app = express();
const PORT = process.env.PORT || 5001;

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In development, allow any localhost origin
    if (origin && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }

    // Fallback: check against allowed origins
    const allowedOrigins = [
      process.env.CORS_ORIGIN || 'http://localhost:3008',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005',
      'http://localhost:3006',
      'http://localhost:3007',
      'http://localhost:3009'
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(compression());
app.use(cookieParser());
// Temporarily disable rate limiting for debugging
// app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { 
    stream: { write: message => logger.info(message.trim()) }
  }));
}

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    database: 'Not Connected'
  };

  // Check database connection
  try {
    const { checkDatabaseHealth } = await import('./config/database.js');
    const dbHealth = await checkDatabaseHealth();
    health.database = dbHealth.status === 'healthy' ? 'Connected' : 'Error';
  } catch (error) {
    health.database = 'Error';
  }

  res.status(200).json(health);
});

// Debug logging for all API requests
app.use('/api', (req, res, next) => {
  console.log(`API Request: ${req.method} ${req.originalUrl}`);
  next();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/hierarchy-filters', hierarchyFilterRoutes);
app.use('/api/iot-data', iotDataRoutes);
app.use('/api/device-details', deviceDetailRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/user-preferences', userPreferencesRoutes);

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'GenVolt IoT Dashboard API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      clients: '/api/clients',
      roles: '/api/roles',
      permissions: '/api/permissions',
      dashboards: '/api/dashboards',
      hierarchyFilters: '/api/hierarchy-filters',
      iotData: '/api/iot-data',
      deviceDetails: '/api/device-details',
      devices: '/api/devices',
      userPreferences: '/api/user-preferences'
    }
  });
});

// 404 handler
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    // Try to connect to database (don't fail if it doesn't work)
    try {
      await connectDB();
      logger.info('✅ Database connection successful');
    } catch (dbError) {
      logger.warn('⚠️  Database connection failed - server will start without database:', dbError.message);
      logger.warn('⚠️  Please check your database configuration in .env file');
      logger.warn('⚠️  Authentication endpoints will not work until database is connected');
    }
    
    app.listen(PORT, () => {
      logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔗 API documentation: http://localhost:${PORT}/api`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🌐 Server: http://localhost:${PORT}`);
        console.log(`🔍 Health: http://localhost:${PORT}/health`);
        console.log(`📋 API Info: http://localhost:${PORT}/api`);
        console.log(`\n📝 Database Setup:`);
        console.log(`   Please update the database credentials in .env file:`);
        console.log(`   - DB_SERVER: Your SQL Server host`);
        console.log(`   - DB_DATABASE: Your database name`);
        console.log(`   - DB_USER: Your database username`);
        console.log(`   - DB_PASSWORD: Your database password`);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;