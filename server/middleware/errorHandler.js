import { logger } from '../utils/logger.js';

/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends APIError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Custom error class for authentication errors
 */
export class AuthenticationError extends APIError {
  constructor(message, details = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Custom error class for authorization errors
 */
export class AuthorizationError extends APIError {
  constructor(message, details = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', details);
    this.name = 'AuthorizationError';
  }
}

/**
 * Custom error class for not found errors
 */
export class NotFoundError extends APIError {
  constructor(message, details = null) {
    super(message, 404, 'NOT_FOUND_ERROR', details);
    this.name = 'NotFoundError';
  }
}

/**
 * Custom error class for conflict errors
 */
export class ConflictError extends APIError {
  constructor(message, details = null) {
    super(message, 409, 'CONFLICT_ERROR', details);
    this.name = 'ConflictError';
  }
}

/**
 * Custom error class for database errors
 */
export class DatabaseError extends APIError {
  constructor(message, details = null) {
    super(message, 500, 'DATABASE_ERROR', details);
    this.name = 'DatabaseError';
  }
}

/**
 * 404 handler middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const notFound = (req, res, next) => {
  const error = new NotFoundError(`Resource not found: ${req.method} ${req.originalUrl}`);
  next(error);
};

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const errorHandler = (err, req, res, next) => {
  let error = err;

  // Default error response
  let response = {
    error: 'Internal Server Error',
    message: 'Something went wrong',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  // Handle different types of errors
  if (error instanceof APIError) {
    // Custom API errors
    response.error = error.name;
    response.message = error.message;
    response.code = error.code;
    response.statusCode = error.statusCode;
    
    if (error.details) {
      response.details = error.details;
    }
  } else if (error.name === 'ValidationError') {
    // Mongoose/Joi validation errors
    response.error = 'Validation Error';
    response.message = error.message;
    response.code = 'VALIDATION_ERROR';
    response.statusCode = 400;
    
    if (error.details) {
      response.details = error.details;
    }
  } else if (error.name === 'CastError') {
    // Database cast errors (invalid ObjectId, etc.)
    response.error = 'Invalid Data Format';
    response.message = 'Invalid data format provided';
    response.code = 'INVALID_FORMAT';
    response.statusCode = 400;
  } else if (error.code === 11000) {
    // MongoDB duplicate key error
    const field = Object.keys(error.keyValue)[0];
    response.error = 'Duplicate Entry';
    response.message = `${field} already exists`;
    response.code = 'DUPLICATE_ENTRY';
    response.statusCode = 409;
    response.details = { field, value: error.keyValue[field] };
  } else if (error.name === 'JsonWebTokenError') {
    // JWT errors
    response.error = 'Authentication Error';
    response.message = 'Invalid token';
    response.code = 'INVALID_TOKEN';
    response.statusCode = 401;
  } else if (error.name === 'TokenExpiredError') {
    // JWT expiration errors
    response.error = 'Authentication Error';
    response.message = 'Token expired';
    response.code = 'TOKEN_EXPIRED';
    response.statusCode = 401;
  } else if (error.name === 'MulterError') {
    // File upload errors
    response.error = 'File Upload Error';
    response.code = 'FILE_UPLOAD_ERROR';
    response.statusCode = 400;
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      response.message = 'File too large';
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      response.message = 'Too many files';
    } else {
      response.message = error.message;
    }
  } else if (error.type === 'entity.parse.failed') {
    // JSON parsing errors
    response.error = 'Parse Error';
    response.message = 'Invalid JSON format';
    response.code = 'INVALID_JSON';
    response.statusCode = 400;
  } else if (error.type === 'entity.too.large') {
    // Request too large
    response.error = 'Request Too Large';
    response.message = 'Request payload too large';
    response.code = 'PAYLOAD_TOO_LARGE';
    response.statusCode = 413;
  } else if (error.code && error.code.startsWith('ER_')) {
    // MySQL/SQL Server errors
    response.error = 'Database Error';
    response.code = 'DATABASE_ERROR';
    response.statusCode = 500;

    if (error.code === 'ER_DUP_ENTRY') {
      response.message = 'Duplicate entry found';
      response.statusCode = 409;
    } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      response.message = 'Referenced record not found';
      response.statusCode = 400;
    } else {
      response.message = 'Database operation failed';
    }
  } else if (error.code === 'INVALID_HIERARCHY_TRANSFER') {
    // Device transfer hierarchy validation errors
    response.error = 'Transfer Not Allowed';
    response.message = error.message;
    response.code = error.code;
    response.statusCode = 400;
  } else if (error.code === 'DEVICE_ALREADY_TRANSFERRED') {
    // Device already transferred error
    response.error = 'Transfer Not Allowed';
    response.message = error.message;
    response.code = error.code;
    response.statusCode = 400;
  } else if (error.message && error instanceof Error) {
    // Generic Error objects with custom messages - preserve the message
    response.error = 'Bad Request';
    response.message = error.message;
    response.code = error.code || 'ERROR';
    response.statusCode = 400;
  }

  // Set status code
  const statusCode = response.statusCode || error.statusCode || 500;

  // Log error
  const logData = {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    },
    user: req.user ? {
      id: req.user.user_id,
      email: req.user.email
    } : null,
    statusCode
  };

  if (statusCode >= 500) {
    logger.error('Server Error:', logData);
  } else if (statusCode >= 400) {
    logger.warn('Client Error:', logData);
  }

  // Remove sensitive information in production
  if (process.env.NODE_ENV === 'production') {
    delete response.stack;
    
    // Don't expose internal error details
    if (statusCode >= 500) {
      response.message = 'Internal server error';
      delete response.details;
    }
  } else {
    // Include stack trace in development
    if (error.stack) {
      response.stack = error.stack;
    }
  }

  // Send error response
  res.status(statusCode).json(response);
};

/**
 * Async error handler wrapper
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Create error response helper
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Error code
 * @param {Object} details - Additional details
 * @returns {APIError} API error instance
 */
export const createError = (message, statusCode = 500, code = null, details = null) => {
  return new APIError(message, statusCode, code, details);
};

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    }
  });
  
  // Close server gracefully
  process.exit(1);
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    }
  });
  
  // Close server gracefully
  process.exit(1);
});

export default {
  APIError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  notFound,
  errorHandler,
  asyncHandler,
  createError
};