import { getDB } from '../config/database.js';
import { logger } from './logger.js';

/**
 * Activity types for audit logging
 */
export const ACTIVITY_TYPES = {
  AUTHENTICATION: 'AUTHENTICATION',
  USER_MANAGEMENT: 'USER_MANAGEMENT',
  CLIENT_MANAGEMENT: 'CLIENT_MANAGEMENT',
  DEVICE_MANAGEMENT: 'DEVICE_MANAGEMENT',
  DATA_ACCESS: 'DATA_ACCESS',
  CONFIGURATION: 'CONFIGURATION',
  SECURITY: 'SECURITY',
  SYSTEM: 'SYSTEM'
};

/**
 * Actions for audit logging
 */
export const AUDIT_ACTIONS = {
  // Authentication
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_REGISTERED: 'USER_REGISTERED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  PERMISSIONS_VIEWED: 'PERMISSIONS_VIEWED',

  // User Management
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',

  // User Preferences
  USER_PREFERENCE_SAVE: 'USER_PREFERENCE_SAVE',
  USER_PREFERENCE_VIEW: 'USER_PREFERENCE_VIEW',
  USER_PREFERENCE_DELETE: 'USER_PREFERENCE_DELETE',

  // Client Management
  CLIENT_CREATED: 'CLIENT_CREATED',
  CLIENT_UPDATED: 'CLIENT_UPDATED',
  CLIENT_DELETED: 'CLIENT_DELETED',
  CLIENT_VIEW: 'CLIENT_VIEW',
  CLIENT_CREATE: 'CLIENT_CREATE',
  CLIENT_UPDATE: 'CLIENT_UPDATE',
  CLIENT_DELETE: 'CLIENT_DELETE',
  CLIENT_STATS: 'CLIENT_STATS',

  // Device Management
  DEVICE_CREATED: 'DEVICE_CREATED',
  DEVICE_UPDATED: 'DEVICE_UPDATED',
  DEVICE_DELETED: 'DEVICE_DELETED',
  DEVICE_TRANSFERRED: 'DEVICE_TRANSFERRED',
  DEVICE_ACTIVATED: 'DEVICE_ACTIVATED',
  DEVICE_DEACTIVATED: 'DEVICE_DEACTIVATED',
  DEVICE_DETAIL_VIEW: 'DEVICE_DETAIL_VIEW',
  DEVICE_HISTORY_VIEW: 'DEVICE_HISTORY_VIEW',

  // Dashboard Management
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',
  DASHBOARD_CREATE: 'DASHBOARD_CREATE',
  DASHBOARD_UPDATE: 'DASHBOARD_UPDATE',
  DASHBOARD_DELETE: 'DASHBOARD_DELETE',

  // Role Management
  ROLE_VIEW: 'ROLE_VIEW',
  ROLE_CREATE: 'ROLE_CREATE',
  ROLE_UPDATE: 'ROLE_UPDATE',
  ROLE_DELETE: 'ROLE_DELETE',
  ROLE_PERMISSION_VIEW: 'ROLE_PERMISSION_VIEW',
  ROLE_PERMISSION_UPDATE: 'ROLE_PERMISSION_UPDATE',
  ROLE_USERS_VIEW: 'ROLE_USERS_VIEW',
  ROLE_STATS_VIEW: 'ROLE_STATS_VIEW',
  ROLE_PERMISSION_MATRIX_VIEW: 'ROLE_PERMISSION_MATRIX_VIEW',

  // Permission Management
  PERMISSION_VIEW: 'PERMISSION_VIEW',
  PERMISSION_CATEGORY_VIEW: 'PERMISSION_CATEGORY_VIEW',
  PERMISSION_ROLES_VIEW: 'PERMISSION_ROLES_VIEW',
  PERMISSION_STATS_VIEW: 'PERMISSION_STATS_VIEW',
  PERMISSION_UNASSIGNED_VIEW: 'PERMISSION_UNASSIGNED_VIEW',
  PERMISSION_SEARCH: 'PERMISSION_SEARCH',

  // IoT Data Access
  IOT_DATA_VIEW: 'IOT_DATA_VIEW',
  IOT_DATA_EXPORT: 'IOT_DATA_EXPORT',
  IOT_DATA_STATS: 'IOT_DATA_STATS',

  // P3 Data Access
  P3_DATA_VIEW: 'P3_DATA_VIEW',
  P3_DATA_EXPORT: 'P3_DATA_EXPORT',
  P3_DATA_STATS: 'P3_DATA_STATS',
  P3_STATUS_METRICS: 'P3_STATUS_METRICS',
  P3_GREASE_METRICS: 'P3_GREASE_METRICS',
  P3_COF_DATE_METRICS: 'P3_COF_DATE_METRICS',
  P3_COF_METRICS: 'P3_COF_METRICS',
  P3_SERVICE_METRICS: 'P3_SERVICE_METRICS',
  P3_DEVICE_DETAIL_VIEW: 'P3_DEVICE_DETAIL_VIEW',
  P3_DEVICE_HISTORY_VIEW: 'P3_DEVICE_HISTORY_VIEW',

  // HKMI Data
  HKMI_DATA_UPLOAD: 'HKMI_DATA_UPLOAD',
  HKMI_TABLE_VIEW: 'HKMI_TABLE_VIEW',

  // Hierarchy Filters
  HIERARCHY_FILTER_VIEW: 'HIERARCHY_FILTER_VIEW',
  HIERARCHY_FILTER_APPLY: 'HIERARCHY_FILTER_APPLY',

  // Data Access (General)
  DATA_ACCESSED: 'DATA_ACCESSED',
  DATA_EXPORTED: 'DATA_EXPORTED',
  REPORT_GENERATED: 'REPORT_GENERATED',

  // Configuration
  CONFIG_UPDATED: 'CONFIG_UPDATED',
  SETTINGS_CHANGED: 'SETTINGS_CHANGED',

  // Security
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // System
  SYSTEM_BACKUP: 'SYSTEM_BACKUP',
  SYSTEM_RESTORE: 'SYSTEM_RESTORE',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE'
};

/**
 * Target types for audit logging
 */
export const TARGET_TYPES = {
  // User and Authentication
  USER: 'USER',

  // Client Management
  CLIENT: 'CLIENT',

  // Device Management
  DEVICE: 'DEVICE',
  DEVICE_DETAIL: 'DEVICE_DETAIL',
  DEVICE_HISTORY: 'DEVICE_HISTORY',

  // Dashboard
  DASHBOARD: 'DASHBOARD',

  // Role and Permission Management
  ROLE: 'ROLE',
  PERMISSION: 'PERMISSION',

  // User Preferences
  USER_PREFERENCE: 'USER_PREFERENCE',

  // IoT Data
  IOT_DATA: 'IOT_DATA',
  IOT_DATA_P3: 'IOT_DATA_P3',
  IOT_DATA_SICK_P3: 'IOT_DATA_SICK_P3',

  // P3 Device
  P3_DEVICE_DETAIL: 'P3_DEVICE_DETAIL',
  P3_DEVICE_HISTORY: 'P3_DEVICE_HISTORY',

  // HKMI
  HKMI_UPLOAD: 'HKMI_UPLOAD',
  HKMI_TABLE: 'HKMI_TABLE',
  CLOUD_DASHBOARD_HKMI: 'CLOUD_DASHBOARD_HKMI',

  // Hierarchy
  HIERARCHY_FILTER: 'HIERARCHY_FILTER',

  // System
  CONFIGURATION: 'CONFIGURATION',
  SYSTEM: 'SYSTEM'
};

/**
 * Create an audit log entry
 * @param {Object} auditData - Audit log data
 * @param {number} auditData.user_id - ID of user performing the action
 * @param {string} auditData.activity_type - Type of activity (from ACTIVITY_TYPES)
 * @param {string} auditData.action - Specific action performed (from AUDIT_ACTIONS)
 * @param {string} auditData.message - Human-readable description of the action
 * @param {string} [auditData.target_type] - Type of target affected (from TARGET_TYPES)
 * @param {number} [auditData.target_id] - ID of the target affected
 * @param {string} [auditData.details] - JSON string with additional details
 * @param {string} [auditData.ip_address] - IP address of the user
 * @param {string} [auditData.user_agent] - User agent string
 * @param {Date} [auditData.timestamp] - Timestamp of the action (defaults to now)
 * @returns {Promise<Object>} Created audit log entry
 */
export const createAuditLog = async (auditData) => {
  const startTime = Date.now();
  
  try {
    const {
      user_id,
      activity_type,
      action,
      message,
      target_type = null,
      target_id = null,
      details = null,
      ip_address = null,
      user_agent = null,
      timestamp = new Date()
    } = auditData;

    // Validate required fields
    if (!user_id || !activity_type || !action || !message) {
      throw new Error('Missing required audit log fields: user_id, activity_type, action, message');
    }

    // Validate activity type
    if (!Object.values(ACTIVITY_TYPES).includes(activity_type)) {
      throw new Error(`Invalid activity type: ${activity_type}`);
    }

    // Validate action
    if (!Object.values(AUDIT_ACTIONS).includes(action)) {
      throw new Error(`Invalid action: ${action}`);
    }

    // Validate target type if provided
    if (target_type && !Object.values(TARGET_TYPES).includes(target_type)) {
      throw new Error(`Invalid target type: ${target_type}`);
    }

    const query = `
      INSERT INTO audit_log (
        user_id,
        activity_type,
        action,
        message,
        target_type,
        target_id,
        details,
        ip_address,
        user_agent,
        created_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @user_id,
        @activity_type,
        @action,
        @message,
        @target_type,
        @target_id,
        @details,
        @ip_address,
        @user_agent,
        @timestamp
      )
    `;

    const pool = await getDB();
    const request = pool.request();
    request.input('user_id', user_id);
    request.input('activity_type', activity_type);
    request.input('action', action);
    request.input('message', message);
    request.input('target_type', target_type);
    request.input('target_id', target_id);
    request.input('details', details);
    request.input('ip_address', ip_address);
    request.input('user_agent', user_agent);
    request.input('timestamp', timestamp);

    const result = await request.query(query);
    const auditLog = result.recordset[0];

    const duration = Date.now() - startTime;
    logger.debug('Audit log created', {
      auditLogId: auditLog.audit_id,
      userId: user_id,
      activityType: activity_type,
      action: action,
      duration: `${duration}ms`
    });

    return auditLog;

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error creating audit log', {
      error: error.message,
      auditData,
      duration: `${duration}ms`
    });
    
    // Don't throw error - audit logging should not break the main flow
    return null;
  }
};

/**
 * Get audit logs with filtering and pagination
 * @param {Object} filters - Filter criteria
 * @param {number} [filters.user_id] - Filter by user ID
 * @param {string} [filters.activity_type] - Filter by activity type
 * @param {string} [filters.action] - Filter by action
 * @param {string} [filters.target_type] - Filter by target type
 * @param {number} [filters.target_id] - Filter by target ID
 * @param {Date} [filters.start_date] - Filter by start date
 * @param {Date} [filters.end_date] - Filter by end date
 * @param {string} [filters.ip_address] - Filter by IP address
 * @param {number} [page=1] - Page number for pagination
 * @param {number} [limit=50] - Number of records per page
 * @param {string} [sortBy='created_at'] - Field to sort by
 * @param {string} [sortOrder='desc'] - Sort order (asc/desc)
 * @returns {Promise<Object>} Paginated audit logs with metadata
 */
export const getAuditLogs = async (filters = {}, page = 1, limit = 50, sortBy = 'created_at', sortOrder = 'desc') => {
  const startTime = Date.now();
  
  try {
    const offset = (page - 1) * limit;
    const conditions = [];
    const pool = await getDB();
    const request = pool.request();

    // Build WHERE clause
    if (filters.user_id) {
      conditions.push('al.user_id = @user_id');
      request.input('user_id', filters.user_id);
    }

    if (filters.activity_type) {
      conditions.push('al.activity_type = @activity_type');
      request.input('activity_type', filters.activity_type);
    }

    if (filters.action) {
      conditions.push('al.action = @action');
      request.input('action', filters.action);
    }

    if (filters.target_type) {
      conditions.push('al.target_type = @target_type');
      request.input('target_type', filters.target_type);
    }

    if (filters.target_id) {
      conditions.push('al.target_id = @target_id');
      request.input('target_id', filters.target_id);
    }

    if (filters.start_date) {
      conditions.push('al.created_at >= @start_date');
      request.input('start_date', filters.start_date);
    }

    if (filters.end_date) {
      conditions.push('al.created_at <= @end_date');
      request.input('end_date', filters.end_date);
    }

    if (filters.ip_address) {
      conditions.push('al.ip_address = @ip_address');
      request.input('ip_address', filters.ip_address);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sort field and order
    const allowedSortFields = ['audit_id', 'user_id', 'activity_type', 'action', 'target_type', 'target_id', 'created_at'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM audit_log al
      ${whereClause}
    `;

    const countResult = await request.query(countQuery);
    const total = countResult.recordset[0].total;

    // Get paginated results with user information
    request.input('offset', offset);
    request.input('limit', limit);

    const dataQuery = `
      SELECT
        al.*,
        u.first_name,
        u.last_name,
        u.email,
        u.user_name
      FROM audit_log al
      LEFT JOIN [user] u ON al.user_id = u.user_id
      ${whereClause}
      ORDER BY al.${validSortBy} ${validSortOrder}
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `;

    const dataResult = await request.query(dataQuery);
    const auditLogs = dataResult.recordset;

    const totalPages = Math.ceil(total / limit);
    const duration = Date.now() - startTime;

    logger.debug('Audit logs retrieved', {
      total,
      page,
      limit,
      totalPages,
      filters,
      duration: `${duration}ms`
    });

    return {
      data: auditLogs,
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
    const duration = Date.now() - startTime;
    logger.error('Error retrieving audit logs', {
      error: error.message,
      filters,
      page,
      limit,
      duration: `${duration}ms`
    });
    throw error;
  }
};

/**
 * Get audit log statistics
 * @param {Object} filters - Filter criteria (same as getAuditLogs)
 * @returns {Promise<Object>} Audit log statistics
 */
export const getAuditLogStats = async (filters = {}) => {
  const startTime = Date.now();
  
  try {
    const conditions = [];
    const pool = await getDB();
    const request = pool.request();

    // Build WHERE clause (same logic as getAuditLogs)
    if (filters.user_id) {
      conditions.push('user_id = @user_id');
      request.input('user_id', filters.user_id);
    }

    if (filters.activity_type) {
      conditions.push('activity_type = @activity_type');
      request.input('activity_type', filters.activity_type);
    }

    if (filters.start_date) {
      conditions.push('created_at >= @start_date');
      request.input('start_date', filters.start_date);
    }

    if (filters.end_date) {
      conditions.push('created_at <= @end_date');
      request.input('end_date', filters.end_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const statsQuery = `
      SELECT
        COUNT(*) as total_logs,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT activity_type) as activity_types,
        COUNT(DISTINCT CAST(created_at AS DATE)) as active_days,
        MIN(created_at) as earliest_log,
        MAX(created_at) as latest_log
      FROM audit_log
      ${whereClause}
    `;

    const statsResult = await request.query(statsQuery);
    const stats = statsResult.recordset[0];

    // Get activity type breakdown
    const activityQuery = `
      SELECT
        activity_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM audit_log
      ${whereClause}
      GROUP BY activity_type
      ORDER BY count DESC
    `;

    const activityResult = await request.query(activityQuery);
    const activityBreakdown = activityResult.recordset;

    // Get daily activity for the last 30 days
    const dailyQuery = `
      SELECT
        CAST(created_at AS DATE) as date,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
      FROM audit_log
      WHERE created_at >= DATEADD(day, -30, GETDATE())
        ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      GROUP BY CAST(created_at AS DATE)
      ORDER BY date DESC
    `;

    const dailyResult = await request.query(dailyQuery);
    const dailyActivity = dailyResult.recordset;

    const duration = Date.now() - startTime;
    logger.debug('Audit log statistics retrieved', {
      totalLogs: stats.total_logs,
      uniqueUsers: stats.unique_users,
      duration: `${duration}ms`
    });

    return {
      summary: stats,
      activityBreakdown,
      dailyActivity: dailyActivity.slice(0, 30) // Last 30 days
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error retrieving audit log statistics', {
      error: error.message,
      filters,
      duration: `${duration}ms`
    });
    throw error;
  }
};

/**
 * Clean up old audit logs
 * @param {number} daysToKeep - Number of days to keep logs (default: 365)
 * @returns {Promise<number>} Number of deleted records
 */
export const cleanupAuditLogs = async (daysToKeep = 365) => {
  const startTime = Date.now();
  
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const query = `
      DELETE FROM audit_log
      WHERE created_at < @cutoffDate
    `;

    const pool = await getDB();
    const request = pool.request();
    request.input('cutoffDate', cutoffDate);

    const result = await request.query(query);
    const deletedCount = result.rowsAffected[0];

    const duration = Date.now() - startTime;
    logger.info('Audit logs cleaned up', {
      deletedCount,
      cutoffDate: cutoffDate.toISOString(),
      daysToKeep,
      duration: `${duration}ms`
    });

    return deletedCount;

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Error cleaning up audit logs', {
      error: error.message,
      daysToKeep,
      duration: `${duration}ms`
    });
    throw error;
  }
};

export default {
  createAuditLog,
  getAuditLogs,
  getAuditLogStats,
  cleanupAuditLogs,
  ACTIVITY_TYPES,
  AUDIT_ACTIONS,
  TARGET_TYPES
};