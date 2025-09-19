import express from 'express';
import { param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import {
  getAllPermissions,
  getPermissionsByCategory,
  getPermissionCategories,
  getPermissionById,
  getPermissionRoles,
  getPermissionStats,
  checkRolePermission,
  getUnassignedPermissions,
  searchPermissions
} from '../controllers/permissionController.js';

const router = express.Router();

/**
 * Validation rules for permission ID parameter
 */
const permissionIdValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Permission ID must be a positive integer')
];

/**
 * Validation rules for role ID parameter (for unassigned permissions)
 */
const roleIdValidation = [
  param('roleId')
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer')
];

/**
 * Validation rules for role permission check
 */
const rolePermissionCheckValidation = [
  query('role_id')
    .isInt({ min: 1 })
    .withMessage('Role ID must be a positive integer'),
  query('permission_name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Permission name must be between 1-100 characters')
];

/**
 * Validation rules for permission search
 */
const searchValidation = [
  query('query')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1-100 characters')
];

// Apply authentication to all routes
router.use(authenticate);

// Permission statistics
router.get('/stats', getPermissionStats);

// Permission categories list
router.get('/category-list', getPermissionCategories);

// Permissions grouped by category
router.get('/categories', getPermissionsByCategory);

// Search permissions
router.get('/search', searchValidation, searchPermissions);

// Check if role has permission
router.get('/check-role-permission', rolePermissionCheckValidation, checkRolePermission);

// Get unassigned permissions for a role
router.get('/unassigned/:roleId', roleIdValidation, getUnassignedPermissions);

// Get all permissions
router.get('/', getAllPermissions);

// Get permission by ID
router.get('/:id', permissionIdValidation, getPermissionById);

// Get roles that have a specific permission
router.get('/:id/roles', permissionIdValidation, getPermissionRoles);

export default router;