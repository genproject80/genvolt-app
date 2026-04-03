import mqtt from 'mqtt';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { decode, resolveLogicIds } from '../decoders/decoder.js';
import { executeQuery, sql } from '../config/database.js';
import mqttService from './mqttService.js';
import { Inventory } from '../models/Inventory.js';
import { FeatureFlag } from '../models/FeatureFlag.js';
import fs from 'fs';


class MQTTListenerService {
  constructor() {
    this.client = null;
    // IMEIs whose retained config topic has already been cleared after first telemetry.
    // Prevents repeated empty publishes on every telemetry message.
    this._clearedConfigTopics = new Set();
    // Cached at connect time from the feature flag — avoids a DB hit on every message.
    this._telemetryEnabled = false;
  }

  connect() {
    const host = process.env.MQTT_BROKER_HOST;

    if (!host) {
      logger.warn('MQTT_BROKER_HOST not set — MQTT listener disabled');
      return;
    }

    this.client = mqtt.connect({
      host,
      port: parseInt(process.env.MQTT_BROKER_PORT || '1883'),
      protocol: process.env.MQTT_BROKER_TLS === 'true' ? 'mqtts' : 'mqtt',
      username: process.env.MQTT_BACKEND_USER,
      password: process.env.MQTT_BACKEND_PASSWORD,
      clientId: 'genvolt-listener-' + Math.random().toString(16).substr(2, 8),
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      ca: process.env.MQTT_BROKER_TLS === 'true'
        ? fs.readFileSync('./certs/ca.crt')
        : undefined,
      key: process.env.MQTT_USE_CLIENT_CERT === 'true'
        ? fs.readFileSync('./certs/client.key')
        : undefined,
      rejectUnauthorized: process.env.MQTT_BROKER_TLS === 'true'
    });

    this.client.on('connect', async () => {
      logger.info('MQTT Listener connected');
      this.client.subscribe('cloudsynk/pre-activation', { qos: 1 }, (err) => {
        if (err) logger.error('Failed to subscribe to pre-activation:', err.message);
        else logger.info('Subscribed: cloudsynk/pre-activation');
      });

      // Telemetry subscription is gated by the 'mqtt_telemetry_subscription' feature flag.
      // The flag is cached for the lifetime of this connection; it is re-evaluated on reconnect.
      try {
        const flag = await FeatureFlag.findByName('mqtt_telemetry_subscription');
        this._telemetryEnabled = !!flag?.is_enabled;
      } catch (err) {
        this._telemetryEnabled = false;
        logger.warn('Could not read mqtt_telemetry_subscription flag — telemetry subscription skipped:', err.message);
      }

      if (this._telemetryEnabled) {
        this.client.subscribe('cloudsynk/+/telemetry', { qos: 1 }, (err) => {
          if (err) logger.error('Failed to subscribe to telemetry:', err.message);
          else logger.info('Subscribed: cloudsynk/+/telemetry');
        });
      } else {
        logger.info('Feature flag mqtt_telemetry_subscription disabled — skipping cloudsynk/+/telemetry subscription');
      }
    });

    this.client.on('message', (topic, message) => {
      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch (err) {
        logger.warn(`Listener: malformed JSON on ${topic}`);
        return;
      }

      if (topic === 'cloudsynk/pre-activation') {
        this.handlePreActivation(payload).catch(err =>
          logger.error('handlePreActivation error:', err.message)
        );
      } else if (topic.endsWith('/telemetry')) {
        // topic format: cloudsynk/<IMEI>/telemetry
        if (!this._telemetryEnabled) {
          logger.debug(`Telemetry message on ${topic} dropped — mqtt_telemetry_subscription flag disabled`);
          return;
        }
        const parts = topic.split('/');
        const imei = parts[1];
        this.handleTelemetry(imei, payload).catch(err =>
          logger.error('handleTelemetry error:', err.message)
        );
      }
    });

    this.client.on('error', (err) => logger.error('MQTT Listener error:', err.message));
    this.client.on('offline', () => logger.warn('MQTT Listener offline'));
    this.client.on('reconnect', () => logger.info('MQTT Listener reconnecting...'));
  }

  // -------------------------------------------------------------------------
  // handlePreActivation
  // Called when a device boots and publishes {"IMEI":"..."} to cloudsynk/pre-activation
  // -------------------------------------------------------------------------
  async handlePreActivation(payload) {
    const imei = payload?.IMEI;

    if (!imei) {
      logger.warn('Pre-activation message missing IMEI field');
      return;
    }
    logger.info(`Pre-activation received: IMEI=${imei}`);

    const result = await executeQuery(
      `SELECT device_id, activation_status, mqtt_password_plain
       FROM dbo.device WHERE imei = @imei`,
      { imei: { value: String(imei), type: sql.NVarChar } }
    );

    if (result.recordset.length === 0) {
      // New device — auto-register as PENDING
      // Resolve model_number from payload (optional); use its prefix for the temp device_id
      const modelNumber = payload?.model_number || null;
      let prefix = 'GV';
      if (modelNumber) {
        try {
          const inv = await Inventory.findByModelNumber(modelNumber);
          if (inv?.device_id_prefix) prefix = inv.device_id_prefix;
        } catch { /* keep default */ }
      }
      const newDeviceId = prefix + crypto.randomBytes(4).toString('hex').toUpperCase();
      await executeQuery(
        `INSERT INTO dbo.device (device_id, imei, activation_status, onboarding_date, model_number)
         VALUES ( @deviceId, @imei, 'PENDING', GETUTCDATE(), @modelNumber)`,
        {
          deviceId: { value: newDeviceId, type: sql.NVarChar },
          imei: { value: String(imei), type: sql.NVarChar },
          modelNumber: { value: modelNumber, type: sql.NVarChar },
        }
      );
      logger.info(`Auto-registered new device IMEI=${imei} deviceId=${newDeviceId} model=${modelNumber || 'none'} — awaiting admin activation`);
      return;
    }

    const device = result.recordset[0];

    if (device.activation_status === 'ACTIVE') {
      // Device rebooted — resend telemetryConfig so it can reconnect with correct credentials
      if (device.mqtt_password_plain && device.device_id) {
        try {
          await mqttService.publishTelemetryConfig(imei, device.device_id, device.mqtt_password_plain);
          logger.info(`Resent telemetryConfig on reboot: IMEI=${imei} device=${device.device_id}`);
        } catch (err) {
          logger.error(`Failed to resend telemetryConfig for IMEI=${imei}:`, err.message);
        }
      } else {
        logger.warn(`Active device IMEI=${imei} rebooted but no plain password stored — relying on retained broker message`);
      }
      return;
    }

    if (device.activation_status === 'PENDING') {
      logger.info(`Pending device IMEI=${imei} reconnected — still awaiting admin activation`);
      return;
    }

    if (device.activation_status === 'INACTIVE') {
      logger.info(`Inactive device IMEI=${imei} connected — no action (deactivated)`);
    }
  }

  // -------------------------------------------------------------------------
  // handleTelemetry
  // Called when an ACTIVE device publishes to cloudsynk/<IMEI>/telemetry
  // -------------------------------------------------------------------------
  async handleTelemetry(imei, payload) {
    const { deviceId, field1 } = payload;

    if (!deviceId) {
      logger.warn(`Telemetry missing deviceId from IMEI=${imei}`);
      return;
    }
    if (!field1) {
      logger.warn(`Telemetry missing field1 from device=${deviceId}`);
      return;
    }

    // Resolve logicId(s) from the device's model — device does not send logicId
    let resolvedIds = [];
    try {
      const deviceRow = await executeQuery(
        `SELECT model_number FROM dbo.device WHERE device_id = @deviceId`,
        { deviceId: { value: deviceId, type: sql.NVarChar } }
      );
      if (deviceRow.recordset.length === 0) {
        logger.warn(`Telemetry from unknown device=${deviceId} IMEI=${imei} — dropping`);
        return;
      }
      const modelNumber = deviceRow.recordset[0].model_number;
      if (!modelNumber) {
        logger.warn(`Device=${deviceId} has no model_number — cannot resolve decoder`);
        return;
      }
      const inv = await Inventory.findByModelNumber(modelNumber);
      if (!inv) {
        logger.warn(`No inventory entry for model=${modelNumber} device=${deviceId} — dropping`);
        return;
      }
      resolvedIds = resolveLogicIds(inv.decoderLogicIdsArray, field1);
      if (resolvedIds.length === 0) {
        logger.warn(`Payload size (${field1.length / 2}B) matches no decoder for model=${modelNumber} device=${deviceId} — dropping`);
        return;
      }
    } catch (err) {
      logger.warn(`Could not resolve logicId for device=${deviceId}: ${err.message}`);
      return;
    }

    // Decode and store one record per resolved logicId
    const rawJson = JSON.stringify(payload);
    for (const logicId of resolvedIds) {
      let decoded = null;
      try {
        decoded = decode(logicId, field1);
      } catch (err) {
        logger.warn(`Decoder failed for logicId=${logicId} device=${deviceId}: ${err.message}`);
      }

      await executeQuery(
        `INSERT INTO dbo.DeviceTelemetry
           (device_id, imei, logic_id, raw_payload, decoded_data, received_at)
         VALUES
           (@deviceId, @imei, @logicId, @raw, @decoded, GETUTCDATE())`,
        {
          deviceId: { value: deviceId, type: sql.NVarChar },
          imei: { value: imei, type: sql.NVarChar },
          logicId: { value: logicId, type: sql.Int },
          raw: { value: rawJson, type: sql.NVarChar },
          decoded: { value: decoded ? JSON.stringify(decoded) : null, type: sql.NVarChar },
        }
      );

      logger.info(`Telemetry stored: device=${deviceId} imei=${imei} logicId=${logicId} (resolved from model)`);
    }

    // Clear the retained activation credential payload from the config topic on first telemetry.
    // Once the device is sending telemetry it has successfully reconnected with device credentials,
    // so the pre-activation credential message is no longer needed on the broker.
    if (!this._clearedConfigTopics.has(imei)) {
      this._clearedConfigTopics.add(imei);
      try {
        await mqttService.publish(`cloudsynk/${imei}/config`, '', { retain: true, qos: 1 });
        logger.info(`Cleared retained config topic for IMEI=${imei}`);
      } catch (err) {
        logger.warn(`Failed to clear retained config topic for IMEI=${imei}: ${err.message}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // setTelemetrySubscription
  // Called by the feature flag controller when mqtt_telemetry_subscription is toggled.
  // Subscribes or unsubscribes live without requiring a reconnect.
  // -------------------------------------------------------------------------
  setTelemetrySubscription(isEnabled) {
    if (!this.client?.connected) {
      // Not connected yet — flag will be picked up on the next connect event.
      this._telemetryEnabled = isEnabled;
      logger.info(`MQTT not connected — mqtt_telemetry_subscription cached as ${isEnabled}`);
      return;
    }

    if (isEnabled && !this._telemetryEnabled) {
      this.client.subscribe('cloudsynk/+/telemetry', { qos: 1 }, (err) => {
        if (err) {
          logger.error('Failed to subscribe to telemetry (flag toggle):', err.message);
        } else {
          this._telemetryEnabled = true;
          logger.info('Subscribed: cloudsynk/+/telemetry (flag enabled)');
        }
      });
    } else if (!isEnabled && this._telemetryEnabled) {
      this.client.unsubscribe('cloudsynk/+/telemetry', (err) => {
        if (err) {
          logger.error('Failed to unsubscribe from telemetry (flag toggle):', err.message);
        } else {
          this._telemetryEnabled = false;
          logger.info('Unsubscribed: cloudsynk/+/telemetry (flag disabled)');
        }
      });
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}

export default new MQTTListenerService();
