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
      rejectUnauthorized: process.env.MQTT_BROKER_TLS === 'true', // enforced in prod, relaxed in dev
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
   * Push a real-time config update to an ACTIVE device.
   */
  async pushConfigUpdate(clientId, deviceId, config, retain = false) {
    if (!this.connected) {
      logger.warn('MQTT not connected — config saved to DB but not pushed live');
      return false;
    }

    const topic = `cloudsynk/${clientId}/${deviceId}/config`;
    const payload = JSON.stringify({
      type: 'config_update',
      timestamp: new Date().toISOString(),
      ...config,
    });

    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 1, retain }, (err) => {
        if (err) {
          logger.error(`MQTT publish failed on ${topic}:`, err.message);
          reject(err);
        } else {
          logger.info(`Config pushed → ${topic}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Push activation payload to a PENDING device.
   * Uses retain:true so the device gets it even if it reconnects after admin clicks Activate.
   */
  async publishActivationPayload(deviceId, clientId, mqttPassword, initialConfig) {
    if (!this.connected) {
      logger.warn('MQTT not connected — activation payload not sent');
      return false;
    }

    const topic = `cloudsynk/pre-activation/response/${deviceId}`;
    const payload = JSON.stringify({
      status: 'activated',
      client_id: clientId,
      telemetry_topic: `cloudsynk/${clientId}/${deviceId}/telemetry`,
      config_topic: `cloudsynk/${clientId}/${deviceId}/config`,
      mqtt_username: deviceId,
      mqtt_password: mqttPassword,
      config: initialConfig,
    });

    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 1, retain: true }, (err) => {
        if (err) {
          logger.error(`Activation publish failed on ${topic}:`, err.message);
          reject(err);
        } else {
          logger.info(`Activation payload published → ${topic}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Push a deactivation notice to an ACTIVE device before cutting access.
   */
  async publishDeactivationNotice(clientId, deviceId, reason = 'admin_action') {
    if (!this.connected) return false;

    const topic = `cloudsynk/${clientId}/${deviceId}/config`;
    const payload = JSON.stringify({
      type: 'deactivation_notice',
      status: 'deactivated',
      reason,
      timestamp: new Date().toISOString(),
    });

    return new Promise((resolve) => {
      this.client.publish(topic, payload, { qos: 1 }, (err) => {
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
