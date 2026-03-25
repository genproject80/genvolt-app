/**
 * Test: Verify retained MQTT config topic after device activation
 *
 * Usage:
 *   node scripts/test_mqtt_activation.js <client_id> <device_id>
 *
 * Example:
 *   node scripts/test_mqtt_activation.js 3 HK00001
 *
 * Requires MQTT_BROKER_HOST, MQTT_BACKEND_USER, MQTT_BACKEND_PASSWORD in server/.env
 * (or set them as env vars before running)
 */

import mqtt from 'mqtt';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load server/.env if not already set
if (!process.env.MQTT_BROKER_HOST) {
  try {
    const envFile = readFileSync(resolve(__dirname, '../server/.env'), 'utf8');
    for (const line of envFile.split('\n')) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
  } catch {
    // .env not found — rely on environment variables
  }
}

const [, , clientId, deviceId] = process.argv;

if (!clientId || !deviceId) {
  console.error('Usage: node scripts/test_mqtt_activation.js <client_id> <device_id>');
  process.exit(1);
}

const topic = `cloudsynk/${clientId}/${deviceId}/config`;
const TIMEOUT_MS = 5000;

const host = process.env.MQTT_BROKER_HOST || 'localhost';
const port = parseInt(process.env.MQTT_BROKER_PORT || '1883');
const useTls = process.env.MQTT_BROKER_TLS === 'true';

console.log(`\nConnecting to ${host}:${port} (TLS: ${useTls})`);
console.log(`Checking retained message on: ${topic}\n`);

const client = mqtt.connect({
  host,
  port,
  protocol: useTls ? 'mqtts' : 'mqtt',
  username: process.env.MQTT_BACKEND_USER,
  password: process.env.MQTT_BACKEND_PASSWORD,
  clientId: 'test-checker-' + Math.random().toString(16).substr(2, 6),
  clean: true,
  rejectUnauthorized: false,
});

const timer = setTimeout(() => {
  console.error(`FAIL: No retained message received on ${topic} within ${TIMEOUT_MS}ms`);
  console.error('      → Either the device was not activated yet, or MQTT publish failed.');
  client.end();
  process.exit(1);
}, TIMEOUT_MS);

client.on('connect', () => {
  console.log('Connected. Subscribing...');
  client.subscribe(topic, { qos: 1 }, (err) => {
    if (err) {
      console.error('Subscribe failed:', err.message);
      clearTimeout(timer);
      client.end();
      process.exit(1);
    }
  });
});

client.on('message', (t, payload) => {
  clearTimeout(timer);
  try {
    const msg = JSON.parse(payload.toString());
    console.log('PASS: Retained config message received:\n');
    console.log(JSON.stringify(msg, null, 2));
    if (msg.type !== 'config_update') {
      console.warn('\nWARN: Expected type "config_update", got:', msg.type);
    }
  } catch {
    console.log('PASS: Message received (not valid JSON):', payload.toString());
  }
  client.end();
  process.exit(0);
});

client.on('error', (err) => {
  console.error('MQTT error: ', process.env.MQTT_BACKEND_USER);
  console.error('password: ', process.env.MQTT_BACKEND_PASSWORD);
  console.error('MQTT error:', err.message);
  clearTimeout(timer);
  client.end();
  process.exit(1);
});
