import { executeQuery, sql } from '../config/database.js';
import { logger, logDB } from '../utils/logger.js';

/**
 * Role Model - Handles all role-related database operations
 * Based on the role table structure from database_model.md
 */
export class Role {
  constructor(roleData) {
    this.role_id = roleData.role_id;
    this.role_name = roleData.role_name;
    this.user_count = roleData.user_count || 0;
    this.permission_count = roleData.permission_count || 0;
  }

  /**
   * Find all roles with user and permission counts
   * @param {Object} options - Query options (includeInactive, limit, offset, search)
   * @returns {Promise<Role[]>} Array of role objects
   */
  static async findAll(options = {}) {
    try {
      const { limit, offset, search } = options;
      
      // Start with a simple query to avoid JOIN issues
      let query = `
        SELECT 
          r.role_id, 
          r.role_name,
          (SELECT COUNT(*) FROM [user] u WHERE u.role_id = r.role_id AND u.is_active = 1) as user_count,
          (SELECT COUNT(*) FROM role_permission rp WHERE rp.role_id = r.role_id) as permission_count
        FROM role r
      `;
      
      let params = {};
      
      if (search) {
        query += ` WHERE r.role_name LIKE @search`;
        params.search = `%${search}%`;
      }
      
      query += ` ORDER BY r.role_name`;
      if (limit) {
        query += ` OFFSET ${offset || 0} ROWS FETCH NEXT ${limit} ROWS ONLY`;
      }

      logDB('Role.findAll', query, params);
      const result = await executeQuery(query, Object.keys(params).length > 0 ? params : undefined);
      return result.recordset.map(role => new Role(role));
    } catch (error) {
      logger.error('Role.findAll error:', error);
      throw error;
    }
  }

  /**
   * Find role by ID
   * @param {number} roleId - Role ID
   * @returns {Promise<Role|null>} Role object or null
   */
  static async findById(roleId) {
    try {
      const query = `
        SELECT 
          r.role_id, 
          r.role_name,
          (SELECT COUNT(*) FROM [user] u WHERE u.role_id = r.role_id AND u.is_active = 1) as user_count,
          (SELECT COUNT(*) FROM role_permission rp WHERE rp.role_id = r.role_id) as permission_count
        FROM role r
        WHERE r.role_id = @roleId
      `;
      
      logDB('Role.findById', query, { roleId });
      const result = await executeQuery(query, { roleId });
      
      if (result.recordset.length === 0) return null;
      return new Role(result.recordset[0]);
    } catch (error) {
      logger.error('Role.findById error:', error);
      throw error;
    }
  }

  /**
   * Find role by name
   * @param {string} roleName - Role name
   * @param {number} excludeRoleId - Role ID to exclude from search
   * @returns {Promise<Role|null>} Role object or null
   */
  static async findByName(roleName, excludeRoleId = null) {
    try {
      let query = `SELECT role_id, role_name FROM role WHERE role_name = @roleName`;
      let params = { roleName };
      
      if (excludeRoleId) {
        query += ` AND role_id != @excludeRoleId`;
        params.excludeRoleId = excludeRoleId;
      }

      logDB('Role.findByName', query, params);
      const result = await executeQuery(query, params);
      
      if (result.recordset.length === 0) return null;
      return new Role(result.recordset[0]);
    } catch (error) {
      logger.error('Role.findByName error:', error);
      throw error;
    }
  }

  /**
   * Create new role
   * @param {Object} roleData - Role data
   * @returns {Promise<Role>} Created role object
   */
  static async create(roleData) {
    try {
      const query = `
        INSERT INTO role (role_name)
        OUTPUT INSERTED.role_id, INSERTED.role_name
        VALUES (@roleName)
      `;
      
      logDB('Role.create', query, { roleName: roleData.role_name });
      const result = await executeQuery(query, { roleName: roleData.role_name });
      
      return new Role(result.recordset[0]);
    } catch (error) {
      logger.error('Role.create error:', error);
      throw error;
    }
  }

  /**
   * Update role
   * @param {number} roleId - Role ID
   * @param {Object} roleData - Role data to update
   * @returns {Promise<Role>} Updated role object
   */
  static async update(roleId, roleData) {
    try {
      const query = `
        UPDATE role 
        SET role_name = @roleName
        OUTPUT INSERTED.role_id, INSERTED.role_name
        WHERE role_id = @roleId
      `;
      
      logDB('Role.update', query, { roleId, roleName: roleData.role_name });
      const result = await executeQuery(query, { roleId, roleName: roleData.role_name });
      
      if (result.recordset.length === 0) {
        throw new Error('Role not found');
      }
      
      return new Role(result.recordset[0]);
    } catch (error) {
      logger.error('Role.update error:', error);
      throw error;
    }
  }

  /**
   * Delete role (only if no users assigned)
   * @param {number} roleId - Role ID
   * @returns {Promise<boolean>} Success status
   */
  static async delete(roleId) {
    try {
      // Check if role has users
      const userCheck = `
        SELECT COUNT(*) as user_count 
        FROM [user] 
        WHERE role_id = @roleId AND is_active = 1
      `;
      
      const userResult = await executeQuery(userCheck, { roleId });
      
      if (userResult.recordset[0].user_count > 0) {
        throw new Error('Cannot delete role with assigned users');
      }

      // Check if it's a system role
      const systemRoles = ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER'];
      const roleCheck = await Role.findById(roleId);
      
      if (roleCheck && systemRoles.includes(roleCheck.role_name)) {
        throw new Error('Cannot delete system role');
      }

      // Delete role permissions first
      const deletePermsQuery = `DELETE FROM role_permission WHERE role_id = @roleId`;
      await executeQuery(deletePermsQuery, { roleId });

      // Delete role
      const deleteRoleQuery = `DELETE FROM role WHERE role_id = @roleId`;
      logDB('Role.delete', deleteRoleQuery, { roleId });
      
      const result = await executeQuery(deleteRoleQuery, { roleId });
      
      return result.rowsAffected[0] > 0;
    } catch (error) {
      logger.error('Role.delete error:', error);
      throw error;
    }
  }

  /**
   * Get users assigned to role
   * @param {number} roleId - Role ID
   * @returns {Promise<Object[]>} Array of user objects
   */
  static async getRoleUsers(roleId) {
    try {
      const query = `
        SELECT 
          u.user_id,
          u.user_name,
          u.first_name,
          u.last_name,
          u.email,
          u.is_active,
          c.name as client_name,
          u.created_at
        FROM [user] u
        INNER JOIN client c ON u.client_id = c.client_id
        WHERE u.role_id = @roleId
        ORDER BY u.first_name, u.last_name
      `;
      
      logDB('Role.getRoleUsers', query, { roleId });
      const result = await executeQuery(query, { roleId });
      
      return result.recordset;
    } catch (error) {
      logger.error('Role.getRoleUsers error:', error);
      throw error;
    }
  }

  /**
   * Get role statistics
   * @returns {Promise<Object>} Role statistics
   */
  static async getStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_roles,
          COUNT(DISTINCT u.user_id) as total_users,
          AVG(CAST(perm_count.permission_count as FLOAT)) as avg_permissions_per_role
        FROM role r
        LEFT JOIN [user] u ON r.role_id = u.role_id AND u.is_active = 1
        LEFT JOIN (
          SELECT role_id, COUNT(*) as permission_count
          FROM role_permission
          GROUP BY role_id
        ) perm_count ON r.role_id = perm_count.role_id
      `;
      
      logDB('Role.getStats', query);
      const result = await executeQuery(query);
      
      return result.recordset[0];
    } catch (error) {
      logger.error('Role.getStats error:', error);
      throw error;
    }
  }

  /**
   * Get total count of roles
   * @param {Object} options - Query options (search)
   * @returns {Promise<number>} Total count
   */
  static async getCount(options = {}) {
    try {
      const { search } = options;
      
      let query = `SELECT COUNT(*) as count FROM role`;
      let params = {};
      
      if (search) {
        query += ` WHERE role_name LIKE @search`;
        params.search = `%${search}%`;
      }

      logDB('Role.getCount', query, params);
      const result = await executeQuery(query, Object.keys(params).length > 0 ? params : undefined);
      
      return result.recordset[0].count;
    } catch (error) {
      logger.error('Role.getCount error:', error);
      throw error;
    }
  }

  /**
   * Convert role to public format (removes sensitive data)
   * @returns {Object} Public role data
   */
  toPublic() {
    return {
      role_id: this.role_id,
      role_name: this.role_name,
      user_count: this.user_count,
      permission_count: this.permission_count
    };
  }
}

export default Role;