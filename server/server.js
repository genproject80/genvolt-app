// Load environment variables first — must use side-effect import so dotenv
// runs during the ES module import phase, before any other module reads process.env
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

// Import custom modules
import { connectDB } from './config/database.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import mqttService from './services/mqttService.js';
import mqttListenerService from './services/mqttListenerService.js';

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
import hkmiTableRoutes from './routes/hkmiTableRoutes.js';
import p3DataRoutes from './routes/p3DataRoutes.js';
import p3DeviceDetailRoutes from './routes/p3DeviceDetailRoutes.js';
import deviceTestingRoutes from './routes/deviceTestingRoutes.js';
import tableConfigRoutes from './routes/tableConfigRoutes.js';
import hyPureRoutes from './routes/hyPureRoutes.js';
import mqttAuthRoutes from './routes/mqttAuthRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import planRoutes from './routes/planRoutes.js';
import discountRoutes from './routes/discountRoutes.js';
import topicConfigRoutes from './routes/topicConfigRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import featureFlagRoutes from './routes/featureFlagRoutes.js';

const app = express();
const PORT = process.env.PORT || 5001;

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
      'https://iot.cloudsynk.net', // Custom domain PROD frontend
      'https://thankful-bay-0638b7700.3.azurestaticapps.net', // DEV frontend
      'https://lively-sand-08d4b6900.3.azurestaticapps.net', // PROD frontend
      'https://gray-sea-04f43a100.4.azurestaticapps.net', // NEW PROD frontend
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005',
      'http://localhost:3006',
      'http://localhost:3007',
      'http://localhost:3009',
      ...(process.env.CORS_EXTRA_ORIGINS
        ? process.env.CORS_EXTRA_ORIGINS.split(',').map(s => s.trim())
        : []),
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('CORS blocked origin:', origin);
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

// Razorpay webhook — must use raw body BEFORE express.json() parses the body
// This route captures the raw Buffer needed for HMAC signature verification.
app.use('/api/razorpay', express.raw({ type: 'application/json' }), webhookRoutes);

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
// IMPORTANT: More specific routes must be registered before general routes
app.use('/api/iot-data/p3', p3DataRoutes);
app.use('/api/iot-data', iotDataRoutes);
app.use('/api/p3-device-details', p3DeviceDetailRoutes);
app.use('/api/device-details', deviceDetailRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/user-preferences', userPreferencesRoutes);
app.use('/api/hkmi-table', hkmiTableRoutes);
app.use('/api/iot-data/p3', p3DataRoutes);
app.use('/api/p3-device-details', p3DeviceDetailRoutes);
// Subscription & billing routes
app.use('/api/subscriptions', subscriptionRoutes);
// Plan management (admin)
app.use('/api/subscription-plans', planRoutes);
// Discount management (admin)
app.use('/api/discounts', discountRoutes);
// Topic pattern configuration (SYSTEM_ADMIN)
app.use('/api/topic-config', topicConfigRoutes);
app.use('/api/inventory', inventoryRoutes);
// Feature flags (admin toggle + client read)
app.use('/api/feature-flags', featureFlagRoutes);

// MQTT hooks — called by EMQX broker, no JWT auth
app.use('/api', mqttAuthRoutes);
app.use('/api/device-testing', deviceTestingRoutes);
app.use('/api/table-config', tableConfigRoutes);
app.use('/api/hypure', hyPureRoutes);

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
      userPreferences: '/api/user-preferences',
      hkmiTable: '/api/hkmi-table',
      p3Data: '/api/iot-data/p3',
      p3DeviceDetails: '/api/p3-device-details',
      deviceTesting: '/api/device-testing',
      tableConfig: '/api/table-config'
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
  mqttService.disconnect();
  mqttListenerService.disconnect();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  mqttService.disconnect();
  mqttListenerService.disconnect();
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

    // Connect to MQTT broker (non-blocking — server starts even if MQTT is unavailable)
    mqttService.connect();

    // Start MQTT listener (pre-activation + telemetry ingestion)
    mqttListenerService.connect();

    // Start subscription expiry cron (runs every hour)
    const { startSubscriptionCron } = await import('./services/subscriptionCron.js');
    startSubscriptionCron();

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