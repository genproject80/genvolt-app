import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

// Configure colors
winston.addColors(logColors);

// Create log directory if it doesn't exist
const logDir = path.join(path.dirname(__dirname), 'logs');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Define console format
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(info => {
    const { timestamp, level, message, ...meta } = info;
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaStr}`;
  })
);

// Create transports array
const transports = [
  // Console transport
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info'
  })
];

// Add file transports only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    })
  );

  // HTTP requests log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'http.log'),
      level: 'http',
      format: logFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: logFormat,
  transports,
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true
});

// Create a stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  }
};

// Helper methods for structured logging

/**
 * Log authentication events
 * @param {string} event - Auth event type
 * @param {Object} details - Event details
 */
export const logAuth = (event, details) => {
  logger.info('Auth Event', {
    type: 'authentication',
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log database operations
 * @param {string} operation - DB operation type
 * @param {Object} details - Operation details
 */
export const logDB = (operation, details) => {
  logger.debug('Database Operation', {
    type: 'database',
    operation,
    ...details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log security events
 * @param {string} event - Security event type
 * @param {Object} details - Event details
 */
export const logSecurity = (event, details) => {
  logger.warn('Security Event', {
    type: 'security',
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log API requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in ms
 */
export const logRequest = (req, res, duration) => {
  const logData = {
    type: 'http_request',
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    duration: `${duration}ms`,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  };

  if (req.user) {
    logData.userId = req.user.user_id;
  }

  if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.http('HTTP Request', logData);
  }
};

/**
 * Log application performance metrics
 * @param {string} metric - Metric name
 * @param {number} value - Metric value
 * @param {string} unit - Metric unit
 */
export const logMetric = (metric, value, unit = '') => {
  logger.info('Performance Metric', {
    type: 'performance',
    metric,
    value,
    unit,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log business logic events
 * @param {string} event - Business event
 * @param {Object} details - Event details
 */
export const logBusiness = (event, details) => {
  logger.info('Business Event', {
    type: 'business',
    event,
    ...details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Format error for logging
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 * @returns {Object} Formatted error object
 */
export const formatError = (error, context = {}) => {
  return {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    ...context,
    timestamp: new Date().toISOString()
  };
};

/**
 * Create child logger with default metadata
 * @param {Object} defaultMeta - Default metadata to include
 * @returns {Object} Child logger instance
 */
export const createChildLogger = (defaultMeta) => {
  return logger.child(defaultMeta);
};

export default logger;