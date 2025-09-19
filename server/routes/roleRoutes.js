import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  updateRolePermissions,
  getRoleUsers,
  getRoleStats,
  checkRoleNameAvailability,
  getPermissionMatrix
} from '../controllers/roleController.js';

const router = express.Router();

/**
 * Validation rules for role creation
 */
const createRoleValidation = [
  body('role_name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Role name must be between 2-100 characters')
    .matches(/^[a-zA-Z0-9\s_-]+$/)
    .withMessage('Role name can only contain letters, numbers, spaces, underscores, and hyphens'),
  body('permission_ids')
    .optional()
    .isArray({ max: 50 })
    .withMessage('Permission IDs must be an array with maximum 50 items'),
  body('permission_ids.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Each permission ID must be a positive integer')
];

/**
 * Validation rules for role update
 */
const updateRoleValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer'),
  body('role_name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Role name must be between 2-100 characters')
    .matches(/^[a-zA-Z0-9\s_-]+$/)
    .withMessage('Role name can only contain letters, numbers, spaces, underscores, and hyphens')
];

/**
 * Validation rules for role ID parameter
 */
const roleIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer')
];

/**
 * Validation rules for role permissions update
 */
const updateRolePermissionsValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer'),
  body('permission_ids')
    .isArray({ max: 50 })
    .withMessage('Permission IDs must be an array with maximum 50 items'),
  body('permission_ids.*')
    .isInt({ min: 1 })
    .withMessage('Each permission ID must be a positive integer')
];

/**
 * Validation rules for role name check
 */
const checkRoleNameValidation = [
  param('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Role name must be between 2-100 characters'),
  query('exclude_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Exclude ID must be a positive integer')
];

/**
 * Validation rules for pagination and search
 */
const paginationValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1-100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1-100 characters')
];

// Apply authentication to all routes
router.use(authenticate);

// Role statistics (no specific permission required, authenticated users can view stats)
router.get('/stats', getRoleStats);

// Role name availability check
router.get('/check-name/:name', checkRoleNameValidation, checkRoleNameAvailability);

// Permission matrix
router.get('/permission-matrix', getPermissionMatrix);

// Get all roles with pagination and search
router.get('/', paginationValidation, getAllRoles);

// Get role by ID
router.get('/:id', roleIdValidation, getRoleById);

// Create new role (requires Create Role permission)
router.post('/', 
  requirePermission('Create Role'),
  createRoleValidation, 
  createRole
);

// Update role (requires Edit Role permission)
router.put('/:id',
  requirePermission('Edit Role'),
  updateRoleValidation,
  updateRole
);

// Delete role (requires Edit Role permission)
router.delete('/:id',
  requirePermission('Edit Role'),
  roleIdValidation,
  deleteRole
);

// Get role permissions
router.get('/:id/permissions', roleIdValidation, getRolePermissions);

// Update role permissions (requires Edit Role permission)
router.put('/:id/permissions',
  requirePermission('Edit Role'),
  updateRolePermissionsValidation,
  updateRolePermissions
);

// Get users assigned to role
router.get('/:id/users', roleIdValidation, getRoleUsers);

export default router;