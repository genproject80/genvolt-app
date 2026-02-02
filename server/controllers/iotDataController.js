import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';
import { Client } from '../models/Client.js';

/**
 * Get IoT data with device ID filtering
 * GET /api/iot-data/sick
 */
export const getIoTData = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const {
    device_ids,
    page = 1,
    limit = 20,
    search,
    sort_field = 'Timestamp',
    sort_order = 'DESC',
    sden,
    den,
    aen,
    sse,
    gsm_filter,
    avg_gsm
  } = req.query;

  const user = req.user;

  try {
    const pool = await getPool();

    // STEP 1: Get all client IDs (self + children only)
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    console.log('=== CLIENT HIERARCHY ===');
    console.log('User client_id:', user.client_id);
    console.log('Descendant clients (children):', descendantClients.map(c => c.client_id));
    console.log('All client IDs (self + children):', allClientIds);
    console.log('========================');

    // STEP 2: Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id, client_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    console.log('=== DEVICES ===');
    console.log('Total devices found:', allDeviceIds.length);
    console.log('Device breakdown by client:', deviceResult.recordset.reduce((acc, d) => {
      acc[d.client_id] = (acc[d.client_id] || 0) + 1;
      return acc;
    }, {}));
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
          hasPrevious: false,
          filtered_device_count: 0,
          filters_applied: {
            device_ids: false,
            search: false,
            sort: `Timestamp DESC`
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
    const pageSize = Math.min(parseInt(limit), 100); // Max 100 records per page
    const currentPage = parseInt(page);
    const offset = (currentPage - 1) * pageSize;

    // Build filter conditions
    const request = pool.request();

    // STEP 3: Build device filter - use allDeviceIds OR filter by specific devices if requested
    let finalDeviceIds = allDeviceIds;

    // If frontend requests specific devices, filter further
    if (deviceIds.length > 0) {
      // Only include devices that exist in our client's device list
      finalDeviceIds = allDeviceIds.filter(id => deviceIds.includes(id));
    }

    // If after filtering no devices remain, return empty
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
            sort: `Timestamp DESC`
          }
        }
      });
    }

    // Build SQL IN clause with device IDs
    const devicePlaceholders = finalDeviceIds.map((_, index) => `@deviceId${index}`).join(',');
    finalDeviceIds.forEach((deviceId, index) => {
      request.input(`deviceId${index}`, sql.VarChar, deviceId);
    });

    console.log('=== FINAL DEVICE FILTER ===');
    console.log('Final device IDs count:', finalDeviceIds.length);
    console.log('============================');

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

    // Build WHERE conditions for outer query
    let outerWhereConditions = [];

    // Apply search filtering if provided
    if (search) {
      outerWhereConditions.push(`(
        iot.Device_ID LIKE @search OR
        iot.MessageType LIKE @search OR
        iot.FaultDescriptions LIKE @search
      )`);
      request.input('search', sql.VarChar, `%${search}%`);
    }

    // Apply GSM signal strength filter if provided
    // Filter shows records with GSM_Signal_Strength BELOW the average (e.g., if avg is 2.71, show records < 2.71)
    if (gsm_filter === 'below_average' && avg_gsm) {
      // Parse only the numeric value (e.g., "2.71" from "2.71/5" display format)
      const avgGsmValue = parseFloat(avg_gsm);
      outerWhereConditions.push('iot.GSM_Signal_Strength < @avgGsm');
      request.input('avgGsm', sql.Float, avgGsmValue);
    }

    const outerWhereClause = outerWhereConditions.length > 0
      ? 'AND ' + outerWhereConditions.join(' AND ')
      : '';

    // Validate sort fields
    const allowedSortFields = [
      'Entry_ID', 'CreatedAt', 'Device_ID', 'MessageType', 'Timestamp',
      'GSM_Signal_Strength', 'Motor_ON_Time_sec', 'Motor_OFF_Time_sec',
      'Latitude', 'Longitude', 'Train_Passed'
    ];

    const sortField = allowedSortFields.includes(sort_field) ? sort_field : 'Timestamp';
    const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // STEP 4: Count query - simple now that we have device IDs
    const countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT iot.Device_ID
        FROM iot_data_sick iot
        INNER JOIN (
          SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
          FROM iot_data_sick
          WHERE Device_ID IN (${devicePlaceholders})
          GROUP BY Device_ID
        ) latest ON iot.Device_ID = latest.Device_ID AND iot.CreatedAt = latest.MaxCreatedAt
        LEFT JOIN (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
          FROM cloud_dashboard_hkmi
        ) hkmi ON iot.Device_ID = hkmi.device_id AND hkmi.rn = 1
        WHERE 1=1
        ${outerWhereClause}
        ${hkmiWhereClause}
      ) as filtered_data
    `;

    // Log the count query for debugging
    console.log('=== COUNT QUERY ===');
    console.log(countQuery);
    console.log('==================');

    const countResult = await request.query(countQuery);
    const totalCount = countResult.recordset[0].total;

    // STEP 5: Main data query - simple, just using device IDs
    const dataQuery = `
      SELECT
        iot.Entry_ID,
        iot.CreatedAt,
        iot.Device_ID,
        iot.MessageType,
        iot.HexField,
        iot.GSM_Signal_Strength,
        iot.Motor_ON_Time_sec,
        iot.Motor_OFF_Time_sec,
        iot.Number_of_Wheels_Configured,
        iot.Latitude,
        iot.Longitude,
        iot.Number_of_Wheels_Detected,
        iot.Fault_Code,
        iot.Motor_Current_mA,
        iot.Timestamp,
        iot.InsertedAt,
        iot.Train_Passed,
        iot.FaultDescriptions,
        iot.Debug_Value,
        iot.Motor_OFF_Time_min,
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
        hkmi.last_service_date
      FROM iot_data_sick iot
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM iot_data_sick
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON iot.Device_ID = latest.Device_ID AND iot.CreatedAt = latest.MaxCreatedAt
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON iot.Device_ID = hkmi.device_id AND hkmi.rn = 1
      WHERE 1=1
      ${outerWhereClause}
      ${hkmiWhereClause}
      ORDER BY iot.${sortField} ${sortOrder}
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `;

    request.input('offset', sql.Int, offset);
    request.input('pageSize', sql.Int, pageSize);

    // Log the main data query for debugging
    console.log('=== DATA QUERY ===');
    console.log(dataQuery);
    console.log('=== SORT ===');
    console.log('sortField:', sortField);
    console.log('sortOrder:', sortOrder);
    console.log('offset:', offset);
    console.log('pageSize:', pageSize);
    console.log('==================');

    const dataResult = await request.query(dataQuery);

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'IOT_DATA_VIEW',
      message: 'Retrieved IoT data',
      target_type: 'IOT_DATA',
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
      message: 'IoT data retrieved successfully',
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
    logger.error('Error fetching IoT data:', error);
    throw error;
  }
});

/**
 * Export filtered IoT data
 * GET /api/iot-data/sick/export
 */
export const exportIoTData = asyncHandler(async (req, res) => {
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
    sse
  } = req.query;

  const user = req.user;

  try {
    const pool = await getPool();

    // STEP 1: Get all client IDs (self + children only) - same as getIoTData
    const descendantClients = await Client.getDescendantClients(user.client_id);
    const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

    // STEP 2: Get all device IDs belonging to these clients
    const deviceQuery = `
      SELECT device_id
      FROM device
      WHERE client_id IN (${allClientIds.join(',')})
    `;
    const deviceResult = await pool.request().query(deviceQuery);
    const allDeviceIds = deviceResult.recordset.map(d => d.device_id);

    // If no devices found, return early
    if (allDeviceIds.length === 0) {
      return res.json({
        success: true,
        message: 'No devices found for this client',
        data: [],
        meta: {
          exported_count: 0,
          format: format,
          filters_applied: {
            device_ids: [],
            search: null
          },
          export_timestamp: new Date().toISOString()
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
          exported_count: 0,
          format: format,
          filters_applied: {
            device_ids: deviceIds,
            search: search || null
          },
          export_timestamp: new Date().toISOString()
        }
      });
    }

    // Limit export to prevent server overload
    const maxExportLimit = Math.min(parseInt(limit), 10000);

    // Build filter conditions
    const request = pool.request();

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

    // Build WHERE conditions for outer query
    let outerWhereConditions = [];

    if (search) {
      outerWhereConditions.push(`(
        iot.Device_ID LIKE @search OR
        iot.MessageType LIKE @search OR
        iot.FaultDescriptions LIKE @search
      )`);
      request.input('search', sql.VarChar, `%${search}%`);
    }

    const outerWhereClause = outerWhereConditions.length > 0
      ? 'AND ' + outerWhereConditions.join(' AND ')
      : '';

    const exportQuery = `
      SELECT TOP ${maxExportLimit}
        iot.Entry_ID,
        iot.CreatedAt,
        iot.Device_ID,
        iot.MessageType,
        iot.HexField,
        iot.GSM_Signal_Strength,
        iot.Motor_ON_Time_sec,
        iot.Motor_OFF_Time_sec,
        iot.Number_of_Wheels_Configured,
        iot.Latitude,
        iot.Longitude,
        iot.Number_of_Wheels_Detected,
        iot.Fault_Code,
        iot.Motor_Current_mA,
        iot.Timestamp,
        iot.InsertedAt,
        iot.Train_Passed,
        iot.FaultDescriptions,
        iot.Debug_Value,
        iot.Motor_OFF_Time_min,
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
        hkmi.last_service_date
      FROM iot_data_sick iot
      INNER JOIN (
        SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
        FROM iot_data_sick
        WHERE Device_ID IN (${devicePlaceholders})
        GROUP BY Device_ID
      ) latest ON iot.Device_ID = latest.Device_ID AND iot.CreatedAt = latest.MaxCreatedAt
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON iot.Device_ID = hkmi.device_id AND hkmi.rn = 1
      WHERE 1=1
      ${outerWhereClause}
      ${hkmiWhereClause}
      ORDER BY iot.CreatedAt DESC
    `;

    const result = await request.query(exportQuery);

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'IOT_DATA_EXPORT',
      message: 'Exported IoT data',
      target_type: 'IOT_DATA',
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
      // Convert to CSV format
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
      res.setHeader('Content-Disposition', `attachment; filename="iot_data_export_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      // Return JSON format
      res.json({
        success: true,
        message: 'IoT data exported successfully',
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
    logger.error('Error exporting IoT data:', error);
    throw error;
  }
});

/**
 * Get aggregated statistics for filtered devices
 * GET /api/iot-data/sick/stats
 */
export const getIoTDataStats = asyncHandler(async (req, res) => {
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
        AVG(CAST(GSM_Signal_Strength as FLOAT)) as avg_signal_strength,
        AVG(CAST(Motor_ON_Time_sec as FLOAT)) as avg_motor_on_time,
        AVG(CAST(Motor_OFF_Time_sec as FLOAT)) as avg_motor_off_time,
        SUM(CASE WHEN Train_Passed = 1 THEN 1 ELSE 0 END) as trains_passed_count,
        SUM(CASE WHEN Fault_Code = 1 THEN 1 ELSE 0 END) as fault_records_count,
        MIN(Timestamp) as earliest_record,
        MAX(Timestamp) as latest_record
      FROM iot_data_sick
      ${whereClause}
    `;

    const statsResult = await request.query(statsQuery);
    const stats = statsResult.recordset[0];

    // Get device-wise statistics
    const deviceStatsQuery = `
      SELECT
        Device_ID,
        COUNT(*) as record_count,
        AVG(CAST(GSM_Signal_Strength as FLOAT)) as avg_signal_strength,
        SUM(CASE WHEN Train_Passed = 1 THEN 1 ELSE 0 END) as trains_passed,
        SUM(CASE WHEN Fault_Code = 1 THEN 1 ELSE 0 END) as faults,
        MIN(Timestamp) as first_record,
        MAX(Timestamp) as last_record
      FROM iot_data_sick
      ${whereClause}
      GROUP BY Device_ID
      ORDER BY record_count DESC
    `;

    const deviceStatsResult = await request.query(deviceStatsQuery);

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'IOT_DATA_STATS',
      message: 'Retrieved IoT data statistics',
      target_type: 'IOT_DATA',
      target_id: null,
      details: JSON.stringify({
        device_ids_filter: deviceIds,
        total_records: stats.total_records,
        unique_devices: stats.unique_devices
      })
    });

    res.json({
      success: true,
      message: 'IoT data statistics retrieved successfully',
      data: {
        overall_stats: {
          total_records: stats.total_records,
          unique_devices: stats.unique_devices,
          avg_signal_strength: Math.round((stats.avg_signal_strength || 0) * 100) / 100,
          avg_motor_on_time: Math.round((stats.avg_motor_on_time || 0) * 100) / 100,
          avg_motor_off_time: Math.round((stats.avg_motor_off_time || 0) * 100) / 100,
          trains_passed_count: stats.trains_passed_count,
          fault_records_count: stats.fault_records_count,
          earliest_record: stats.earliest_record,
          latest_record: stats.latest_record
        },
        device_stats: deviceStatsResult.recordset.map(device => ({
          device_id: device.Device_ID,
          record_count: device.record_count,
          avg_signal_strength: Math.round((device.avg_signal_strength || 0) * 100) / 100,
          trains_passed: device.trains_passed,
          faults: device.faults,
          first_record: device.first_record,
          last_record: device.last_record
        }))
      },
      meta: {
        filtered_device_count: deviceIds.length,
        stats_timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Error fetching IoT data statistics:', error);
    throw error;
  }
});