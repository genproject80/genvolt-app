import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateMe,
  changePassword,
  validateToken
} from '../controllers/authController.js';

const router = express.Router();

/**
 * Validation rules for user registration
 */
const registerValidation = [
  body('client_id')
    .isInt({ min: 1 })
    .withMessage('Client ID must be a positive integer'),
  body('first_name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be between 1-50 characters'),
  body('last_name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be between 1-50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('ph_no')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/)
    .withMessage('Phone number must be valid'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  body('user_name')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('role_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer')
];

/**
 * Validation rules for user login
 */
const loginValidation = [
  body('email')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Email or username is required'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required'),
  body('remember_me')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be a boolean')
];

/**
 * Validation rules for refresh token
 */
const refreshTokenValidation = [
  body('refreshToken')
    .optional()
    .isString()
    .withMessage('Refresh token must be a string')
];

/**
 * Validation rules for profile update
 */
const updateProfileValidation = [
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name must be between 1-50 characters'),
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name must be between 1-50 characters'),
  body('ph_no')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/)
    .withMessage('Phone number must be valid')
];

/**
 * Validation rules for password change
 */
const changePasswordValidation = [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

// Public routes (no authentication required)

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', registerValidation, register);

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login', loginValidation, login);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', refreshTokenValidation, refreshToken);

// Protected routes (authentication required)

/**
 * POST /api/auth/logout
 * User logout
 */
router.post('/logout', authenticate, logout);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticate, getMe);

/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put('/me', authenticate, updateProfileValidation, updateMe);

/**
 * PUT /api/auth/change-password
 * Change user password
 */
router.put('/change-password', authenticate, changePasswordValidation, changePassword);

/**
 * GET /api/auth/validate
 * Validate current token
 */
router.get('/validate', authenticate, validateToken);

// Admin only routes

/**
 * POST /api/auth/register-admin
 * Register a new user (admin only)
 */
router.post('/register-admin', 
  authenticate, 
  registerValidation, 
  register
);

export default router;