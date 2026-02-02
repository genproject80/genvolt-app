import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';
import { Client } from '../models/Client.js';

/**
 * Get cloud_dashboard_hkmi table data with pagination
 * GET /api/hkmi-table
 */
export const getHKMITableData = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const {
    page = 1,
    limit = 20,
    search,
    sort_field = 'created_at',
    sort_order = 'DESC'
  } = req.query;

  const user = req.user;

  try {
    const pool = await getPool();

    // STEP 1: Get all client IDs (self + children only)
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    console.log('=== HKMI TABLE - CLIENT HIERARCHY ===');
    console.log('User client_id:', user.client_id);
    console.log('All client IDs (self + children):', allClientIds);
    console.log('=====================================');

    // STEP 2: Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    console.log('=== DEVICES ===');
    console.log('Total devices found:', allDeviceIds.length);
    console.log('================');

    // If no devices found, return early
    if (allDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No devices found for this client',
        data: [],
        meta: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0,
          hasNext: false,
          hasPrevious: false
        }
      });
    }

    // Calculate pagination
    const pageSize = Math.min(parseInt(limit), 100); // Max 100 records per page
    const currentPage = parseInt(page);
    const offset = (currentPage - 1) * pageSize;

    // Build filter conditions
    const request = pool.request();

    // Build SQL IN clause with device IDs
    const devicePlaceholders = allDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    allDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    // Build WHERE conditions
    let whereConditions = [`device_id IN (${devicePlaceholders})`];

    // Apply search filtering if provided
    if (search) {
      whereConditions.push(`(
        device_id LIKE @search OR
        machine_id LIKE @search OR
        sden LIKE @search OR
        den LIKE @search OR
        aen LIKE @search OR
        sse LIKE @search OR
        div_rly LIKE @search OR
        section LIKE @search
      )`);
      request.input('search', sql.VarChar, `%${search}%`);
    }

    const whereClause = 'WHERE ' + whereConditions.join(' AND ');

    // Validate sort fields
    const allowedSortFields = [
      'id', 'device_id', 'machine_id', 'sden', 'den', 'aen', 'sse',
      'div_rly', 'section', 'curve_number', 'line', 'grease_left',
      'last_service_date', 'created_at', 'updated_at'
    ];

    const sortField = allowedSortFields.includes(sort_field) ? sort_field : 'created_at';
    const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM cloud_dashboard_hkmi
      ${whereClause}
    `;

    const countResult = await request.query(countQuery);
    const totalCount = countResult.recordset[0].total;

    // Main data query
    const dataQuery = `
      SELECT
        id,
        device_id,
        machine_id,
        sden,
        den,
        aen,
        sse,
        div_rly,
        section,
        curve_number,
        line,
        grease_left,
        last_service_date,
        created_at,
        updated_at
      FROM cloud_dashboard_hkmi
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `;

    request.input('offset', sql.Int, offset);
    request.input('pageSize', sql.Int, pageSize);

    const dataResult = await request.query(dataQuery);

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'HKMI_TABLE_VIEW',
      message: 'Retrieved HKMI table data',
      target_type: 'HKMI_TABLE',
      target_id: null,
      details: JSON.stringify({
        search_term: search || null,
        page: currentPage,
        limit: pageSize,
        total_results: totalCount
      })
    });

    res.json({
      success: true,
      message: 'HKMI table data retrieved successfully',
      data: dataResult.recordset,
      meta: {
        total: totalCount,
        page: currentPage,
        limit: pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNext: offset + pageSize < totalCount,
        hasPrevious: currentPage > 1,
        filters_applied: {
          search: !!search,
          sort: `${sortField} ${sortOrder}`
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching HKMI table data:', error);
    throw error;
  }
});
