import { Permission } from '../models/Permission.js';
import { logger, logSecurity } from '../utils/logger.js';
import { AuthorizationError } from './errorHandler.js';

/**
 * Middleware to check if user has required permission
 * @param {string} requiredPermission - Permission name required
 * @returns {Function} Express middleware function
 */
export const requirePermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        logSecurity(`Permission check failed - No user in request for permission: ${requiredPermission}`);
        throw new AuthorizationError('User not authenticated');
      }

      if (!user.role_id) {
        logSecurity(`Permission check failed - User ${user.user_id} has no role assigned`);
        throw new AuthorizationError('User has no role assigned');
      }

      // Check if user's role has the required permission
      const hasPermission = await Permission.roleHasPermission(user.role_id, requiredPermission);

      if (!hasPermission) {
        logSecurity(`Permission denied - User ${user.user_id} (role ${user.role_id}) lacks permission: ${requiredPermission}`);
        throw new AuthorizationError(`Insufficient permissions. Required: ${requiredPermission}`);
      }

      // Log successful permission check
      logger.debug(`Permission granted - User ${user.user_id} has permission: ${requiredPermission}`);

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        next(error);
      } else {
        logger.error('Permission check middleware error:', error);
        next(new AuthorizationError('Permission check failed'));
      }
    }
  };
};

/**
 * Middleware to check if user has any of the required permissions
 * @param {string[]} requiredPermissions - Array of permission names
 * @returns {Function} Express middleware function
 */
export const requireAnyPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        logSecurity(`Permission check failed - No user in request for permissions: ${requiredPermissions.join(', ')}`);
        throw new AuthorizationError('User not authenticated');
      }

      if (!user.role_id) {
        logSecurity(`Permission check failed - User ${user.user_id} has no role assigned`);
        throw new AuthorizationError('User has no role assigned');
      }

      // Check if user's role has any of the required permissions
      let hasAnyPermission = false;
      for (const permission of requiredPermissions) {
        const hasPermission = await Permission.roleHasPermission(user.role_id, permission);
        if (hasPermission) {
          hasAnyPermission = true;
          logger.debug(`Permission granted - User ${user.user_id} has permission: ${permission}`);
          break;
        }
      }

      if (!hasAnyPermission) {
        logSecurity(`Permission denied - User ${user.user_id} (role ${user.role_id}) lacks any of permissions: ${requiredPermissions.join(', ')}`);
        throw new AuthorizationError(`Insufficient permissions. Required any of: ${requiredPermissions.join(', ')}`);
      }

      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        next(error);
      } else {
        logger.error('Permission check middleware error:', error);
        next(new AuthorizationError('Permission check failed'));
      }
    }
  };
};

/**
 * Middleware to check if user has all of the required permissions
 * @param {string[]} requiredPermissions - Array of permission names
 * @returns {Function} Express middleware function
 */
export const requireAllPermissions = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        logSecurity(`Permission check failed - No user in request for permissions: ${requiredPermissions.join(', ')}`);
        throw new AuthorizationError('User not authenticated');
      }

      if (!user.role_id) {
        logSecurity(`Permission check failed - User ${user.user_id} has no role assigned`);
        throw new AuthorizationError('User has no role assigned');
      }

      // Check if user's role has all required permissions
      const permissionChecks = await Promise.all(
        requiredPermissions.map(permission => 
          Permission.roleHasPermission(user.role_id, permission)
        )
      );

      const missingPermissions = requiredPermissions.filter((permission, index) => !permissionChecks[index]);

      if (missingPermissions.length > 0) {
        logSecurity(`Permission denied - User ${user.user_id} (role ${user.role_id}) lacks permissions: ${missingPermissions.join(', ')}`);
        throw new AuthorizationError(`Insufficient permissions. Missing: ${missingPermissions.join(', ')}`);
      }

      logger.debug(`All permissions granted - User ${user.user_id} has permissions: ${requiredPermissions.join(', ')}`);
      
      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        next(error);
      } else {
        logger.error('Permission check middleware error:', error);
        next(new AuthorizationError('Permission check failed'));
      }
    }
  };
};

/**
 * Middleware to check if user is system admin (has all permissions)
 * @returns {Function} Express middleware function
 */
export const requireSystemAdmin = () => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      if (!user) {
        logSecurity(`System admin check failed - No user in request`);
        throw new AuthorizationError('User not authenticated');
      }

      if (!user.role_id) {
        logSecurity(`System admin check failed - User ${user.user_id} has no role assigned`);
        throw new AuthorizationError('User has no role assigned');
      }

      // Check if user is SYSTEM_ADMIN role
      const isSystemAdmin = await Permission.roleHasPermission(user.role_id, 'Create Role') &&
                           await Permission.roleHasPermission(user.role_id, 'Edit Role') &&
                           await Permission.roleHasPermission(user.role_id, 'Create User') &&
                           await Permission.roleHasPermission(user.role_id, 'Edit User') &&
                           await Permission.roleHasPermission(user.role_id, 'Delete User');

      if (!isSystemAdmin) {
        logSecurity(`System admin check failed - User ${user.user_id} (role ${user.role_id}) is not system admin`);
        throw new AuthorizationError('System administrator access required');
      }

      logger.debug(`System admin access granted - User ${user.user_id}`);
      
      next();
    } catch (error) {
      if (error instanceof AuthorizationError) {
        next(error);
      } else {
        logger.error('System admin check middleware error:', error);
        next(new AuthorizationError('System admin check failed'));
      }
    }
  };
};

/**
 * Helper function to get user permissions (for use in controllers)
 * @param {number} roleId - User's role ID
 * @returns {Promise<string[]>} Array of permission names
 */
export const getUserPermissions = async (roleId) => {
  try {
    const permissions = await Permission.getRolePermissions(roleId);
    return permissions.map(p => p.permission_name);
  } catch (error) {
    logger.error('Error getting user permissions:', error);
    return [];
  }
};

/**
 * Helper function to check if user can perform action on resource
 * @param {Object} user - User object with role_id
 * @param {string} action - Action being performed
 * @param {string} resource - Resource being accessed
 * @param {number} resourceId - ID of the resource (for ownership checks)
 * @returns {Promise<boolean>} Whether user can perform action
 */
export const canUserPerformAction = async (user, action, resource, resourceId = null) => {
  try {
    if (!user || !user.role_id) {
      return false;
    }

    // Build permission name based on action and resource
    const permissionName = `${action} ${resource}`;
    
    // Check basic permission
    const hasPermission = await Permission.roleHasPermission(user.role_id, permissionName);
    
    if (!hasPermission) {
      return false;
    }

    // Additional checks can be added here for resource ownership, etc.
    // For example, users might only be able to edit their own profile
    
    return true;
  } catch (error) {
    logger.error('Error checking user action permission:', error);
    return false;
  }
};

export default {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  requireSystemAdmin,
  getUserPermissions,
  canUserPerformAction
};