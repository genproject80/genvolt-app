import mqtt from 'mqtt';
import { logger } from '../utils/logger.js';

class MQTTService {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  connect() {
    const host = process.env.MQTT_BROKER_HOST;
    const port = parseInt(process.env.MQTT_BROKER_PORT || '1883');
    const useTls = process.env.MQTT_BROKER_TLS === 'true';

    if (!host) {
      logger.warn('MQTT_BROKER_HOST not set — MQTT service disabled');
      return;
    }

    const options = {
      host,
      port,
      protocol: useTls ? 'mqtts' : 'mqtt',
      username: process.env.MQTT_BACKEND_USER,
      password: process.env.MQTT_BACKEND_PASSWORD,
      clientId: 'genvolt-backend-' + Math.random().toString(16).substr(2, 8),
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      rejectUnauthorized: process.env.MQTT_BROKER_TLS === 'true',
    };

    this.client = mqtt.connect(options);

    this.client.on('connect', () => {
      this.connected = true;
      logger.info(`MQTT Service connected to ${host}:${port}`);
    });

    this.client.on('reconnect', () => {
      logger.info('MQTT Service reconnecting...');
    });

    this.client.on('error', (err) => {
      logger.error('MQTT Service error:', err.message);
      this.connected = false;
    });

    this.client.on('offline', () => {
      this.connected = false;
      logger.warn('MQTT Service offline');
    });
  }

  /**
   * Generic publish to any topic.
   */
  async publish(topic, payload, options = {}) {
    if (!this.connected) {
      logger.warn(`MQTT not connected — publish skipped for ${topic}`);
      return false;
    }
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Promise((resolve) => {
      this.client.publish(topic, payloadStr, { qos: 1, retain: false, ...options }, (err) => {
        if (err) logger.error(`MQTT publish failed on ${topic}:`, err.message);
        else logger.info(`MQTT published → ${topic}`);
        resolve(!err);
      });
    });
  }

  /**
   * Send telemetryConfig to a device via its IMEI-based config topic.
   * retain: true — device receives it even after reconnecting.
   * Used for: initial activation, reactivation, reboot recovery, credential rotation.
   */
  async publishTelemetryConfig(imei, deviceId, plainPassword) {
    if (!this.connected) {
      logger.warn('MQTT not connected — telemetryConfig not sent');
      return false;
    }

    const topic = `cloudsynk/${imei}/config`;
    const payload = {
      type: 'telemetryConfig',
      isActive: 1,
      mqtt_username: deviceId,
      mqtt_password: plainPassword,
    };

    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1, retain: true }, (err) => {
        if (err) {
          logger.error(`telemetryConfig publish failed on ${topic}:`, err.message);
          reject(err);
        } else {
          logger.info(`telemetryConfig published → ${topic}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Push an isActive flag update to a device as a telemetryConfig message.
   * retain: true — device receives it even after reconnecting.
   * Used for pause (isActive=false) and resume (isActive=true).
   */
  async pushActiveStatus(imei, isActive) {
    if (!this.connected) {
      logger.warn('MQTT not connected — active status update not sent');
      return false;
    }

    const topic = `cloudsynk/${imei}/config`;
    const payload = {
      type: 'telemetryConfig',
      isActive: isActive ? 1 : 0,
      timestamp: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1, retain: true }, (err) => {
        if (err) {
          logger.error(`Active status publish failed on ${topic}:`, err.message);
          reject(err);
        } else {
          logger.info(`Active status (isActive=${payload.isActive}) published → ${topic}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Push a config_update to an ACTIVE device.
   * Topic: cloudsynk/<IMEI>/config, retain: false.
   */
  async pushConfigUpdate(imei, config) {
    if (!this.connected) {
      logger.warn('MQTT not connected — config update not pushed');
      return false;
    }

    const topic = `cloudsynk/${imei}/config`;
    const payload = {
      type: 'config_update',
      timestamp: new Date().toISOString(),
      ...config,
    };

    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, (err) => {
        if (err) {
          logger.error(`config_update publish failed on ${topic}:`, err.message);
          reject(err);
        } else {
          logger.info(`config_update pushed → ${topic}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Send a deactivation notice to a device before clearing its MQTT credentials.
   * Topic: cloudsynk/<IMEI>/config, retain: false.
   */
  async publishDeactivationNotice(imei, reason = 'admin_action') {
    if (!this.connected) return false;

    const topic = `cloudsynk/${imei}/config`;
    const payload = {
      type: 'deactivation_notice',
      status: 'deactivated',
      reason,
      timestamp: new Date().toISOString(),
    };

    return new Promise((resolve) => {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1, retain: false }, (err) => {
        if (err) logger.error(`Deactivation notice failed on ${topic}:`, err.message);
        else logger.info(`Deactivation notice sent → ${topic}`);
        resolve(!err);
      });
    });
  }

  get isConnected() {
    return this.connected;
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this.connected = false;
    }
  }
}

export default new MQTTService();
