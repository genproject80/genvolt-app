import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';
import Client from '../models/Client.js';

/**
 * Get user-accessible dashboards
 * GET /api/dashboards
 */
export const getUserDashboards = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  try {
    const pool = await getPool();
    const user = req.user;

    // Validate user has client_id
    if (!user?.client_id) {
      throw new ValidationError('User does not have a valid client_id');
    }

    // STEP 1: Get all descendant clients (children, grandchildren, etc.)
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    console.log('=== DASHBOARD FETCHING - CLIENT HIERARCHY ===');
    console.log('User client_id:', user.client_id);
    console.log('Descendant clients:', descendantClients.map(c => ({ id: c.client_id, name: c.name, level: c.level })));
    console.log('All client IDs (self + all descendants):', allClientIds);
    console.log('=============================================');

    // STEP 2: Get dashboards for all these clients
    const query = `
      SELECT DISTINCT
        d.id,
        d.name,
        d.display_name,
        d.description,
        d.client_id,
        d.is_active,
        d.created_at,
        c.name as client_name
      FROM dashboard d
      LEFT JOIN client c ON d.client_id = c.client_id
      WHERE d.is_active = 1
      AND d.client_id IN (${allClientIds.join(',')})
      ORDER BY d.display_name
    `;

    const result = await pool.request()
      .query(query);

    // Create audit log
    await createAuditLog(user.id, 'DASHBOARD_VIEW', 'Viewed dashboard list', 'dashboard', null, {
      client_id: user.client_id,
      descendant_count: descendantClients.length,
      total_clients_included: allClientIds.length,
      dashboards_count: result.recordset.length
    });

    console.log('Dashboards found:', result.recordset.length);
    console.log('Dashboard details:', result.recordset.map(d => ({ id: d.id, name: d.display_name, client_id: d.client_id, client_name: d.client_name })));

    res.json({
      success: true,
      message: 'Dashboards retrieved successfully',
      data: result.recordset,
      meta: {
        total: result.recordset.length,
        user_client_id: user.client_id,
        descendant_clients_count: descendantClients.length,
        total_clients_included: allClientIds.length
      }
    });

  } catch (error) {
    logger.error('Error fetching user dashboards:', error);
    throw error;
  }
});

/**
 * Get specific dashboard details
 * GET /api/dashboards/:id
 */
export const getDashboardById = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { id } = req.params;
  const user = req.user;

  try {
    const pool = await getPool();

    const query = `
      SELECT
        d.id,
        d.name,
        d.display_name,
        d.description,
        d.client_id,
        d.is_active,
        d.created_at,
        c.name as client_name
      FROM dashboard d
      LEFT JOIN client c ON d.client_id = c.client_id
      WHERE d.id = @dashboardId
      AND d.is_active = 1
      AND (
        d.client_id = @userClientId
        OR
        d.client_id IN (
          SELECT client_id FROM client
          WHERE parent_id = @userClientId
        )
      )
    `;

    const result = await pool.request()
      .input('dashboardId', sql.Int, id)
      .input('userClientId', sql.NVarChar, user.client_id.toString())
      .query(query);

    if (result.recordset.length === 0) {
      throw new NotFoundError('Dashboard not found or access denied');
    }

    const dashboard = result.recordset[0];

    // Create audit log
    await createAuditLog(user.id, 'DASHBOARD_VIEW', 'Viewed dashboard details', 'dashboard', id, {
      dashboard_name: dashboard.name,
      client_id: dashboard.client_id
    });

    res.json({
      success: true,
      message: 'Dashboard retrieved successfully',
      data: dashboard
    });

  } catch (error) {
    logger.error('Error fetching dashboard:', error);
    throw error;
  }
});

/**
 * Create a new dashboard (admin only)
 * POST /api/dashboards
 */
export const createDashboard = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { name, display_name, description, client_id } = req.body;
  const user = req.user;

  try {
    const pool = await getPool();

    const query = `
      INSERT INTO dashboard (name, display_name, description, client_id, created_by, created_at, is_active)
      OUTPUT INSERTED.*
      VALUES (@name, @display_name, @description, @client_id, @created_by, GETUTCDATE(), 1)
    `;

    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('display_name', sql.NVarChar, display_name)
      .input('description', sql.NVarChar, description)
      .input('client_id', sql.NVarChar, client_id)
      .input('created_by', sql.Int, user.id)
      .query(query);

    const newDashboard = result.recordset[0];

    // Create audit log
    await createAuditLog(user.id, 'DASHBOARD_CREATE', 'Created new dashboard', 'dashboard', newDashboard.id, {
      dashboard_name: name,
      client_id: client_id
    });

    res.status(201).json({
      success: true,
      message: 'Dashboard created successfully',
      data: newDashboard
    });

  } catch (error) {
    logger.error('Error creating dashboard:', error);
    throw error;
  }
});

/**
 * Update dashboard (admin only)
 * PUT /api/dashboards/:id
 */
export const updateDashboard = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { id } = req.params;
  const { name, display_name, description, client_id, is_active } = req.body;
  const user = req.user;

  try {
    const pool = await getPool();

    const query = `
      UPDATE dashboard
      SET
        name = @name,
        display_name = @display_name,
        description = @description,
        client_id = @client_id,
        is_active = @is_active
      OUTPUT INSERTED.*
      WHERE id = @id
    `;

    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .input('display_name', sql.NVarChar, display_name)
      .input('description', sql.NVarChar, description)
      .input('client_id', sql.NVarChar, client_id)
      .input('is_active', sql.Bit, is_active)
      .query(query);

    if (result.recordset.length === 0) {
      throw new NotFoundError('Dashboard not found');
    }

    const updatedDashboard = result.recordset[0];

    // Create audit log
    await createAuditLog(user.id, 'DASHBOARD_UPDATE', 'Updated dashboard', 'dashboard', id, {
      dashboard_name: name,
      client_id: client_id
    });

    res.json({
      success: true,
      message: 'Dashboard updated successfully',
      data: updatedDashboard
    });

  } catch (error) {
    logger.error('Error updating dashboard:', error);
    throw error;
  }
});

/**
 * Delete dashboard (admin only)
 * DELETE /api/dashboards/:id
 */
export const deleteDashboard = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { id } = req.params;
  const user = req.user;

  try {
    const pool = await getPool();

    // Soft delete by setting is_active to false
    const query = `
      UPDATE dashboard
      SET is_active = 0
      OUTPUT DELETED.name, DELETED.client_id
      WHERE id = @id AND is_active = 1
    `;

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(query);

    if (result.recordset.length === 0) {
      throw new NotFoundError('Dashboard not found or already deleted');
    }

    const deletedDashboard = result.recordset[0];

    // Create audit log
    await createAuditLog(user.id, 'DASHBOARD_DELETE', 'Deleted dashboard', 'dashboard', id, {
      dashboard_name: deletedDashboard.name,
      client_id: deletedDashboard.client_id
    });

    res.json({
      success: true,
      message: 'Dashboard deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting dashboard:', error);
    throw error;
  }
});