import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { Client } from '../models/Client.js';
import mqttService from '../services/mqttService.js';

/**
 * Get all HKMI devices visible to the current user (scoped by client hierarchy).
 * GET /api/hkmi-config/devices
 */
export const getHkmiDevices = asyncHandler(async (req, res) => {
  const user = req.user;
  const pool = await getPool();

  // Get client scope: self + descendants
  const descendantClients = await Client.getDescendantClients(user.client_id);
  const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

  const request = pool.request();
  const placeholders = allClientIds.map((id, i) => {
    request.input(`cid${i}`, sql.Int, id);
    return `@cid${i}`;
  }).join(',');

  const result = await request.query(`
    SELECT id, device_id, client_id, model_number, machin_id, imei, activation_status
    FROM device
    WHERE client_id IN (${placeholders})
    ORDER BY device_id
  `);

  res.json({ success: true, data: result.recordset });
});

/**
 * Get the latest config values for a specific device from IoT_Data_Sick_P3.
 * GET /api/hkmi-config/device/:deviceId/latest
 */
export const getDeviceLatestConfig = asyncHandler(async (req, res) => {
  const user = req.user;
  const { deviceId } = req.params;
  const pool = await getPool();

  // Verify device belongs to user's client scope
  const descendantClients = await Client.getDescendantClients(user.client_id);
  const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

  const scopeReq = pool.request();
  const placeholders = allClientIds.map((id, i) => {
    scopeReq.input(`cid${i}`, sql.Int, id);
    return `@cid${i}`;
  }).join(',');
  scopeReq.input('deviceId', sql.VarChar, deviceId);

  const deviceCheck = await scopeReq.query(`
    SELECT id FROM device
    WHERE device_id = @deviceId AND client_id IN (${placeholders})
  `);

  if (deviceCheck.recordset.length === 0) {
    return res.status(404).json({ success: false, message: 'Device not found or access denied' });
  }

  // Get latest row from IoT_Data_Sick_P3
  const dataReq = pool.request();
  dataReq.input('deviceId', sql.VarChar, deviceId);

  const result = await dataReq.query(`
    SELECT TOP 1
      Device_ID,
      Motor_ON_Time_sec,
      Motor_OFF_Time_min,
      Wheel_Threshold,
      CreatedAt
    FROM IoT_Data_Sick_P3
    WHERE Device_ID = @deviceId
    ORDER BY CreatedAt DESC
  `);

  if (result.recordset.length === 0) {
    return res.json({ success: true, data: null, message: 'No telemetry data found for this device' });
  }

  res.json({ success: true, data: result.recordset[0] });
});

/**
 * Publish new config values to a device via MQTT.
 * POST /api/hkmi-config/device/:deviceId/publish
 */
export const publishDeviceConfig = asyncHandler(async (req, res) => {
  const user = req.user;
  const { deviceId } = req.params;
  const { Motor_ON_Time_sec, Motor_OFF_Time_min, Wheel_Threshold } = req.body;

  // Validate required fields
  if (Motor_ON_Time_sec == null || Motor_OFF_Time_min == null || Wheel_Threshold == null) {
    return res.status(400).json({
      success: false,
      message: 'All config fields are required: Motor_ON_Time_sec, Motor_OFF_Time_min, Wheel_Threshold'
    });
  }

  const pool = await getPool();

  // Verify device belongs to user's client scope and get its IMEI
  const descendantClients = await Client.getDescendantClients(user.client_id);
  const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

  const scopeReq = pool.request();
  const placeholders = allClientIds.map((id, i) => {
    scopeReq.input(`cid${i}`, sql.Int, id);
    return `@cid${i}`;
  }).join(',');
  scopeReq.input('deviceId', sql.VarChar, deviceId);

  const deviceResult = await scopeReq.query(`
    SELECT id, device_id, imei FROM device
    WHERE device_id = @deviceId AND client_id IN (${placeholders})
  `);

  if (deviceResult.recordset.length === 0) {
    return res.status(404).json({ success: false, message: 'Device not found or access denied' });
  }

  const device = deviceResult.recordset[0];
  const imei = device.imei || device.device_id; // fallback to device_id if imei is null

  const config = {
    Motor_ON_Time_sec: Number(Motor_ON_Time_sec),
    Motor_OFF_Time_min: Number(Motor_OFF_Time_min),
    Wheel_Threshold: Number(Wheel_Threshold),
  };

  // Publish via MQTT
  const topic = `cloudsynk/${imei}/config`;
  const published = await mqttService.pushConfigUpdate(imei, config);

  if (!published) {
    return res.status(503).json({
      success: false,
      message: 'MQTT broker is not connected. Config was not published.',
    });
  }

  logger.info(`HKMI config published by user ${user.id} for device ${deviceId} → ${topic}`);

  res.json({
    success: true,
    message: 'Config published to device via MQTT',
    published: true,
    topic,
    config,
  });
});
