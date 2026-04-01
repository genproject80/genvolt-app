import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { validationResult } from 'express-validator';
import { Client } from '../models/Client.js';

/**
 * Resolve device IDs authorised for the requesting user.
 * Optionally further filters by a requested subset of device IDs.
 */
async function resolveDeviceIds(pool, user, requestedDeviceIds = []) {
  const descendantClients = await Client.getDescendantClients(user.client_id);
  const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

  const deviceResult = await pool.request().query(`
    SELECT device_id
    FROM device
    WHERE client_id IN (${allClientIds.join(',')})
  `);
  let allDeviceIds = deviceResult.recordset.map(d => d.device_id);

  if (requestedDeviceIds.length > 0) {
    allDeviceIds = allDeviceIds.filter(id => requestedDeviceIds.includes(id));
  }

  return allDeviceIds;
}

/**
 * Add device ID parameters to a request and return the IN-clause placeholder string.
 */
function bindDeviceIds(request, deviceIds) {
  const placeholders = deviceIds.map((_, i) => `@did${i}`).join(',');
  deviceIds.forEach((id, i) => request.input(`did${i}`, sql.VarChar, id));
  return placeholders;
}

/**
 * GET /api/hypure/overview
 * Returns the most recent row (for gauges/status widgets) and the last N rows
 * in chronological order (for trend charts).
 *
 * Query params:
 *   device_ids  – optional JSON array or comma-separated string
 *   history_limit – number of historical rows to return (default 50, max 200)
 */
export const getHyPureOverview = asyncHandler(async (req, res) => {
  const { device_ids, history_limit = 50 } = req.query;
  const user = req.user;

  let requestedIds = [];
  if (device_ids) {
    try {
      requestedIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
    } catch {
      requestedIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
    }
  }

  const pool = await getPool();
  const deviceIds = await resolveDeviceIds(pool, user, requestedIds);

  if (deviceIds.length === 0) {
    return res.json({ success: true, data: { latest: null, history: [] } });
  }

  const histLimit = Math.min(parseInt(history_limit) || 50, 200);

  const request = pool.request();
  const placeholders = bindDeviceIds(request, deviceIds);
  request.input('histLimit', sql.Int, histLimit);

  const result = await request.query(`
    SELECT TOP (@histLimit)
      Entry_ID, Device_ID, CreatedAt,
      kV_Value, mA_Value, Pressure, Temperature,
      Signal_Strength,
      Motor_Runtime_Min, Total_Runtime_Min, Device_Runtime_Min,
      HVS, Oil_Level, Limit_Switch, Motor_Forward, Motor_Reverse,
      Spark, Motor_Trip, Buzzer,
      Tank_Pressure, Motor_Trip_Fault, Moisture_Contamination,
      HVS_OFF, Change_Collector, Pump_Suction, Drain_Period_Over,
      HexField
    FROM IoT_Data_HyPure
    WHERE Device_ID IN (${placeholders})
    ORDER BY CreatedAt DESC
  `);

  const rows = result.recordset;
  const latest = rows.length > 0 ? rows[0] : null;
  const history = [...rows].reverse(); // oldest-first for chart rendering

  return res.json({ success: true, data: { latest, history } });
});

/**
 * GET /api/hypure/devices/latest
 * Returns the most recent row for each authorised device (for the Device Overview table).
 */
export const getHyPureDevicesLatest = asyncHandler(async (req, res) => {
  const user = req.user;
  const pool = await getPool();
  const deviceIds = await resolveDeviceIds(pool, user, []);

  if (deviceIds.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const request = pool.request();
  const placeholders = bindDeviceIds(request, deviceIds);

  const result = await request.query(`
    SELECT d.Entry_ID, d.Device_ID, d.CreatedAt,
      d.kV_Value, d.mA_Value, d.Pressure, d.Temperature,
      d.Signal_Strength,
      d.Motor_Runtime_Min, d.Total_Runtime_Min, d.Device_Runtime_Min,
      d.Motor_Forward, d.Motor_Reverse,
      d.Tank_Pressure, d.Motor_Trip_Fault, d.Moisture_Contamination,
      d.HVS_OFF, d.Change_Collector, d.Pump_Suction, d.Drain_Period_Over
    FROM IoT_Data_HyPure d
    INNER JOIN (
      SELECT Device_ID, MAX(CreatedAt) AS MaxCreatedAt
      FROM IoT_Data_HyPure
      WHERE Device_ID IN (${placeholders})
      GROUP BY Device_ID
    ) latest ON d.Device_ID = latest.Device_ID AND d.CreatedAt = latest.MaxCreatedAt
    ORDER BY d.Device_ID
  `);

  return res.json({ success: true, data: result.recordset });
});

/**
 * GET /api/hypure
 * Returns paginated HyPure data for the Detailed Data table.
 *
 * Query params:
 *   device_ids  – optional JSON array or comma-separated string
 *   page        – page number (default 1)
 *   limit       – rows per page (default 20, max 100)
 *   sort_field  – column to sort by (default CreatedAt)
 *   sort_order  – ASC | DESC (default DESC)
 */
export const getHyPureData = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid request parameters', errors.array());
  }

  const {
    device_ids,
    page = 1,
    limit = 20,
    sort_field = 'CreatedAt',
    sort_order = 'DESC'
  } = req.query;

  const user = req.user;

  let requestedIds = [];
  if (device_ids) {
    try {
      requestedIds = Array.isArray(device_ids) ? device_ids : JSON.parse(device_ids);
    } catch {
      requestedIds = typeof device_ids === 'string' ? device_ids.split(',') : [];
    }
  }

  const pool = await getPool();
  const deviceIds = await resolveDeviceIds(pool, user, requestedIds);

  const emptyMeta = {
    total: 0,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  };

  if (deviceIds.length === 0) {
    return res.json({ success: true, data: [], meta: emptyMeta });
  }

  const allowedSortFields = [
    'Entry_ID', 'CreatedAt', 'Device_ID',
    'kV_Value', 'mA_Value', 'Pressure', 'Temperature'
  ];
  const safeSortField = allowedSortFields.includes(sort_field) ? sort_field : 'CreatedAt';
  const safeSortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const pageSize = Math.min(parseInt(limit), 100);
  const currentPage = Math.max(parseInt(page), 1);
  const offsetVal = (currentPage - 1) * pageSize;

  // Count query
  const countRequest = pool.request();
  const placeholders = bindDeviceIds(countRequest, deviceIds);
  const countResult = await countRequest.query(`
    SELECT COUNT(*) AS total
    FROM IoT_Data_HyPure
    WHERE Device_ID IN (${placeholders})
  `);
  const total = countResult.recordset[0].total;

  // Data query
  const dataRequest = pool.request();
  const dataPlaceholders = bindDeviceIds(dataRequest, deviceIds);
  dataRequest.input('pageSize', sql.Int, pageSize);
  dataRequest.input('offsetVal', sql.Int, offsetVal);

  const dataResult = await dataRequest.query(`
    SELECT
      Entry_ID, Device_ID, CreatedAt,
      kV_Value, mA_Value, kV_Minimum, mA_Minimum,
      Pressure, Temperature, Signal_Strength,
      Motor_Runtime_Min, Total_Runtime_Min, Device_Runtime_Min,
      HVS, Oil_Level, Limit_Switch, Motor_Forward, Motor_Reverse,
      Spark, Motor_Trip, Buzzer,
      Tank_Pressure, Motor_Trip_Fault, Moisture_Contamination,
      HVS_OFF, Change_Collector, Pump_Suction, Drain_Period_Over
    FROM IoT_Data_HyPure
    WHERE Device_ID IN (${dataPlaceholders})
    ORDER BY ${safeSortField} ${safeSortOrder}
    OFFSET @offsetVal ROWS FETCH NEXT @pageSize ROWS ONLY
  `);

  const totalPages = Math.ceil(total / pageSize);

  return res.json({
    success: true,
    data: dataResult.recordset,
    meta: {
      total,
      page: currentPage,
      limit: pageSize,
      totalPages,
      hasNext: currentPage < totalPages,
      hasPrevious: currentPage > 1
    }
  });
});
