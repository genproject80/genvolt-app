import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Get detailed P3 device information for specific IoT entry
 * GET /api/p3-device-details/:entryId
 */
export const getP3DeviceDetails = asyncHandler(async (req, res) => {
  try {
    const { entryId } = req.params;
    const user = req.user;
    const pool = await getPool();

    logger.info(`Fetching P3 device details for Entry_ID: ${entryId}`);

    // Check if this Entry_ID exists
    const checkQuery = `SELECT COUNT(*) as count FROM [IoT_Data_Sick_P3] WHERE [Entry_ID] = @entryId`;
    const checkResult = await pool.request()
      .input('entryId', sql.Int, entryId)
      .query(checkQuery);

    logger.info(`P3 Entry_ID ${entryId} existence check: ${checkResult.recordset[0].count} records found`);

    if (checkResult.recordset[0].count === 0) {
      const sampleQuery = `SELECT TOP 5 [Entry_ID], [Device_ID] FROM [IoT_Data_Sick_P3] ORDER BY [Entry_ID] DESC`;
      const sampleResult = await pool.request().query(sampleQuery);
      logger.info(`Sample P3 Entry_IDs in database:`, sampleResult.recordset);
    }

    // Get specific P3 IoT data entry with device and HKMI information
    const deviceDetailQuery = `
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
        d.client_id,
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
        CASE
          WHEN DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) <= 90 THEN 'Active'
          ELSE 'Inactive'
        END AS Device_Status,
        DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) AS Minutes_Since_Last_Data
      FROM [IoT_Data_Sick_P3] p3
      INNER JOIN device d ON p3.Device_ID = d.device_id
      LEFT JOIN (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
        FROM cloud_dashboard_hkmi
      ) hkmi ON p3.Device_ID = hkmi.device_id AND hkmi.rn = 1
      WHERE p3.[Entry_ID] = @entryId
    `;

    const deviceResult = await pool.request()
      .input('entryId', sql.Int, entryId)
      .query(deviceDetailQuery);

    if (deviceResult.recordset.length === 0) {
      logger.warn(`No P3 device data found for Entry_ID: ${entryId}`);
      return res.status(404).json({
        success: false,
        message: `P3 device data not found for Entry_ID: ${entryId}`
      });
    }

    const deviceData = deviceResult.recordset[0];

    // Get the latest record date for this device (always show the most recent, not the current entry's date)
    const latestRecordQuery = `
      SELECT MAX(CreatedAt) as latest_record_date
      FROM [IoT_Data_Sick_P3]
      WHERE Device_ID = @deviceId
    `;

    const latestRecordResult = await pool.request()
      .input('deviceId', sql.NVarChar, deviceData.Device_ID)
      .query(latestRecordQuery);

    const latestRecordDate = latestRecordResult.recordset[0]?.latest_record_date;

    // Calculate battery status
    let batteryStatus = 'Unknown';
    const batteryVoltage = deviceData.Battery_Voltage_mV || 0;
    if (batteryVoltage >= 4000) {
      batteryStatus = 'Battery Full & Charging';
    } else if (batteryVoltage >= 3700) {
      batteryStatus = 'Battery Good';
    } else if (batteryVoltage >= 3400) {
      batteryStatus = 'Battery Low';
    } else if (batteryVoltage > 0) {
      batteryStatus = 'Battery Critical';
    }

    // Calculate motor status
    const motorStatus = deviceData.Motor_ON_Flag ? 'Running' : 'Stopped';

    // Calculate duty cycle
    const motorOnTime = deviceData.Motor_ON_Time_sec || 0;
    const motorOffTime = (deviceData.Motor_OFF_Time_min || 0) * 60; // Convert to seconds
    const totalCycleTime = motorOnTime + motorOffTime;
    const dutyCycle = totalCycleTime > 0 ? ((motorOnTime / totalCycleTime) * 100).toFixed(1) : '0.0';

    // Format response data matching the HKMI structure
    const responseData = {
      // Top level fields for easy access
      Device_ID: deviceData.Device_ID,
      Entry_ID: deviceData.Entry_ID,
      Latitude: deviceData.Latitude,
      Longitude: deviceData.Longitude,
      GSM_Signal_Strength: deviceData.Signal_Strength,
      Motor_Current_mA: deviceData.Motor_Current_Average_mA,
      Motor_ON_Time_sec: deviceData.Motor_ON_Time_sec,
      Motor_OFF_Time_min: deviceData.Motor_OFF_Time_min,
      Number_of_Wheels_Configured: deviceData.Wheel_Threshold,
      Number_of_Wheels_Detected: deviceData.Number_of_Wheels_Detected,

      device_information: {
        device_id: deviceData.Device_ID,
        machine_id: deviceData.machine_id,
        client_id: deviceData.client_id,
        record_time: deviceData.CreatedAt,
        device_type: 'P3 Motor Device',
        latest_record_date: latestRecordDate
      },

      machine_configuration: {
        motor_on_time_sec: deviceData.Motor_ON_Time_sec || 0,
        motor_off_time_min: deviceData.Motor_OFF_Time_min || 0,
        wheel_threshold: deviceData.Wheel_Threshold || 0
      },

      communication_gps: {
        gsm_signal: deviceData.Signal_Strength || 0,
        latitude: deviceData.Latitude,
        longitude: deviceData.Longitude
      },

      fault_diagnostics: {
        device_status: deviceData.Device_Status,
        minutes_since_last_data: deviceData.Minutes_Since_Last_Data,
        battery_status: batteryStatus,
        battery_voltage_mv: deviceData.Battery_Voltage_mV,
        motor_status: motorStatus,
        motor_on_flag: deviceData.Motor_ON_Flag,
        train_passed_flag: deviceData.Train_Passed_Flag,
        event_type: deviceData.Event_Type,
        event_type_description: deviceData.Event_Type_Description
      },

      technical_details: {
        wheels_detected: deviceData.Number_of_Wheels_Detected || 0,
        current_draw_ma: deviceData.Motor_Current_Average_mA || 0,
        current_min_ma: deviceData.Motor_Current_Min_mA || 0,
        current_max_ma: deviceData.Motor_Current_Max_mA || 0,
        battery_voltage_mv: deviceData.Battery_Voltage_mV || 0,
        raw_hex_data: deviceData.HexField,
        debug_value: deviceData.Debug_Value,
        timestamp: deviceData.Timestamp,
        inserted_at: deviceData.InsertedAt
      },

      hierarchy_info: {
        sden: deviceData.sden,
        den: deviceData.den,
        aen: deviceData.aen,
        sse: deviceData.sse,
        div_rly: deviceData.div_rly,
        section: deviceData.section,
        curve_number: deviceData.curve_number,
        line: deviceData.line,
        grease_left: deviceData.grease_left,
        last_service_date: deviceData.last_service_date,
        machine_id: deviceData.machine_id
      }
    };

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_DEVICE_DETAIL_VIEW',
      message: `Viewed P3 device details for entry ${entryId} (device ${deviceData.Device_ID})`,
      target_type: 'P3_DEVICE_DETAIL',
      target_id: entryId,
      details: JSON.stringify({
        entry_id: entryId,
        device_id: deviceData.Device_ID,
        access_method: 'p3_device_details_api'
      })
    });

    res.json({
      success: true,
      message: 'P3 device details retrieved successfully',
      data: responseData
    });

  } catch (error) {
    logger.error('Error fetching P3 device details:', error);
    throw error;
  }
});

/**
 * Get historical P3 IoT data for device related to specific entry
 * GET /api/p3-device-details/:entryId/history
 */
export const getP3DeviceHistory = asyncHandler(async (req, res) => {
  try {
    const { entryId } = req.params;
    const {
      timeRange = 'all',
      status = 'all',
      search = '',
      date = '',
      page = 1,
      limit = 20,
      sortField = 'CreatedAt',
      sortOrder = 'DESC'
    } = req.query;

    const user = req.user;
    const pool = await getPool();

    // First, get the Device_ID from the Entry_ID
    logger.info(`Fetching Device_ID for P3 Entry_ID: ${entryId}`);

    const entryQuery = `
      SELECT Device_ID FROM [IoT_Data_Sick_P3] WHERE [Entry_ID] = @entryId
    `;

    const entryResult = await pool.request()
      .input('entryId', sql.Int, entryId)
      .query(entryQuery);

    if (entryResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'P3 Entry not found'
      });
    }

    const deviceId = entryResult.recordset[0].Device_ID;

    // Calculate time range filter
    let timeFilter = '';
    switch (timeRange) {
      case 'all':
        timeFilter = '';
        break;
      case '2h':
        timeFilter = `AND DATEDIFF(HOUR, p3.CreatedAt, GETUTCDATE()) <= 2`;
        break;
      case '24h':
        timeFilter = `AND DATEDIFF(HOUR, p3.CreatedAt, GETUTCDATE()) <= 24`;
        break;
      case '7d':
        timeFilter = `AND p3.CreatedAt >= DATEADD(DAY, -7, GETUTCDATE())`;
        break;
      case '30d':
        timeFilter = `AND p3.CreatedAt >= DATEADD(DAY, -30, GETUTCDATE())`;
        break;
      default:
        timeFilter = '';
    }

    // Handle specific date filter (overrides timeRange if provided)
    if (date && date.trim() !== '') {
      timeFilter = `AND CAST(p3.CreatedAt AS DATE) = @filterDate`;
      logger.info(`Date filter applied for P3: ${date}`);
    } else {
      logger.info(`Time filter applied for P3: ${timeFilter}`);
    }

    // Build the query
    let whereClause = `WHERE p3.Device_ID = @deviceId ${timeFilter}`;
    const request = pool.request();
    request.input('deviceId', sql.NVarChar, deviceId);

    // Add date parameter if date filter is active
    if (date && date.trim() !== '') {
      request.input('filterDate', sql.Date, new Date(date));
    }

    // Add status filter
    logger.info(`P3 Status filter value: "${status}"`);
    if (status !== 'all') {
      if (status === 'fault') {
        // Consider fault as battery critical or motor issues
        const faultCondition = ` AND (p3.Battery_Voltage_mV < 3400 OR p3.Event_Type = 4)`;
        whereClause += faultCondition;
        logger.info(`Applied P3 fault filter: ${faultCondition}`);
      } else if (status === 'active') {
        const activeCondition = ` AND (p3.Battery_Voltage_mV >= 3400 OR p3.Battery_Voltage_mV IS NULL)`;
        whereClause += activeCondition;
        logger.info(`Applied P3 active filter: ${activeCondition}`);
      }
    }

    // Add search filter
    if (search) {
      whereClause += ` AND (p3.Device_ID LIKE @search OR p3.Event_Type_Description LIKE @search)`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }

    // Count total records
    const countQuery = `
      SELECT COUNT(*) as total
      FROM [IoT_Data_Sick_P3] p3
      ${whereClause}
    `;

    const countResult = await request.query(countQuery);
    const totalRecords = countResult.recordset[0].total;

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const totalPages = Math.ceil(totalRecords / parseInt(limit));

    // Validate sort field
    const allowedSortFields = ['CreatedAt', 'Entry_ID', 'Signal_Strength', 'Motor_Current_Average_mA', 'Battery_Voltage_mV', 'Event_Type'];
    const safeSortField = allowedSortFields.includes(sortField) ? sortField : 'CreatedAt';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get paginated data
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
        CASE
          WHEN p3.Motor_ON_Flag = 1 THEN 'Running'
          ELSE 'Stopped'
        END AS Motor_Status
      FROM [IoT_Data_Sick_P3] p3
      ${whereClause}
      ORDER BY p3.${safeSortField} ${safeSortOrder}
      OFFSET ${offset} ROWS
      FETCH NEXT ${limit} ROWS ONLY
    `;

    const dataResult = await request.query(dataQuery);

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'DATA_ACCESS',
      action: 'P3_DEVICE_HISTORY_VIEW',
      message: `Viewed P3 device history for entry ${entryId} (device ${deviceId})`,
      target_type: 'P3_DEVICE_HISTORY',
      target_id: entryId,
      details: JSON.stringify({
        entry_id: entryId,
        device_id: deviceId,
        time_range: timeRange,
        status_filter: status,
        search_term: search || null,
        date_filter: date || null,
        page: parseInt(page),
        limit: parseInt(limit)
      })
    });

    res.json({
      success: true,
      message: 'P3 device history retrieved successfully',
      data: dataResult.recordset,
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
        search,
        date
      }
    });

  } catch (error) {
    logger.error('Error fetching P3 device history:', error);
    throw error;
  }
});
