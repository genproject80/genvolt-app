import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';
import { Client } from '../models/Client.js';

/**
 * Get P3 IoT data with device ID filtering and HKMI hierarchy
 * GET /api/iot-data/p3
 *
 * Returns latest P3 data per device joined with cloud_dashboard_hkmi
 * with calculated Motor Runs (Event_Type=2) and Train Passed (Event_Type=2 OR 3)
 */
export const getP3Data = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const {
    device_ids,
    page = 1,
    limit = 20,
    search,
    sort_field = 'CreatedAt',
    sort_order = 'DESC',
    sden,
    den,
    aen,
    sse,
    event_date // Optional date filter for Motor Runs and Train Passed counts (format: YYYY-MM-DD)
  } = req.query;

  const user = req.user;

  try {
    const pool = await getPool();

    // STEP 1: Get all client IDs (self + children only)
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    console.log('=== P3 CLIENT HIERARCHY ===');
    console.log('User client_id:', user.client_id);
    console.log('All client IDs (self + children):', allClientIds);
    console.log('===========================');

    // STEP 2: Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id, client_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    console.log('=== P3 DEVICES ===');
    console.log('Total devices found:', allDeviceIds.length);
    console.log('==================');

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
          hasPrevious: false,
          filtered_device_count: 0,
          filters_applied: {
            device_ids: false,
            search: false,
            sort: `CreatedAt DESC`
          }
        }
      });
    }

    // Parse device IDs from query parameter (optional additional filtering)
    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    // Calculate pagination
    const pageSize = Math.min(parseInt(limit), 100);
    const currentPage = parseInt(page);
    const offset = (currentPage - 1) * pageSize;

    // Build filter conditions
    const request = pool.request();

    // STEP 3: Build device filter
    let finalDeviceIds = allDeviceIds;
    if (deviceIds.length > 0) {
      finalDeviceIds = allDeviceIds.filter(id => deviceIds.includes(id));
    }

    if (finalDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No matching devices found',
        data: [],
        meta: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
          filtered_device_count: 0,
          filters_applied: {
            device_ids: deviceIds.length > 0,
            search: false,
            sort: `CreatedAt DESC`
          }
        }
      });
    }

    // Build SQL IN clause with device IDs
    const devicePlaceholders = finalDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    finalDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    // Build HKMI WHERE clause based on hierarchy filters
    const hasHierarchyFilters = sden || den || aen || sse;
    let hkmiWhereConditions = [];

    if (hasHierarchyFilters) {
      if (sden) {
        hkmiWhereConditions.push('hkmi.sden = @sden');
        request.input('sden', sql.VarChar, sden);
      }
      if (den) {
        hkmiWhereConditions.push('hkmi.den = @den');
        request.input('den', sql.VarChar, den);
      }
      if (aen) {
        hkmiWhereConditions.push('hkmi.aen = @aen');
        request.input('aen', sql.VarChar, aen);
      }
      if (sse) {
        hkmiWhereConditions.push('hkmi.sse = @sse');
        request.input('sse', sql.VarChar, sse);
      }
    }

    const hkmiWhereClause = hkmiWhereConditions.length > 0
      ? 'AND ' + hkmiWhereConditions.join(' AND ')
      : '';

    // Build date filter for Motor Runs and Train Passed counts
    let eventDateFilter = '';
    if (event_date) {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(event_date)) {
        eventDateFilter = 'AND CAST(CreatedAt AS DATE) = @eventDate';
        request.input('eventDate', sql.Date, event_date);
      }
    }

    // Build WHERE conditions for outer query
    let outerWhereConditions = [];

    if (search) {
      outerWhereConditions.push(`(
        p3.Device_ID LIKE @search OR
        hkmi.machine_id LIKE @search OR
        hkmi.section LIKE @search
      )`);
      request.input('search', sql.VarChar, `%${search}%`);
    }

    const outerWhereClause = outerWhereConditions.length > 0
      ? 'AND ' + outerWhereConditions.join(' AND ')
      : '';

    // Validate sort fields for P3
    const allowedSortFields = [
      'Entry_ID', 'CreatedAt', 'Device_ID', 'Signal_Strength',
      'Event_Type', 'Latitude', 'Longitude', 'Battery_Voltage_mV',
      'machine_id', 'grease_left', 'last_cof_date', 'last_cof_value'
    ];

    const sortField = allowedSortFields.includes(sort_field) ? sort_field : 'CreatedAt';
    const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // STEP 4: Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT p3.Device_ID
        FROM IoT_Data_Sick_P3 p3
        INNER JOIN (
          SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
          FROM IoT_Data_Sick_P3
          WHERE Device_ID IN (${devicePlaceholders})
          GROUP BY Device_ID
        ) latest ON p3.Device_ID = latest.Device_ID AND p3.CreatedAt = latest.MaxCreatedAt
        LEFT JOIN (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
          FROM cloud_dashboard_hkmi
        ) hkmi ON p3.Device_ID = hkmi.device_id AND hkmi.rn = 1
        WHERE 1=1
        ${outerWhereClause}
        ${hkmiWhereClause}
      ) as filtered_data
    `;

    console.log('=== P3 COUNT QUERY ===');
    console.log(countQuery);
    console.log('======================');

    const countResult = await request.query(countQuery);
    const totalCount = countResult.recordset[0].total;

    // STEP 5: Main data query with calculated columns
    // Device Status: Active if data received within last 90 minutes, otherwise Inactive
    const dataQuery = `
      SELECT
        p3.Entry_ID,
        p3.CreatedAt,
        p3.Device_ID,
        p3.Event_Type,
        p3.Event_Type_Description,
        p3.Signal_Strength,
        p3.Motor_ON_Time_sec,
        p3.Motor_OFF_Time_min,
        p3.Wheel_Threshold,
        p3.Latitude,
        p3.Longitude,
        p3.Number_of_Wheels_Detected,
        p3.Motor_Current_Average_mA,
        p3.Motor_Current_Min_mA,
        p3.Motor_Current_Max_mA,
        p3.Train_Passed_Flag,
        p3.Motor_ON_Flag,
        p3.Battery_Voltage_mV,
        p3.Debug_Value,
        p3.Timestamp,
        p3.InsertedAt,
        p3.HexField,
        hkmi.machine_id,
        hkmi.sden,
        hkmi.den,
        hkmi.aen,
        hkmi.sse,
        hkmi.div_rly,
        hkmi.section,
        hkmi.curve_number,
        hkmi.line,
        hkmi.grease_left,
        hkmi.last_service_date,
        hkmi.last_cof_date,
        hkmi.last_cof_value,
        motor_runs.Motor_Runs,
        train_passed.Train_Passed_Count,
        CASE
          WHEN DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) <= 90 THEN 'Active'
          ELSE 'Inactive'
        END AS Device_Status,
        DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) AS Minutes_Since_Last_Data
      FROM IoT_Data_Sick_P3 p3
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON p3.Device_ID = latest.Device_ID AND p3.CreatedAt = latest.MaxCreatedAt
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON p3.Device_ID = hkmi.device_id AND hkmi.rn = 1
      LEFT JOIN (
        SELECT
          Device_ID,
          COUNT(*) as Motor_Runs
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
          AND Event_Type = 2
          ${eventDateFilter}
        GROUP BY Device_ID
      ) motor_runs ON p3.Device_ID = motor_runs.Device_ID
      LEFT JOIN (
        SELECT
          Device_ID,
          COUNT(*) as Train_Passed_Count
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
          AND (Event_Type = 2 OR Event_Type = 3)
          ${eventDateFilter}
        GROUP BY Device_ID
      ) train_passed ON p3.Device_ID = train_passed.Device_ID
      WHERE 1=1
      ${outerWhereClause}
      ${hkmiWhereClause}
      ORDER BY ${sortField.includes('.') ? sortField : (sortField === 'machine_id' || sortField === 'grease_left' ? `hkmi.${sortField}` : `p3.${sortField}`)} ${sortOrder}
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `;

    request.input('offset', sql.Int, offset);
    request.input('pageSize', sql.Int, pageSize);

    console.log('=== P3 DATA QUERY ===');
    console.log(dataQuery);
    console.log('=== SORT ===');
    console.log('sortField:', sortField);
    console.log('sortOrder:', sortOrder);
    console.log('=====================');

    const dataResult = await request.query(dataQuery);

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_DATA_VIEW',
      message: 'Retrieved P3 IoT data',
      target_type: 'IOT_DATA_P3',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        search_term: search || null,
        page: currentPage,
        limit: pageSize,
        total_results: totalCount
      })
    });

    res.json({
      success: true,
      message: 'P3 IoT data retrieved successfully',
      data: dataResult.recordset,
      meta: {
        total: totalCount,
        page: currentPage,
        limit: pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNext: offset + pageSize < totalCount,
        hasPrevious: currentPage > 1,
        filtered_device_count: deviceIds.length,
        filters_applied: {
          device_ids: deviceIds.length > 0,
          search: !!search,
          sort: `${sortField} ${sortOrder}`
        }
      }
    });

  } catch (error) {
    logger.error('Error fetching P3 IoT data:', error);
    throw error;
  }
});

/**
 * Export filtered P3 IoT data
 * GET /api/iot-data/p3/export
 */
export const exportP3Data = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const {
    device_ids,
    search,
    format = 'json',
    limit = 10000,
    sden,
    den,
    aen,
    sse,
    event_date // Optional date filter for Motor Runs and Train Passed counts (format: YYYY-MM-DD)
  } = req.query;

  const user = req.user;

  try {
    const pool = await getPool();

    // Get client hierarchy
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    // Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    if (allDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No devices found for this client',
        data: [],
        meta: {
          exported_count: 0,
          format: format,
          filters_applied: { device_ids: [], search: null },
          export_timestamp: new Date().toISOString()
        }
      });
    }

    // Parse device IDs from query parameter
    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    let finalDeviceIds = allDeviceIds;
    if (deviceIds.length > 0) {
      finalDeviceIds = allDeviceIds.filter(id => deviceIds.includes(id));
    }

    if (finalDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No matching devices found',
        data: [],
        meta: {
          exported_count: 0,
          format: format,
          filters_applied: { device_ids: deviceIds, search: search || null },
          export_timestamp: new Date().toISOString()
        }
      });
    }

    const maxExportLimit = Math.min(parseInt(limit), 10000);
    const request = pool.request();

    // Build SQL IN clause with device IDs
    const devicePlaceholders = finalDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    finalDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    // Build HKMI WHERE clause
    let hkmiWhereConditions = [];
    if (sden) {
      hkmiWhereConditions.push('hkmi.sden = @sden');
      request.input('sden', sql.VarChar, sden);
    }
    if (den) {
      hkmiWhereConditions.push('hkmi.den = @den');
      request.input('den', sql.VarChar, den);
    }
    if (aen) {
      hkmiWhereConditions.push('hkmi.aen = @aen');
      request.input('aen', sql.VarChar, aen);
    }
    if (sse) {
      hkmiWhereConditions.push('hkmi.sse = @sse');
      request.input('sse', sql.VarChar, sse);
    }

    const hkmiWhereClause = hkmiWhereConditions.length > 0
      ? 'AND ' + hkmiWhereConditions.join(' AND ')
      : '';

    // Build date filter for Motor Runs and Train Passed counts
    let eventDateFilter = '';
    if (event_date) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(event_date)) {
        eventDateFilter = 'AND CAST(CreatedAt AS DATE) = @eventDate';
        request.input('eventDate', sql.Date, event_date);
      }
    }

    // Build search WHERE clause
    let outerWhereConditions = [];
    if (search) {
      outerWhereConditions.push(`(
        p3.Device_ID LIKE @search OR
        hkmi.machine_id LIKE @search OR
        hkmi.section LIKE @search
      )`);
      request.input('search', sql.VarChar, `%${search}%`);
    }

    const outerWhereClause = outerWhereConditions.length > 0
      ? 'AND ' + outerWhereConditions.join(' AND ')
      : '';

    const exportQuery = `
      SELECT TOP ${maxExportLimit}
        p3.Entry_ID,
        p3.CreatedAt,
        p3.Device_ID,
        p3.Event_Type,
        p3.Event_Type_Description,
        p3.Signal_Strength,
        p3.Motor_ON_Time_sec,
        p3.Motor_OFF_Time_min,
        p3.Latitude,
        p3.Longitude,
        p3.Number_of_Wheels_Detected,
        p3.Motor_Current_Average_mA,
        p3.Motor_Current_Min_mA,
        p3.Motor_Current_Max_mA,
        p3.Train_Passed_Flag,
        p3.Motor_ON_Flag,
        p3.Battery_Voltage_mV,
        hkmi.machine_id,
        hkmi.sden,
        hkmi.den,
        hkmi.aen,
        hkmi.sse,
        hkmi.div_rly,
        hkmi.section,
        hkmi.curve_number,
        hkmi.line,
        hkmi.grease_left,
        hkmi.last_service_date,
        hkmi.last_cof_date,
        hkmi.last_cof_value,
        motor_runs.Motor_Runs,
        train_passed.Train_Passed_Count,
        CASE
          WHEN DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) <= 90 THEN 'Active'
          ELSE 'Inactive'
        END AS Device_Status,
        DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) AS Minutes_Since_Last_Data
      FROM IoT_Data_Sick_P3 p3
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON p3.Device_ID = latest.Device_ID AND p3.CreatedAt = latest.MaxCreatedAt
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON p3.Device_ID = hkmi.device_id AND hkmi.rn = 1
      LEFT JOIN (
        SELECT
          Device_ID,
          COUNT(*) as Motor_Runs
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
          AND Event_Type = 2
          ${eventDateFilter}
        GROUP BY Device_ID
      ) motor_runs ON p3.Device_ID = motor_runs.Device_ID
      LEFT JOIN (
        SELECT
          Device_ID,
          COUNT(*) as Train_Passed_Count
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
          AND (Event_Type = 2 OR Event_Type = 3)
          ${eventDateFilter}
        GROUP BY Device_ID
      ) train_passed ON p3.Device_ID = train_passed.Device_ID
      WHERE 1=1
      ${outerWhereClause}
      ${hkmiWhereClause}
      ORDER BY p3.CreatedAt DESC
    `;

    const result = await request.query(exportQuery);

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_DATA_EXPORT',
      message: 'Exported P3 IoT data',
      target_type: 'IOT_DATA_P3',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        search_term: search || null,
        format: format,
        exported_count: result.recordset.length,
        max_limit: maxExportLimit
      })
    });

    if (format === 'csv') {
      if (result.recordset.length === 0) {
        return res.json({
          success: true,
          message: 'No data to export',
          data: [],
          meta: { exported_count: 0 }
        });
      }

      const headers = Object.keys(result.recordset[0]);
      const csvHeader = headers.join(',');
      const csvRows = result.recordset.map(row =>
        headers.map(header => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return String(value);
        }).join(',')
      );

      const csvContent = [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="p3_data_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        message: 'P3 IoT data exported successfully',
        data: result.recordset,
        meta: {
          exported_count: result.recordset.length,
          format: format,
          filters_applied: {
            device_ids: deviceIds,
            search: search || null
          },
          export_timestamp: new Date().toISOString()
        }
      });
    }

  } catch (error) {
    logger.error('Error exporting P3 IoT data:', error);
    throw error;
  }
});

/**
 * Get P3 IoT data statistics
 * GET /api/iot-data/p3/stats
 */
/**
 * Get device status counts (Active vs Inactive)
 * GET /api/iot-data/p3/status-metrics
 */
export const getP3StatusMetrics = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { device_ids } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get client hierarchy
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    // Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    if (allDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No devices found for this client',
        data: {
          active_devices: 0,
          inactive_devices: 0,
          total_devices: 0
        }
      });
    }

    // Parse device IDs from query parameter
    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    let finalDeviceIds = allDeviceIds;
    if (deviceIds.length > 0) {
      finalDeviceIds = allDeviceIds.filter(id => deviceIds.includes(id));
    }

    if (finalDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No matching devices found',
        data: {
          active_devices: 0,
          inactive_devices: 0,
          total_devices: 0
        }
      });
    }

    const request = pool.request();

    // Build SQL IN clause with device IDs
    const devicePlaceholders = finalDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    finalDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    // Count active vs inactive devices
    // Active: Data received within last 90 minutes
    // Only count devices that exist in IoT_Data_Sick_P3 table
    const statusMetricsQuery = `
      SELECT
        COUNT(DISTINCT CASE
          WHEN DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) <= 90
          THEN p3.Device_ID
          ELSE NULL
        END) as active_devices,
        COUNT(DISTINCT CASE
          WHEN DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) > 90
          THEN p3.Device_ID
          ELSE NULL
        END) as inactive_devices,
        COUNT(DISTINCT p3.Device_ID) as total_devices
      FROM IoT_Data_Sick_P3 p3
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON p3.Device_ID = latest.Device_ID AND p3.CreatedAt = latest.MaxCreatedAt
    `;

    const metricsResult = await request.query(statusMetricsQuery);
    const metrics = metricsResult.recordset[0];

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_STATUS_METRICS',
      message: 'Retrieved P3 device status metrics',
      target_type: 'IOT_DATA_SICK_P3',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        active_devices: metrics.active_devices,
        inactive_devices: metrics.inactive_devices,
        total_devices: metrics.total_devices
      })
    });

    res.json({
      success: true,
      message: 'P3 device status metrics retrieved successfully',
      data: {
        active_devices: metrics.active_devices || 0,
        inactive_devices: metrics.inactive_devices || 0,
        total_devices: metrics.total_devices || 0
      }
    });

  } catch (error) {
    logger.error('Error fetching P3 device status metrics:', error);
    throw error;
  }
});

/**
 * Get count of curves with grease_left < 40 kg
 * GET /api/iot-data/p3/grease-metrics
 */
export const getP3GreaseMetrics = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { device_ids } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get client hierarchy
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    // Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    if (allDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No devices found for this client',
        data: {
          curves_low_grease: 0,
          total_curves: 0
        }
      });
    }

    // Parse device IDs from query parameter
    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    let finalDeviceIds = allDeviceIds;
    if (deviceIds.length > 0) {
      finalDeviceIds = allDeviceIds.filter(id => deviceIds.includes(id));
    }

    if (finalDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No matching devices found',
        data: {
          curves_low_grease: 0,
          total_curves: 0
        }
      });
    }

    const request = pool.request();

    // Build SQL IN clause with device IDs
    const devicePlaceholders = finalDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    finalDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    // Count curves where grease_left < 40 kg
    // Only count devices that exist in BOTH IoT_Data_Sick_P3 AND cloud_dashboard_hkmi tables
    const greaseMetricsQuery = `
      SELECT
        COUNT(DISTINCT CASE
          WHEN hkmi.grease_left IS NOT NULL
            AND hkmi.grease_left < 40
          THEN p3.Device_ID
          ELSE NULL
        END) as curves_low_grease,
        COUNT(DISTINCT p3.Device_ID) as total_curves
      FROM IoT_Data_Sick_P3 p3
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON p3.Device_ID = latest.Device_ID AND p3.CreatedAt = latest.MaxCreatedAt
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON p3.Device_ID = hkmi.device_id AND hkmi.rn = 1
    `;

    const metricsResult = await request.query(greaseMetricsQuery);
    const metrics = metricsResult.recordset[0];

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_GREASE_METRICS',
      message: 'Retrieved P3 grease metrics',
      target_type: 'CLOUD_DASHBOARD_HKMI',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        curves_low_grease: metrics.curves_low_grease,
        total_curves: metrics.total_curves
      })
    });

    res.json({
      success: true,
      message: 'P3 grease metrics retrieved successfully',
      data: {
        curves_low_grease: metrics.curves_low_grease || 0,
        total_curves: metrics.total_curves || 0
      }
    });

  } catch (error) {
    logger.error('Error fetching P3 grease metrics:', error);
    throw error;
  }
});

/**
 * Get count of curves with last_cof_date > 1 month old
 * GET /api/iot-data/p3/cof-date-metrics
 */
export const getP3CofDateMetrics = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { device_ids } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get client hierarchy
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    // Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    if (allDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No devices found for this client',
        data: {
          curves_old_cof_measurement: 0,
          total_curves: 0
        }
      });
    }

    // Parse device IDs from query parameter
    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    let finalDeviceIds = allDeviceIds;
    if (deviceIds.length > 0) {
      finalDeviceIds = allDeviceIds.filter(id => deviceIds.includes(id));
    }

    if (finalDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No matching devices found',
        data: {
          curves_old_cof_measurement: 0,
          total_curves: 0
        }
      });
    }

    const request = pool.request();

    // Build SQL IN clause with device IDs
    const devicePlaceholders = finalDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    finalDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    // Count curves where last_cof_date > 1 month old (30 days)
    // Only count devices that exist in BOTH IoT_Data_Sick_P3 AND cloud_dashboard_hkmi tables
    const cofDateMetricsQuery = `
      SELECT
        COUNT(DISTINCT CASE
          WHEN hkmi.last_cof_date IS NOT NULL
            AND DATEDIFF(DAY, hkmi.last_cof_date, GETUTCDATE()) > 30
          THEN p3.Device_ID
          ELSE NULL
        END) as curves_old_cof_measurement,
        COUNT(DISTINCT p3.Device_ID) as total_curves
      FROM IoT_Data_Sick_P3 p3
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON p3.Device_ID = latest.Device_ID AND p3.CreatedAt = latest.MaxCreatedAt
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON p3.Device_ID = hkmi.device_id AND hkmi.rn = 1
    `;

    const metricsResult = await request.query(cofDateMetricsQuery);
    const metrics = metricsResult.recordset[0];

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_COF_DATE_METRICS',
      message: 'Retrieved P3 CoF date metrics',
      target_type: 'CLOUD_DASHBOARD_HKMI',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        curves_old_cof_measurement: metrics.curves_old_cof_measurement,
        total_curves: metrics.total_curves
      })
    });

    res.json({
      success: true,
      message: 'P3 CoF date metrics retrieved successfully',
      data: {
        curves_old_cof_measurement: metrics.curves_old_cof_measurement || 0,
        total_curves: metrics.total_curves || 0
      }
    });

  } catch (error) {
    logger.error('Error fetching P3 CoF date metrics:', error);
    throw error;
  }
});

/**
 * Get count of curves with last_cof_value > 0.25
 * GET /api/iot-data/p3/cof-metrics
 */
export const getP3CofMetrics = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { device_ids } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get client hierarchy
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    // Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    if (allDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No devices found for this client',
        data: {
          curves_high_cof: 0,
          total_curves: 0
        }
      });
    }

    // Parse device IDs from query parameter
    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    let finalDeviceIds = allDeviceIds;
    if (deviceIds.length > 0) {
      finalDeviceIds = allDeviceIds.filter(id => deviceIds.includes(id));
    }

    if (finalDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No matching devices found',
        data: {
          curves_high_cof: 0,
          total_curves: 0
        }
      });
    }

    const request = pool.request();

    // Build SQL IN clause with device IDs
    const devicePlaceholders = finalDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    finalDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    // Count curves where last_cof_value > 0.25
    // Only count devices that exist in BOTH IoT_Data_Sick_P3 AND cloud_dashboard_hkmi tables
    const cofMetricsQuery = `
      SELECT
        COUNT(DISTINCT CASE
          WHEN hkmi.last_cof_value IS NOT NULL
            AND hkmi.last_cof_value > 0.25
          THEN p3.Device_ID
          ELSE NULL
        END) as curves_high_cof,
        COUNT(DISTINCT p3.Device_ID) as total_curves
      FROM IoT_Data_Sick_P3 p3
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON p3.Device_ID = latest.Device_ID AND p3.CreatedAt = latest.MaxCreatedAt
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON p3.Device_ID = hkmi.device_id AND hkmi.rn = 1
    `;

    const metricsResult = await request.query(cofMetricsQuery);
    const metrics = metricsResult.recordset[0];

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_COF_METRICS',
      message: 'Retrieved P3 CoF metrics',
      target_type: 'CLOUD_DASHBOARD_HKMI',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        curves_high_cof: metrics.curves_high_cof,
        total_curves: metrics.total_curves
      })
    });

    res.json({
      success: true,
      message: 'P3 CoF metrics retrieved successfully',
      data: {
        curves_high_cof: metrics.curves_high_cof || 0,
        total_curves: metrics.total_curves || 0
      }
    });

  } catch (error) {
    logger.error('Error fetching P3 CoF metrics:', error);
    throw error;
  }
});

/**
 * Get count of curves with last_service_date > 15 days
 * GET /api/iot-data/p3/service-metrics
 */
export const getP3ServiceMetrics = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { device_ids } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    // Get client hierarchy
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    // Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    if (allDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No devices found for this client',
        data: {
          curves_needing_service: 0,
          total_curves: 0
        }
      });
    }

    // Parse device IDs from query parameter
    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    let finalDeviceIds = allDeviceIds;
    if (deviceIds.length > 0) {
      finalDeviceIds = allDeviceIds.filter(id => deviceIds.includes(id));
    }

    if (finalDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No matching devices found',
        data: {
          curves_needing_service: 0,
          total_curves: 0
        }
      });
    }

    const request = pool.request();

    // Build SQL IN clause with device IDs
    const devicePlaceholders = finalDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    finalDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    // Count curves where last_service_date > 15 days old
    // Only count devices that exist in BOTH IoT_Data_Sick_P3 AND cloud_dashboard_hkmi tables
    const serviceMetricsQuery = `
      SELECT
        COUNT(DISTINCT CASE
          WHEN hkmi.last_service_date IS NOT NULL
            AND DATEDIFF(DAY, hkmi.last_service_date, GETUTCDATE()) > 15
          THEN p3.Device_ID
          ELSE NULL
        END) as curves_needing_service,
        COUNT(DISTINCT p3.Device_ID) as total_curves
      FROM IoT_Data_Sick_P3 p3
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM IoT_Data_Sick_P3
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON p3.Device_ID = latest.Device_ID AND p3.CreatedAt = latest.MaxCreatedAt
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON p3.Device_ID = hkmi.device_id AND hkmi.rn = 1
    `;

    const metricsResult = await request.query(serviceMetricsQuery);
    const metrics = metricsResult.recordset[0];

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_SERVICE_METRICS',
      message: 'Retrieved P3 service metrics',
      target_type: 'CLOUD_DASHBOARD_HKMI',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        curves_needing_service: metrics.curves_needing_service,
        total_curves: metrics.total_curves
      })
    });

    res.json({
      success: true,
      message: 'P3 service metrics retrieved successfully',
      data: {
        curves_needing_service: metrics.curves_needing_service || 0,
        total_curves: metrics.total_curves || 0
      }
    });

  } catch (error) {
    logger.error('Error fetching P3 service metrics:', error);
    throw error;
  }
});

export const getP3Stats = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const { device_ids } = req.query;
  const user = req.user;

  try {
    const pool = await getPool();

    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    let whereClause = 'WHERE 1 = 1';
    const request = pool.request();

    if (deviceIds.length > 0) {
      const placeholders = deviceIds.map((_, index) => `@deviceId${index}`).join(',');
      whereClause += ` AND Device_ID IN (${placeholders})`;

      deviceIds.forEach((deviceId, index) => {
        request.input(`deviceId${index}`, sql.VarChar, deviceId);
      });
    }

    const statsQuery = `
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT Device_ID) as unique_devices,
        AVG(CAST(Signal_Strength as FLOAT)) as avg_signal_strength,
        SUM(CASE WHEN Event_Type = 2 THEN 1 ELSE 0 END) as motor_runs_total,
        SUM(CASE WHEN Event_Type = 2 OR Event_Type = 3 THEN 1 ELSE 0 END) as trains_passed_total,
        SUM(CASE WHEN Event_Type = 4 THEN 1 ELSE 0 END) as low_battery_alerts,
        AVG(CAST(Battery_Voltage_mV as FLOAT)) as avg_battery_voltage,
        AVG(CAST(Motor_Current_Average_mA as FLOAT)) as avg_motor_current,
        MIN(CreatedAt) as earliest_record,
        MAX(CreatedAt) as latest_record
      FROM IoT_Data_Sick_P3
      ${whereClause}
    `;

    const statsResult = await request.query(statsQuery);
    const stats = statsResult.recordset[0];

    // Event type breakdown
    const eventBreakdownQuery = `
      SELECT
        Event_Type,
        Event_Type_Description,
        COUNT(*) as count
      FROM IoT_Data_Sick_P3
      ${whereClause}
      GROUP BY Event_Type, Event_Type_Description
      ORDER BY Event_Type
    `;

    const eventBreakdownResult = await request.query(eventBreakdownQuery);

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_DATA_STATS',
      message: 'Retrieved P3 IoT data statistics',
      target_type: 'IOT_DATA_P3',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        total_records: stats.total_records,
        unique_devices: stats.unique_devices
      })
    });

    res.json({
      success: true,
      message: 'P3 IoT data statistics retrieved successfully',
      data: {
        overall_stats: {
          total_records: stats.total_records,
          unique_devices: stats.unique_devices,
          avg_signal_strength: Math.round((stats.avg_signal_strength || 0) * 100) / 100,
          motor_runs_total: stats.motor_runs_total,
          trains_passed_total: stats.trains_passed_total,
          low_battery_alerts: stats.low_battery_alerts,
          avg_battery_voltage: Math.round((stats.avg_battery_voltage || 0)),
          avg_motor_current: Math.round((stats.avg_motor_current || 0)),
          earliest_record: stats.earliest_record,
          latest_record: stats.latest_record
        },
        event_breakdown: eventBreakdownResult.recordset.map(event => ({
          event_type: event.Event_Type,
          description: event.Event_Type_Description,
          count: event.count
        }))
      },
      meta: {
        filtered_device_count: deviceIds.length,
        stats_timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching P3 IoT data statistics:', error);
    throw error;
  }
});
