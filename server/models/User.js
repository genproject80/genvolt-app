import { executeQuery, sql } from '../config/database.js';
import { logger, logDB } from '../utils/logger.js';
import bcrypt from 'bcryptjs';

/**
 * User Model - Handles all user-related database operations
 * Based on the USER table structure from database_model.md
 */
export class User {
  constructor(userData) {
    this.user_id = userData.user_id;
    this.client_id = userData.client_id;
    this.first_name = userData.first_name;
    this.last_name = userData.last_name;
    this.email = userData.email;
    this.ph_no = userData.ph_no;
    this.password = userData.password;
    this.user_name = userData.user_name;
    this.is_active = userData.is_active;
    this.role_id = userData.role_id;
    this.created_by_user_id = userData.created_by_user_id;
    this.created_at = userData.created_at;
    this.updated_at = userData.updated_at;
    this.updated_by_user_id = userData.updated_by_user_id;

    // Include joined data from roles and clients tables
    this.role_name = userData.role_name;
    this.client_name = userData.client_name;
  }

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Promise<User|null>} User object or null if not found
   */
  static async findByEmail(email) {
    try {
      const query = `
        SELECT 
          u.user_id, u.client_id, u.first_name, u.last_name, u.email, 
          u.ph_no, u.password, u.user_name, u.is_active, u.role_id,
          u.created_by_user_id, u.created_at, u.updated_at, u.updated_by_user_id,
          c.name as client_name,
          r.role_name
        FROM [user] u
        LEFT JOIN client c ON u.client_id = c.client_id
        LEFT JOIN role r ON u.role_id = r.role_id
        WHERE u.email = @email AND u.is_active = 1
      `;

      const result = await executeQuery(query, { email });
      
      if (result.recordset.length === 0) {
        return null;
      }

      return new User(result.recordset[0]);
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Promise<User|null>} User object or null if not found
   */
  static async findByUsername(username) {
    try {
      const query = `
        SELECT 
          u.user_id, u.client_id, u.first_name, u.last_name, u.email, 
          u.ph_no, u.password, u.user_name, u.is_active, u.role_id,
          u.created_by_user_id, u.created_at, u.updated_at, u.updated_by_user_id,
          c.name as client_name,
          r.role_name
        FROM [user] u
        LEFT JOIN client c ON u.client_id = c.client_id
        LEFT JOIN role r ON u.role_id = r.role_id
        WHERE u.user_name = @username AND u.is_active = 1
      `;

      const result = await executeQuery(query, { username });
      
      if (result.recordset.length === 0) {
        return null;
      }

      return new User(result.recordset[0]);
    } catch (error) {
      logger.error('Error finding user by username:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   * @param {number} userId - User ID
   * @returns {Promise<User|null>} User object or null if not found
   */
  static async findById(userId) {
    try {
      const query = `
        SELECT 
          u.user_id, u.client_id, u.first_name, u.last_name, u.email, 
          u.ph_no, u.password, u.user_name, u.is_active, u.role_id,
          u.created_by_user_id, u.created_at, u.updated_at, u.updated_by_user_id,
          c.name as client_name,
          r.role_name
        FROM [user] u
        LEFT JOIN client c ON u.client_id = c.client_id
        LEFT JOIN role r ON u.role_id = r.role_id
        WHERE u.user_id = @userId AND u.is_active = 1
      `;

      const result = await executeQuery(query, { userId });
      
      if (result.recordset.length === 0) {
        return null;
      }

      return new User(result.recordset[0]);
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }

  /**
   * Create a new user
   * @param {Object} userData - User data object
   * @returns {Promise<User>} Created user object
   */
  static async create(userData) {
    try {
      // Hash password before storing
      const hashedPassword = await bcrypt.hash(userData.password, 12);

      const query = `
        INSERT INTO [user] (
          client_id, first_name, last_name, email, ph_no, 
          password, user_name, role_id, created_by_user_id, is_active
        )
        OUTPUT INSERTED.*
        VALUES (
          @client_id, @first_name, @last_name, @email, @ph_no,
          @password, @user_name, @role_id, @created_by_user_id, 1
        )
      `;

      const params = {
        client_id: userData.client_id,
        first_name: userData.first_name,
        last_name: userData.last_name,
        email: userData.email,
        ph_no: userData.ph_no,
        password: hashedPassword,
        user_name: userData.user_name,
        role_id: userData.role_id,
        created_by_user_id: userData.created_by_user_id
      };

      const result = await executeQuery(query, params);
      
      if (result.recordset.length === 0) {
        throw new Error('Failed to create user');
      }

      return new User(result.recordset[0]);
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user information
   * @param {number} userId - User ID to update
   * @param {Object} updateData - Data to update
   * @param {number} updatedBy - ID of user making the update
   * @returns {Promise<User>} Updated user object
   */
  static async update(userId, updateData, updatedBy) {
    try {
      const setClauses = [];
      const params = { userId, updatedBy };

      // Build dynamic UPDATE query based on provided data
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== 'user_id' && key !== 'password') {
          setClauses.push(`${key} = @${key}`);
          params[key] = updateData[key];
        }
      });

      // Handle password update separately (hash it)
      if (updateData.password) {
        const hashedPassword = await bcrypt.hash(updateData.password, 12);
        setClauses.push('password = @password');
        params.password = hashedPassword;
      }

      if (setClauses.length === 0) {
        throw new Error('No fields to update');
      }

      setClauses.push('updated_at = GETUTCDATE()');
      setClauses.push('updated_by_user_id = @updatedBy');

      const query = `
        UPDATE [user] 
        SET ${setClauses.join(', ')}
        OUTPUT INSERTED.*
        WHERE user_id = @userId AND is_active = 1
      `;

      const result = await executeQuery(query, params);
      
      if (result.recordset.length === 0) {
        throw new Error('User not found or not updated');
      }

      return new User(result.recordset[0]);
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Soft delete user (set is_active to false)
   * @param {number} userId - User ID to delete
   * @param {number} deletedBy - ID of user performing deletion
   * @returns {Promise<boolean>} True if successful
   */
  static async softDelete(userId, deletedBy) {
    try {
      const query = `
        UPDATE [user] 
        SET is_active = 0, updated_at = GETUTCDATE(), updated_by_user_id = @deletedBy
        WHERE user_id = @userId AND is_active = 1
      `;

      const result = await executeQuery(query, { userId, deletedBy });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      logger.error('Error soft deleting user:', error);
      throw error;
    }
  }

  /**
   * Verify user password
   * @param {string} plainPassword - Plain text password
   * @returns {Promise<boolean>} True if password matches
   */
  async verifyPassword(plainPassword) {
    try {
      return await bcrypt.compare(plainPassword, this.password);
    } catch (error) {
      logger.error('Error verifying password:', error);
      throw error;
    }
  }

  /**
   * Get user's permissions based on role
   * @returns {Promise<Array>} Array of permission names
   */
  async getPermissions() {
    try {
      const query = `
        SELECT p.permission_name
        FROM permissions p
        INNER JOIN role_permission rp ON p.permission_id = rp.permission_id
        WHERE rp.role_id = @role_id
      `;

      const result = await executeQuery(query, { role_id: this.role_id });
      return result.recordset.map(row => row.permission_name);
    } catch (error) {
      logger.error('Error getting user permissions:', error);
      throw error;
    }
  }

  /**
   * Check if user has specific permission
   * @param {string} permission - Permission name to check
   * @returns {Promise<boolean>} True if user has permission
   */
  async hasPermission(permission) {
    try {
      const permissions = await this.getPermissions();
      return permissions.includes(permission);
    } catch (error) {
      logger.error('Error checking user permission:', error);
      return false;
    }
  }

  /**
   * Get users by client ID with pagination
   * @param {number} clientId - Client ID
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Number of users per page
   * @returns {Promise<Object>} Object with users array and pagination info
   */
  static async getByClientId(clientId, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM [user] u
        WHERE u.client_id = @clientId AND u.is_active = 1
      `;

      const dataQuery = `
        SELECT 
          u.user_id, u.client_id, u.first_name, u.last_name, u.email, 
          u.ph_no, u.user_name, u.is_active, u.role_id, u.created_at,
          c.name as client_name,
          r.role_name
        FROM [user] u
        LEFT JOIN client c ON u.client_id = c.client_id
        LEFT JOIN role r ON u.role_id = r.role_id
        WHERE u.client_id = @clientId AND u.is_active = 1
        ORDER BY u.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;

      const [countResult, dataResult] = await Promise.all([
        executeQuery(countQuery, { clientId }),
        executeQuery(dataQuery, { clientId, offset, limit })
      ]);

      const total = countResult.recordset[0].total;
      const totalPages = Math.ceil(total / limit);

      return {
        users: dataResult.recordset.map(row => new User(row)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error getting users by client ID:', error);
      throw error;
    }
  }

  /**
   * Search users by various criteria
   * @param {Object} searchCriteria - Search parameters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Search results with pagination
   */
  static async search(searchCriteria, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      const whereClauses = ['u.is_active = 1'];
      const params = { offset, limit };

      // Build dynamic WHERE clauses
      if (searchCriteria.email) {
        whereClauses.push('u.email LIKE @email');
        params.email = `%${searchCriteria.email}%`;
      }

      if (searchCriteria.name) {
        whereClauses.push('(u.first_name LIKE @name OR u.last_name LIKE @name)');
        params.name = `%${searchCriteria.name}%`;
      }

      if (searchCriteria.client_id) {
        whereClauses.push('u.client_id = @client_id');
        params.client_id = searchCriteria.client_id;
      }

      if (searchCriteria.role_id) {
        whereClauses.push('u.role_id = @role_id');
        params.role_id = searchCriteria.role_id;
      }

      const whereClause = whereClauses.join(' AND ');

      const countQuery = `
        SELECT COUNT(*) as total
        FROM [user] u
        WHERE ${whereClause}
      `;

      const dataQuery = `
        SELECT 
          u.user_id, u.client_id, u.first_name, u.last_name, u.email, 
          u.ph_no, u.user_name, u.is_active, u.role_id, u.created_at,
          c.name as client_name,
          r.role_name
        FROM [user] u
        LEFT JOIN client c ON u.client_id = c.client_id
        LEFT JOIN role r ON u.role_id = r.role_id
        WHERE ${whereClause}
        ORDER BY u.created_at DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;

      const [countResult, dataResult] = await Promise.all([
        executeQuery(countQuery, params),
        executeQuery(dataQuery, params)
      ]);

      const total = countResult.recordset[0].total;
      const totalPages = Math.ceil(total / limit);

      return {
        users: dataResult.recordset.map(row => new User(row)),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Error searching users:', error);
      throw error;
    }
  }

  /**
   * Convert user object to JSON (exclude sensitive data)
   * @returns {Object} User object without password
   */
  toJSON() {
    const { password, ...userWithoutPassword } = this;
    return userWithoutPassword;
  }

  /**
   * Get public user data for API responses
   * @returns {Object} Public user data
   */
  toPublic() {
    return {
      user_id: this.user_id,
      client_id: this.client_id,
      first_name: this.first_name,
      last_name: this.last_name,
      email: this.email,
      user_name: this.user_name,
      role_id: this.role_id,
      role_name: this.role_name,
      client_name: this.client_name,
      is_active: this.is_active,
      created_at: this.created_at
    };
  }

  /**
   * Find all users with filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Records per page
   * @param {string} sortBy - Sort field
   * @param {string} sortOrder - Sort order (asc/desc)
   * @returns {Promise<Object>} Paginated users with metadata
   */
  static async findAll(filters = {}, page = 1, limit = 10, sortBy = 'created_at', sortOrder = 'desc') {
    try {
      const offset = (page - 1) * limit;
      const conditions = ['u.is_active = 1'];
      const params = { offset, limit };

      // Build WHERE clause
      if (filters.client_id) {
        conditions.push('u.client_id = @client_id');
        params.client_id = filters.client_id;
      }

      if (filters.user_id) {
        conditions.push('u.user_id = @user_id');
        params.user_id = filters.user_id;
      }

      if (filters.is_active !== undefined) {
        conditions[0] = 'u.is_active = @is_active';
        params.is_active = filters.is_active;
      }

      if (filters.role_id) {
        conditions.push('u.role_id = @role_id');
        params.role_id = filters.role_id;
      }

      if (filters.search) {
        conditions.push(`(
          u.first_name LIKE @search OR 
          u.last_name LIKE @search OR 
          u.email LIKE @search OR 
          u.user_name LIKE @search OR
          CONCAT(u.first_name, ' ', u.last_name) LIKE @search
        )`);
        params.search = `%${filters.search}%`;
      }

      const whereClause = conditions.join(' AND ');

      // Validate sort field and order
      const allowedSortFields = ['user_id', 'first_name', 'last_name', 'email', 'user_name', 'created_at', 'role_name'];
      const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
      const validSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM [user] u
        LEFT JOIN role r ON u.role_id = r.role_id
        LEFT JOIN client c ON u.client_id = c.client_id
        WHERE ${whereClause}
      `;

      const countResult = await executeQuery(countQuery, params);
      const total = countResult.recordset[0].total;

      // Get paginated results
      const sortField = validSortBy === 'role_name' ? 'r.role_name' : `u.${validSortBy}`;
      
      const dataQuery = `
        SELECT 
          u.user_id,
          u.client_id,
          u.first_name,
          u.last_name,
          u.email,
          u.ph_no,
          u.user_name,
          u.role_id,
          u.is_active,
          u.created_at,
          u.updated_at,
          r.role_name,
          c.name as client_name
        FROM [user] u
        LEFT JOIN role r ON u.role_id = r.role_id
        LEFT JOIN client c ON u.client_id = c.client_id
        WHERE ${whereClause}
        ORDER BY ${sortField} ${validSortOrder}
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;

      const dataResult = await executeQuery(dataQuery, params);
      const users = dataResult.recordset.map(user => new User(user));

      const totalPages = Math.ceil(total / limit);

      return {
        data: users.map(user => user.toPublic()),
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters,
        sortBy: validSortBy,
        sortOrder: validSortOrder
      };

    } catch (error) {
      logger.error('Error finding users', { error: error.message, filters, page, limit });
      throw new Error('Failed to fetch users');
    }
  }

  /**
   * Find users by role within client scope
   * @param {number} roleId - Role ID to filter by
   * @param {number|null} clientId - Client ID to filter by (null for all clients)
   * @returns {Promise<User[]>} Array of users
   */
  static async findByRoleAndClient(roleId, clientId = null) {
    try {
      const params = { roleId };
      const clientFilter = clientId ? 'AND u.client_id = @clientId' : '';

      if (clientId) {
        params.clientId = clientId;
      }

      const query = `
        SELECT
          u.user_id, u.client_id, u.first_name, u.last_name, u.email,
          u.ph_no, u.user_name, u.is_active, u.role_id,
          u.created_by_user_id, u.created_at, u.updated_at, u.updated_by_user_id,
          c.name as client_name,
          r.role_name
        FROM [user] u
        LEFT JOIN client c ON u.client_id = c.client_id
        LEFT JOIN role r ON u.role_id = r.role_id
        WHERE u.role_id = @roleId AND u.is_active = 1 ${clientFilter}
        ORDER BY u.created_at DESC
      `;

      const result = await executeQuery(query, params);
      return result.recordset.map(row => new User(row));
    } catch (error) {
      logger.error('Error finding users by role and client:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   * @param {number|null} clientId - Filter by client ID (null for all clients)
   * @returns {Promise<Object>} User statistics
   */
  static async getStatistics(clientId = null) {
    try {
      const params = {};
      const clientFilter = clientId ? 'WHERE u.client_id = @client_id' : '';
      
      if (clientId) {
        params.client_id = clientId;
      }

      const statsQuery = `
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN u.is_active = 1 THEN 1 END) as active_users,
          COUNT(CASE WHEN u.is_active = 0 THEN 1 END) as inactive_users,
          COUNT(CASE WHEN u.created_at >= DATEADD(day, -30, GETDATE()) THEN 1 END) as new_users_last_30_days,
          MIN(u.created_at) as first_user_created,
          MAX(u.created_at) as latest_user_created
        FROM [user] u
        ${clientFilter}
      `;

      const statsResult = await executeQuery(statsQuery, params);
      const stats = statsResult.recordset[0];

      // Get role breakdown
      const roleQuery = `
        SELECT 
          r.role_name,
          COUNT(u.user_id) as user_count,
          COUNT(CASE WHEN u.is_active = 1 THEN 1 END) as active_count
        FROM role r
        LEFT JOIN [USER] u ON r.role_id = u.role_id ${clientId ? 'AND u.client_id = @client_id' : ''}
        GROUP BY r.role_id, r.role_name
        ORDER BY user_count DESC
      `;

      const roleResult = await executeQuery(roleQuery, params);
      const roleBreakdown = roleResult.recordset;

      // Get client breakdown (if not filtered by client)
      let clientBreakdown = [];
      if (!clientId) {
        const clientQuery = `
          SELECT 
            c.name as client_name,
            COUNT(u.user_id) as user_count,
            COUNT(CASE WHEN u.is_active = 1 THEN 1 END) as active_count
          FROM client c
          LEFT JOIN [user] u ON c.client_id = u.client_id
          GROUP BY c.client_id, c.name
          ORDER BY user_count DESC
        `;

        const clientResult = await executeQuery(clientQuery, {});
        clientBreakdown = clientResult.recordset;
      }

      // Get daily user creation for last 30 days
      const dailyQuery = `
        SELECT 
          CAST(u.created_at as DATE) as date,
          COUNT(*) as new_users
        FROM [user] u
        WHERE u.created_at >= DATEADD(day, -30, GETDATE())
          ${clientId ? 'AND u.client_id = @client_id' : ''}
        GROUP BY CAST(u.created_at as DATE)
        ORDER BY date DESC
      `;

      const dailyResult = await executeQuery(dailyQuery, params);
      const dailyCreations = dailyResult.recordset;

      return {
        summary: stats,
        roleBreakdown,
        clientBreakdown,
        dailyCreations: dailyCreations.slice(0, 30)
      };

    } catch (error) {
      logger.error('Error getting user statistics', { error: error.message, clientId });
      throw new Error('Failed to get user statistics');
    }
  }
}

export default User;