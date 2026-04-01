import { body, param, query, validationResult } from 'express-validator';
import { ValidationError } from './errorHandler.js';

/**
 * Middleware to handle validation results
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));

    console.error('Validation errors:', JSON.stringify(formattedErrors, null, 2));
    throw new ValidationError('Validation failed', formattedErrors);
  }
  next();
};

/**
 * Common validation rules
 */

// User ID validation
export const validateUserId = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer'),
  handleValidationErrors
];

// Client ID validation
export const validateClientId = [
  param('clientId')
    .isInt({ min: 1 })
    .withMessage('Client ID must be a positive integer'),
  handleValidationErrors
];

// Email validation
export const validateEmail = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  handleValidationErrors
];

// Password validation (strong password)
export const validatePassword = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  handleValidationErrors
];

// Username validation
export const validateUsername = [
  body('user_name')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  handleValidationErrors
];

// Phone number validation
export const validatePhoneNumber = [
  body('ph_no')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/)
    .withMessage('Phone number must be valid'),
  handleValidationErrors
];

// Name validation
export const validateName = [
  body('first_name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be between 1-50 characters'),
  body('last_name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be between 1-50 characters'),
  handleValidationErrors
];

// Pagination validation
export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('sortBy')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Sort by field must be specified'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be either asc or desc'),
  handleValidationErrors
];

// Date range validation
export const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('End date must be a valid ISO 8601 date'),
  handleValidationErrors
];

// Search validation
export const validateSearch = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1-100 characters'),
  handleValidationErrors
];

// Role validation
export const validateRole = [
  body('role_id')
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer'),
  handleValidationErrors
];

// Status validation
export const validateStatus = [
  body('is_active')
    .isBoolean()
    .withMessage('Status must be a boolean value'),
  handleValidationErrors
];

/**
 * Sanitization middleware
 */
export const sanitizeInput = (req, res, next) => {
  // Remove potentially dangerous characters from string inputs
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/<[^>]*>?/gm, '') // Remove HTML tags
      .trim();
  };

  // Recursively sanitize object
  const sanitizeObject = (obj) => {
    if (obj === null || typeof obj !== 'object') {
      return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        sanitized[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitized;
  };

  // Sanitize request body, params, and query
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.params) req.params = sanitizeObject(req.params);
  if (req.query) req.query = sanitizeObject(req.query);

  next();
};

/**
 * Custom validation for specific business rules
 */

// Validate that end date is after start date
export const validateDateRangeLogic = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      throw new ValidationError('End date must be after start date');
    }
  }
  
  next();
};

// Validate file upload
export const validateFileUpload = (allowedTypes = [], maxSize = 5 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file) {
      return next();
    }

    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(req.file.mimetype)) {
      throw new ValidationError(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Check file size
    if (req.file.size > maxSize) {
      throw new ValidationError(`File too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    next();
  };
};

export default {
  handleValidationErrors,
  validateUserId,
  validateClientId,
  validateEmail,
  validatePassword,
  validateUsername,
  validatePhoneNumber,
  validateName,
  validatePagination,
  validateDateRange,
  validateSearch,
  validateRole,
  validateStatus,
  sanitizeInput,
  validateDateRangeLogic,
  validateFileUpload
};