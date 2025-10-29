import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Save user preferences
 * POST /api/user-preferences
 * Body: { preference_name, preference_value, dashboard_id }
 */
export const saveUserPreference = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { preference_name, preference_value, dashboard_id } = req.body;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get the dashboard's client_id
    let clientId = user.client_id;

    if (dashboard_id) {
      const dashboardQuery = `
        SELECT client_id FROM dashboard
        WHERE id = @dashboardId AND is_active = 1
      `;
      const dashboardResult = await pool.request()
        .input('dashboardId', sql.Int, dashboard_id)
        .query(dashboardQuery);

      if (dashboardResult.recordset.length > 0) {
        clientId = dashboardResult.recordset[0].client_id;
      }
    }

    // Check if preference already exists
    const checkQuery = `
      SELECT id FROM user_preferences
      WHERE user_id = @userId
        AND client_id = @clientId
        AND preference_name = @preferenceName
    `;

    const checkResult = await pool.request()
      .input('userId', sql.Int, user.user_id)
      .input('clientId', sql.Int, clientId)
      .input('preferenceName', sql.NVarChar, preference_name)
      .query(checkQuery);

    let query;
    let action;

    if (checkResult.recordset.length > 0) {
      // Update existing preference
      query = `
        UPDATE user_preferences
        SET preference_value = @preferenceValue
        WHERE user_id = @userId
          AND client_id = @clientId
          AND preference_name = @preferenceName
      `;
      action = 'updated';
    } else {
      // Insert new preference
      query = `
        INSERT INTO user_preferences (user_id, client_id, preference_name, preference_value)
        VALUES (@userId, @clientId, @preferenceName, @preferenceValue)
      `;
      action = 'created';
    }

    await pool.request()
      .input('userId', sql.Int, user.user_id)
      .input('clientId', sql.Int, clientId)
      .input('preferenceName', sql.NVarChar, preference_name)
      .input('preferenceValue', sql.NVarChar, preference_value)
      .query(query);

    // Create audit log
    await createAuditLog(
      user.user_id,
      'USER_PREFERENCE_SAVE',
      `User preference ${action}`,
      'user_preference',
      null,
      {
        preference_name,
        preference_value,
        dashboard_id: dashboard_id || null,
        action
      }
    );

    res.status(200).json({
      success: true,
      message: `Preference ${action} successfully`,
      data: {
        preference_name,
        preference_value,
        action
      }
    });

  } catch (error) {
    logger.error('Error saving user preference:', error);
    throw error;
  }
});

/**
 * Get user preferences
 * GET /api/user-preferences?preference_name=filter_preferences&dashboard_id=1
 */
export const getUserPreferences = asyncHandler(async (req, res) => {
  const { preference_name, dashboard_id } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get the dashboard's client_id
    let clientId = user.client_id;

    if (dashboard_id) {
      const dashboardQuery = `
        SELECT client_id FROM dashboard
        WHERE id = @dashboardId AND is_active = 1
      `;
      const dashboardResult = await pool.request()
        .input('dashboardId', sql.Int, dashboard_id)
        .query(dashboardQuery);

      if (dashboardResult.recordset.length > 0) {
        clientId = dashboardResult.recordset[0].client_id;
      }
    }

    console.log('=== GET USER PREFERENCES - QUERY PARAMETERS ===');
    console.log('Request params from frontend:');
    console.log('  - dashboard_id:', dashboard_id);
    console.log('  - preference_name:', preference_name);
    console.log('Logged-in user info:');
    console.log('  - user.user_id:', user.user_id);
    console.log('  - user.client_id:', user.client_id);
    console.log('Resolved client_id for query:', clientId);
    console.log('Query will use:');
    console.log('  - userId:', user.user_id);
    console.log('  - clientId:', clientId);
    console.log('  - preferenceName:', preference_name);

    let query = `
      SELECT
        id,
        user_id,
        client_id,
        preference_name,
        preference_value
      FROM user_preferences
      WHERE user_id = @userId AND client_id = @clientId
    `;

    const request = pool.request()
      .input('userId', sql.Int, user.user_id)
      .input('clientId', sql.Int, clientId);

    if (preference_name) {
      query += ` AND preference_name = @preferenceName`;
      request.input('preferenceName', sql.NVarChar, preference_name);
    }

    console.log('Executing query:', query);

    const result = await request.query(query);

    console.log('Query results:');
    console.log('  - Records found:', result.recordset.length);
    if (result.recordset.length > 0) {
      console.log('  - Preference data:', result.recordset[0]);
    }
    console.log('===============================================');

    // Create audit log
    await createAuditLog(
      user.user_id,
      'USER_PREFERENCE_VIEW',
      'Retrieved user preferences',
      'user_preference',
      null,
      {
        preference_name: preference_name || 'all',
        dashboard_id: dashboard_id || null,
        count: result.recordset.length
      }
    );

    // If a specific preference was requested and found, return just that one
    if (preference_name && result.recordset.length > 0) {
      const preference = result.recordset[0];
      res.json({
        success: true,
        message: 'User preference retrieved successfully',
        data: {
          preference_name: preference.preference_name,
          preference_value: preference.preference_value
        }
      });
    } else if (preference_name && result.recordset.length === 0) {
      // Specific preference requested but not found - return null explicitly
      res.json({
        success: true,
        message: 'No preference found',
        data: null
      });
    } else {
      // Return all preferences
      res.json({
        success: true,
        message: 'User preferences retrieved successfully',
        data: result.recordset.map(pref => ({
          preference_name: pref.preference_name,
          preference_value: pref.preference_value
        }))
      });
    }

  } catch (error) {
    logger.error('Error fetching user preferences:', error);
    throw error;
  }
});

/**
 * Delete user preference
 * DELETE /api/user-preferences?preference_name=filter_preferences&dashboard_id=1
 */
export const deleteUserPreference = asyncHandler(async (req, res) => {
  const { preference_name, dashboard_id } = req.query;
  const user = req.user;

  if (!preference_name) {
    throw new ValidationError('preference_name is required');
  }

  try {
    const pool = await getPool();

    // Get the dashboard's client_id
    let clientId = user.client_id;

    if (dashboard_id) {
      const dashboardQuery = `
        SELECT client_id FROM dashboard
        WHERE id = @dashboardId AND is_active = 1
      `;
      const dashboardResult = await pool.request()
        .input('dashboardId', sql.Int, dashboard_id)
        .query(dashboardQuery);

      if (dashboardResult.recordset.length > 0) {
        clientId = dashboardResult.recordset[0].client_id;
      }
    }

    const query = `
      DELETE FROM user_preferences
      WHERE user_id = @userId
        AND client_id = @clientId
        AND preference_name = @preferenceName
    `;

    const result = await pool.request()
      .input('userId', sql.Int, user.user_id)
      .input('clientId', sql.Int, clientId)
      .input('preferenceName', sql.NVarChar, preference_name)
      .query(query);

    // Create audit log
    await createAuditLog(
      user.user_id,
      'USER_PREFERENCE_DELETE',
      'Deleted user preference',
      'user_preference',
      null,
      {
        preference_name,
        dashboard_id: dashboard_id || null,
        rows_affected: result.rowsAffected[0]
      }
    );

    res.json({
      success: true,
      message: 'User preference deleted successfully',
      data: {
        preference_name,
        deleted: result.rowsAffected[0] > 0
      }
    });

  } catch (error) {
    logger.error('Error deleting user preference:', error);
    throw error;
  }
});
