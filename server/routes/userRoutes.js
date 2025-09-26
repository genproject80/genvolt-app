import express from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { sanitizeInput, validatePagination } from '../middleware/validation.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  resetUserPassword,
  getUserStats
} from '../controllers/userController.js';

const router = express.Router();

// Apply authentication to all user routes
router.use(authenticate);

/**
 * Validation rules for user creation
 */
const createUserValidation = [
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
    .isLength({ min: 1 })
    .withMessage('Password is required'),
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
 * Validation rules for user update
 */
const updateUserValidation = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer'),
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
    .optional({ nullable: true })
    .if((value) => value !== null && value !== undefined && value !== '')
    .matches(/^\+?[\d\s\-\(\)]{10,15}$/)
    .withMessage('Phone number must be valid'),
  body('role_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('Active status must be a boolean')
];

/**
 * Validation rules for user status update
 */
const updateUserStatusValidation = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer'),
  body('is_active')
    .isBoolean()
    .withMessage('Active status must be a boolean')
];

/**
 * Validation rules for password reset
 */
const resetPasswordValidation = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer'),
  body('newPassword')
    .isLength({ min: 1 })
    .withMessage('New password is required')
];

/**
 * Validation rules for user ID parameter
 */
const userIdValidation = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer')
];

// Routes

/**
 * GET /api/users/stats
 * Get user statistics (requires View User permission)
 */
router.get('/stats',
  requirePermission('View User'),
  getUserStats
);

/**
 * GET /api/users
 * Get all users (requires View User permission)
 */
router.get('/',
  requirePermission('View User'),
  validatePagination,
  sanitizeInput,
  getUsers
);

/**
 * GET /api/users/:userId
 * Get user by ID (requires View User permission)
 */
router.get('/:userId',
  requirePermission('View User'),
  userIdValidation,
  getUserById
);

/**
 * POST /api/users
 * Create new user (requires Create User permission)
 */
router.post('/',
  requirePermission('Create User'),
  createUserValidation,
  sanitizeInput,
  createUser
);

/**
 * PUT /api/users/:userId
 * Update user (requires Edit User permission)
 */
router.put('/:userId',
  requirePermission('Edit User'),
  updateUserValidation,
  sanitizeInput,
  updateUser
);

/**
 * PATCH /api/users/:userId/status
 * Update user status (requires Edit User permission)
 */
router.patch('/:userId/status',
  requirePermission('Edit User'),
  updateUserStatusValidation,
  updateUserStatus
);

/**
 * POST /api/users/:userId/reset-password
 * Reset user password (requires Edit User permission)
 */
router.post('/:userId/reset-password',
  requirePermission('Edit User'),
  resetPasswordValidation,
  resetUserPassword
);

/**
 * DELETE /api/users/:userId
 * Delete user (soft delete - deactivate) (requires Delete User permission)
 */
router.delete('/:userId',
  requirePermission('Delete User'),
  userIdValidation,
  deleteUser
);

export default router;