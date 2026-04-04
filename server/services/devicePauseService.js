import { executeQuery, sql } from '../config/database.js';
import { logger } from '../utils/logger.js';
import mqttService from './mqttService.js';

// ---------------------------------------------------------------------------
// getDeviceImei — fetch imei for a device_id (required for MQTT calls)
// ---------------------------------------------------------------------------
async function getDeviceImei(deviceId) {
  const result = await executeQuery(
    `SELECT imei FROM dbo.device WHERE device_id = @deviceId`,
    { deviceId: { value: deviceId, type: sql.NVarChar } }
  );
  return result.recordset[0]?.imei || null;
}

// ---------------------------------------------------------------------------
// pauseDevice — pause a single device (CLIENT or ADMIN initiated)
// ---------------------------------------------------------------------------
export async function pauseDevice(deviceId, pausedBy, reason = '') {
  const result = await executeQuery(
    `SELECT device_id, client_id, activation_status, data_enabled, paused_by, imei
     FROM dbo.device WHERE device_id = @deviceId`,
    { deviceId: { value: deviceId, type: sql.NVarChar } }
  );

  if (result.recordset.length === 0) throw new Error('Device not found');
  const device = result.recordset[0];

  if (device.activation_status !== 'ACTIVE') {
    throw new Error('Only ACTIVE devices can be paused');
  }

  if (device.paused_by === 'ADMIN' && pausedBy !== 'ADMIN') {
    throw new Error('Device is paused by admin — contact your administrator to resume');
  }

  await executeQuery(
    `UPDATE dbo.device
     SET data_enabled = 0, paused_by = @pausedBy, paused_at = GETUTCDATE(), paused_reason = @reason
     WHERE device_id = @deviceId`,
    {
      deviceId: { value: deviceId, type: sql.NVarChar },
      pausedBy: { value: pausedBy, type: sql.NVarChar },
      reason:   { value: reason,   type: sql.NVarChar },
    }
  );

  if (device.imei) {
    try {
      await mqttService.pushActiveStatus(device.imei, false);
    } catch (mqttErr) {
      logger.warn(`Pause MQTT push failed for ${deviceId}:`, mqttErr.message);
    }
  }

  logger.info(`Device ${deviceId} paused by ${pausedBy}. Reason: ${reason}`);
}

// ---------------------------------------------------------------------------
// resumeDevice — resume a single device
// ---------------------------------------------------------------------------
export async function resumeDevice(deviceId, actorRole) {
  const result = await executeQuery(
    `SELECT device_id, client_id, activation_status, data_enabled, paused_by, imei
     FROM dbo.device WHERE device_id = @deviceId`,
    { deviceId: { value: deviceId, type: sql.NVarChar } }
  );

  if (result.recordset.length === 0) throw new Error('Device not found');
  const device = result.recordset[0];

  if (device.data_enabled === 1 || device.data_enabled === true) {
    return; // already enabled — nothing to do
  }

  if (device.paused_by === 'ADMIN' && actorRole !== 'ADMIN') {
    throw new Error('Device is paused by admin — contact your administrator to resume');
  }

  await executeQuery(
    `UPDATE dbo.device
     SET data_enabled = 1, paused_by = NULL, paused_at = NULL, paused_reason = NULL
     WHERE device_id = @deviceId`,
    { deviceId: { value: deviceId, type: sql.NVarChar } }
  );

  if (device.imei) {
    try {
      await mqttService.pushActiveStatus(device.imei, true);
    } catch (mqttErr) {
      logger.warn(`Resume MQTT push failed for ${deviceId}:`, mqttErr.message);
    }
  }

  logger.info(`Device ${deviceId} resumed by actor role ${actorRole}`);
}

// ---------------------------------------------------------------------------
// pauseAllDevicesForClient — bulk pause
// ---------------------------------------------------------------------------
export async function pauseAllDevicesForClient(clientId, pausedBy, reason = '') {
  let whereClause = `activation_status = 'ACTIVE' AND data_enabled = 1 AND client_id = @clientId`;
  if (pausedBy !== 'ADMIN') {
    whereClause += ` AND (paused_by IS NULL OR paused_by = 'CLIENT')`;
  }

  const devicesResult = await executeQuery(
    `SELECT device_id, imei FROM dbo.device WHERE ${whereClause}`,
    { clientId: { value: clientId, type: sql.Int } }
  );

  const devices = devicesResult.recordset;
  if (devices.length === 0) return 0;

  await executeQuery(
    `UPDATE dbo.device
     SET data_enabled = 0, paused_by = @pausedBy, paused_at = GETUTCDATE(), paused_reason = @reason
     WHERE activation_status = 'ACTIVE' AND data_enabled = 1 AND client_id = @clientId
       ${pausedBy !== 'ADMIN' ? `AND (paused_by IS NULL OR paused_by = 'CLIENT')` : ''}`,
    {
      clientId: { value: clientId, type: sql.Int },
      pausedBy: { value: pausedBy, type: sql.NVarChar },
      reason:   { value: reason,   type: sql.NVarChar },
    }
  );

  for (const device of devices) {
    if (!device.imei) continue;
    try {
      await mqttService.pushActiveStatus(device.imei, false);
    } catch (mqttErr) {
      logger.warn(`Pause MQTT push failed for ${device.device_id}:`, mqttErr.message);
    }
  }

  logger.info(`Paused ${devices.length} devices for client ${clientId} by ${pausedBy}`);
  return devices.length;
}

// ---------------------------------------------------------------------------
// resumeAllDevicesForClient — bulk resume
// ---------------------------------------------------------------------------
export async function resumeAllDevicesForClient(clientId, actorRole) {
  const isAdmin = actorRole === 'ADMIN';
  const whereExtra = isAdmin ? '' : `AND paused_by = 'CLIENT'`;

  const devicesResult = await executeQuery(
    `SELECT device_id, imei FROM dbo.device
     WHERE client_id = @clientId AND activation_status = 'ACTIVE' AND data_enabled = 0 ${whereExtra}`,
    { clientId: { value: clientId, type: sql.Int } }
  );

  const devices = devicesResult.recordset;
  if (devices.length === 0) return 0;

  await executeQuery(
    `UPDATE dbo.device
     SET data_enabled = 1, paused_by = NULL, paused_at = NULL, paused_reason = NULL
     WHERE client_id = @clientId AND activation_status = 'ACTIVE' AND data_enabled = 0 ${whereExtra}`,
    { clientId: { value: clientId, type: sql.Int } }
  );

  for (const device of devices) {
    if (!device.imei) continue;
    try {
      await mqttService.pushActiveStatus(device.imei, true);
    } catch (mqttErr) {
      logger.warn(`Resume MQTT push failed for ${device.device_id}:`, mqttErr.message);
    }
  }

  logger.info(`Resumed ${devices.length} devices for client ${clientId} by role ${actorRole}`);
  return devices.length;
}
