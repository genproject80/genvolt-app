#!/usr/bin/env node
/**
 * CloudSynk Device Simulator
 *
 * Simulates the full device lifecycle:
 *   1. Boot → publish {"IMEI":"...","model_number":"..."} to cloudsynk/pre-activation
 *   2. Wait for telemetryConfig on cloudsynk/<IMEI>/config
 *   3. Reconnect with MQTT credentials from telemetryConfig
 *   4. Publish telemetry payloads on cloudsynk/<IMEI>/telemetry at --interval ms
 *      One message per logicId per interval (logicIds sourced from telemetryConfig or --logicIds)
 *
 * Usage:
 *   node device-simulator.js --imei 123456789012345 --host 127.0.0.1 --port 1883
 *   node device-simulator.js --imei 123456789012345 --model-number GV-M1 --interval 5000
 *   node device-simulator.js --help
 *
 * Flags:
 *   --imei          Device IMEI (required)
 *   --host          MQTT broker host (default: 127.0.0.1)
 *   --port          MQTT broker port (default: 1883)
 *   --tls           Use mqtts protocol (default: false)
 *   --no-verify     Skip TLS certificate verification (default: false, dev only)
 *   --pre-pass      Pre-activation broker password (default: PRE_ACTIVATION_SECRET env var)
 *   --model-number  Device model number to announce during pre-activation (required)
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
  --model-number  Model number to announce      (required)
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
  1: 'voltage/power',
  2: 'temperature/humidity',
  3: 'GPS',
  4: 'energy-v2/power-factor',
  5: 'energy+environment',
  6: 'energy+GPS',
  7: 'EV-charger',
  8: 'ultra/all-sensors',
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
        console.log(`[Phase 2] Telemetry round=${sentCount + 1} type=${logicLabel(logicId)} → field1=${field1}`);
      }
    });
  }
  sentCount++;
}

// ---------------------------------------------------------------------------
// Synthetic hex payloads per logicId
// ---------------------------------------------------------------------------

// Shared helpers to avoid repetition
function randEnergy() {
  const voltage = 3700 + Math.floor(Math.random() * 400);  // 3700–4100 mV
  const current = 500  + Math.floor(Math.random() * 200);  // 500–700 mA
  const power   = voltage * current;
  return { voltage, current, power };
}
function randEnv() {
  const temp     = Math.round((20 + Math.random() * 15) * 100);  // 20–35°C ×100
  const humidity = Math.round((40 + Math.random() * 40) * 100);  // 40–80% ×100
  const pressure = 101325 + Math.floor(Math.random() * 2000);    // ~1 atm Pa
  return { temp, humidity, pressure };
}
function randGps() {
  const lat  = Math.round((28.4 + Math.random() * 0.5) * 1e6);  // ~Delhi
  const lng  = Math.round((77.1 + Math.random() * 0.5) * 1e6);
  const alt  = 200 + Math.floor(Math.random() * 50);
  const spd  = Math.floor(Math.random() * 80);
  const sats = 6   + Math.floor(Math.random() * 6);
  return { lat, lng, alt, spd, sats };
}

function buildHexPayload(logicId) {
  let buf;

  if (logicId === 1) {
    // GV-M1: voltage_mv(2) current_ma(2) power_mw(4) — 8 bytes
    buf = Buffer.alloc(8);
    const e = randEnergy();
    buf.writeUInt16BE(e.voltage, 0);
    buf.writeUInt16BE(e.current, 2);
    buf.writeUInt32BE(e.power,   4);
    return buf.toString('hex');
  }

  if (logicId === 2) {
    // GV-ENV1: temp_c×100(2s) humidity×100(2u) pressure_pa(4u) — 8 bytes
    buf = Buffer.alloc(8);
    const v = randEnv();
    buf.writeInt16BE(v.temp,      0);
    buf.writeUInt16BE(v.humidity, 2);
    buf.writeUInt32BE(v.pressure, 4);
    return buf.toString('hex');
  }

  if (logicId === 3) {
    // GV-GPS1: lat×1e6(4s) lng×1e6(4s) altitude_m(2u) speed_kmh(2u) satellites(1u) — 13 bytes
    buf = Buffer.alloc(13);
    const g = randGps();
    buf.writeInt32BE(g.lat,  0);
    buf.writeInt32BE(g.lng,  4);
    buf.writeUInt16BE(g.alt, 8);
    buf.writeUInt16BE(g.spd, 10);
    buf.writeUInt8(g.sats,   12);
    return buf.toString('hex');
  }

  if (logicId === 4) {
    // GV-M2: voltage_mv(2) current_ma(2) power_mw(4) power_factor×100(2u) — 10 bytes
    buf = Buffer.alloc(10);
    const e = randEnergy();
    const pf = Math.round((0.85 + Math.random() * 0.14) * 100);  // 85–99 → 0.85–0.99
    buf.writeUInt16BE(e.voltage, 0);
    buf.writeUInt16BE(e.current, 2);
    buf.writeUInt32BE(e.power,   4);
    buf.writeUInt16BE(pf,        8);
    return buf.toString('hex');
  }

  if (logicId === 5) {
    // GV-PRO1: energy(8) + env(8) — 16 bytes
    buf = Buffer.alloc(16);
    const e = randEnergy();
    const v = randEnv();
    buf.writeUInt16BE(e.voltage,  0);
    buf.writeUInt16BE(e.current,  2);
    buf.writeUInt32BE(e.power,    4);
    buf.writeInt16BE(v.temp,      8);
    buf.writeUInt16BE(v.humidity, 10);
    buf.writeUInt32BE(v.pressure, 12);
    return buf.toString('hex');
  }

  if (logicId === 6) {
    // GV-FLT1: energy(8) + GPS(13) — 21 bytes
    buf = Buffer.alloc(21);
    const e = randEnergy();
    const g = randGps();
    buf.writeUInt16BE(e.voltage, 0);
    buf.writeUInt16BE(e.current, 2);
    buf.writeUInt32BE(e.power,   4);
    buf.writeInt32BE(g.lat,      8);
    buf.writeInt32BE(g.lng,      12);
    buf.writeUInt16BE(g.alt,     16);
    buf.writeUInt16BE(g.spd,     18);
    buf.writeUInt8(g.sats,       20);
    return buf.toString('hex');
  }

  if (logicId === 7) {
    // EV-M1: voltage_mv(2) current_ma(2) power_mw(4) energy_wh(4u) — 12 bytes
    buf = Buffer.alloc(12);
    const e  = randEnergy();
    const wh = 500 + Math.floor(Math.random() * 9500);  // 0.5–10 kWh session
    buf.writeUInt16BE(e.voltage, 0);
    buf.writeUInt16BE(e.current, 2);
    buf.writeUInt32BE(e.power,   4);
    buf.writeUInt32BE(wh,        8);
    return buf.toString('hex');
  }

  if (logicId === 8) {
    // GV-ULTRA1: energy(8) + env(8) + GPS(13) — 29 bytes
    buf = Buffer.alloc(29);
    const e = randEnergy();
    const v = randEnv();
    const g = randGps();
    buf.writeUInt16BE(e.voltage,  0);
    buf.writeUInt16BE(e.current,  2);
    buf.writeUInt32BE(e.power,    4);
    buf.writeInt16BE(v.temp,      8);
    buf.writeUInt16BE(v.humidity, 10);
    buf.writeUInt32BE(v.pressure, 12);
    buf.writeInt32BE(g.lat,       16);
    buf.writeInt32BE(g.lng,       20);
    buf.writeUInt16BE(g.alt,      24);
    buf.writeUInt16BE(g.spd,      26);
    buf.writeUInt8(g.sats,        28);
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
