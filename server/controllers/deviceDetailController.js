import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Get detailed device information for specific IoT entry
 * GET /api/device-details/:entryId
 */
export const getDeviceDetails = asyncHandler(async (req, res) => {
  try {
    const { entryId } = req.params;
    const user = req.user;
    const pool = await getPool();

    // Debug: Log the entryId parameter
    logger.info(`Fetching device details for Entry_ID: ${entryId}`);

    // First, let's check if this Entry_ID exists at all
    const checkQuery = `SELECT COUNT(*) as count FROM [IoT_Data_Sick] WHERE [Entry_ID] = @entryId`;
    const checkResult = await pool.request()
      .input('entryId', sql.Int, entryId)
      .query(checkQuery);

    logger.info(`Entry_ID ${entryId} existence check: ${checkResult.recordset[0].count} records found`);

    // If no records found, let's check the first few Entry_IDs in the table to see what's available
    if (checkResult.recordset[0].count === 0) {
      const sampleQuery = `SELECT TOP 5 [Entry_ID], [Device_ID] FROM [IoT_Data_Sick] ORDER BY [Entry_ID]`;
      const sampleResult = await pool.request().query(sampleQuery);
      logger.info(`Sample Entry_IDs in database:`, sampleResult.recordset);
    }

    // Get specific IoT data entry with device information
    const deviceDetailQuery = `
      SELECT
        iot.Device_ID,
        iot.Entry_ID,
        iot.CreatedAt,
        iot.MessageType,
        iot.HexField,
        iot.GSM_Signal_Strength,
        iot.Motor_ON_Time_sec,
        iot.Motor_OFF_Time_sec,
        iot.Motor_OFF_Time_min,
        iot.Number_of_Wheels_Configured,
        iot.Number_of_Wheels_Detected,
        iot.Latitude,
        iot.Longitude,
        iot.Fault_Code,
        iot.Motor_Current_mA,
        iot.Timestamp,
        iot.InsertedAt,
        iot.Train_Passed,
        iot.FaultDescriptions,
        iot.Debug_Value,
        d.client_id,
        h.sden,
        h.den,
        h.aen,
        h.sse,
        h.machine_id
      FROM [IoT_Data_Sick] iot
      INNER JOIN device d ON iot.Device_ID = d.device_id
      LEFT JOIN cloud_dashboard_hkmi h ON iot.Device_ID = h.device_id
      WHERE iot.[Entry_ID] = @entryId
    `;

    const deviceResult = await pool.request()
      .input('entryId', sql.Int, entryId)
      .query(deviceDetailQuery);

    if (deviceResult.recordset.length === 0) {
      logger.warn(`No device data found for Entry_ID: ${entryId}`);
      return res.status(404).json({
        success: false,
        message: `Device data not found for Entry_ID: ${entryId}`
      });
    }

    const deviceData = deviceResult.recordset[0];


    // Parse fault codes and descriptions
    let faultCodes = [];
    let faultDescriptions = [];

    if (deviceData.Fault_Code) {
      faultCodes = [deviceData.Fault_Code];
    }

    if (deviceData.FaultDescriptions) {
      try {
        faultDescriptions = JSON.parse(deviceData.FaultDescriptions);
      } catch (e) {
        faultDescriptions = deviceData.FaultDescriptions.split(',').map(desc => desc.trim()).filter(desc => desc);
      }
    }

    // Calculate power status based on motor current
    let powerStatus = 'Inactive';
    if (deviceData.Motor_Current_mA > 0) {
      powerStatus = 'Active';
    }

    // Format response data
    const responseData = {
      // Add GPS coordinates at top level for easy access
      Device_ID: deviceData.Device_ID,
      Entry_ID: deviceData.Entry_ID,
      Latitude: deviceData.Latitude,
      Longitude: deviceData.Longitude,
      GSM_Signal_Strength: deviceData.GSM_Signal_Strength,
      Motor_Current_mA: deviceData.Motor_Current_mA,
      Fault_Code: deviceData.Fault_Code,
      Motor_ON_Time_sec: deviceData.Motor_ON_Time_sec,
      Motor_OFF_Time_sec: deviceData.Motor_OFF_Time_sec,
      Motor_OFF_Time_min: deviceData.Motor_OFF_Time_min,
      Number_of_Wheels_Configured: deviceData.Number_of_Wheels_Configured,
      Number_of_Wheels_Detected: deviceData.Number_of_Wheels_Detected,

      device_information: {
        device_id: deviceData.Device_ID,
        channel_id: 'N/A', // Not available in current schema
        client_id: deviceData.client_id,
        conversion_logic: 1, // Default value
        record_time: deviceData.Timestamp,
        device_name: 'N/A', // Not available in current schema
        device_type: 'IoT Device' // Default value
      },
      operational_status: {
        runtime: deviceData.Motor_ON_Time_sec ? Math.floor(deviceData.Motor_ON_Time_sec / 60) : 0, // Convert to minutes
        off_time_sec: deviceData.Motor_OFF_Time_sec || 0,
        off_time_min: deviceData.Motor_OFF_Time_min || 0,
        genset_signal: deviceData.Train_Passed ? 'On' : 'Off',
        thermostat: 'N/A', // Not available in current schema
        entry_id: deviceData.Entry_ID,
        power_status: powerStatus
      },
      electrical_parameters: {
        hv_output_voltage: 0, // Not available in current schema
        hv_output_current: deviceData.Motor_Current_mA || 0,
        hv_source_no: 0, // Not available in current schema
        power_status: powerStatus
      },
      fault_information: {
        active_fault_codes: faultCodes,
        fault_descriptions: faultDescriptions,
        leading_fault_code: faultCodes.length > 0 ? faultCodes[0] : null,
        system_status: {
          genset: deviceData.Train_Passed ? 'On' : 'Off',
          thermostat: 'N/A' // Not available in current schema
        }
      },
      technical_details: {
        api_key: deviceData.Device_ID, // Using device_id as API key placeholder
        entry_id: deviceData.Entry_ID,
        channel_id: 'N/A', // Not available in current schema
        raw_hex_data: deviceData.HexField
      },
      hierarchy_info: {
        sden: deviceData.sden,
        den: deviceData.den,
        aen: deviceData.aen,
        sse: deviceData.sse,
        machine_id: deviceData.machine_id
      }
    };


    // Create audit log
    await createAuditLog(user.id, 'DEVICE_DETAIL_VIEW', `Viewed device details for entry ${entryId} (device ${deviceData.Device_ID})`, 'device_detail', entryId, {
      entry_id: entryId,
      device_id: deviceData.Device_ID,
      access_method: 'device_details_api'
    });

    res.json({
      success: true,
      message: 'Device details retrieved successfully',
      data: responseData
    });

  } catch (error) {
    logger.error('Error fetching device details:', error);
    throw error;
  }
});

/**
 * Get historical IoT data for device related to specific entry
 * GET /api/device-details/:entryId/history
 */
export const getDeviceHistory = asyncHandler(async (req, res) => {
  try {
    const { entryId } = req.params;
    const {
      timeRange = '2h',
      status = 'all',
      search = '',
      page = 1,
      limit = 20,
      sortField = 'timestamp',
      sortOrder = 'DESC'
    } = req.query;

    const user = req.user;
    const pool = await getPool();

    // First, get the Device_ID from the Entry_ID
    logger.info(`Fetching Device_ID for Entry_ID: ${entryId}`);

    const entryQuery = `
      SELECT Device_ID FROM [IoT_Data_Sick] WHERE [Entry_ID] = @entryId
    `;

    const entryResult = await pool.request()
      .input('entryId', sql.Int, entryId)
      .query(entryQuery);

    if (entryResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Entry not found'
      });
    }

    const deviceId = entryResult.recordset[0].Device_ID;

    // Calculate time range filter
    let timeFilter = '';
    const now = new Date();
    switch (timeRange) {
      case '2h':
        timeFilter = `AND iot.Timestamp >= DATEADD(HOUR, -2, GETDATE())`;
        break;
      case '24h':
        timeFilter = `AND iot.Timestamp >= DATEADD(HOUR, -24, GETDATE())`;
        break;
      case '7d':
        timeFilter = `AND iot.Timestamp >= DATEADD(DAY, -7, GETDATE())`;
        break;
      case '30d':
        timeFilter = `AND iot.Timestamp >= DATEADD(DAY, -30, GETDATE())`;
        break;
      default:
        timeFilter = `AND iot.Timestamp >= DATEADD(HOUR, -2, GETDATE())`;
    }

    // Build the query
    let whereClause = `WHERE iot.Device_ID = @deviceId ${timeFilter}`;
    const request = pool.request();
    request.input('deviceId', sql.NVarChar, deviceId);

    // Add status filter
    if (status !== 'all') {
      if (status === 'fault') {
        whereClause += ` AND (iot.Fault_Code IS NOT NULL AND iot.Fault_Code != '' AND iot.Fault_Code != '0')`;
      } else if (status === 'active') {
        whereClause += ` AND iot.Motor_Current_mA > 0`;
      }
    }

    // Add search filter
    if (search) {
      whereClause += ` AND (iot.Fault_Code LIKE @search OR iot.FaultDescriptions LIKE @search OR iot.Device_ID LIKE @search)`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }

    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM [IoT_Data_Sick] iot
      ${whereClause}
    `;

    const countResult = await request.query(countQuery);
    const totalRecords = countResult.recordset[0].total;

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const totalPages = Math.ceil(totalRecords / parseInt(limit));

    // Get paginated data
    const dataQuery = `
      SELECT
        iot.Timestamp,
        iot.Motor_ON_Time_sec,
        iot.Train_Passed,
        iot.Motor_Current_mA,
        iot.Fault_Code,
        iot.FaultDescriptions,
        iot.Entry_ID,
        iot.GSM_Signal_Strength
      FROM [IoT_Data_Sick] iot
      ${whereClause}
      ORDER BY iot.${sortField} ${sortOrder}
      OFFSET ${offset} ROWS
      FETCH NEXT ${limit} ROWS ONLY
    `;

    const dataResult = await request.query(dataQuery);

    // Format the data
    const formattedData = dataResult.recordset.map(row => ({
      timestamp: row.Timestamp,
      runtime: row.Motor_ON_Time_sec ? Math.floor(row.Motor_ON_Time_sec / 60) : 0, // Convert to minutes
      status: row.Motor_Current_mA > 0 ? 'Active' : 'Inactive',
      hv_output_voltage: 0, // Not available in schema
      hv_output_current: row.Motor_Current_mA || 0,
      genset_signal: row.Train_Passed ? 'On' : 'Off',
      thermostat: 'N/A', // Not available in schema
      fault_codes: row.Fault_Code || '',
      entry_id: row.Entry_ID
    }));

    // Create audit log
    await createAuditLog(user.id, 'DEVICE_HISTORY_VIEW', `Viewed device history for entry ${entryId} (device ${deviceId})`, 'device_history', entryId, {
      entry_id: entryId,
      device_id: deviceId,
      time_range: timeRange,
      status_filter: status,
      search_term: search || null,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      message: 'Device history retrieved successfully',
      data: formattedData,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRecords,
        totalPages: totalPages,
        hasNext: parseInt(page) < totalPages,
        hasPrevious: parseInt(page) > 1
      },
      filters: {
        timeRange,
        status,
        search
      }
    });

  } catch (error) {
    logger.error('Error fetching device history:', error);
    throw error;
  }
});