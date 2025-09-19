import { Role } from '../models/Role.js';
import { Permission } from '../models/Permission.js';
import { RolePermission } from '../models/RolePermission.js';
import { logger, logAuth, logSecurity } from '../utils/logger.js';
import { asyncHandler, ValidationError, ConflictError, NotFoundError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Get all roles with pagination and search
 * GET /api/roles
 */
export const getAllRoles = asyncHandler(async (req, res) => {
  const { limit, offset, page, search } = req.query;
  
  try {
    // Calculate pagination
    const pageSize = limit ? parseInt(limit) : 50;
    const currentPage = page ? parseInt(page) : 1;
    const offsetValue = offset ? parseInt(offset) : (currentPage - 1) * pageSize;

    const options = {
      limit: pageSize,
      offset: offsetValue,
      search
    };

    const roles = await Role.findAll(options);
    const totalCount = await Role.getCount(options);

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_VIEW', 'Viewed role list', 'role', null, {
      search,
      limit: pageSize,
      page: currentPage
    });

    res.json({
      success: true,
      message: 'Roles retrieved successfully',
      data: {
        roles: roles.map(role => role.toPublic()),
        pagination: {
          currentPage,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
          hasNext: offsetValue + pageSize < totalCount,
          hasPrevious: currentPage > 1
        }
      }
    });
  } catch (error) {
    logger.error('getAllRoles error:', error);
    throw error;
  }
});

/**
 * Get role by ID with permissions
 * GET /api/roles/:id
 */
export const getRoleById = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid role ID', errors.array());
  }

  const roleId = parseInt(req.params.id);
  
  try {
    const role = await Role.findById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    // Get role permissions
    const permissions = await Permission.getRolePermissions(roleId);

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_VIEW', `Viewed role: ${role.role_name}`, 'role', roleId);

    res.json({
      success: true,
      message: 'Role retrieved successfully',
      data: {
        ...role.toPublic(),
        permissions: permissions.map(p => p.toPublic())
      }
    });
  } catch (error) {
    logger.error('getRoleById error:', error);
    throw error;
  }
});

/**
 * Create new role
 * POST /api/roles
 */
export const createRole = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { role_name, permission_ids = [] } = req.body;
  
  try {
    // Check if role name already exists
    const existingRole = await Role.findByName(role_name);
    if (existingRole) {
      throw new ConflictError('Role name already exists');
    }

    // Validate permission IDs if provided
    if (permission_ids.length > 0) {
      const validPermissions = await Permission.findAll();
      const validPermissionIds = validPermissions.map(p => p.permission_id);
      const invalidPermissions = permission_ids.filter(id => !validPermissionIds.includes(id));
      
      if (invalidPermissions.length > 0) {
        throw new ValidationError('Invalid permission IDs provided', { 
          invalidPermissions 
        });
      }
    }

    // Create role
    const newRole = await Role.create({ role_name });

    // Assign permissions if provided
    if (permission_ids.length > 0) {
      await RolePermission.assignPermissionsToRole(newRole.role_id, permission_ids);
    }

    // Get the created role with permissions
    const createdRole = await Role.findById(newRole.role_id);
    const rolePermissions = await Permission.getRolePermissions(newRole.role_id);

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_CREATE', `Created role: ${role_name}`, 'role', newRole.role_id, {
      permission_ids
    });

    logSecurity(`Role created: ${role_name} by user ${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: {
        ...createdRole.toPublic(),
        permissions: rolePermissions.map(p => p.toPublic())
      }
    });
  } catch (error) {
    logger.error('createRole error:', error);
    throw error;
  }
});

/**
 * Update role
 * PUT /api/roles/:id
 */
export const updateRole = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const roleId = parseInt(req.params.id);
  const { role_name } = req.body;
  
  try {
    const existingRole = await Role.findById(roleId);
    if (!existingRole) {
      throw new NotFoundError('Role not found');
    }


    // Check if new role name already exists (excluding current role)
    if (role_name !== existingRole.role_name) {
      const duplicateRole = await Role.findByName(role_name, roleId);
      if (duplicateRole) {
        throw new ConflictError('Role name already exists');
      }
    }

    // Update role
    const updatedRole = await Role.update(roleId, { role_name });

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_UPDATE', `Updated role: ${existingRole.role_name} to ${role_name}`, 'role', roleId, {
      old_name: existingRole.role_name,
      new_name: role_name
    });

    logSecurity(`Role updated: ${existingRole.role_name} to ${role_name} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Role updated successfully',
      data: updatedRole.toPublic()
    });
  } catch (error) {
    logger.error('updateRole error:', error);
    throw error;
  }
});

/**
 * Delete role
 * DELETE /api/roles/:id
 */
export const deleteRole = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid role ID', errors.array());
  }

  const roleId = parseInt(req.params.id);
  
  try {
    const role = await Role.findById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }


    // Check if role has assigned users
    const roleUsers = await Role.getRoleUsers(roleId);
    if (roleUsers.length > 0) {
      throw new ConflictError('Cannot delete role with assigned users', {
        userCount: roleUsers.length
      });
    }

    // Delete role (also removes role_permission entries)
    const deleted = await Role.delete(roleId);
    if (!deleted) {
      throw new NotFoundError('Role not found or could not be deleted');
    }

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_DELETE', `Deleted role: ${role.role_name}`, 'role', roleId);

    logSecurity(`Role deleted: ${role.role_name} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    logger.error('deleteRole error:', error);
    throw error;
  }
});

/**
 * Get role permissions
 * GET /api/roles/:id/permissions
 */
export const getRolePermissions = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid role ID', errors.array());
  }

  const roleId = parseInt(req.params.id);
  
  try {
    const role = await Role.findById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const permissions = await Permission.getRolePermissions(roleId);
    const allPermissions = await Permission.findAll();

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_PERMISSION_VIEW', `Viewed permissions for role: ${role.role_name}`, 'role', roleId);

    res.json({
      success: true,
      message: 'Role permissions retrieved successfully',
      data: {
        role: role.toPublic(),
        assigned_permissions: permissions.map(p => p.toPublic()),
        all_permissions: allPermissions.map(p => p.toPublic())
      }
    });
  } catch (error) {
    logger.error('getRolePermissions error:', error);
    throw error;
  }
});

/**
 * Update role permissions
 * PUT /api/roles/:id/permissions
 */
export const updateRolePermissions = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const roleId = parseInt(req.params.id);
  const { permission_ids = [] } = req.body;
  
  try {
    const role = await Role.findById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }


    // Validate permission IDs
    if (permission_ids.length > 0) {
      const validPermissions = await Permission.findAll();
      const validPermissionIds = validPermissions.map(p => p.permission_id);
      const invalidPermissions = permission_ids.filter(id => !validPermissionIds.includes(id));
      
      if (invalidPermissions.length > 0) {
        throw new ValidationError('Invalid permission IDs provided', { 
          invalidPermissions 
        });
      }
    }

    // Get current permissions for audit log
    const oldPermissions = await Permission.getRolePermissions(roleId);

    // Update role permissions
    await RolePermission.updateRolePermissions(roleId, permission_ids);

    // Get updated permissions
    const newPermissions = await Permission.getRolePermissions(roleId);

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_PERMISSION_UPDATE', `Updated permissions for role: ${role.role_name}`, 'role', roleId, {
      old_permissions: oldPermissions.map(p => p.permission_name),
      new_permissions: newPermissions.map(p => p.permission_name),
      added_count: newPermissions.length - oldPermissions.length
    });

    logSecurity(`Role permissions updated for ${role.role_name} by user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Role permissions updated successfully',
      data: {
        role: role.toPublic(),
        permissions: newPermissions.map(p => p.toPublic())
      }
    });
  } catch (error) {
    logger.error('updateRolePermissions error:', error);
    throw error;
  }
});

/**
 * Get users assigned to role
 * GET /api/roles/:id/users
 */
export const getRoleUsers = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid role ID', errors.array());
  }

  const roleId = parseInt(req.params.id);
  
  try {
    const role = await Role.findById(roleId);
    if (!role) {
      throw new NotFoundError('Role not found');
    }

    const users = await Role.getRoleUsers(roleId);

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_USERS_VIEW', `Viewed users for role: ${role.role_name}`, 'role', roleId);

    res.json({
      success: true,
      message: 'Role users retrieved successfully',
      data: {
        role: role.toPublic(),
        users: users.map(user => ({
          user_id: user.user_id,
          user_name: user.user_name,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          client_name: user.client_name,
          is_active: user.is_active,
          created_at: user.created_at
        }))
      }
    });
  } catch (error) {
    logger.error('getRoleUsers error:', error);
    throw error;
  }
});

/**
 * Get role statistics
 * GET /api/roles/stats
 */
export const getRoleStats = asyncHandler(async (req, res) => {
  try {
    const roleStats = await Role.getStats();
    const permissionStats = await Permission.getStats();

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_STATS_VIEW', 'Viewed role statistics', 'role', null);

    res.json({
      success: true,
      message: 'Role statistics retrieved successfully',
      data: {
        total_roles: roleStats.total_roles || 0,
        total_users: roleStats.total_users || 0,
        avg_permissions_per_role: parseFloat(roleStats.avg_permissions_per_role || 0).toFixed(1),
        total_permissions: permissionStats.total_permissions || 0,
        roles_with_permissions: permissionStats.roles_with_permissions || 0
      }
    });
  } catch (error) {
    logger.error('getRoleStats error:', error);
    throw error;
  }
});

/**
 * Check role name availability
 * GET /api/roles/check-name/:name
 */
export const checkRoleNameAvailability = asyncHandler(async (req, res) => {
  const { name } = req.params;
  const { exclude_id } = req.query;
  
  try {
    const existingRole = await Role.findByName(name, exclude_id ? parseInt(exclude_id) : null);
    const isAvailable = !existingRole;

    res.json({
      success: true,
      message: 'Role name availability checked',
      data: {
        name,
        available: isAvailable,
        exists: !isAvailable
      }
    });
  } catch (error) {
    logger.error('checkRoleNameAvailability error:', error);
    throw error;
  }
});

/**
 * Get permission matrix for all roles
 * GET /api/roles/permission-matrix
 */
export const getPermissionMatrix = asyncHandler(async (req, res) => {
  try {
    const matrix = await RolePermission.getPermissionMatrix();

    // Create audit log
    await createAuditLog(req.user.id, 'ROLE_PERMISSION_MATRIX_VIEW', 'Viewed role permission matrix', 'role', null);

    res.json({
      success: true,
      message: 'Permission matrix retrieved successfully',
      data: {
        matrix
      }
    });
  } catch (error) {
    logger.error('getPermissionMatrix error:', error);
    throw error;
  }
});

export default {
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
};