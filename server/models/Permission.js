import { executeQuery, sql } from '../config/database.js';
import { logger, logDB } from '../utils/logger.js';

/**
 * Permission Model - Handles permission read operations only
 * Permission creation/modification is handled via backend SQL scripts
 */
export class Permission {
  constructor(permissionData) {
    this.permission_id = permissionData.permission_id;
    this.permission_name = permissionData.permission_name;
    this.category = permissionData.category;
  }

  /**
   * Find all permissions
   * @returns {Promise<Permission[]>} Array of permission objects
   */
  static async findAll() {
    try {
      const query = `
        SELECT permission_id, permission_name
        FROM permissions
        ORDER BY permission_name
      `;
      
      logDB('Permission.findAll', query);
      const result = await executeQuery(query);
      
      return result.recordset.map(permission => new Permission(permission));
    } catch (error) {
      logger.error('Permission.findAll error:', error);
      throw error;
    }
  }

  /**
   * Get permissions grouped by category
   * @returns {Promise<Object>} Permissions grouped by category
   */
  static async getPermissionsByCategory() {
    try {
      const permissions = await Permission.findAll();
      
      // Define permission categories based on existing permissions
      const categoryMap = {
        'Create User': 'User Management',
        'Edit User': 'User Management',
        'Delete User': 'User Management',
        'View User': 'User Management',
        'Create Client': 'Client Management',
        'Edit Client': 'Client Management',
        'Delete Client': 'Client Management',
        'View Client': 'Client Management',
        'Onboard Channel Device': 'Device Management',
        'Onboard Device': 'Device Management',
        'View Device': 'Device Management',
        'Remove Device': 'Device Management',
        'Create Role': 'System Administration',
        'Edit_role': 'System Administration'
      };

      const categorizedPermissions = {};

      permissions.forEach(permission => {
        const category = categoryMap[permission.permission_name] || 'Other';
        
        if (!categorizedPermissions[category]) {
          categorizedPermissions[category] = [];
        }
        
        categorizedPermissions[category].push({
          ...permission,
          category
        });
      });

      return categorizedPermissions;
    } catch (error) {
      logger.error('Permission.getPermissionsByCategory error:', error);
      throw error;
    }
  }

  /**
   * Get permission categories
   * @returns {Promise<string[]>} Array of category names
   */
  static async getPermissionCategories() {
    try {
      const categorizedPermissions = await Permission.getPermissionsByCategory();
      return Object.keys(categorizedPermissions).sort();
    } catch (error) {
      logger.error('Permission.getPermissionCategories error:', error);
      throw error;
    }
  }

  /**
   * Get permissions assigned to a specific role
   * @param {number} roleId - Role ID
   * @returns {Promise<Permission[]>} Array of permission objects
   */
  static async getRolePermissions(roleId) {
    try {
      const query = `
        SELECT p.permission_id, p.permission_name
        FROM permissions p
        INNER JOIN role_permission rp ON p.permission_id = rp.permission_id
        WHERE rp.role_id = @roleId
        ORDER BY p.permission_name
      `;
      
      logDB('Permission.getRolePermissions', query, { roleId });
      const result = await executeQuery(query, { roleId });
      
      return result.recordset.map(permission => new Permission(permission));
    } catch (error) {
      logger.error('Permission.getRolePermissions error:', error);
      throw error;
    }
  }

  /**
   * Get permissions not assigned to a specific role
   * @param {number} roleId - Role ID
   * @returns {Promise<Permission[]>} Array of permission objects
   */
  static async getUnassignedPermissions(roleId) {
    try {
      const query = `
        SELECT p.permission_id, p.permission_name
        FROM permissions p
        WHERE p.permission_id NOT IN (
          SELECT permission_id 
          FROM role_permission 
          WHERE role_id = @roleId
        )
        ORDER BY p.permission_name
      `;
      
      logDB('Permission.getUnassignedPermissions', query, { roleId });
      const result = await executeQuery(query, { roleId });
      
      return result.recordset.map(permission => new Permission(permission));
    } catch (error) {
      logger.error('Permission.getUnassignedPermissions error:', error);
      throw error;
    }
  }

  /**
   * Get permission by ID
   * @param {number} permissionId - Permission ID
   * @returns {Promise<Permission|null>} Permission object or null
   */
  static async findById(permissionId) {
    try {
      const query = `
        SELECT permission_id, permission_name
        FROM permissions
        WHERE permission_id = @permissionId
      `;
      
      logDB('Permission.findById', query, { permissionId });
      const result = await executeQuery(query, { permissionId });
      
      if (result.recordset.length === 0) return null;
      return new Permission(result.recordset[0]);
    } catch (error) {
      logger.error('Permission.findById error:', error);
      throw error;
    }
  }

  /**
   * Get permission by name
   * @param {string} permissionName - Permission name
   * @returns {Promise<Permission|null>} Permission object or null
   */
  static async findByName(permissionName) {
    try {
      const query = `
        SELECT permission_id, permission_name
        FROM permissions
        WHERE permission_name = @permissionName
      `;
      
      logDB('Permission.findByName', query, { permissionName });
      const result = await executeQuery(query, { permissionName });
      
      if (result.recordset.length === 0) return null;
      return new Permission(result.recordset[0]);
    } catch (error) {
      logger.error('Permission.findByName error:', error);
      throw error;
    }
  }

  /**
   * Check if a role has a specific permission
   * @param {number} roleId - Role ID
   * @param {string} permissionName - Permission name
   * @returns {Promise<boolean>} True if role has permission
   */
  static async roleHasPermission(roleId, permissionName) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM role_permission rp
        INNER JOIN permissions p ON rp.permission_id = p.permission_id
        WHERE rp.role_id = @roleId AND p.permission_name = @permissionName
      `;
      
      logDB('Permission.roleHasPermission', query, { roleId, permissionName });
      const result = await executeQuery(query, { roleId, permissionName });
      
      return result.recordset[0].count > 0;
    } catch (error) {
      logger.error('Permission.roleHasPermission error:', error);
      throw error;
    }
  }

  /**
   * Get permission statistics
   * @returns {Promise<Object>} Permission statistics
   */
  static async getStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_permissions,
          COUNT(DISTINCT rp.role_id) as roles_with_permissions,
          AVG(CAST(role_perm_count.permission_count as FLOAT)) as avg_permissions_per_role
        FROM permissions p
        LEFT JOIN role_permission rp ON p.permission_id = rp.permission_id
        LEFT JOIN (
          SELECT role_id, COUNT(*) as permission_count
          FROM role_permission
          GROUP BY role_id
        ) role_perm_count ON rp.role_id = role_perm_count.role_id
      `;
      
      logDB('Permission.getStats', query);
      const result = await executeQuery(query);
      
      return result.recordset[0];
    } catch (error) {
      logger.error('Permission.getStats error:', error);
      throw error;
    }
  }

  /**
   * Convert permission to public format
   * @returns {Object} Public permission data
   */
  toPublic() {
    return {
      permission_id: this.permission_id,
      permission_name: this.permission_name,
      category: this.category
    };
  }
}

export default Permission;