# CloudSynk Platform — Consolidated Implementation Plan v4.0

**Supersedes:** `CLOUDSYNK_PLATFORM_PLAN.md`, previous `DEVICE_ACTIVATION_UI_PLAN.md`
**Date:** 2026-03-29
**Status:** Planning

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Device Protocol Specification](#2-device-protocol-specification)
3. [Device Lifecycle](#3-device-lifecycle)
4. [Database Changes](#4-database-changes)
5. [Backend Changes](#5-backend-changes)
6. [MQTT Listener Service (replaces Python)](#6-mqtt-listener-service-replaces-python)
7. [Telemetry Decoders](#7-telemetry-decoders)
8. [MQTT Auth Hook Changes](#8-mqtt-auth-hook-changes)
9. [Frontend — Client Device Dashboard](#9-frontend--client-device-dashboard)
10. [Device Simulator](#10-device-simulator)
11. [Database Migration SQL](#11-database-migration-sql)
12. [Implementation Order](#12-implementation-order)
13. [Files — New & Modified](#13-files--new--modified)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEVICE (firmware)                         │
│                                                                  │
│  Hardcoded:                       Variables (received via MQTT): │
│  MQTT_server   = mqtt.cloudsynk.net   mqtt_username_tele = ""   │
│  MQTT_port     = 1883                 mqtt_password_tele = ""   │
│  Pre-auth user = adddevice            isActive          = 0     │
│  Pre-auth pass = admin@123                                       │
│  IMEI          = <device IMEI>                                   │
│  pub_topic     = cloudsynk/<IMEI>/telemetry  (always IMEI)      │
│  sub_topic     = cloudsynk/<IMEI>/config     (always IMEI)      │
└───────────────────┬─────────────────────────┬───────────────────┘
        BOOT/REBOOT │                          │ ACTIVE telemetry
  cloudsynk/pre-activation               cloudsynk/<IMEI>/telemetry
                    │                          │
┌───────────────────▼──────────────────────────▼───────────────────┐
│                   EMQX MQTT BROKER (mqtt.cloudsynk.net:1883)      │
│  Broker-level user: adddevice / admin@123                         │
│  ACL: adddevice → publish cloudsynk/pre-activation               │
│  ACL: adddevice → subscribe cloudsynk/+/config                   │
│  All other users → validated via HTTP auth hook (Node.js)        │
└───────┬───────────────────────────────────────────────┬──────────┘
        │ subscribe                                      │ subscribe
  cloudsynk/pre-activation                    cloudsynk/+/telemetry
        │                                               │
┌───────▼───────────────────────────────────────────────▼──────────┐
│              NODE.JS SERVER (Express + MQTT Listener)             │
│                                                                   │
│  mqttListenerService.js                                           │
│    ├─ handlePreActivation(imei)                                   │
│    │    └─ create device in DB if new (PENDING)                   │
│    │    └─ resend telemetryConfig if ACTIVE (reboot recovery)     │
│    └─ handleTelemetry(imei, payload)                              │
│         └─ decode via logicId dispatcher                          │
│         └─ store to DeviceTelemetry table                         │
│                                                                   │
│  HTTP API (existing + new)                                        │
│    ├─ POST /api/devices/:id/activate   → publish telemetryConfig  │
│    ├─ POST /api/devices/:id/deactivate → publish deactivation     │
│    ├─ POST /api/devices/:id/config-push → publish config_update   │
│    └─ MQTT ACL hook (updated for IMEI topics)                     │
└───────────────────────────────────┬──────────────────────────────┘
                                    │
                              SQL Server (cs_db_dev)
                              device, DeviceTelemetry, ...
```

---

## 2. Device Protocol Specification

### 2.1 Hardcoded Device Constants

| Constant | Value |
|---|---|
| MQTT server | `mqtt.cloudsynk.net` |
| MQTT port | `1883` |
| Pre-activation MQTT user | `adddevice` |
| Pre-activation MQTT password | `admin@123` |
| Pre-activation publish topic | `cloudsynk/pre-activation` |
| Telemetry publish topic | `cloudsynk/<IMEI>/telemetry` |
| Config subscribe topic | `cloudsynk/<IMEI>/config` |

### 2.2 Device Variables (received via config topic)

| Variable | Default | Source |
|---|---|---|
| `mqtt_username_tele` | `""` | Received in `telemetryConfig` payload |
| `mqtt_password_tele` | `""` | Received in `telemetryConfig` payload |
| `isActive` | `0` | Received in `telemetryConfig` payload |

### 2.3 Inbound Payloads (device → broker)

**Boot message** (published to `cloudsynk/pre-activation`):
```json
{ "IMEI": "350938241548715" }
```

**Telemetry** (published to `cloudsynk/<IMEI>/telemetry` when `isActive = 1`):
```json
{
  "deviceId": "HY2030",
  "logicId": 3,
  "field1": "320c140a4a0016000006f6f5000d1e5d0025000000000000800033300000000e",
  "created_at": "2026-03-11T04:52:24.949975+00:00"
}
```
- `logicId` determines which decoder to use
- `field1` is a hex-encoded binary payload, decoded by the logicId decoder

**Config echo** (device republishes current config on telemetry topic after receiving `config_update`):
Same telemetry payload format but includes current config values.

### 2.4 Outbound Payloads (server → device)

**Activation config** (published to `cloudsynk/<IMEI>/config`, retain: true):
```json
{
  "type": "telemetryConfig",
  "isActive": 1,
  "mqtt_username": "HY2030",
  "mqtt_password": "7e3877e35fc92f0b1e43591e0d1ede82"
}
```
Retain `true` so device gets it even if it reconnects after admin activates.

**Device config update** (published to `cloudsynk/<IMEI>/config`, retain: false):
```json
{
  "type": "config_update",
  "timestamp": "2026-03-28T08:25:19.021Z",
  "Motor_ON_Time_sec": 20,
  "Motor_OFF_Time_min": 15,
  "Wheel_Threshold": 5
}
```

**Deactivation notice** (published to `cloudsynk/<IMEI>/config`):
```json
{
  "type": "deactivation_notice",
  "status": "deactivated",
  "reason": "admin_action",
  "timestamp": "2026-03-28T08:25:19.021Z"
}
```

### 2.5 Credential Rotation Payload

When an admin rotates credentials for an already-active device, the server publishes a new `telemetryConfig` payload — same format as activation — to `cloudsynk/<IMEI>/config` with `retain: true`. The device treats it identically to the first activation: store new credentials, reconnect.

```json
{
  "type": "telemetryConfig",
  "isActive": 1,
  "mqtt_username": "HY2030",
  "mqtt_password": "<new_random_password>"
}
```

**This payload works for all three topics the device uses:**

| Topic | Role | After rotation |
|---|---|---|
| `cloudsynk/pre-activation` | Publish (boot) | Unchanged — uses `adddevice` credentials, independent |
| `cloudsynk/<IMEI>/telemetry` | Publish (telemetry) | Device reconnects with new credentials, same topic |
| `cloudsynk/<IMEI>/config` | Subscribe (config) | Device reconnects with new credentials, same topic |

The MQTT broker ACL lookup (Node.js auth hook) uses `mqtt_username` to find the device record. After a DB update, the old username/password hash is replaced, so the old credentials are automatically invalidated on next broker auth check.

---

## 3. Device Lifecycle

```
                   [Device First Boot]
                          │
                          ▼
         Publish: cloudsynk/pre-activation
         {"IMEI": "350938241548715"}
                          │
         ┌────────────────▼────────────────┐
         │  Node.js: handlePreActivation   │
         │  Is IMEI in device table?        │
         └────┬──────────────────┬─────────┘
           NO │               YES│
              ▼                  ▼
    Create device row      activation_status?
    imei = IMEI            ┌──────────────────┐
    activation_status      │PENDING: do nothing│
    = 'PENDING'            │(wait for admin)   │
    Wait for admin         │                   │
                           │ACTIVE: resend     │
                           │telemetryConfig    │
                           │(reboot recovery)  │
                           └──────────────────┘

                   [Admin Activates Device]
                          │
          ClientDeviceDashboard → POST /api/devices/:id/activate
                          │
         ┌────────────────▼────────────────┐
         │  deviceController.activateDevice│
         │  1. Assign client_id to device  │
         │  2. Generate mqtt credentials   │
         │     mqtt_username = device_id   │
         │     mqtt_password = random hash │
         │  3. activation_status = 'ACTIVE'│
         │  4. Publish telemetryConfig to  │
         │     cloudsynk/<IMEI>/config     │
         │     retain: true                │
         └─────────────────────────────────┘
                          │
                          ▼
           Device receives telemetryConfig
           Stores mqtt_username_tele + password
           Sets isActive = 1
           Reconnects with new credentials
           Starts publishing telemetry
                          │
                          ▼
         cloudsynk/<IMEI>/telemetry
         {"deviceId":"HY2030","logicId":3,"field1":"..."}
                          │
         ┌────────────────▼────────────────┐
         │  Node.js: handleTelemetry        │
         │  1. Lookup device by IMEI        │
         │  2. Decode via logicId           │
         │  3. Store to DeviceTelemetry     │
         └─────────────────────────────────┘
```

---

## 4. Database Changes

### 4.1 New column: `device.imei`

```sql
ALTER TABLE dbo.device ADD
  imei NVARCHAR(20) NULL;

CREATE UNIQUE INDEX IX_device_imei
  ON dbo.device (imei)
  WHERE imei IS NOT NULL;
```

- IMEI populated automatically when device first boots (pre-activation handler creates row)
- Existing manually-created devices: `imei` = NULL until device connects

### 4.2 New table: `DeviceTelemetry`

```sql
CREATE TABLE dbo.DeviceTelemetry (
  telemetry_id   BIGINT         IDENTITY(1,1) PRIMARY KEY,
  device_id      NVARCHAR(50)   NOT NULL,   -- e.g. "HY2030"
  imei           NVARCHAR(20)   NULL,
  logic_id       INT            NOT NULL,
  raw_payload    NVARCHAR(MAX)  NOT NULL,   -- original JSON from device
  decoded_data   NVARCHAR(MAX)  NULL,       -- JSON of decoded fields
  received_at    DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IX_DeviceTelemetry_device
  ON dbo.DeviceTelemetry (device_id, received_at DESC);

CREATE INDEX IX_DeviceTelemetry_imei
  ON dbo.DeviceTelemetry (imei, received_at DESC);
```

Decoded data stored as JSON column allows different fields per logicId without schema changes.

### 4.3 Summary of all DB changes (idempotent)

See [Section 11](#11-database-migration-sql) for full migration SQL.

---

## 5. Backend Changes

### 5.1 `server/services/mqttService.js` — updated methods

**Replace `publishActivationPayload`** — old method sent to wrong topic and wrong payload format:

```javascript
// OLD (remove):
async publishActivationPayload(deviceId, clientId, mqttPassword, initialConfig)
// topic: cloudsynk/pre-activation/response/${deviceId}  ← device doesn't subscribe here

// NEW:
async publishTelemetryConfig(imei, deviceId, mqttPassword) {
  const topic = `cloudsynk/${imei}/config`;
  const payload = {
    type: 'telemetryConfig',
    isActive: 1,
    mqtt_username: deviceId,
    mqtt_password: mqttPassword,
  };
  return this.publish(topic, payload, { qos: 1, retain: true });
}
```

**Replace `publishDeactivationNotice`** — old method used clientId/deviceId topic:

```javascript
// NEW:
async publishDeactivationNotice(imei, reason = 'admin_action') {
  const topic = `cloudsynk/${imei}/config`;
  const payload = {
    type: 'deactivation_notice',
    status: 'deactivated',
    reason,
    timestamp: new Date().toISOString(),
  };
  return this.publish(topic, payload, { qos: 1, retain: false });
}
```

**Replace `pushConfigUpdate`** — old method used clientId/deviceId topic:

```javascript
// NEW:
async pushConfigUpdate(imei, config) {
  const topic = `cloudsynk/${imei}/config`;
  const payload = {
    type: 'config_update',
    timestamp: new Date().toISOString(),
    ...config,
  };
  return this.publish(topic, payload, { qos: 1, retain: false });
}
```

### 5.2 `server/controllers/deviceController.js` — updated handlers

**`activateDevice`**:
- After DB update, look up `device.imei`
- Call `mqttService.publishTelemetryConfig(device.imei, device_id, mqttPassword)`
- Remove call to old `publishActivationPayload` + `pushConfigUpdate`

**`deactivateDevice`**:
- Look up `device.imei` before clearing credentials
- Call `mqttService.publishDeactivationNotice(device.imei, reason)`
- Remove old `publishDeactivationNotice(clientId, deviceId)` call

**`reactivateDevice`**:
- Same as activateDevice — generate new credentials, call `publishTelemetryConfig`

**New handler: `pushDeviceConfig`**:
```javascript
export const pushDeviceConfig = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const config = req.body; // { Motor_ON_Time_sec, Motor_OFF_Time_min, Wheel_Threshold, ... }

  const device = await Device.findByDeviceStringId(deviceId);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  if (device.activation_status !== 'ACTIVE')
    return res.status(400).json({ error: 'Device is not active' });
  if (!device.imei)
    return res.status(400).json({ error: 'Device has no IMEI registered' });
  if (!await canAccessDevice(req.user, device))
    return res.status(403).json({ error: 'Access denied' });

  await mqttService.pushConfigUpdate(device.imei, config);
  res.json({ message: 'Config pushed', device_id: deviceId, config });
});
```

### 5.3 `server/routes/deviceRoutes.js` — new routes

```javascript
router.post('/:deviceId/config-push',         requirePermission('Edit Device'), pushDeviceConfig);
router.post('/:deviceId/rotate-credentials',  requirePermission('Edit Device'), rotateDeviceCredentials);
```

### 5.5 New handler: `rotateDeviceCredentials`

Generates a new password, updates `mqtt_username` + `mqtt_password` in DB, then republishes `telemetryConfig` (retain: true) so the device receives new credentials on its subscribed config topic.

```javascript
export const rotateDeviceCredentials = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;

  const device = await Device.findByDeviceStringId(deviceId);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  if (device.activation_status !== 'ACTIVE')
    return res.status(400).json({ error: 'Device is not active' });
  if (!device.imei)
    return res.status(400).json({ error: 'Device has no IMEI registered' });
  if (!await canAccessDevice(req.user, device))
    return res.status(403).json({ error: 'Access denied' });

  // Generate new credentials
  const newPassword     = crypto.randomBytes(16).toString('hex');
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  // Update DB — same mqtt_username (device_id), new password
  await executeQuery(
    `UPDATE dbo.device
     SET mqtt_password = @hash, updated_at = GETUTCDATE()
     WHERE device_id = @deviceId`,
    [
      { name: 'hash',     type: sql.NVarChar, value: newPasswordHash },
      { name: 'deviceId', type: sql.NVarChar, value: deviceId },
    ]
  );

  // Push new telemetryConfig — retain:true so device gets it on reconnect
  await mqttService.publishTelemetryConfig(device.imei, deviceId, newPassword);

  // Note: plain-text password is only ever sent via MQTT to the device.
  // It is NOT returned in the HTTP response.
  res.json({ message: 'Credentials rotated — new telemetryConfig sent to device', device_id: deviceId });
});
```

**How it works across all three topics:**
1. `cloudsynk/pre-activation` — unaffected, device uses `adddevice` for this
2. `cloudsynk/<IMEI>/telemetry` — device reconnects with new credentials and continues publishing here
3. `cloudsynk/<IMEI>/config` — device resubscribes with new credentials and continues receiving here

Old credentials are invalidated immediately: MQTT auth hook queries `mqtt_password` from DB on each new connection attempt, and `bcrypt.compare` will fail for the old password.

### 5.4 `server/services/devicePauseService.js` — updated topics

Change all `pushConfigUpdate(clientId, deviceId, ...)` calls to use IMEI:
```javascript
// Lookup device.imei before pause/resume
await mqttService.pushConfigUpdate(device.imei, { data_enabled: false });
```

---

## 6. MQTT Listener Service (replaces Python)

**New file:** `server/services/mqttListenerService.js`

This service runs inside the Node.js process, subscribes to two wildcard topics, and handles all device messages. **Replaces the Python subscriber entirely.**

```javascript
// server/services/mqttListenerService.js

import mqtt from 'mqtt';
import { logger } from '../utils/logger.js';
import { decode } from '../decoders/decoder.js';
import { executeQuery, sql } from '../db/database.js';
import mqttService from './mqttService.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

class MQTTListenerService {
  constructor() {
    this.client = null;
  }

  connect() {
    const host = process.env.MQTT_BROKER_HOST;
    if (!host) { logger.warn('MQTT_BROKER_HOST not set — listener disabled'); return; }

    this.client = mqtt.connect({
      host,
      port: parseInt(process.env.MQTT_BROKER_PORT || '1883'),
      username: process.env.MQTT_BACKEND_USER,
      password: process.env.MQTT_BACKEND_PASSWORD,
      clientId: 'genvolt-listener-' + Math.random().toString(16).substr(2, 8),
      clean: true,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      logger.info('MQTT Listener connected');
      // Subscribe to pre-activation (device boot)
      this.client.subscribe('cloudsynk/pre-activation', { qos: 1 });
      // Subscribe to all IMEI telemetry topics
      this.client.subscribe('cloudsynk/+/telemetry', { qos: 1 });
      logger.info('Subscribed: cloudsynk/pre-activation, cloudsynk/+/telemetry');
    });

    this.client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (topic === 'cloudsynk/pre-activation') {
          this.handlePreActivation(payload);
        } else if (topic.endsWith('/telemetry')) {
          const imei = topic.split('/')[1]; // cloudsynk/<IMEI>/telemetry
          this.handleTelemetry(imei, payload);
        }
      } catch (err) {
        logger.error(`Listener parse error on ${topic}:`, err.message);
      }
    });

    this.client.on('error', (err) => logger.error('MQTT Listener error:', err.message));
  }

  async handlePreActivation(payload) {
    const imei = payload?.IMEI;
    if (!imei) { logger.warn('Pre-activation: missing IMEI'); return; }
    logger.info(`Pre-activation received: IMEI=${imei}`);

    // Check if device exists
    const result = await executeQuery(
      `SELECT device_id, activation_status, mqtt_password FROM dbo.device WHERE imei = @imei`,
      [{ name: 'imei', type: sql.NVarChar, value: imei }]
    );

    if (result.recordset.length === 0) {
      // New device — auto-create as PENDING
      await executeQuery(
        `INSERT INTO dbo.device (imei, activation_status, onboarding_date)
         VALUES (@imei, 'PENDING', GETUTCDATE())`,
        [{ name: 'imei', type: sql.NVarChar, value: imei }]
      );
      logger.info(`Auto-registered new device: IMEI=${imei} — awaiting admin activation`);
      return;
    }

    const device = result.recordset[0];

    if (device.activation_status === 'ACTIVE') {
      // Device rebooted — resend telemetryConfig (retain:true will deliver on reconnect)
      // Note: we can't resend plain-text password (it's hashed). The device should
      // retain credentials in its own persistent storage. Only resend isActive=1.
      logger.info(`Active device rebooted: IMEI=${imei} — telemetryConfig already retained on broker`);
      // The retained message on cloudsynk/<IMEI>/config will be delivered automatically.
    }

    if (device.activation_status === 'PENDING') {
      logger.info(`Pending device reconnected: IMEI=${imei} — still awaiting admin activation`);
    }
  }

  async handleTelemetry(imei, payload) {
    const { deviceId, logicId, field1, created_at } = payload;
    if (!deviceId || logicId === undefined) {
      logger.warn(`Telemetry missing required fields from IMEI=${imei}`);
      return;
    }

    // Decode hex payload
    let decoded = null;
    try {
      decoded = decode(logicId, field1);
    } catch (err) {
      logger.warn(`Decoder error logicId=${logicId}: ${err.message}`);
    }

    // Store to DB
    await executeQuery(
      `INSERT INTO dbo.DeviceTelemetry (device_id, imei, logic_id, raw_payload, decoded_data, received_at)
       VALUES (@deviceId, @imei, @logicId, @raw, @decoded, GETUTCDATE())`,
      [
        { name: 'deviceId', type: sql.NVarChar, value: deviceId },
        { name: 'imei',     type: sql.NVarChar, value: imei },
        { name: 'logicId',  type: sql.Int,       value: logicId },
        { name: 'raw',      type: sql.NVarChar,  value: JSON.stringify(payload) },
        { name: 'decoded',  type: sql.NVarChar,  value: decoded ? JSON.stringify(decoded) : null },
      ]
    );

    logger.info(`Telemetry stored: device=${deviceId} logicId=${logicId}`);
  }
}

export default new MQTTListenerService();
```

**Start listener in `server/server.js`:**

```javascript
import mqttListenerService from './services/mqttListenerService.js';

// After app starts:
mqttListenerService.connect();
```

---

## 7. Telemetry Decoders

### 7.1 Dispatcher: `server/decoders/decoder.js`

```javascript
import { decodeLogic1 } from './logicId1.js';
import { decodeLogic2 } from './logicId2.js';
import { decodeLogic3 } from './logicId3.js';

const DECODERS = {
  1: decodeLogic1,
  2: decodeLogic2,
  3: decodeLogic3,
};

export function decode(logicId, hexField) {
  const decoder = DECODERS[logicId];
  if (!decoder) throw new Error(`No decoder registered for logicId=${logicId}`);
  if (!hexField) return null;
  const buf = Buffer.from(hexField, 'hex');
  return decoder(buf);
}
```

### 7.2 `server/decoders/logicId1.js` — Voltage decoder (sample)

```javascript
/**
 * LogicId 1 — Voltage / Power payload (sample skeleton)
 * Actual byte offsets to be filled in once firmware spec is confirmed.
 */
export function decodeLogic1(buf) {
  return {
    logic_id: 1,
    voltage_mv:    buf.readUInt16BE(0),    // bytes 0-1: voltage in millivolts
    current_ma:    buf.readUInt16BE(2),    // bytes 2-3: current in milliamps
    power_mw:      buf.readUInt32BE(4),    // bytes 4-7: power in milliwatts
    raw_hex:       buf.toString('hex'),
  };
}
```

### 7.3 `server/decoders/logicId2.js` — Temperature decoder (sample)

```javascript
/**
 * LogicId 2 — Temperature / Environment payload (sample skeleton)
 */
export function decodeLogic2(buf) {
  return {
    logic_id: 2,
    temperature_c:   (buf.readInt16BE(0) / 100).toFixed(2),  // bytes 0-1: temp × 100
    humidity_pct:    (buf.readUInt16BE(2) / 100).toFixed(2), // bytes 2-3: humidity × 100
    pressure_hpa:    buf.readUInt32BE(4),                    // bytes 4-7: pressure
    raw_hex:         buf.toString('hex'),
  };
}
```

### 7.4 `server/decoders/logicId3.js` — GPS decoder (sample)

```javascript
/**
 * LogicId 3 — GPS / Location payload (sample skeleton)
 * Example field1: "320c140a4a0016000006f6f5000d1e5d0025..."
 */
export function decodeLogic3(buf) {
  return {
    logic_id:    3,
    latitude:    (buf.readInt32BE(0) / 1e6).toFixed(6),   // bytes 0-3: lat × 1e6
    longitude:   (buf.readInt32BE(4) / 1e6).toFixed(6),   // bytes 4-7: lng × 1e6
    altitude_m:  buf.readUInt16BE(8),                      // bytes 8-9: altitude m
    speed_kmh:   buf.readUInt16BE(10),                     // bytes 10-11: speed
    satellites:  buf.readUInt8(12),                        // byte 12: sat count
    raw_hex:     buf.toString('hex'),
  };
}
```

> **Note:** Byte offsets are placeholders. Replace with actual firmware binary layout when available.

---

## 8. MQTT Auth Hook Changes

**File:** `server/routes/mqttAuthRoutes.js`

### 8.1 Changes required

The `adddevice` user is configured at the MQTT broker level — **no changes to the auth hook**.

For device authentication (ACL check), the topic pattern changes from
`cloudsynk/<clientId>/<deviceId>/telemetry` → `cloudsynk/<IMEI>/telemetry`.

**Updated topic checks for ACTIVE devices:**

```javascript
// OLD:
const telemetryTopic = `cloudsynk/${device.client_id}/${username}/telemetry`;
const configTopic    = `cloudsynk/${device.client_id}/${username}/config`;

// NEW (add imei lookup to device query):
const telemetryTopic = `cloudsynk/${device.imei}/telemetry`;
const configTopic    = `cloudsynk/${device.imei}/config`;
```

**DB query must include `imei`** (add to existing SELECT):
```sql
SELECT device_id, client_id, activation_status, data_enabled, paused_by, imei
FROM dbo.device
WHERE mqtt_username = @username
```

### 8.2 PENDING device check

Currently the hook allows PENDING devices to publish to `cloudsynk/pre-activation`. In the new flow, PENDING devices use the `adddevice` user (broker-level, never hits the hook). **Remove the PENDING special case from the hook** — any device reaching the hook has already authenticated as a named user, meaning it's post-activation.

### 8.3 MQTT Broker ACL Configuration (Mosquitto / EMQX)

Broker-level static credentials to add:

```
# Mosquitto: /etc/mosquitto/passwd (run mosquitto_passwd -b)
adddevice : admin@123

# Mosquitto ACL file: /etc/mosquitto/acl
user adddevice
topic write cloudsynk/pre-activation
topic read cloudsynk/+/config
```

---

## 9. Frontend — Client Device Dashboard

**New route:** `/admin/clients/:clientId/devices`
**New file:** `client/src/pages/Admin/ClientDeviceDashboard.jsx`
**Entry point:** "Manage Devices" button in `ClientManagement.jsx`

### 9.1 Page Layout

```
┌──────────────────────────────────────────────────────┐
│ ← Back to Clients    [ClientName] — Device Management │
├─────────────┬──────────────┬───────────┬─────────────┤
│ Total       │ Active       │ Pending   │ Inactive    │
├─────────────┴──────────────┴───────────┴─────────────┤
│ [Search...] [Status ▼]    Tabs: All | Pending        │
├──────────────────────────────────────────────────────┤
│ Device Table                                         │
└──────────────────────────────────────────────────────┘
```

### 9.2 Device Table

| Column | Source |
|---|---|
| Device ID | `device.device_id` (IMEI if not yet assigned) |
| IMEI | `device.imei` |
| Model | `device.Model` badge |
| Status | `activation_status` + `data_enabled` badge |
| Last Seen | `device.last_seen` |
| Actions | see below |

### 9.3 Action Buttons per Row

| Status | Condition | Button | Color | Action |
|---|---|---|---|---|
| PENDING | `canOnboardDevice` | Activate | Green `BoltIcon` | Opens `ActivateDeviceModal` with `fixedClientId` |
| ACTIVE + data_enabled | `canEditDevice` | Push Config | Indigo `AdjustmentsHorizontalIcon` | Opens `DeviceConfigModal` |
| ACTIVE + data_enabled | `canPauseResume` | Pause | Amber `PauseCircleIcon` | Inline confirm |
| ACTIVE + !data_enabled | `canPauseResume` | Resume | Green `PlayCircleIcon` | Direct call |
| ACTIVE | `canEditDevice` | Deactivate | Red `NoSymbolIcon` | Opens `DeactivateDeviceModal` |
| INACTIVE | `canOnboardDevice` | Reactivate | Blue `ArrowPathIcon` | Direct call |

### 9.4 New Modal: `DeviceConfigModal.jsx`

**File:** `client/src/components/modals/DeviceConfigModal.jsx`

Two-tab modal combining config push and credential rotation.

**Tab 1 — Config Update**
Pushes `config_update` to `cloudsynk/<IMEI>/config` via `POST /api/devices/:deviceId/config-push`.

```jsx
const [config, setConfig] = useState({
  Motor_ON_Time_sec:  20,
  Motor_OFF_Time_min: 15,
  Wheel_Threshold:    5,
});
// Calls: deviceService.pushDeviceConfig(device.device_id, config)
```

**Tab 2 — Rotate Credentials**
Calls `POST /api/devices/:deviceId/rotate-credentials`. No user input required — server generates new credentials and pushes `telemetryConfig` directly to the device.

UI shows:
- Warning: "This will disconnect the device and force it to reconnect with new MQTT credentials."
- "Rotate Credentials" confirm button
- Success: "New credentials sent to device via MQTT"

```jsx
const handleRotate = async () => {
  setRotating(true);
  await deviceService.rotateDeviceCredentials(device.device_id);
  setRotateSuccess(true);
  setRotating(false);
};
```

**State:**
```javascript
const [activeTab,     setActiveTab]     = useState('config'); // 'config' | 'credentials'
const [config,        setConfig]        = useState({ Motor_ON_Time_sec: 20, Motor_OFF_Time_min: 15, Wheel_Threshold: 5 });
const [pushing,       setPushing]       = useState(false);
const [rotating,      setRotating]      = useState(false);
const [rotateSuccess, setRotateSuccess] = useState(false);
const [error,         setError]         = useState(null);
```

### 9.5 Modified: `ActivateDeviceModal.jsx`

Add optional `fixedClientId` prop. When present:
- Skip loading client list
- Hide client dropdown, show client name as read-only text
- Pre-set `selectedClientId = fixedClientId`

### 9.6 Changes to `ClientManagement.jsx`

Add "Manage Devices" icon button per row:

```jsx
import { ServerStackIcon } from '@heroicons/react/24/outline';
const navigate = useNavigate();

// In table row actions:
{canViewDevice && (
  <button
    onClick={() => navigate(`/admin/clients/${client.client_id}/devices`)}
    title="Manage Devices"
    className="text-indigo-600 hover:text-indigo-900"
  >
    <ServerStackIcon className="w-4 h-4" />
  </button>
)}
```

### 9.7 `client/src/services/deviceService.js` — new methods

```javascript
pushDeviceConfig: (deviceId, config) =>
  api.post(`/devices/${deviceId}/config-push`, config),

rotateDeviceCredentials: (deviceId) =>
  api.post(`/devices/${deviceId}/rotate-credentials`),
```

### 9.8 App.jsx new route

```jsx
import ClientDeviceDashboard from './pages/Admin/ClientDeviceDashboard';

<Route
  path="/admin/clients/:clientId/devices"
  element={
    <ProtectedRoute>
      <Layout>
        <ClientDeviceDashboard />
      </Layout>
    </ProtectedRoute>
  }
/>
```

---

## 10. Device Simulator

**New file:** `simulator/device-simulator.js`

Simulates a physical device going through the full lifecycle: boot → pre-activation → receive config → send telemetry.

```javascript
#!/usr/bin/env node
/**
 * CloudSynk Device Simulator
 * Usage: node simulator/device-simulator.js [--imei <IMEI>] [--logicId <1|2|3>] [--interval <ms>]
 */

import mqtt from 'mqtt';

const IMEI          = process.argv[3] || '350938241548715';
const LOGIC_ID      = parseInt(process.argv[5] || '3');
const INTERVAL_MS   = parseInt(process.argv[7] || '5000');
const BROKER        = 'mqtt://mqtt.cloudsynk.net:1883';

let credentials = { username: 'adddevice', password: 'admin@123' };
let deviceId    = null;
let isActive    = 0;
let client      = null;

function connect() {
  console.log(`[SIM] Connecting as ${credentials.username}...`);
  client = mqtt.connect(BROKER, {
    username:  credentials.username,
    password:  credentials.password,
    clientId:  `simulator-${IMEI}-${Date.now()}`,
    clean:     true,
    reconnectPeriod: 0, // manual reconnect after activation
  });

  client.on('connect', () => {
    console.log(`[SIM] Connected as ${credentials.username}`);

    // Subscribe to config topic (hardcoded IMEI-based)
    const configTopic = `cloudsynk/${IMEI}/config`;
    client.subscribe(configTopic, { qos: 1 }, () => {
      console.log(`[SIM] Subscribed to ${configTopic}`);
    });

    if (credentials.username === 'adddevice') {
      // Boot: publish pre-activation
      const bootPayload = JSON.stringify({ IMEI });
      client.publish('cloudsynk/pre-activation', bootPayload, { qos: 1 }, () => {
        console.log(`[SIM] Boot message sent: ${bootPayload}`);
      });
    } else if (isActive) {
      // Post-activation: start telemetry
      startTelemetry();
    }
  });

  client.on('message', (topic, message) => {
    try {
      const msg = JSON.parse(message.toString());
      console.log(`[SIM] Received on ${topic}:`, JSON.stringify(msg, null, 2));

      if (msg.type === 'telemetryConfig') {
        console.log('[SIM] Received telemetryConfig — reconnecting with new credentials');
        deviceId = msg.mqtt_username;
        isActive = msg.isActive;
        credentials = {
          username: msg.mqtt_username,
          password: msg.mqtt_password,
        };
        client.end(false, () => {
          setTimeout(connect, 1000); // reconnect with telemetry credentials
        });
      }

      if (msg.type === 'config_update') {
        console.log('[SIM] Config update received — echoing back on telemetry');
        const echoTopic = `cloudsynk/${IMEI}/telemetry`;
        const echoPayload = JSON.stringify({
          deviceId,
          logicId: LOGIC_ID,
          field1: generateHexPayload(LOGIC_ID, msg),
          config_echo: msg,
          created_at: new Date().toISOString(),
        });
        client.publish(echoTopic, echoPayload, { qos: 1 });
      }

      if (msg.type === 'deactivation_notice') {
        console.log('[SIM] Deactivated — stopping telemetry');
        isActive = 0;
        client.end();
      }
    } catch (e) {
      console.error('[SIM] Parse error:', e.message);
    }
  });

  client.on('error',   (e) => console.error('[SIM] Error:', e.message));
  client.on('offline', ()  => console.log('[SIM] Offline'));
}

function startTelemetry() {
  console.log(`[SIM] Starting telemetry every ${INTERVAL_MS}ms on cloudsynk/${IMEI}/telemetry`);
  setInterval(() => {
    if (!isActive || !client?.connected) return;
    const payload = JSON.stringify({
      deviceId,
      logicId: LOGIC_ID,
      field1:  generateHexPayload(LOGIC_ID),
      created_at: new Date().toISOString(),
    });
    client.publish(`cloudsynk/${IMEI}/telemetry`, payload, { qos: 1 }, () => {
      console.log(`[SIM] Telemetry sent: ${payload}`);
    });
  }, INTERVAL_MS);
}

function generateHexPayload(logicId, config = {}) {
  // Generates a realistic-looking hex buffer per logicId
  const buf = Buffer.alloc(32);
  if (logicId === 1) {
    // Voltage: 3700mV, Current: 500mA, Power: 1850mW
    buf.writeUInt16BE(3700 + Math.floor(Math.random() * 100), 0);
    buf.writeUInt16BE(500  + Math.floor(Math.random() * 50),  2);
    buf.writeUInt32BE(1850 + Math.floor(Math.random() * 200), 4);
  } else if (logicId === 2) {
    // Temperature: 25.50°C, Humidity: 60.00%
    buf.writeInt16BE(2550 + Math.floor(Math.random() * 500), 0);
    buf.writeUInt16BE(6000 + Math.floor(Math.random() * 1000), 2);
    buf.writeUInt32BE(101325, 4); // pressure Pa
  } else if (logicId === 3) {
    // GPS: Bangalore approx (12.9716, 77.5946)
    buf.writeInt32BE(Math.round((12.9716 + (Math.random() - 0.5) * 0.01) * 1e6), 0);
    buf.writeInt32BE(Math.round((77.5946 + (Math.random() - 0.5) * 0.01) * 1e6), 4);
    buf.writeUInt16BE(920, 8);  // altitude m
    buf.writeUInt16BE(0,   10); // speed km/h
    buf.writeUInt8(8,      12); // satellites
  }
  return buf.toString('hex');
}

connect();
```

**Usage:**
```bash
# Default: IMEI=350938241548715, logicId=3, interval=5s
node simulator/device-simulator.js

# Custom:
node simulator/device-simulator.js --imei 123456789012345 --logicId 1 --interval 3000
```

---

## 11. Database Migration SQL

Run in DBeaver while connected to `cs_db_dev`:

```sql
-- ─────────────────────────────────────────────────────────────
-- 1. Add IMEI column to device table
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.device') AND name = 'imei'
)
BEGIN
  ALTER TABLE dbo.device ADD
    imei NVARCHAR(20) NULL;

  CREATE UNIQUE INDEX IX_device_imei
    ON dbo.device (imei)
    WHERE imei IS NOT NULL;

  PRINT 'Added imei column to dbo.device';
END
ELSE
  PRINT 'dbo.device.imei already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 2. Create DeviceTelemetry table
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE schema_id = SCHEMA_ID('dbo') AND name = 'DeviceTelemetry'
)
BEGIN
  CREATE TABLE dbo.DeviceTelemetry (
    telemetry_id  BIGINT         IDENTITY(1,1) PRIMARY KEY,
    device_id     NVARCHAR(50)   NOT NULL,
    imei          NVARCHAR(20)   NULL,
    logic_id      INT            NOT NULL,
    raw_payload   NVARCHAR(MAX)  NOT NULL,
    decoded_data  NVARCHAR(MAX)  NULL,
    received_at   DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );

  CREATE INDEX IX_DeviceTelemetry_device
    ON dbo.DeviceTelemetry (device_id, received_at DESC);

  CREATE INDEX IX_DeviceTelemetry_imei
    ON dbo.DeviceTelemetry (imei, received_at DESC);

  PRINT 'Created table: dbo.DeviceTelemetry';
END
ELSE
  PRINT 'Table dbo.DeviceTelemetry already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 3. Make device_id nullable (G1 — auto-registered devices via pre-activation)
-- ─────────────────────────────────────────────────────────────
-- Only needed if device_id is currently NOT NULL.
-- Check first: SELECT is_nullable FROM sys.columns WHERE object_id = OBJECT_ID('dbo.device') AND name = 'device_id'
ALTER TABLE dbo.device ALTER COLUMN device_id NVARCHAR(50) NULL;
PRINT 'Made dbo.device.device_id nullable';

-- ─────────────────────────────────────────────────────────────
-- 4. Add mqtt_password_plain for reboot recovery (G2)
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.device') AND name = 'mqtt_password_plain'
)
BEGIN
  ALTER TABLE dbo.device ADD
    mqtt_password_plain NVARCHAR(100) NULL;
  PRINT 'Added mqtt_password_plain to dbo.device';
END
ELSE
  PRINT 'dbo.device.mqtt_password_plain already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 5. v3.0 changes (from migrate_v3.sql — run if not already done)
-- ─────────────────────────────────────────────────────────────
-- See scripts/migrate_v3.sql for the full v3.0 migration.
-- Run migrate_v3.sql first if not already applied.
```

---

## 12. Gaps & Resolutions

Gaps found during plan review. All resolved below.

### G1 — `device_id` nullable for auto-registered devices
**Gap:** `handlePreActivation` inserts a row with only `imei`. The `device` table likely has NOT NULL on `device_id`.
**Resolution:** Migration must make `device_id` nullable (`NULL` allowed). When admin activates and assigns the device, they supply `device_id` (e.g., "HY2030"). Until then, `device_id = NULL`. The pending devices tab in `ClientDeviceDashboard` shows IMEI as the identifier.

```sql
-- Add to migration SQL:
ALTER TABLE dbo.device ALTER COLUMN device_id NVARCHAR(50) NULL;
```

### G2 — Reboot recovery: password is hashed in DB
**Gap:** When an ACTIVE device reboots and publishes to `cloudsynk/pre-activation`, the plan logs "retained message will deliver automatically" — but this only works if the broker's retained message store is persistent. If the broker restarts, the retained `telemetryConfig` is lost.
**Resolution:** Store the plain-text password in a new column `mqtt_password_plain NVARCHAR(100) NULL` (encrypted or accept the risk in dev). On reboot of an ACTIVE device, the pre-activation handler explicitly re-publishes `telemetryConfig` with the stored plain-text password.

```sql
ALTER TABLE dbo.device ADD mqtt_password_plain NVARCHAR(100) NULL;
```

Updated `handlePreActivation`:
```javascript
if (device.activation_status === 'ACTIVE' && device.mqtt_password_plain) {
  await mqttService.publishTelemetryConfig(imei, device.device_id, device.mqtt_password_plain);
  logger.info(`Resent telemetryConfig on reboot: IMEI=${imei}`);
}
```

Updated `rotateDeviceCredentials` and `activateDevice`: also save `mqtt_password_plain` alongside the hash.

> **Security note:** For production, encrypt `mqtt_password_plain` using `AES-256` with a server-side key from `process.env.DEVICE_SECRET_KEY` before storing.

### G3 — Missing telemetry API endpoints
**Gap:** `DeviceTelemetry` table exists but no GET endpoints are defined. `DeviceDetailPage` has nothing to read from.
**Resolution:** Add two new endpoints:

```javascript
// server/routes/deviceRoutes.js
router.get('/:deviceId/telemetry',         requirePermission('View Device'), getDeviceTelemetry);
router.get('/:deviceId/telemetry/latest',  requirePermission('View Device'), getLatestTelemetry);
```

`getDeviceTelemetry` — paginated, optional `logicId` filter, last N records.
`getLatestTelemetry` — returns the single most recent decoded record per logicId.

Add to `deviceService.js`:
```javascript
getDeviceTelemetry: (deviceId, params) =>
  api.get(`/devices/${deviceId}/telemetry`, { params }),
getLatestTelemetry: (deviceId) =>
  api.get(`/devices/${deviceId}/telemetry/latest`),
```

### G4 — `DeviceDetailPage` not updated for new telemetry source
**Gap:** `DeviceDetailPage.jsx` reads from `DeviceDetailContext` / existing data source. With `DeviceTelemetry` table, it needs to use the new endpoints.
**Resolution:** Update `DeviceDetailContext` to call `getLatestTelemetry(deviceId)` and populate the existing card components. The decoded JSON fields map directly to the existing card field names.

### G5 — `devicePauseService.js` doesn't load IMEI
**Gap:** The service calls `pushConfigUpdate(clientId, deviceId, ...)` but the new signature is `pushConfigUpdate(imei, config)`. The service doesn't currently load the full device record.
**Resolution:** Add IMEI lookup at the start of `pauseDevice` / `resumeDevice`:

```javascript
const deviceRecord = await executeQuery(
  `SELECT imei FROM dbo.device WHERE device_id = @deviceId`,
  [{ name: 'deviceId', type: sql.NVarChar, value: deviceId }]
);
const imei = deviceRecord.recordset[0]?.imei;
if (!imei) throw new Error(`Device ${deviceId} has no IMEI`);
await mqttService.pushConfigUpdate(imei, { data_enabled: false, timestamp: new Date().toISOString() });
```

### G6 — Backend MQTT user ACL not documented
**Gap:** `MQTT_BACKEND_USER` connects as the backend service and publishes/subscribes to many topics. The broker must allow it.
**Resolution:** Add to broker ACL:

```
# Mosquitto ACL:
user <MQTT_BACKEND_USER>
topic readwrite #
# OR scope it more tightly:
topic write cloudsynk/+/config
topic read  cloudsynk/pre-activation
topic read  cloudsynk/+/telemetry
```

### G7 — `TopicPatternConfig` / `ClientTopicConfig` now obsolete
**Gap:** v3.0 built `TopicPatternConfig.jsx`, `ClientTopicConfig` model, `topicConfigController.js`, `topicConfigRoutes.js`, and `topicConfigService.js`. Topics are now IMEI-based and non-configurable per client.
**Resolution:** Remove from production navigation. Keep the code but hide the sidebar link:
```jsx
// In Sidebar.jsx — remove or comment out:
// {hasAnyPermission(['Manage Topic Config']) && <NavLink to="/admin/topic-config">Topic Config</NavLink>}
```
The DB table `ClientTopicConfig` can stay (no harm), and the API routes can stay (no active harm), but the UI entry point should be removed to avoid confusion.

### G8 — EMQX vs Mosquitto inconsistency
**Gap:** Architecture diagram says "EMQX", broker config sections say "Mosquitto".
**Resolution:** Choose Mosquitto (simpler, already in use). All broker config examples use Mosquitto. If EMQX is the actual broker, ACL format differs — adjust accordingly.

### G9 — Simulator uses positional `process.argv` parsing
**Gap:** `process.argv[3]`, `[5]`, `[7]` breaks if flags are reordered.
**Resolution:** Replace with `minimist` or simple flag parsing:
```javascript
const args = process.argv.slice(2).reduce((acc, val, i, arr) => {
  if (val.startsWith('--')) acc[val.slice(2)] = arr[i + 1];
  return acc;
}, {});
const IMEI       = args.imei     || '350938241548715';
const LOGIC_ID   = parseInt(args.logicId   || '3');
const INTERVAL_MS = parseInt(args.interval || '5000');
```

### G10 — mqttAuthRoutes.js in-memory cache needs simplification
**Gap:** The v3.0 plan added a `Map` cache with 30s TTL to store topic configs per client. This cache was based on `ClientTopicConfig` (now obsolete). The cache should be simplified to cache device records by `mqtt_username`.
**Resolution:** Keep the cache but change its key from `clientId` to `mqtt_username` and cache `{ imei, activation_status, data_enabled, paused_by }` per device, with 30s TTL.

### G11 — `activate` assigns `device_id` from request body, but auto-registered devices have none
**Gap:** Pre-activation creates rows with `device_id = NULL`. When admin activates, the request body must include a `device_id` (the human-readable name like "HY2030").
**Resolution:** Require `device_id` in the activate request body if the device's current `device_id` is NULL. Update `activateDevice` controller:
```javascript
if (!device.device_id) {
  if (!req.body.device_id) return res.status(400).json({ error: 'device_id required for new devices' });
  // Set device_id in DB as part of activation
}
```
Update `ActivateDeviceModal` to show a "Device ID" input field when activating a device that came in via pre-activation (i.e., has no `device_id` yet).

---

## 13. Implementation Order

| Step | Task | Gap ref | Files |
|---|---|---|---|
| 1 | Run full migration SQL (imei, device_id nullable, mqtt_password_plain, DeviceTelemetry) | G1, G2 | DBeaver `cs_db_dev` |
| 2 | Configure Mosquitto — `adddevice` user + backend user ACL | G6, §8.3 | Broker config |
| 3 | Update `mqttService.js` — replace all topic methods, add `publishTelemetryConfig` | §5.1 | `mqttService.js` |
| 4 | Update `deviceController.js` — activate/deactivate/reactivate use IMEI + save `mqtt_password_plain`; `device_id` assignment for pre-activated devices | G2, G11, §5.2 | `deviceController.js` |
| 5 | Add `pushDeviceConfig` + `rotateDeviceCredentials` handlers + routes | §5.3, §5.5 | `deviceController.js`, `deviceRoutes.js` |
| 6 | Add telemetry GET handlers + routes | G3 | `deviceController.js`, `deviceRoutes.js` |
| 7 | Update `devicePauseService.js` — IMEI lookup before MQTT calls | G5, §5.4 | `devicePauseService.js` |
| 8 | Write decoders | §7 | `server/decoders/` |
| 9 | Write `mqttListenerService.js` — pre-activation (with reboot recovery) + telemetry handler | G2, §6 | `mqttListenerService.js` |
| 10 | Start listener in `server.js` | §6 | `server.js` |
| 11 | Update MQTT ACL hook — IMEI topics, remove PENDING case, simplify cache | G10, §8 | `mqttAuthRoutes.js` |
| 12 | Update `DeviceDetailContext` to use new telemetry endpoint | G4 | `DeviceDetailContext.jsx` |
| 13 | Remove Topic Config from sidebar nav | G7 | `Sidebar.jsx` |
| 14 | Add `pushDeviceConfig` + `rotateDeviceCredentials` to `deviceService.js` | §9.7 | `deviceService.js` |
| 15 | Write `DeviceConfigModal.jsx` (2-tab: config update + rotate credentials) | §9.4 | `DeviceConfigModal.jsx` |
| 16 | Update `ActivateDeviceModal.jsx` — `fixedClientId` + `device_id` input for pre-activated | G11, §9.5 | `ActivateDeviceModal.jsx` |
| 17 | Write `ClientDeviceDashboard.jsx` | §9.1–9.3 | `ClientDeviceDashboard.jsx` |
| 18 | Add "Manage Devices" button to `ClientManagement.jsx` | §9.6 | `ClientManagement.jsx` |
| 19 | Register `ClientDeviceDashboard` route in `App.jsx` | §9.8 | `App.jsx` |
| 20 | Fix simulator arg parsing + update for credential rotation handling | G9 | `simulator/device-simulator.js` |
| 21 | Run CLIENT_ADMIN permission grants SQL | §10 | DBeaver `cs_db_dev` |

---

## 14. Files — New & Modified

### New Files

| File | Purpose |
|---|---|
| `server/services/mqttListenerService.js` | MQTT subscriber — replaces Python |
| `server/decoders/decoder.js` | LogicId dispatcher |
| `server/decoders/logicId1.js` | Voltage decoder (sample) |
| `server/decoders/logicId2.js` | Temperature decoder (sample) |
| `server/decoders/logicId3.js` | GPS decoder (sample) |
| `client/src/pages/Admin/ClientDeviceDashboard.jsx` | Per-client device management page |
| `client/src/components/modals/DeviceConfigModal.jsx` | Config push + credential rotation (2-tab) |
| `simulator/device-simulator.js` | Device simulator for testing |

### Modified Files

| File | Change |
|---|---|
| `server/services/mqttService.js` | Replace topic methods to use IMEI |
| `server/controllers/deviceController.js` | Use IMEI for all MQTT calls; add `pushDeviceConfig` |
| `server/routes/deviceRoutes.js` | Add `config-push`, `rotate-credentials`, telemetry GET routes |
| `server/controllers/deviceController.js` | IMEI-based MQTT calls, save plain password, new handlers |
| `server/services/mqttService.js` | Replace all 3 topic methods |
| `server/services/devicePauseService.js` | IMEI lookup + new pushConfigUpdate signature |
| `server/routes/mqttAuthRoutes.js` | IMEI topics, simplify cache, remove PENDING case |
| `server/server.js` | Start mqttListenerService |
| `client/src/context/DeviceDetailContext.jsx` | Call new telemetry endpoint |
| `client/src/services/deviceService.js` | Add `pushDeviceConfig`, `rotateDeviceCredentials`, telemetry methods |
| `client/src/components/modals/ActivateDeviceModal.jsx` | `fixedClientId` prop + `device_id` input |
| `client/src/components/layout/Sidebar.jsx` | Remove Topic Config nav item |
| `client/src/pages/Admin/ClientManagement.jsx` | Add "Manage Devices" button |
| `client/src/App.jsx` | Register `ClientDeviceDashboard` route |
| `scripts/migrate_v4.sql` | New file — v4 migration (see Section 11) |
