import { executeQuery, sql } from '../config/database.js';
import { logger, logDB } from '../utils/logger.js';

/**
 * RolePermission Model - Handles role-permission relationship operations
 * Based on the role_permission table structure from database_model.md
 */
export class RolePermission {
  constructor(data) {
    this.role_id = data.role_id;
    this.permission_id = data.permission_id;
  }

  /**
   * Assign permissions to a role (bulk operation)
   * @param {number} roleId - Role ID
   * @param {number[]} permissionIds - Array of permission IDs
   * @returns {Promise<void>}
   */
  static async assignPermissionsToRole(roleId, permissionIds) {
    try {
      if (!permissionIds || permissionIds.length === 0) {
        return;
      }

      // Build batch insert query
      const values = permissionIds.map((_, index) => 
        `(@roleId, @permissionId${index})`
      ).join(', ');

      const query = `
        INSERT INTO role_permission (role_id, permission_id)
        VALUES ${values}
      `;

      const params = { roleId };

      permissionIds.forEach((permissionId, index) => {
        params[`permissionId${index}`] = permissionId;
      });

      logDB('RolePermission.assignPermissionsToRole', query, params);
      await executeQuery(query, params);
    } catch (error) {
      logger.error('RolePermission.assignPermissionsToRole error:', error);
      throw error;
    }
  }

  /**
   * Remove permissions from a role
   * @param {number} roleId - Role ID
   * @param {number[]} permissionIds - Array of permission IDs to remove
   * @returns {Promise<void>}
   */
  static async removePermissionsFromRole(roleId, permissionIds) {
    try {
      if (!permissionIds || permissionIds.length === 0) {
        return;
      }

      const placeholders = permissionIds.map((_, index) => `@permissionId${index}`).join(', ');

      const query = `
        DELETE FROM role_permission 
        WHERE role_id = @roleId AND permission_id IN (${placeholders})
      `;

      const params = { roleId };

      permissionIds.forEach((permissionId, index) => {
        params[`permissionId${index}`] = permissionId;
      });

      logDB('RolePermission.removePermissionsFromRole', query, params);
      await executeQuery(query, params);
    } catch (error) {
      logger.error('RolePermission.removePermissionsFromRole error:', error);
      throw error;
    }
  }

  /**
   * Update role permissions (replace all existing permissions)
   * @param {number} roleId - Role ID
   * @param {number[]} permissionIds - Array of permission IDs
   * @returns {Promise<void>}
   */
  static async updateRolePermissions(roleId, permissionIds) {
    try {
      // First, remove all existing permissions for the role
      const deleteQuery = `DELETE FROM role_permission WHERE role_id = @roleId`;
      await executeQuery(deleteQuery, { roleId });

      // Add new permissions if any provided
      if (permissionIds && permissionIds.length > 0) {
        // Use the same pattern as assignPermissionsToRole
        const values = permissionIds.map((_, index) => 
          `(@roleId, @permissionId${index})`
        ).join(', ');

        const insertQuery = `
          INSERT INTO role_permission (role_id, permission_id)
          VALUES ${values}
        `;

        const params = { roleId };
        permissionIds.forEach((permissionId, index) => {
          params[`permissionId${index}`] = permissionId;
        });

        await executeQuery(insertQuery, params);
      }

      logDB('RolePermission.updateRolePermissions', `Completed for role ${roleId}`, { permissionIds });
    } catch (error) {
      logger.error('RolePermission.updateRolePermissions error:', error);
      throw error;
    }
  }

  /**
   * Check if role has specific permission
   * @param {number} roleId - Role ID
   * @param {number} permissionId - Permission ID
   * @returns {Promise<boolean>} True if role has permission
   */
  static async hasPermission(roleId, permissionId) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM role_permission
        WHERE role_id = @roleId AND permission_id = @permissionId
      `;

      logDB('RolePermission.hasPermission', query, { roleId, permissionId });
      const result = await executeQuery(query, { roleId, permissionId });

      return result.recordset[0].count > 0;
    } catch (error) {
      logger.error('RolePermission.hasPermission error:', error);
      throw error;
    }
  }

  /**
   * Get all role-permission mappings
   * @param {number} roleId - Optional role ID filter
   * @returns {Promise<Object[]>} Array of role-permission mappings
   */
  static async findAll(roleId = null) {
    try {
      let query = `
        SELECT 
          rp.role_id,
          rp.permission_id,
          r.role_name,
          p.permission_name
        FROM role_permission rp
        INNER JOIN role r ON rp.role_id = r.role_id
        INNER JOIN permissions p ON rp.permission_id = p.permission_id
      `;

      let params = {};

      if (roleId) {
        query += ` WHERE rp.role_id = @roleId`;
        params.roleId = roleId;
      }

      query += ` ORDER BY r.role_name, p.permission_name`;

      logDB('RolePermission.findAll', query, params);
      const result = await executeQuery(query, Object.keys(params).length > 0 ? params : undefined);

      return result.recordset;
    } catch (error) {
      logger.error('RolePermission.findAll error:', error);
      throw error;
    }
  }

  /**
   * Get roles that have a specific permission
   * @param {number} permissionId - Permission ID
   * @returns {Promise<Object[]>} Array of roles with the permission
   */
  static async getRolesWithPermission(permissionId) {
    try {
      const query = `
        SELECT 
          r.role_id,
          r.role_name,
          COUNT(DISTINCT u.user_id) as user_count
        FROM role r
        INNER JOIN role_permission rp ON r.role_id = rp.role_id
        LEFT JOIN [user] u ON r.role_id = u.role_id AND u.is_active = 1
        WHERE rp.permission_id = @permissionId
        GROUP BY r.role_id, r.role_name
        ORDER BY r.role_name
      `;

      logDB('RolePermission.getRolesWithPermission', query, { permissionId });
      const result = await executeQuery(query, { permissionId });

      return result.recordset;
    } catch (error) {
      logger.error('RolePermission.getRolesWithPermission error:', error);
      throw error;
    }
  }

  /**
   * Get permission matrix for all roles
   * @returns {Promise<Object>} Permission matrix with roles and their permissions
   */
  static async getPermissionMatrix() {
    try {
      const query = `
        SELECT 
          r.role_id,
          r.role_name,
          p.permission_id,
          p.permission_name,
          CASE WHEN rp.role_id IS NOT NULL THEN 1 ELSE 0 END as has_permission
        FROM role r
        CROSS JOIN permissions p
        LEFT JOIN role_permission rp ON r.role_id = rp.role_id AND p.permission_id = rp.permission_id
        ORDER BY r.role_name, p.permission_name
      `;

      logDB('RolePermission.getPermissionMatrix', query);
      const result = await executeQuery(query);

      // Group by role for easier frontend consumption
      const matrix = {};
      result.recordset.forEach(row => {
        if (!matrix[row.role_id]) {
          matrix[row.role_id] = {
            role_id: row.role_id,
            role_name: row.role_name,
            permissions: {}
          };
        }
        
        matrix[row.role_id].permissions[row.permission_id] = {
          permission_id: row.permission_id,
          permission_name: row.permission_name,
          has_permission: row.has_permission === 1
        };
      });

      return Object.values(matrix);
    } catch (error) {
      logger.error('RolePermission.getPermissionMatrix error:', error);
      throw error;
    }
  }

  /**
   * Bulk update permissions for multiple roles
   * @param {Object[]} updates - Array of {roleId, permissionIds}
   * @returns {Promise<void>}
   */
  static async bulkUpdateRolePermissions(updates) {
    try {
      // Start transaction for bulk operations
      const transaction = await sql.connect().then(pool => pool.transaction());
      await transaction.begin();

      try {
        for (const update of updates) {
          const { roleId, permissionIds } = update;

          // Delete existing permissions for this role
          await transaction.request()
            .input('roleId', sql.Int, roleId)
            .query(`DELETE FROM role_permission WHERE role_id = @roleId`);

          // Insert new permissions if any
          if (permissionIds && permissionIds.length > 0) {
            const values = permissionIds.map((_, index) => 
              `(${roleId}, @permissionId${index})`
            ).join(', ');

            const insertQuery = `
              INSERT INTO role_permission (role_id, permission_id)
              VALUES ${values}
            `;

            const insertRequest = transaction.request();
            permissionIds.forEach((permissionId, index) => {
              insertRequest.input(`permissionId${index}`, sql.Int, permissionId);
            });

            await insertRequest.query(insertQuery);
          }
        }

        await transaction.commit();
        logDB('RolePermission.bulkUpdateRolePermissions', `Bulk update completed for ${updates.length} roles`);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('RolePermission.bulkUpdateRolePermissions error:', error);
      throw error;
    }
  }
}

export default RolePermission;