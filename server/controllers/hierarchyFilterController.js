import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Get unique Overall Managers (SDEN values)
 * GET /api/hierarchy-filters/sden
 */
export const getOverallManagers = asyncHandler(async (req, res) => {
  try {
    const pool = await getPool();
    const user = req.user;
    const { dashboard_id } = req.query;

    // Get the dashboard's client_id to filter devices
    let dashboardClientId = user.client_id.toString();

    if (dashboard_id) {
      const dashboardQuery = `
        SELECT client_id FROM dashboard
        WHERE id = @dashboardId AND is_active = 1
      `;
      const dashboardResult = await pool.request()
        .input('dashboardId', sql.Int, dashboard_id)
        .query(dashboardQuery);

      if (dashboardResult.recordset.length > 0) {
        dashboardClientId = dashboardResult.recordset[0].client_id;
      }
    }

    // Only show hierarchy data for devices that belong to the dashboard's client
    const query = `
      SELECT DISTINCT h.sden
      FROM cloud_dashboard_hkmi h
      INNER JOIN device d ON h.device_id = d.device_id
      WHERE h.sden IS NOT NULL AND h.sden != ''
      AND d.client_id = @dashboardClientId
      ORDER BY h.sden
    `;

    const result = await pool.request()
      .input('dashboardClientId', sql.NVarChar, dashboardClientId)
      .query(query);

    // Create audit log
    await createAuditLog(user.id, 'HIERARCHY_FILTER_VIEW', 'Retrieved Overall Managers (SDEN)', 'hierarchy_filter', null, {
      filter_type: 'sden',
      count: result.recordset.length,
      dashboard_id: dashboard_id || null
    });

    res.json({
      success: true,
      message: 'Overall Managers retrieved successfully',
      data: result.recordset.map(row => row.sden)
    });

  } catch (error) {
    logger.error('Error fetching Overall Managers:', error);
    throw error;
  }
});

/**
 * Get unique Level 2 Managers (DEN values)
 * GET /api/hierarchy-filters/den?sden=value
 */
export const getLevel2Managers = asyncHandler(async (req, res) => {
  const { sden } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    let query = `
      SELECT DISTINCT h.den
      FROM cloud_dashboard_hkmi h
      INNER JOIN device d ON h.device_id = d.device_id
      WHERE h.den IS NOT NULL AND h.den != ''
      AND d.client_id = @userClientId
    `;

    const request = pool.request();
    request.input('userClientId', sql.NVarChar, user.client_id.toString());

    if (sden) {
      query += ` AND h.sden = @sden`;
      request.input('sden', sql.NVarChar, sden);
    }

    query += ` ORDER BY h.den`;

    const result = await request.query(query);

    // Create audit log
    await createAuditLog(user.id, 'HIERARCHY_FILTER_VIEW', 'Retrieved Level 2 Managers (DEN)', 'hierarchy_filter', null, {
      filter_type: 'den',
      parent_filter: sden || null,
      count: result.recordset.length
    });

    res.json({
      success: true,
      message: 'Level 2 Managers retrieved successfully',
      data: result.recordset.map(row => row.den),
      filters_applied: sden ? { sden } : {}
    });

  } catch (error) {
    logger.error('Error fetching Level 2 Managers:', error);
    throw error;
  }
});

/**
 * Get unique Level 3 Managers (AEN values)
 * GET /api/hierarchy-filters/aen?sden=value&den=value
 */
export const getLevel3Managers = asyncHandler(async (req, res) => {
  const { sden, den } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    let query = `
      SELECT DISTINCT h.aen
      FROM cloud_dashboard_hkmi h
      INNER JOIN device d ON h.device_id = d.device_id
      WHERE h.aen IS NOT NULL AND h.aen != ''
      AND d.client_id = @userClientId
    `;

    const request = pool.request();
    request.input('userClientId', sql.NVarChar, user.client_id.toString());

    if (sden) {
      query += ` AND h.sden = @sden`;
      request.input('sden', sql.NVarChar, sden);
    }

    if (den) {
      query += ` AND h.den = @den`;
      request.input('den', sql.NVarChar, den);
    }

    query += ` ORDER BY h.aen`;

    const result = await request.query(query);

    // Create audit log
    await createAuditLog(user.id, 'HIERARCHY_FILTER_VIEW', 'Retrieved Level 3 Managers (AEN)', 'hierarchy_filter', null, {
      filter_type: 'aen',
      parent_filters: { sden: sden || null, den: den || null },
      count: result.recordset.length
    });

    res.json({
      success: true,
      message: 'Level 3 Managers retrieved successfully',
      data: result.recordset.map(row => row.aen),
      filters_applied: { sden: sden || null, den: den || null }
    });

  } catch (error) {
    logger.error('Error fetching Level 3 Managers:', error);
    throw error;
  }
});

/**
 * Get unique Level 4 Managers (SSE values)
 * GET /api/hierarchy-filters/sse?sden=value&den=value&aen=value
 */
export const getLevel4Managers = asyncHandler(async (req, res) => {
  const { sden, den, aen } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    let query = `
      SELECT DISTINCT h.sse
      FROM cloud_dashboard_hkmi h
      INNER JOIN device d ON h.device_id = d.device_id
      WHERE h.sse IS NOT NULL AND h.sse != ''
      AND d.client_id = @userClientId
    `;

    const request = pool.request();
    request.input('userClientId', sql.NVarChar, user.client_id.toString());

    if (sden) {
      query += ` AND h.sden = @sden`;
      request.input('sden', sql.NVarChar, sden);
    }

    if (den) {
      query += ` AND h.den = @den`;
      request.input('den', sql.NVarChar, den);
    }

    if (aen) {
      query += ` AND h.aen = @aen`;
      request.input('aen', sql.NVarChar, aen);
    }

    query += ` ORDER BY h.sse`;

    const result = await request.query(query);

    // Create audit log
    await createAuditLog(user.id, 'HIERARCHY_FILTER_VIEW', 'Retrieved Level 4 Managers (SSE)', 'hierarchy_filter', null, {
      filter_type: 'sse',
      parent_filters: { sden: sden || null, den: den || null, aen: aen || null },
      count: result.recordset.length
    });

    res.json({
      success: true,
      message: 'Level 4 Managers retrieved successfully',
      data: result.recordset.map(row => row.sse),
      filters_applied: { sden: sden || null, den: den || null, aen: aen || null }
    });

  } catch (error) {
    logger.error('Error fetching Level 4 Managers:', error);
    throw error;
  }
});

/**
 * Get filtered device IDs based on hierarchy filters
 * GET /api/hierarchy-filters/devices?sden=value&den=value&aen=value&sse=value&machineId=value&dashboard_id=value
 * If no filters provided, returns all devices for the dashboard
 */
export const getFilteredDevices = asyncHandler(async (req, res) => {
  const { sden, den, aen, sse, machineId, dashboard_id } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get the dashboard's client_id to filter devices
    let dashboardClientId = user.client_id.toString();

    if (dashboard_id) {
      const dashboardQuery = `
        SELECT client_id FROM dashboard
        WHERE id = @dashboardId AND is_active = 1
      `;
      const dashboardResult = await pool.request()
        .input('dashboardId', sql.Int, dashboard_id)
        .query(dashboardQuery);

      if (dashboardResult.recordset.length > 0) {
        dashboardClientId = dashboardResult.recordset[0].client_id;
      }
    }

    let query = `
      SELECT DISTINCT h.device_id, h.machine_id
      FROM cloud_dashboard_hkmi h
      INNER JOIN device d ON h.device_id = d.device_id
      WHERE d.client_id = @clientId
    `;

    const request = pool.request();
    request.input('clientId', sql.NVarChar, dashboardClientId);
    const appliedFilters = {};

    if (sden) {
      query += ` AND h.sden = @sden`;
      request.input('sden', sql.NVarChar, sden);
      appliedFilters.sden = sden;
    }

    if (den) {
      query += ` AND h.den = @den`;
      request.input('den', sql.NVarChar, den);
      appliedFilters.den = den;
    }

    if (aen) {
      query += ` AND h.aen = @aen`;
      request.input('aen', sql.NVarChar, aen);
      appliedFilters.aen = aen;
    }

    if (sse) {
      query += ` AND h.sse = @sse`;
      request.input('sse', sql.NVarChar, sse);
      appliedFilters.sse = sse;
    }

    if (machineId) {
      query += ` AND h.machine_id LIKE @machineId`;
      request.input('machineId', sql.NVarChar, `%${machineId}%`);
      appliedFilters.machineId = machineId;
    }

    query += ` ORDER BY h.device_id`;

    const result = await request.query(query);

    // Create audit log
    await createAuditLog(user.id, 'HIERARCHY_FILTER_APPLY', 'Applied hierarchy filters to get devices', 'hierarchy_filter', null, {
      filters_applied: appliedFilters,
      device_count: result.recordset.length
    });

    res.json({
      success: true,
      message: 'Filtered devices retrieved successfully',
      data: {
        device_ids: result.recordset.map(row => row.device_id),
        devices: result.recordset,
        total_devices: result.recordset.length,
        filters_applied: appliedFilters
      }
    });

  } catch (error) {
    logger.error('Error fetching filtered devices:', error);
    throw error;
  }
});

/**
 * Apply combined filters and get device IDs
 * POST /api/hierarchy-filters/apply
 */
export const applyHierarchyFilters = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { sden, den, aen, sse, machineId, dashboard_id } = req.body;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get the dashboard's client_id to filter devices
    let dashboardClientId = user.client_id.toString();

    if (dashboard_id) {
      const dashboardQuery = `
        SELECT client_id FROM dashboard
        WHERE id = @dashboardId AND is_active = 1
      `;
      const dashboardResult = await pool.request()
        .input('dashboardId', sql.Int, dashboard_id)
        .query(dashboardQuery);

      if (dashboardResult.recordset.length > 0) {
        dashboardClientId = dashboardResult.recordset[0].client_id;
      }
    }

    let query = `
      SELECT
        h.device_id,
        h.machine_id,
        h.sden,
        h.den,
        h.aen,
        h.sse
      FROM cloud_dashboard_hkmi h
      INNER JOIN device d ON h.device_id = d.device_id
      WHERE d.client_id = @dashboardClientId
    `;

    const request = pool.request();
    request.input('dashboardClientId', sql.NVarChar, dashboardClientId);
    const appliedFilters = {};

    if (sden) {
      query += ` AND h.sden = @sden`;
      request.input('sden', sql.NVarChar, sden);
      appliedFilters.sden = sden;
    }

    if (den) {
      query += ` AND h.den = @den`;
      request.input('den', sql.NVarChar, den);
      appliedFilters.den = den;
    }

    if (aen) {
      query += ` AND h.aen = @aen`;
      request.input('aen', sql.NVarChar, aen);
      appliedFilters.aen = aen;
    }

    if (sse) {
      query += ` AND h.sse = @sse`;
      request.input('sse', sql.NVarChar, sse);
      appliedFilters.sse = sse;
    }

    if (machineId) {
      query += ` AND h.machine_id LIKE @machineId`;
      request.input('machineId', sql.NVarChar, `%${machineId}%`);
      appliedFilters.machineId = machineId;
    }

    query += ` ORDER BY h.device_id`;

    const result = await request.query(query);

    // Create audit log
    await createAuditLog(user.id, 'HIERARCHY_FILTER_APPLY', 'Applied hierarchy filters via POST', 'hierarchy_filter', null, {
      filters_applied: appliedFilters,
      device_count: result.recordset.length
    });

    res.json({
      success: true,
      message: 'Hierarchy filters applied successfully',
      data: {
        device_ids: result.recordset.map(row => row.device_id),
        devices: result.recordset,
        total_devices: result.recordset.length,
        filters_applied: appliedFilters
      }
    });

  } catch (error) {
    logger.error('Error applying hierarchy filters:', error);
    throw error;
  }
});

/**
 * Get machine ID suggestions for autocomplete
 * GET /api/hierarchy-filters/machine-suggestions?q=search_term&sden=value&den=value&aen=value&sse=value
 */
export const getMachineSuggestions = asyncHandler(async (req, res) => {
  const { q, sden, den, aen, sse } = req.query;
  const user = req.user;

  if (!q || q.length < 2) {
    return res.json({
      success: true,
      message: 'Machine suggestions retrieved successfully',
      data: []
    });
  }

  try {
    const pool = await getPool();

    let query = `
      SELECT DISTINCT TOP 10 machine_id
      FROM cloud_dashboard_hkmi
      WHERE machine_id LIKE @searchTerm
    `;

    const request = pool.request();
    request.input('searchTerm', sql.NVarChar, `%${q}%`);

    if (sden) {
      query += ` AND sden = @sden`;
      request.input('sden', sql.NVarChar, sden);
    }

    if (den) {
      query += ` AND den = @den`;
      request.input('den', sql.NVarChar, den);
    }

    if (aen) {
      query += ` AND aen = @aen`;
      request.input('aen', sql.NVarChar, aen);
    }

    if (sse) {
      query += ` AND sse = @sse`;
      request.input('sse', sql.NVarChar, sse);
    }

    query += ` ORDER BY machine_id`;

    const result = await request.query(query);

    res.json({
      success: true,
      message: 'Machine suggestions retrieved successfully',
      data: result.recordset.map(row => row.machine_id)
    });

  } catch (error) {
    logger.error('Error fetching machine suggestions:', error);
    throw error;
  }
});