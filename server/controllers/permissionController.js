import { Permission } from '../models/Permission.js';
import { RolePermission } from '../models/RolePermission.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Get all permissions
 * GET /api/permissions
 */
export const getAllPermissions = asyncHandler(async (req, res) => {
  try {
    const permissions = await Permission.findAll();

    // Create audit log
    await createAuditLog(req.user.id, 'PERMISSION_VIEW', 'Viewed all permissions', 'permission', null);

    res.json({
      success: true,
      message: 'Permissions retrieved successfully',
      data: {
        permissions: permissions.map(permission => permission.toPublic())
      }
    });
  } catch (error) {
    logger.error('getAllPermissions error:', error);
    throw error;
  }
});

/**
 * Get permissions grouped by category
 * GET /api/permissions/categories
 */
export const getPermissionsByCategory = asyncHandler(async (req, res) => {
  try {
    const categorizedPermissions = await Permission.getPermissionsByCategory();

    // Create audit log
    await createAuditLog(req.user.id, 'PERMISSION_CATEGORY_VIEW', 'Viewed permissions by category', 'permission', null);

    res.json({
      success: true,
      message: 'Permissions by category retrieved successfully',
      data: {
        categories: categorizedPermissions
      }
    });
  } catch (error) {
    logger.error('getPermissionsByCategory error:', error);
    throw error;
  }
});

/**
 * Get permission categories
 * GET /api/permissions/category-list
 */
export const getPermissionCategories = asyncHandler(async (req, res) => {
  try {
    const categories = await Permission.getPermissionCategories();

    res.json({
      success: true,
      message: 'Permission categories retrieved successfully',
      data: {
        categories
      }
    });
  } catch (error) {
    logger.error('getPermissionCategories error:', error);
    throw error;
  }
});

/**
 * Get permission by ID
 * GET /api/permissions/:id
 */
export const getPermissionById = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid permission ID', errors.array());
  }

  const permissionId = parseInt(req.params.id);
  
  try {
    const permission = await Permission.findById(permissionId);
    if (!permission) {
      throw new NotFoundError('Permission not found');
    }

    // Get roles that have this permission
    const rolesWithPermission = await RolePermission.getRolesWithPermission(permissionId);

    // Create audit log
    await createAuditLog(req.user.id, 'PERMISSION_VIEW', `Viewed permission: ${permission.permission_name}`, 'permission', permissionId);

    res.json({
      success: true,
      message: 'Permission retrieved successfully',
      data: {
        ...permission.toPublic(),
        roles: rolesWithPermission
      }
    });
  } catch (error) {
    logger.error('getPermissionById error:', error);
    throw error;
  }
});

/**
 * Get roles that have a specific permission
 * GET /api/permissions/:id/roles
 */
export const getPermissionRoles = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid permission ID', errors.array());
  }

  const permissionId = parseInt(req.params.id);
  
  try {
    const permission = await Permission.findById(permissionId);
    if (!permission) {
      throw new NotFoundError('Permission not found');
    }

    const roles = await RolePermission.getRolesWithPermission(permissionId);

    // Create audit log
    await createAuditLog(req.user.id, 'PERMISSION_ROLES_VIEW', `Viewed roles for permission: ${permission.permission_name}`, 'permission', permissionId);

    res.json({
      success: true,
      message: 'Permission roles retrieved successfully',
      data: {
        permission: permission.toPublic(),
        roles
      }
    });
  } catch (error) {
    logger.error('getPermissionRoles error:', error);
    throw error;
  }
});

/**
 * Get permission statistics
 * GET /api/permissions/stats
 */
export const getPermissionStats = asyncHandler(async (req, res) => {
  try {
    const stats = await Permission.getStats();
    const categories = await Permission.getPermissionCategories();

    // Create audit log
    await createAuditLog(req.user.id, 'PERMISSION_STATS_VIEW', 'Viewed permission statistics', 'permission', null);

    res.json({
      success: true,
      message: 'Permission statistics retrieved successfully',
      data: {
        total_permissions: stats.total_permissions || 0,
        roles_with_permissions: stats.roles_with_permissions || 0,
        avg_permissions_per_role: parseFloat(stats.avg_permissions_per_role || 0).toFixed(1),
        total_categories: categories.length,
        categories
      }
    });
  } catch (error) {
    logger.error('getPermissionStats error:', error);
    throw error;
  }
});

/**
 * Check if a role has a specific permission
 * GET /api/permissions/check-role-permission
 */
export const checkRolePermission = asyncHandler(async (req, res) => {
  const { role_id, permission_name } = req.query;
  
  if (!role_id || !permission_name) {
    throw new ValidationError('role_id and permission_name are required');
  }

  try {
    const hasPermission = await Permission.roleHasPermission(parseInt(role_id), permission_name);

    res.json({
      success: true,
      message: 'Role permission checked successfully',
      data: {
        role_id: parseInt(role_id),
        permission_name,
        has_permission: hasPermission
      }
    });
  } catch (error) {
    logger.error('checkRolePermission error:', error);
    throw error;
  }
});

/**
 * Get unassigned permissions for a role
 * GET /api/permissions/unassigned/:roleId
 */
export const getUnassignedPermissions = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid role ID', errors.array());
  }

  const roleId = parseInt(req.params.roleId);
  
  try {
    const unassignedPermissions = await Permission.getUnassignedPermissions(roleId);

    // Create audit log
    await createAuditLog(req.user.id, 'PERMISSION_UNASSIGNED_VIEW', `Viewed unassigned permissions for role ID: ${roleId}`, 'permission', null);

    res.json({
      success: true,
      message: 'Unassigned permissions retrieved successfully',
      data: {
        role_id: roleId,
        unassigned_permissions: unassignedPermissions.map(permission => permission.toPublic())
      }
    });
  } catch (error) {
    logger.error('getUnassignedPermissions error:', error);
    throw error;
  }
});

/**
 * Search permissions by name
 * GET /api/permissions/search
 */
export const searchPermissions = asyncHandler(async (req, res) => {
  const { query } = req.query;
  
  if (!query || query.trim().length < 1) {
    throw new ValidationError('Search query is required');
  }

  try {
    const allPermissions = await Permission.findAll();
    const filteredPermissions = allPermissions.filter(permission => 
      permission.permission_name.toLowerCase().includes(query.toLowerCase())
    );

    // Create audit log
    await createAuditLog(req.user.id, 'PERMISSION_SEARCH', `Searched permissions with query: ${query}`, 'permission', null, {
      query,
      results_count: filteredPermissions.length
    });

    res.json({
      success: true,
      message: 'Permissions search completed successfully',
      data: {
        query,
        permissions: filteredPermissions.map(permission => permission.toPublic()),
        total_results: filteredPermissions.length
      }
    });
  } catch (error) {
    logger.error('searchPermissions error:', error);
    throw error;
  }
});

export default {
  getAllPermissions,
  getPermissionsByCategory,
  getPermissionCategories,
  getPermissionById,
  getPermissionRoles,
  getPermissionStats,
  checkRolePermission,
  getUnassignedPermissions,
  searchPermissions
};