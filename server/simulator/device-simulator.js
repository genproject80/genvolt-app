#!/usr/bin/env node
/**
 * CloudSynk Device Simulator
 *
 * Simulates the full device lifecycle:
 *   1. Boot → publish {"IMEI":"...","model_number":"..."} to cloudsynk/pre-activation
 *   2. Wait for telemetryConfig on cloudsynk/<IMEI>/config
 *   3. Reconnect with MQTT credentials from telemetryConfig
 *   4. Publish telemetry payloads on cloudsynk/<IMEI>/telemetry at --interval ms
 *      One message per logicId per interval (logicIds sourced from telemetryConfig)
 *
 * Supported model numbers:
 *   HK  — P3 SICK sensor (logicId 1, 32-byte payload)
 *   HY  — P4 HyPure telemetry (logicId 2, 28-byte payload)
 *
 * Usage:
 *   node device-simulator.js --imei 123456789012345 --model-number HK
 *   node device-simulator.js --imei 123456789012345 --model-number HY --interval 5000
 *   node device-simulator.js --help
 *
 * Flags:
 *   --imei          Device IMEI (required)
 *   --host          MQTT broker host (default: 127.0.0.1)
 *   --port          MQTT broker port (default: 1883)
 *   --tls           Use mqtts protocol (default: false)
 *   --no-verify     Skip TLS certificate verification (default: false, dev only)
 *   --pre-pass      Pre-activation broker password (default: PRE_ACTIVATION_SECRET env var)
 *   --model-number  Device model number — HK or HY (required)
 *                   Logic IDs are derived from the model number server-side via telemetryConfig
 *   --interval      Telemetry publish interval in ms (default: 10000)
 *   --count         Number of telemetry rounds to send, 0=unlimited (default: 0)
 *   --device-id     Force a specific device_id in telemetry (discovered from telemetryConfig)
 */

import mqtt from 'mqtt';

// ---------------------------------------------------------------------------
// Argument parser — simple --flag value style, no external dependencies
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (args.help) {
  console.log(`
CloudSynk Device Simulator

Usage:
  node device-simulator.js --imei <IMEI> [options]

Options:
  --imei          Device IMEI (required)
  --host          MQTT broker host              (default: 127.0.0.1)
  --port          MQTT broker port              (default: 1883)
  --tls           Use TLS (mqtts)               (default: false)
  --no-verify     Skip TLS cert verification    (default: false, dev only)
  --pre-pass      Pre-activation password       (default: PRE_ACTIVATION_SECRET env var)
  --model-number  Model number — HK or HY        (required)
                  Logic IDs are derived from the model number server-side
  --interval      Telemetry interval (ms)       (default: 10000)
  --count         Rounds to send (0=∞)          (default: 0)
  --device-id     Override device_id in payload
  --help          Show this help
  `);
  process.exit(0);
}

const IMEI         = args['imei'];
const HOST         = args['host']         || '127.0.0.1';
const PORT         = parseInt(args['port'] || '1883');
const TLS          = args['tls']          === true || args['tls'] === 'true';
const NO_VERIFY    = args['no-verify']    === true || args['no-verify'] === 'true';
// Pre-activation: device identifies itself with IMEI as username and the shared firmware secret.
const PRE_USER     = IMEI; // username is the device IMEI
const PRE_PASS     = args['pre-pass']     || process.env.PRE_ACTIVATION_SECRET || '';
const MODEL_NUMBER = args['model-number'] || null;
const INTERVAL     = parseInt(args['interval'] || '10000');
const COUNT        = parseInt(args['count'] || '0');

if (!IMEI) {
  console.error('Error: --imei is required');
  process.exit(1);
}

if (!MODEL_NUMBER) {
  console.error('Error: --model-number is required');
  process.exit(1);
}

const PRE_ACTIVATION_TOPIC = 'cloudsynk/pre-activation';
const CONFIG_TOPIC         = `cloudsynk/${IMEI}/config`;
const TELEMETRY_TOPIC      = `cloudsynk/${IMEI}/telemetry`;

let mqttUsername   = null;
let mqttPassword   = null;
let deviceId       = args['device-id'] || null;
let telemetryClient = null;
let telemetryTimer  = null;
let sentCount       = 0;
let isPaused        = false;
// Active logicIds — resolved from telemetryConfig; default [1] until config arrives
let activeLogicIds  = [1];

const logicLabel = id => ({
  1: 'HK/P3-SICK',
  2: 'HY/P4-HyPure',
}[id] || `logicId${id}`);
console.log(`[Simulator] IMEI=${IMEI}  model=${MODEL_NUMBER || '(none)'}  broker=${TLS ? 'mqtts' : 'mqtt'}://${HOST}:${PORT}  interval=${INTERVAL}ms  (logicIds derived from model server-side)`);

// ---------------------------------------------------------------------------
// Phase 1: Pre-activation — connect as adddevice user and announce IMEI
// ---------------------------------------------------------------------------
function startPreActivation() {
  console.log(`[Phase 1] Connecting as ${PRE_USER} for pre-activation...`);

  const preClient = mqtt.connect({
    host:               HOST,
    port:               PORT,
    protocol:           TLS ? 'mqtts' : 'mqtt',
    username:           PRE_USER,
    password:           PRE_PASS,
    clientId:           `sim-pre-${IMEI}-${Math.random().toString(16).substr(2, 6)}`,
    clean:              true,
    reconnectPeriod:    5000,
    connectTimeout:     10000,
    rejectUnauthorized: !NO_VERIFY,
  });

  preClient.on('connect', () => {
    console.log(`[Phase 1] Connected. Subscribing to config topic for telemetryConfig...`);

    // Subscribe to config topic to receive activation credentials
    preClient.subscribe(CONFIG_TOPIC, { qos: 1 }, (err) => {
      if (err) {
        console.error('[Phase 1] Subscribe error:', err.message);
        return;
      }
      console.log(`[Phase 1] Subscribed to ${CONFIG_TOPIC}`);

      // Publish pre-activation announcement (include model_number so server can resolve inventory)
      const prePayload = { IMEI };
      if (MODEL_NUMBER) prePayload.model_number = MODEL_NUMBER;
      const payload = JSON.stringify(prePayload);
      preClient.publish(PRE_ACTIVATION_TOPIC, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error('[Phase 1] Publish error:', err.message);
        } else {
          console.log(`[Phase 1] Published to ${PRE_ACTIVATION_TOPIC}: ${payload}`);
          console.log('[Phase 1] Waiting for telemetryConfig from server...');
        }
      });
    });
  });

  preClient.on('message', (topic, message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      return;
    }

    if (topic === CONFIG_TOPIC && payload.type === 'telemetryConfig') {
      console.log('[Phase 1] Received telemetryConfig:', JSON.stringify(payload));

      if (payload.isActive !== 1) {
        console.warn('[Phase 1] telemetryConfig has isActive != 1 — device not active yet. Waiting...');
        return;
      }

      mqttUsername = payload.mqtt_username;
      mqttPassword = payload.mqtt_password;
      if (!deviceId) deviceId = mqttUsername; // device_id == mqtt_username

      // Resolve logicIds from telemetryConfig (derived server-side from model number)
      if (payload.decoder_logic_ids) {
        try {
          const ids = typeof payload.decoder_logic_ids === 'string'
            ? JSON.parse(payload.decoder_logic_ids)
            : payload.decoder_logic_ids;
          if (Array.isArray(ids) && ids.length > 0) {
            activeLogicIds = ids.map(Number).filter(n => !isNaN(n));
            console.log(`[Phase 1] logicIds from telemetryConfig: [${activeLogicIds.join(', ')}]`);
          }
        } catch { /* keep default */ }
      }

      console.log(`[Phase 1] Got credentials. username=${mqttUsername}  model=${payload.model_number || MODEL_NUMBER || '(none)'}. Disconnecting pre-activation client.`);
      preClient.end(false, {}, () => {
        startTelemetry();
      });
    }
  });

  preClient.on('error', (err) => console.error('[Phase 1] MQTT error:', err.message));
  preClient.on('offline', () => console.warn('[Phase 1] Offline, will reconnect...'));
}

// ---------------------------------------------------------------------------
// Phase 2: Reconnect with device credentials and publish telemetry
// ---------------------------------------------------------------------------
function startTelemetry() {
  console.log(`[Phase 2] Connecting as ${mqttUsername} for telemetry...`);

  telemetryClient = mqtt.connect({
    host:               HOST,
    port:               PORT,
    protocol:           TLS ? 'mqtts' : 'mqtt',
    username:           mqttUsername,
    password:           mqttPassword,
    clientId:           `sim-telem-${IMEI}-${Math.random().toString(16).substr(2, 6)}`,
    clean:              true,
    reconnectPeriod:    5000,
    connectTimeout:     10000,
    rejectUnauthorized: !NO_VERIFY,
  });

  telemetryClient.on('connect', () => {
    console.log('[Phase 2] Connected with device credentials.');

    // Subscribe to config topic to receive config_update and deactivation_notice
    telemetryClient.subscribe(CONFIG_TOPIC, { qos: 1 }, (err) => {
      if (!err) console.log(`[Phase 2] Subscribed to ${CONFIG_TOPIC} for config updates`);
    });

    // Begin publishing telemetry
    publishTelemetry(); // immediate first
    telemetryTimer = setInterval(() => {
      publishTelemetry();
    }, INTERVAL);
  });

  telemetryClient.on('message', (topic, message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      return;
    }

    if (topic === CONFIG_TOPIC) {
      if (payload.type === 'config_update') {
        console.log('[Phase 2] Received config_update:', JSON.stringify(payload));
        // In a real device this would update motor/wheel settings
      } else if (payload.type === 'deactivation_notice') {
        console.log('[Phase 2] Received deactivation_notice — disconnecting.');
        clearInterval(telemetryTimer);
        telemetryClient.end();
      } else if (payload.type === 'telemetryConfig') {
        const active = payload.isActive === 1 || payload.isActive === true;

        if (!active) {
          // Pause — stop publishing, stay connected to keep receiving config
          if (!isPaused) {
            isPaused = true;
            clearInterval(telemetryTimer);
            telemetryTimer = null;
            console.log('[Phase 2] Device paused (isActive=0) — telemetry stopped. Listening for resume...');
          }
        } else if (payload.mqtt_password && payload.mqtt_password !== mqttPassword) {
          // Credential rotation — reconnect only if password actually changed
          console.log('[Phase 2] Credential rotation received. Reconnecting...');
          isPaused = false;
          mqttPassword = payload.mqtt_password;
          clearInterval(telemetryTimer);
          telemetryClient.end(false, {}, () => startTelemetry());
        } else {
          // Resume — restart telemetry without reconnecting
          if (isPaused) {
            isPaused = false;
            console.log('[Phase 2] Device resumed (isActive=1) — restarting telemetry.');
            publishTelemetry();
            telemetryTimer = setInterval(publishTelemetry, INTERVAL);
          }
        }
      }
    }
  });

  telemetryClient.on('error', (err) => console.error('[Phase 2] MQTT error:', err.message));
  telemetryClient.on('offline', () => console.warn('[Phase 2] Offline, will reconnect...'));
}

// ---------------------------------------------------------------------------
// Build and publish one telemetry message per active logicId
// ---------------------------------------------------------------------------
function publishTelemetry() {
  if (isPaused) return;
  if (COUNT > 0 && sentCount >= COUNT) {
    console.log(`[Phase 2] Sent ${sentCount} rounds. Done.`);
    clearInterval(telemetryTimer);
    telemetryClient.end();
    return;
  }

  const ts = new Date().toISOString();
  for (const logicId of activeLogicIds) {
    const field1 = buildHexPayload(logicId);
    const payload = JSON.stringify({
      deviceId:   deviceId || mqttUsername,
      field1,
      created_at: ts,
    });

    telemetryClient.publish(TELEMETRY_TOPIC, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[Phase 2] Publish error (${logicLabel(logicId)} payload):`, err.message);
      } else {
        console.log(`[Phase 2] Telemetry round=${sentCount + 1} topic=${TELEMETRY_TOPIC} type=${logicLabel(logicId)} → field1=${field1}`);
      }
    });
  }
  sentCount++;
}

// ---------------------------------------------------------------------------
// Synthetic hex payloads per logicId
// ---------------------------------------------------------------------------

function buildHexPayload(logicId) {
  let buf;

  if (logicId === 1) {
    // HK — P3 SICK sensor, 32 bytes (64 hex chars)
    buf = Buffer.alloc(32);

    // Block 1: event type (nibble), signal strength (nibble), motor times, wheel threshold
    const eventType     = Math.floor(Math.random() * 6);          // 0–5
    const signalStr     = Math.floor(Math.random() * 7);          // 0–6
    buf.writeUInt8((eventType << 4) | signalStr, 0);
    buf.writeUInt8(Math.floor(Math.random() * 60),  1);           // motor ON time sec (0–59)
    buf.writeUInt8(Math.floor(Math.random() * 30),  2);           // motor OFF time min (0–29)
    buf.writeUInt8(Math.floor(Math.random() * 100), 3);           // wheel threshold

    // Block 2: GPS integer parts, little-endian (byte-swapped)
    const latInt = 48 + Math.floor(Math.random() * 4);            // 48–51°
    const lonInt = 10 + Math.floor(Math.random() * 8);            // 10–17°
    buf.writeUInt16LE(latInt, 4);
    buf.writeUInt16LE(lonInt, 6);

    // Block 3 & 4: GPS decimal parts (uint32 BE, treated as decimal fraction)
    buf.writeUInt32BE(Math.floor(Math.random() * 999999), 8);     // lat decimal
    buf.writeUInt32BE(Math.floor(Math.random() * 999999), 12);    // lon decimal

    // Block 5: wheels detected, average current mA
    buf.writeUInt16BE(Math.floor(Math.random() * 8),    16);      // wheels (0–7)
    buf.writeUInt16BE(200 + Math.floor(Math.random() * 800), 18); // avg current mA

    // Block 6: min / max current mA
    const minCurrent = 100 + Math.floor(Math.random() * 300);
    const maxCurrent = minCurrent + Math.floor(Math.random() * 500);
    buf.writeUInt16BE(minCurrent, 20);
    buf.writeUInt16BE(maxCurrent, 22);

    // Block 7: flags byte, reserved, battery voltage mV
    const trainPassed = Math.random() > 0.7 ? 0x80 : 0;
    const motorOn     = Math.random() > 0.5 ? 0x40 : 0;
    buf.writeUInt8(trainPassed | motorOn, 24);
    buf.writeUInt8(0, 25);                                         // reserved
    buf.writeUInt16BE(3200 + Math.floor(Math.random() * 800), 26); // battery mV (3200–4000)

    // Block 8: debug value
    buf.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 28);

    return buf.toString('hex');
  }

  if (logicId === 2) {
    // HY — P4 HyPure telemetry, 28 bytes (56 hex chars)
    buf = Buffer.alloc(28);

    // Chunk 1: status flags, fault flags, signal strength, unused
    buf.writeUInt8(Math.floor(Math.random() * 256), 0);           // status flags
    buf.writeUInt8(Math.floor(Math.random() * 256), 1);           // fault flags
    buf.writeUInt8(Math.floor(Math.random() * 7),   2);           // signal strength (0–6)
    buf.writeUInt8(0, 3);                                          // unused

    // Chunk 2: electrical readings (1 byte each)
    buf.writeUInt8(Math.floor(Math.random() * 21),  4);           // kV value (0–20)
    buf.writeUInt8(Math.floor(Math.random() * 6),   5);           // mA value (0–5)
    buf.writeUInt8(Math.floor(Math.random() * 21),  6);           // kV minimum (0–20)
    buf.writeUInt8(Math.floor(Math.random() * 6),   7);           // mA minimum (0–5)

    // Chunk 3: temperature (°C), pressure (barG)
    buf.writeUInt16BE(20 + Math.floor(Math.random() * 60),  8);   // temperature (20–79°C)
    buf.writeUInt16BE(Math.floor(Math.random() * 11),       10);  // pressure (0–10 barG)

    // Chunks 4–6: runtime counters (minutes)
    buf.writeUInt32BE(Math.floor(Math.random() * 100000),   12);  // motor runtime
    buf.writeUInt32BE(Math.floor(Math.random() * 500000),   16);  // total runtime
    buf.writeUInt32BE(Math.floor(Math.random() * 500000),   20);  // device runtime

    // Chunk 7: debug value
    buf.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 24);

    return buf.toString('hex');
  }

  // Fallback: random 8 bytes
  buf = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) buf.writeUInt8(Math.floor(Math.random() * 256), i);
  return buf.toString('hex');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
startPreActivation();

process.on('SIGINT', () => {
  console.log('\n[Simulator] Interrupted. Disconnecting...');
  if (telemetryTimer) clearInterval(telemetryTimer);
  if (telemetryClient) telemetryClient.end();
  process.exit(0);
});
