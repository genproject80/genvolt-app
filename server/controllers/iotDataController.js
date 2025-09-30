import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

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
    sort_order = 'DESC'
  } = req.query;

  const user = req.user;

  try {
    const pool = await getPool();

    // Parse device IDs from query parameter
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

    // Build the base query
    let whereClause = 'WHERE 1 = 1';
    const request = pool.request();

    // Apply device ID filtering if provided
    if (deviceIds.length > 0) {
      const placeholders = deviceIds.map((_, index) => `@deviceId${index}`).join(',');
      whereClause += ` AND Device_ID IN (${placeholders})`;

      deviceIds.forEach((deviceId, index) => {
        request.input(`deviceId${index}`, sql.VarChar, deviceId);
      });
    }

    // Apply search filtering if provided
    if (search) {
      whereClause += ` AND (
        Device_ID LIKE @search OR
        MessageType LIKE @search OR
        FaultDescriptions LIKE @search
      )`;
      request.input('search', sql.VarChar, `%${search}%`);
    }

    // Validate sort fields
    const allowedSortFields = [
      'Entry_ID', 'CreatedAt', 'Device_ID', 'MessageType', 'Timestamp',
      'GSM_Signal_Strength', 'Motor_ON_Time_sec', 'Motor_OFF_Time_sec',
      'Latitude', 'Longitude', 'Train_Passed'
    ];

    const sortField = allowedSortFields.includes(sort_field) ? sort_field : 'Timestamp';
    const sortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM iot_data_sick
      ${whereClause}
    `;

    const countResult = await request.query(countQuery);
    const totalCount = countResult.recordset[0].total;

    // Main data query
    const dataQuery = `
      SELECT
        Entry_ID,
        CreatedAt,
        Device_ID,
        MessageType,
        HexField,
        GSM_Signal_Strength,
        Motor_ON_Time_sec,
        Motor_OFF_Time_sec,
        Number_of_Wheels_Configured,
        Latitude,
        Longitude,
        Number_of_Wheels_Detected,
        Fault_Code,
        Motor_Current_mA,
        Timestamp,
        InsertedAt,
        Train_Passed,
        FaultDescriptions,
        Debug_Value,
        Motor_OFF_Time_min
      FROM iot_data_sick
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY
    `;

    request.input('offset', sql.Int, offset);
    request.input('pageSize', sql.Int, pageSize);

    const dataResult = await request.query(dataQuery);

    // Create audit log
    await createAuditLog(user.id, 'IOT_DATA_VIEW', 'Retrieved IoT data', 'iot_data', null, {
      device_ids_filter: deviceIds,
      search_term: search || null,
      page: currentPage,
      limit: pageSize,
      total_results: totalCount
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
    limit = 10000
  } = req.query;

  const user = req.user;

  try {
    const pool = await getPool();

    // Parse device IDs
    let deviceIds = [];
    if (device_ids) {
      try {
        deviceIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
      } catch (e) {
        deviceIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
      }
    }

    // Limit export to prevent server overload
    const maxExportLimit = Math.min(parseInt(limit), 10000);

    let whereClause = 'WHERE 1 = 1';
    const request = pool.request();

    if (deviceIds.length > 0) {
      const placeholders = deviceIds.map((_, index) => `@deviceId${index}`).join(',');
      whereClause += ` AND Device_ID IN (${placeholders})`;

      deviceIds.forEach((deviceId, index) => {
        request.input(`deviceId${index}`, sql.VarChar, deviceId);
      });
    }

    if (search) {
      whereClause += ` AND (
        Device_ID LIKE @search OR
        MessageType LIKE @search OR
        FaultDescriptions LIKE @search
      )`;
      request.input('search', sql.VarChar, `%${search}%`);
    }

    const exportQuery = `
      SELECT TOP ${maxExportLimit}
        Entry_ID,
        CreatedAt,
        Device_ID,
        MessageType,
        HexField,
        GSM_Signal_Strength,
        Motor_ON_Time_sec,
        Motor_OFF_Time_sec,
        Number_of_Wheels_Configured,
        Latitude,
        Longitude,
        Number_of_Wheels_Detected,
        Fault_Code,
        Motor_Current_mA,
        Timestamp,
        InsertedAt,
        Train_Passed,
        FaultDescriptions,
        Debug_Value,
        Motor_OFF_Time_min
      FROM iot_data_sick
      ${whereClause}
      ORDER BY Timestamp DESC
    `;

    const result = await request.query(exportQuery);

    // Create audit log
    await createAuditLog(user.id, 'IOT_DATA_EXPORT', 'Exported IoT data', 'iot_data', null, {
      device_ids_filter: deviceIds,
      search_term: search || null,
      format: format,
      exported_count: result.recordset.length,
      max_limit: maxExportLimit
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
    await createAuditLog(user.id, 'IOT_DATA_STATS', 'Retrieved IoT data statistics', 'iot_data', null, {
      device_ids_filter: deviceIds,
      total_records: stats.total_records,
      unique_devices: stats.unique_devices
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