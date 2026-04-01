import { ClientTopicConfig } from '../models/ClientTopicConfig.js';
import { logger } from '../utils/logger.js';
import mqttService from './mqttService.js';
import { executeQuery, sql } from '../config/database.js';

// ---------------------------------------------------------------------------
// getTopicConfig — returns ClientTopicConfig or default fallback
// ---------------------------------------------------------------------------
export async function getTopicConfig(clientId) {
  const config = await ClientTopicConfig.findByClientId(clientId);
  return config ?? ClientTopicConfig.getDefault(clientId);
}

// ---------------------------------------------------------------------------
// buildTopicPaths — constructs telemetry + config topic strings
// ---------------------------------------------------------------------------
export function buildTopicPaths(clientId, deviceId, deviceType, config) {
  const overrides = config.device_type_overrides
    ? (typeof config.device_type_overrides === 'string'
        ? JSON.parse(config.device_type_overrides)
        : config.device_type_overrides)
    : {};

  const typeOverride = overrides[deviceType] ?? {};
  const prefix    = config.topic_prefix     ?? 'cloudsynk';
  const tSuffix   = typeOverride.telemetry  ?? config.telemetry_suffix ?? 'telemetry';
  const cSuffix   = typeOverride.config     ?? config.config_suffix    ?? 'config';

  return {
    telemetry: `${prefix}/${clientId}/${deviceId}/${tSuffix}`,
    config:    `${prefix}/${clientId}/${deviceId}/${cSuffix}`,
  };
}

// ---------------------------------------------------------------------------
// saveTopicConfig — UPSERT + push config to all active devices + reload signal
// ---------------------------------------------------------------------------
export async function saveTopicConfig(clientId, configData, adminUserId) {
  const saved = await ClientTopicConfig.upsert(clientId, configData, adminUserId);

  // Push updated topic config to all ACTIVE devices for this client
  const devicesResult = await executeQuery(
    `SELECT device_id, device_type FROM device
     WHERE client_id = @clientId AND activation_status = 'ACTIVE'`,
    { clientId: { value: clientId, type: sql.Int } }
  );

  const devices = devicesResult.recordset;
  for (const device of devices) {
    try {
      // Use old default topic to reach device before it switches
      const oldConfigTopic = `cloudsynk/${clientId}/${device.device_id}/config`;
      const newTopics = buildTopicPaths(clientId, device.device_id, device.device_type, saved);

      await mqttService.publish(oldConfigTopic, {
        action: 'topic_update',
        telemetry_topic: newTopics.telemetry,
        config_topic:    newTopics.config,
        effective_at:    new Date().toISOString(),
      });
    } catch (mqttErr) {
      logger.warn(`Topic update push failed for device ${device.device_id}:`, mqttErr.message);
    }
  }

  // Signal Python subscriber to reload topic subscriptions
  await notifySubscriberReload();

  logger.info(`Topic config saved for client ${clientId} by admin ${adminUserId}. Pushed to ${devices.length} devices.`);
  return saved;
}

// ---------------------------------------------------------------------------
// notifySubscriberReload — publish reload signal to Python subscriber
// ---------------------------------------------------------------------------
export async function notifySubscriberReload() {
  try {
    await mqttService.publish('cloudsynk/internal/subscriber/reload', {
      action:    'reload_topics',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn('Subscriber reload signal failed:', err.message);
  }
}
