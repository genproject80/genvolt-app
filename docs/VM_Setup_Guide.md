# CloudSynk MQTT Broker - Azure VM Setup Guide

**Reference Document:** MQTT_Implementation_Functional_Document.md (v2.1)
**Date Started:** 2026-03-18
**Updated:** 2026-03-23
**Status:** VM Infrastructure Ready, Subscriber Code Pending

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                    DEVICE LAYER (500-600 devices)                      │
├────────────────────────────────────────────────────────────────────────┤
│  PENDING (First Boot):                                                 │
│    → MQTT PUBLISH: cloudsynk/pre-activation                           │
│      Payload: { device_id, device_type, firmware_version, mac }       │
│    ← MQTT SUBSCRIBE: cloudsynk/pre-activation/response/{device_id}    │
│      (activation payload with credentials + assigned topics)          │
│                                                                        │
│  ACTIVE (Post Activation):                                             │
│    → HTTP GET /api/v1/device-config (Device Config Function App)      │
│      ← Initial config: mqtt_broker, topics, device_settings           │
│    → MQTT PUBLISH: cloudsynk/{client_id}/{device_id}/telemetry        │
│    ← MQTT SUBSCRIBE: cloudsynk/{client_id}/{device_id}/config         │
│                                                                        │
│  INACTIVE:                                                             │
│    → MQTT connection rejected by EMQX auth hook                       │
└────────────────────────────────────────────────────────────────────────┘
                         ↓↑ MQTT TLS Port 8883
┌────────────────────────────────────────────────────────────────────────┐
│              Azure VM (vm-cloudsynk-emqx) - MQTT BROKER                │
├────────────────────────────────────────────────────────────────────────┤
│  EMQX Broker (Docker)                                                  │
│    ├─ Port 1883 (internal only - for local subscriber)               │
│    ├─ Port 8883 (TLS external - for devices & Express backend)        │
│    ├─ Port 18083 (dashboard)                                          │
│    └─ Auth/ACL: HTTP hooks → Express Backend (lifecycle-aware)        │
│                                                                        │
│  Python Subscriber (systemd, persistent session)                       │
│    ├─ Subscribes to: cloudsynk/pre-activation (register PENDING devs) │
│    ├─ Subscribes to: cloudsynk/+/+/telemetry (ACTIVE device data)     │
│    ├─ Decodes hex payload using existing decoders                     │
│    └─ Inserts to Azure SQL: IoT_Raw_Messages + IoT_Data_*             │
└────────────────────────────────────────────────────────────────────────┘
          ↓ SQL INSERT                              ↑ MQTT PUBLISH config
┌────────────────────────────────────────────────────────────────────────┐
│                 Azure SQL Server (sqlserver-cs-db-prod)                │
│                         Database: cs_db_prod                           │
├────────────────────────────────────────────────────────────────────────┤
│  Tables:                                                               │
│    ├─ device (device_id, client_id, activation_status, mqtt_password) │
│    ├─ client_subscription, payment_plan, payment_transaction          │
│    ├─ IoT_Raw_Messages (raw MQTT payloads)                            │
│    ├─ IoT_Data_Sick (decoded SICK P1/P2/P3 data)                      │
│    ├─ IoT_Data_HKMI (decoded HKMI data)                               │
│    └─ IoT_Data_Gas (decoded gas sensor data)                          │
└────────────────────────────────────────────────────────────────────────┘
          ↓ API Queries                              ↑ Config Updates
┌────────────────────────────────────────────────────────────────────────┐
│            Express Backend (genvolt-app-main/server)                   │
├────────────────────────────────────────────────────────────────────────┤
│  HTTP API:                                                             │
│    ├─ GET  /api/devices/pending        (pre-activation list)          │
│    ├─ POST /api/devices/:id/activate   (assign + enable)              │
│    ├─ POST /api/devices/:id/deactivate (disable)                      │
│    ├─ POST /api/mqtt/auth              (EMQX auth hook)               │
│    ├─ POST /api/mqtt/acl               (EMQX ACL hook)                │
│    ├─ GET  /api/dashboard/*            (read telemetry data)          │
│    ├─ PUT  /api/device-config/:deviceId (update config)               │
│    ├─ PATCH /api/device-config/:deviceId/debugmode (toggle debug)    │
│    └─ POST /api/webhooks/razorpay      (payment events)               │
│                                                                        │
│  MQTT Publisher (mqttService.js):                                     │
│    ├─ Connects to: vm-cloudsynk-emqx:8883 (TLS)                       │
│    ├─ Publishes activation payload on device activation               │
│    └─ Pushes real-time config updates to ACTIVE devices               │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ React App
┌────────────────────────────────────────────────────────────────────────┐
│              React Frontend (genvolt-app-main/client)                  │
├────────────────────────────────────────────────────────────────────────┤
│  Admin actions:                                                        │
│    ├─ Pending Devices page → Assign & Activate flow                   │
│    ├─ Deactivate / Re-activate device                                 │
│    ├─ Toggle Debug Mode → Backend → MQTT push config update           │
│    ├─ Change Motor_On_Time → Backend → MQTT push config update        │
│    └─ View real-time telemetry from SQL database                      │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

**Device Lifecycle:**

| State | MQTT Access | How to enter |
|-------|-------------|--------------|
| `PENDING` | Pre-activation topic only | Device first powers on |
| `ACTIVE` | Full telemetry + config topics | Admin assigns + activates |
| `INACTIVE` | Blocked | Admin deactivates / payment lapses |

**Topic Structure:**
- Pre-activation (any device): `cloudsynk/pre-activation`
- Activation response (one-time): `cloudsynk/pre-activation/response/{device_id}`
- Telemetry (active device publishes): `cloudsynk/{client_id}/{device_id}/telemetry`
- Config (active device subscribes): `cloudsynk/{client_id}/{device_id}/config`

**Multi-Tenant Support:**
- Each active device belongs to a `client_id` stored in the database
- Topic pattern automatically isolates clients; PENDING devices share one pre-activation topic

**Debug Mode (UI Concept Only):**
- `debugmode` flag stored in database for UI state tracking only
- When toggled ON, backend translates to actual config changes sent to device:
  - `telemetry_interval`: 300s → 30s
  - `log_level`: "normal" → "verbose"
- Device receives actual config values — never sees "debugmode"
- No device firmware changes needed

**Device Authentication (Database-Backed, Lifecycle-Aware):**
- EMQX calls Express Backend for every connection attempt (`/api/mqtt/auth`)
- EMQX calls Express Backend for every topic access (`/api/mqtt/acl`)
- PENDING devices: allowed to connect, restricted to pre-activation topic by ACL
- ACTIVE devices: verified by bcrypt password comparison
- INACTIVE devices: always denied
- Zero manual EMQX configuration per device

---

## VM Resource Details

| Setting | Value |
|---|---|
| **Subscription** | CloudSynk_Prod |
| **Resource Group** | CloudSynk_Prod |
| **VM Name** | vm-cloudsynk-emqx |
| **Region** | Central India |
| **Image** | Ubuntu Server 24.04 LTS - x64 Gen2 |
| **Size** | Standard B2als_v2 (2 vCPU, 4 GB RAM) |
| **OS Disk** | 30 GiB, Standard SSD LRS |
| **Username** | mqttvm |
| **SSH Key** | vm-cloudsynk-emqx_key.pem |
| **Public IP** | 20.198.101.175 |
| **Current Cost** | ~$24/month |

### NSG Rules (vm-cloudsynk-emqx-nsg)

| Priority | Name | Port | Protocol | Source |
|---|---|---|---|---|
| 1000 | SSH | 22 | TCP | Any |
| 1010 | MQTT | 1883 | TCP | Any |
| 1020 | MQTT-TLS | 8883 | TCP | Any |
| 1030/1040 | EMQX-Dashboard | 18083 | TCP | My IP |

### ⚠️ Planned Infrastructure Changes (Scaling)

When device count grows beyond ~300 or uptime requirements tighten, apply these changes (see [Scaling & HA](#scaling--ha) section below):

| Change | When | Cost Impact |
|--------|------|-------------|
| Add second EMQX VM + Azure Load Balancer | > 300 devices or first prod incident | +~$24/month |
| Azure Cache for Redis (auth/ACL caching) | > 200 devices in debug mode | +~$13/month |
| Azure Service Bus (webhook reliability) | Before payment gateway goes live | +~$1/month |

---

## Completed Steps

### 1. Azure VM Created ✅
- [x] Resource group: CloudSynk_Prod
- [x] VM: vm-cloudsynk-emqx (Standard B2als_v2)
- [x] Ubuntu Server 24.04 LTS
- [x] SSH key generated and downloaded
- [x] NSG rules configured (SSH, MQTT, MQTT-TLS, EMQX Dashboard)
- [x] Quota increased for Basv2 family (0 → 2 vCPUs)

### 2. Docker Installed ✅
```bash
sudo apt update && sudo apt install -y docker.io
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker $USER
```

### 3. EMQX Broker Running ✅

Docker container: `cloudsynk-emqxmqtt-broker`, Image: `emqx/emqx:latest`

```bash
sudo docker run -d --name cloudsynk-emqxmqtt-broker \
  --restart always \
  -p 1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  emqx/emqx:latest
```

Dashboard: `http://20.198.101.175:18083` — default login changed ✅

### 4. Python Environment Prepared ✅
- [x] Python 3.12 (came with Ubuntu 24.04)
- [x] python3-pip, python3-venv installed
- [x] Virtual environment at `/opt/cloudsynk-subscriber/venv`
- [x] `paho-mqtt` 2.1.0 installed
- [x] `pyodbc` 5.3.0 installed

### 5. EMQX Dashboard Password Changed ✅

### 8. ODBC Driver Installed ✅
```bash
curl -s https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
curl -s https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
curl -s https://packages.microsoft.com/config/ubuntu/24.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt update && sudo ACCEPT_EULA=Y apt install -y msodbcsql18 unixodbc-dev
```

### 9. Environment Variables on VM ✅
- `.env` at `/opt/cloudsynk-subscriber/.env`, permissions 600
- Contains: `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `MQTT_BROKER`, `MQTT_PORT`

---

## Remaining Steps

### 6. Write local_subscriber.py

**Location on VM:** `/opt/cloudsynk-subscriber/local_subscriber.py`

**Responsibilities:**
- ✅ Subscribe to `cloudsynk/pre-activation` — register new PENDING devices in SQL
- ✅ Subscribe to `cloudsynk/+/+/telemetry` — receive telemetry from ACTIVE devices
- ✅ Decode payloads using existing decoders (P1/P2/P3/H1/Gas)
- ✅ Insert decoded data to SQL (IoT_Raw_Messages + IoT_Data_*)
- ❌ Does NOT handle config updates or activation (Express Backend handles those)

**Key implementation notes:**

```python
import paho.mqtt.client as mqtt
import json
import pyodbc
import os
from decoders.factory import DecoderFactory

MQTT_CLIENT_ID = "cloudsynk-subscriber-prod"  # Fixed ID — required for persistent session

def on_connect(client, userdata, flags, rc):
    # Subscribe to both topics on every connect (required for persistent session recovery)
    client.subscribe("cloudsynk/pre-activation", qos=1)
    client.subscribe("cloudsynk/+/+/telemetry", qos=1)

def on_message(client, userdata, message):
    topic = message.topic
    if topic == "cloudsynk/pre-activation":
        handle_pre_activation(message)
    else:
        # Topic: cloudsynk/{client_id}/{device_id}/telemetry
        parts = topic.split('/')
        client_id = parts[1]
        device_id = parts[2]
        handle_telemetry(client_id, device_id, message)

def handle_pre_activation(message):
    """Register or update a PENDING device when it first powers on."""
    payload = json.loads(message.payload)
    device_id    = payload.get("device_id")
    device_type  = payload.get("device_type")
    firmware     = payload.get("firmware_version")
    mac_address  = payload.get("mac_address")

    conn = get_db_connection()
    conn.execute("""
        MERGE device AS target
        USING (VALUES (?, ?, ?, ?, GETUTCDATE()))
          AS source (device_id, device_type, firmware_version, mac_address, last_seen)
        ON target.device_id = source.device_id
        WHEN MATCHED THEN
            UPDATE SET last_seen = source.last_seen
        WHEN NOT MATCHED THEN
            INSERT (device_id, device_type, firmware_version, mac_address,
                    activation_status, first_seen, last_seen)
            VALUES (source.device_id, source.device_type, source.firmware_version,
                    source.mac_address, 'PENDING', GETUTCDATE(), GETUTCDATE());
    """, device_id, device_type, firmware, mac_address)
    conn.commit()

def handle_telemetry(client_id, device_id, message):
    """Decode and store telemetry from an ACTIVE device."""
    payload = json.loads(message.payload)
    decoder = DecoderFactory.get_decoder(device_id)
    decoded = decoder.decode(payload.get("data"))

    conn = get_db_connection()
    # Insert raw
    conn.execute(
        "INSERT INTO IoT_Raw_Messages (device_id, client_id, raw_payload, timestamp) VALUES (?, ?, ?, GETUTCDATE())",
        device_id, client_id, message.payload.decode()
    )
    # Insert decoded
    decoded_insert(conn, device_id, client_id, decoded)
    conn.commit()

# IMPORTANT: clean_session=False keeps EMQX buffering messages while subscriber is offline
client = mqtt.Client(client_id=MQTT_CLIENT_ID, clean_session=False)
client.username_pw_set(os.getenv("MQTT_USER"), os.getenv("MQTT_PASSWORD"))
client.on_connect = on_connect
client.on_message = on_message
client.connect(os.getenv("MQTT_BROKER"), int(os.getenv("MQTT_PORT", 1883)))
client.loop_forever()
```

**Why `clean_session=False`:** If the subscriber service restarts or the VM is patched, EMQX will buffer any messages published during the downtime and replay them when the subscriber reconnects. Without this, messages published while the subscriber is offline are lost.

### 7. Copy Decoders to VM

```bash
scp -i ~/Downloads/vm-cloudsynk-emqx_key.pem -r \
  "E:/OneDrive/Genvolt/Development/Sick_Sensor/Http_Ingest/decoders" \
  mqttvm@20.198.101.175:/opt/cloudsynk-subscriber/
```

Decoder files needed:
- `decoders/factory.py`
- `decoders/base.py`
- `decoders/device_decoders/p1_fault_decoder.py`
- `decoders/device_decoders/p2_sick_decoder.py`
- `decoders/device_decoders/p3_sick_decoder.py`
- `decoders/device_decoders/h1_hypure_decoder.py`
- `decoders/device_decoders/default.py`

### 10. Create systemd Service

```bash
sudo tee /etc/systemd/system/cloudsynk-subscriber.service > /dev/null <<'EOF'
[Unit]
Description=CloudSynk MQTT Subscriber
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=mqttvm
WorkingDirectory=/opt/cloudsynk-subscriber
ExecStart=/opt/cloudsynk-subscriber/venv/bin/python local_subscriber.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=/opt/cloudsynk-subscriber/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable cloudsynk-subscriber
sudo systemctl start cloudsynk-subscriber
```

**After starting, verify:**
```bash
sudo systemctl status cloudsynk-subscriber
# Expected: Active: active (running)

sudo journalctl -u cloudsynk-subscriber -f
# Expected: "Connected to EMQX" and "Subscribed to cloudsynk/pre-activation"
```

### 10a. Configure Express Backend MQTT Publisher

**Purpose:** Enable Express Backend to push activation payloads and real-time config updates to devices via MQTT.

**1. Install MQTT client library:**
```bash
cd /path/to/genvolt-app-main/server
npm install mqtt
```

**2. Add environment variables to Express Backend `.env`:**
```env
MQTT_BROKER_HOST=20.198.101.175
MQTT_BROKER_PORT=8883
MQTT_BROKER_TLS=true
MQTT_BACKEND_USER=backend_publisher
MQTT_BACKEND_PASSWORD=your_secure_password_here
```

**3. Create MQTT service** (`server/services/mqttService.js`):

```javascript
import mqtt from 'mqtt';
import { logger } from '../utils/logger.js';

class MQTTService {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  connect() {
    const options = {
      host: process.env.MQTT_BROKER_HOST,
      port: parseInt(process.env.MQTT_BROKER_PORT),
      protocol: process.env.MQTT_BROKER_TLS === 'true' ? 'mqtts' : 'mqtt',
      username: process.env.MQTT_BACKEND_USER,
      password: process.env.MQTT_BACKEND_PASSWORD,
      clientId: 'genvolt-backend-' + Math.random().toString(16).substr(2, 8),
      clean: true,
      reconnectPeriod: 5000,
      rejectUnauthorized: false  // For self-signed certs in dev
    };

    this.client = mqtt.connect(options);

    this.client.on('connect', () => {
      this.connected = true;
      logger.info('MQTT Service connected to broker');
    });

    this.client.on('error', (err) => {
      logger.error('MQTT Service error:', err);
      this.connected = false;
    });
  }

  async pushConfigUpdate(clientId, deviceId, config) {
    if (!this.connected) {
      logger.warn('MQTT not connected, config saved but not pushed');
      return false;
    }

    const topic = `cloudsynk/${clientId}/${deviceId}/config`;
    const payload = {
      type: 'config_update',
      timestamp: new Date().toISOString(),
      ...config
    };

    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) {
          logger.error(`Failed to publish config to ${topic}:`, err);
          reject(err);
        } else {
          logger.info(`Config pushed to ${topic}`);
          resolve(true);
        }
      });
    });
  }

  async publishActivationPayload(deviceId, clientId, mqttPassword, initialConfig) {
    if (!this.connected) {
      logger.warn('MQTT not connected, cannot publish activation payload');
      return false;
    }

    const topic = `cloudsynk/pre-activation/response/${deviceId}`;
    const payload = {
      status: 'activated',
      client_id: clientId,
      telemetry_topic: `cloudsynk/${clientId}/${deviceId}/telemetry`,
      config_topic: `cloudsynk/${clientId}/${deviceId}/config`,
      mqtt_username: deviceId,
      mqtt_password: mqttPassword,
      config: initialConfig
    };

    return new Promise((resolve, reject) => {
      // retain: true ensures device gets the payload even if it reconnects after activation
      this.client.publish(topic, JSON.stringify(payload), { qos: 1, retain: true }, (err) => {
        if (err) {
          logger.error(`Failed to publish activation to ${topic}:`, err);
          reject(err);
        } else {
          logger.info(`Activation payload published to ${topic}`);
          resolve(true);
        }
      });
    });
  }

  disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}

export default new MQTTService();
```

**4. Initialize in server.js:**
```javascript
import mqttService from './services/mqttService.js';

mqttService.connect();  // After database connection

process.on('SIGTERM', () => {
  mqttService.disconnect();
});
```

**5. Use in deviceConfigController.js:**
```javascript
import mqttService from '../services/mqttService.js';

export const updateDeviceConfig = async (req, res) => {
  // ... validation and database update ...

  try {
    await mqttService.pushConfigUpdate(device.client_id, deviceId, {
      telemetry_interval: config.telemetry_interval,
      device_settings: config.device_settings
    });
  } catch (mqttError) {
    logger.error('MQTT push failed:', mqttError);
    // Don't fail the API response — config is saved in SQL regardless
  }

  res.json({ success: true, config_pushed: true });
};
```

### 11. Configure TLS (Production)

- [ ] Obtain TLS certificate (Let's Encrypt or purchased)
- [ ] Configure EMQX for TLS on port 8883
- [ ] Disable plain MQTT port 1883 for external access (keep for internal subscriber)
- [ ] Update NSG to remove port 1883 rule for external IPs

### 12. Configure EMQX Authentication & ACL

**⚠️ IMPORTANT: HTTP-based authentication — zero manual config per device, lifecycle-aware**

#### Step 12a: Database Schema

Run on `cs_db_prod`:

```sql
-- MQTT credentials columns (v1.0 — already added)
ALTER TABLE device
ADD mqtt_username      NVARCHAR(100) NULL,
    mqtt_password_hash NVARCHAR(255) NULL,
    mqtt_enabled       BIT DEFAULT 1;

CREATE NONCLUSTERED INDEX IX_device_mqtt_username
ON device (mqtt_username) WHERE mqtt_enabled = 1;

-- Lifecycle columns (v2.0 — new)
ALTER TABLE device ADD
  activation_status  NVARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  -- PENDING | ACTIVE | INACTIVE
  mqtt_password      NVARCHAR(255) NULL,
  -- bcrypt-hashed, generated on activation (replaces mqtt_password_hash above)
  device_type        NVARCHAR(50)  NULL,
  -- P1 | P2 | P3 | HKMI | GAS
  firmware_version   NVARCHAR(50)  NULL,
  mac_address        NVARCHAR(50)  NULL,
  first_seen         DATETIME      NULL,
  last_seen          DATETIME      NULL,
  activated_at       DATETIME      NULL,
  activated_by       INT           NULL,
  deactivated_at     DATETIME      NULL,
  deactivated_by     INT           NULL;

CREATE INDEX IX_device_activation_status ON device (activation_status);

-- Payment / subscription tables (v2.1 — new)
CREATE TABLE payment_plan (
  id               INT           IDENTITY PRIMARY KEY,
  name             NVARCHAR(50)  NOT NULL,
  device_quota     INT           NOT NULL,
  price_monthly    DECIMAL(10,2) NOT NULL,
  price_annual     DECIMAL(10,2) NOT NULL,
  currency         NVARCHAR(10)  NOT NULL DEFAULT 'INR',
  razorpay_plan_id NVARCHAR(100) NULL,
  features         NVARCHAR(MAX) NULL,
  is_active        BIT           NOT NULL DEFAULT 1,
  created_at       DATETIME      NOT NULL DEFAULT GETUTCDATE()
);

CREATE TABLE client_subscription (
  id                       INT           IDENTITY PRIMARY KEY,
  client_id                INT           NOT NULL,
  plan_id                  INT           NOT NULL REFERENCES payment_plan(id),
  status                   NVARCHAR(20)  NOT NULL DEFAULT 'trialing',
  -- trialing | active | past_due | cancelled | expired
  razorpay_subscription_id NVARCHAR(100) NULL,
  billing_cycle            NVARCHAR(10)  NOT NULL DEFAULT 'monthly',
  current_period_start     DATETIME      NULL,
  current_period_end       DATETIME      NULL,
  grace_period_end         DATETIME      NULL,
  trial_end                DATETIME      NULL,
  cancelled_at             DATETIME      NULL,
  created_at               DATETIME      NOT NULL DEFAULT GETUTCDATE(),
  updated_at               DATETIME      NOT NULL DEFAULT GETUTCDATE()
);

CREATE TABLE payment_transaction (
  id                 INT           IDENTITY PRIMARY KEY,
  client_id          INT           NOT NULL,
  subscription_id    INT           NULL REFERENCES client_subscription(id),
  gateway            NVARCHAR(20)  NOT NULL,
  gateway_payment_id NVARCHAR(100) NOT NULL,
  amount             DECIMAL(10,2) NOT NULL,
  currency           NVARCHAR(10)  NOT NULL DEFAULT 'INR',
  status             NVARCHAR(20)  NOT NULL,
  event_type         NVARCHAR(50)  NOT NULL,
  raw_payload        NVARCHAR(MAX) NULL,
  created_at         DATETIME      NOT NULL DEFAULT GETUTCDATE()
);

ALTER TABLE device ADD subscription_id INT NULL REFERENCES client_subscription(id);
```

#### Step 12b: Configure EMQX HTTP Auth Plugin

**Access EMQX Dashboard:** `http://20.198.101.175:18083`

---

**Step 1: Create Auth & ACL Endpoints on Express Backend**

File: `/genvolt-app-main/server/routes/mqttAuthRoutes.js`

```javascript
import express from 'express';
import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// EMQX HTTP Authentication Hook
// Called on every device connection attempt
router.post('/mqtt/auth', async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, username)
      .query(`
        SELECT activation_status, mqtt_password, client_id
        FROM device WHERE device_id = @deviceId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ result: 'deny', reason: 'Device not found' });
    }

    const device = result.recordset[0];

    if (device.activation_status === 'INACTIVE') {
      return res.status(403).json({ result: 'deny', reason: 'Device deactivated' });
    }

    // PENDING: allow connection, ACL will restrict topics
    if (device.activation_status === 'PENDING') {
      return res.json({ result: 'allow', is_superuser: false });
    }

    // ACTIVE: verify bcrypt password
    if (device.activation_status === 'ACTIVE') {
      if (!device.mqtt_password || !password) {
        return res.status(401).json({ result: 'deny', reason: 'No credentials' });
      }
      const isValid = await bcrypt.compare(password, device.mqtt_password);
      return isValid
        ? res.json({ result: 'allow', is_superuser: false })
        : res.status(401).json({ result: 'deny', reason: 'Invalid password' });
    }

    res.status(403).json({ result: 'deny', reason: 'Unknown state' });
  } catch (error) {
    logger.error('MQTT auth error:', error);
    res.status(500).json({ result: 'deny', reason: 'Internal error' });
  }
});

// EMQX HTTP ACL Hook
// Called before allowing publish/subscribe to any topic
router.post('/mqtt/acl', async (req, res) => {
  const { username, topic, action } = req.body;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, username)
      .query('SELECT activation_status, client_id FROM device WHERE device_id = @deviceId');

    if (result.recordset.length === 0) {
      return res.json({ result: 'deny', reason: 'Device not found' });
    }

    const device = result.recordset[0];

    // INACTIVE: deny everything
    if (device.activation_status === 'INACTIVE') {
      return res.json({ result: 'deny', reason: 'Device deactivated' });
    }

    // PENDING: pre-activation topic only
    if (device.activation_status === 'PENDING') {
      if (action === 'publish' && topic === 'cloudsynk/pre-activation') {
        return res.json({ result: 'allow' });
      }
      if (action === 'subscribe' && topic === `cloudsynk/pre-activation/response/${username}`) {
        return res.json({ result: 'allow' });
      }
      return res.json({ result: 'deny', reason: 'Pending device: pre-activation topic only' });
    }

    // ACTIVE: own client/device topics only
    if (device.activation_status === 'ACTIVE') {
      const clientId = device.client_id;
      if (action === 'publish' && topic === `cloudsynk/${clientId}/${username}/telemetry`) {
        return res.json({ result: 'allow' });
      }
      if (action === 'subscribe' && topic === `cloudsynk/${clientId}/${username}/config`) {
        return res.json({ result: 'allow' });
      }
      return res.json({ result: 'deny', reason: 'Topic not allowed' });
    }

    res.json({ result: 'deny', reason: 'Unknown device state' });
  } catch (error) {
    logger.error('MQTT ACL error:', error);
    res.status(500).json({ result: 'deny', reason: 'Internal error' });
  }
});

export default router;
```

Add to `server.js`:
```javascript
import mqttAuthRoutes from './routes/mqttAuthRoutes.js';
app.use('/api', mqttAuthRoutes);
```

---

**Step 2: Configure EMQX HTTP Auth Plugin (EMQX Dashboard)**

**Management → Authentication → Create**
- **Type:** HTTP
- **Method:** POST
- **URL:** `http://your-express-backend.azurewebsites.net/api/mqtt/auth`
- **Request Body:**
  ```json
  { "clientid": "${clientid}", "username": "${username}", "password": "${password}" }
  ```
- **Success Condition:** HTTP 200 + `"result": "allow"`

**Management → Authorization → Create**
- **Type:** HTTP
- **Method:** POST
- **URL:** `http://your-express-backend.azurewebsites.net/api/mqtt/acl`
- **Request Body:**
  ```json
  { "clientid": "${clientid}", "username": "${username}", "topic": "${topic}", "action": "${action}" }
  ```
- **Success Condition:** HTTP 200 + `"result": "allow"`

---

**Step 3: Create Backend/Subscriber Service Accounts (One-Time Only)**

These accounts bypass the device lifecycle HTTP auth — create them in EMQX built-in database.

**Management → Authentication → Built-in Database → Users → Add**

| Username | Password | Is Superuser |
|----------|----------|--------------|
| `backend_publisher` | `<secure_password>` | No |
| `local_subscriber` | `<secure_password>` | No |

Update Express Backend `.env` and VM `.env` with these passwords:
```env
# Express Backend .env
MQTT_BACKEND_USER=backend_publisher
MQTT_BACKEND_PASSWORD=<same as above>

# VM /opt/cloudsynk-subscriber/.env
MQTT_USER=local_subscriber
MQTT_PASSWORD=<same as above>
```

**Management → Authorization → Built-in Database → Rules → Add**

For `backend_publisher`:
```
ALLOW publish cloudsynk/+/+/config
ALLOW publish cloudsynk/pre-activation/response/+
DENY  subscribe #
```

For `local_subscriber`:
```
ALLOW subscribe cloudsynk/+/+/telemetry
ALLOW subscribe cloudsynk/pre-activation
DENY  publish #
```

#### Step 12c: Device Lifecycle Provisioning

Devices no longer need pre-created credentials. The lifecycle is:

1. **Device powers on** → publishes to `cloudsynk/pre-activation` → subscriber registers it as PENDING in SQL
2. **Admin sees it** in Pending Devices page → selects client → clicks Activate
3. **Backend** generates credentials, sets `activation_status = ACTIVE`, publishes activation payload to device
4. **Device** saves credentials, reconnects, starts sending telemetry

```javascript
// server/controllers/deviceController.js — activateDevice
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mqttService from '../services/mqttService.js';
import paymentService from '../services/paymentService.js';

export const activateDevice = async (req, res) => {
  const { id } = req.params;
  const { client_id, initial_config } = req.body;

  // Check subscription quota before activating
  const quotaCheck = await paymentService.checkDeviceQuota(client_id);
  if (!quotaCheck.allowed) {
    return res.status(403).json({ success: false, error: quotaCheck.reason });
  }

  const mqtt_password = crypto.randomBytes(16).toString('hex');
  const mqtt_password_hash = await bcrypt.hash(mqtt_password, 10);
  const config = initial_config || { telemetry_interval: 300, motor_on_time: 30 };

  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .input('clientId', sql.Int, client_id)
    .input('mqttPassword', sql.NVarChar, mqtt_password_hash)
    .input('activatedBy', sql.Int, req.user.user_id)
    .query(`
      UPDATE device
      SET activation_status = 'ACTIVE',
          client_id = @clientId,
          mqtt_password = @mqttPassword,
          mqtt_username = device_id,
          activated_at = GETUTCDATE(),
          activated_by = @activatedBy
      OUTPUT INSERTED.device_id, INSERTED.client_id
      WHERE id = @id AND activation_status = 'PENDING'
    `);

  if (result.recordset.length === 0) {
    return res.status(404).json({ error: 'Device not found or already active' });
  }

  const device = result.recordset[0];

  try {
    // Retained publish — device gets this even if it reconnects later
    await mqttService.publishActivationPayload(device.device_id, device.client_id, mqtt_password, config);
  } catch (mqttErr) {
    logger.error('Activation MQTT push failed:', mqttErr);
    // Device will re-register via pre-activation on next boot
  }

  res.json({
    success: true,
    message: 'Device activated',
    data: { device_id: device.device_id, client_id: device.client_id, activation_status: 'ACTIVE' }
  });
};
```

#### Summary: No Manual Work Per Device

✅ **One-time setup:** HTTP auth/ACL hooks configured in EMQX
✅ **PENDING devices:** Auto-register on first boot via pre-activation topic
✅ **Activation:** Admin assigns client → credentials generated + pushed via retained MQTT message
✅ **Deactivation:** Status set to INACTIVE → EMQX auth hook denies on next connection
✅ **Scales to:** Unlimited devices with zero manual EMQX configuration

### 13. Test End-to-End

**Test 1: Pre-activation Flow**
```bash
# Simulate new device first boot
mosquitto_pub -h 20.198.101.175 -p 1883 \
  -u "HK00001" \
  -t "cloudsynk/pre-activation" \
  -m '{"device_id":"HK00001","device_type":"P3","firmware_version":"2.1.0","mac_address":"AA:BB:CC:DD:EE:FF"}'
```
- [ ] Verify HK00001 appears in Pending Devices page
- [ ] Activate via admin UI (assign to a client)
- [ ] Verify device receives activation payload:
```bash
mosquitto_sub -h 20.198.101.175 -p 1883 \
  -u "HK00001" \
  -t "cloudsynk/pre-activation/response/HK00001" \
  -v
```

**Test 2: Telemetry Flow (Active Device → SQL → Dashboard)**
```bash
mosquitto_pub -h 20.198.101.175 -p 1883 \
  -t "cloudsynk/3/HK00001/telemetry" \
  -u "HK00001" -P "device_mqtt_password" \
  -m '{"device_id":"HK00001","data":"0x1A2B3C4D..."}'
```
- [ ] Check subscriber logs: `sudo journalctl -u cloudsynk-subscriber -f`
- [ ] Verify data decoded and inserted to Azure SQL
- [ ] Verify data appears in web dashboard

**Test 3: Config Push Flow (Dashboard → Device)**
- [ ] Toggle Debug Mode ON for HK00001 in dashboard
- [ ] Check Express Backend logs for: `"Config pushed to cloudsynk/3/HK00001/config"`
```bash
mosquitto_sub -h 20.198.101.175 -p 1883 \
  -t "cloudsynk/3/HK00001/config" \
  -u "HK00001" -P "device_mqtt_password" -v
```
- [ ] Verify config received:
```json
{
  "type": "config_update",
  "timestamp": "2026-03-23T10:30:00Z",
  "telemetry_interval": 30,
  "device_settings": { "Motor_On_Time": 600, "log_level": "verbose" }
}
```

**Test 4: Multi-Client Isolation**
- [ ] Activate devices for two different clients (client_id: 3, 5)
- [ ] Verify device from client 3 is denied on client 5 topics
- [ ] Verify ACL enforced by EMQX

**Test 5: Deactivation**
- [ ] Deactivate HK00001 via admin UI
- [ ] Attempt to connect: `mosquitto_pub -u "HK00001" -P "device_mqtt_password" ...`
- [ ] Verify connection is rejected

**Test 6: Express Backend Failover**
- [ ] Disconnect Express Backend from MQTT
- [ ] Update device config in dashboard
- [ ] Verify config saved to SQL despite MQTT push failure
- [ ] Reconnect → verify subsequent pushes work

---

## Complete Data Flow Examples

### Scenario 1: New Device First Boot (Pre-activation)

```
1. Device powers on — no credentials stored
   ↓
2. Connects to EMQX with username=HK00001 (no password)
   EMQX → POST /api/mqtt/auth { username: "HK00001" }
   Express: status=PENDING → ALLOW
   ↓
3. Device publishes to cloudsynk/pre-activation:
   { device_id: "HK00001", device_type: "P3", firmware_version: "2.1.0" }
   EMQX → POST /api/mqtt/acl { topic: "cloudsynk/pre-activation", action: "publish" }
   Express: PENDING + correct topic → ALLOW
   ↓
4. Python subscriber receives pre-activation message
   Upserts device in SQL: activation_status = PENDING, first_seen = now
   ↓
5. Admin sees HK00001 in Pending Devices page
   Assigns to client 3, confirms initial config
   POST /api/devices/42/activate { client_id: 3 }
   ↓
6. Backend:
   - Sets activation_status = ACTIVE, client_id = 3
   - Generates MQTT credentials (bcrypt hashed)
   - Publishes retained activation payload to cloudsynk/pre-activation/response/HK00001
   ↓
7. Device receives activation payload (retained — delivered even on reconnect)
   Saves: mqtt_username, mqtt_password, telemetry_topic, config_topic
   ↓
8. Device reconnects with new credentials
   Calls Device Config Function App for initial settings
   Starts publishing telemetry to cloudsynk/3/HK00001/telemetry
```

### Scenario 2: Active Device Startup

```
1. Device powers on (already ACTIVE, has saved credentials)
   ↓
2. HTTP GET to Device Config Function App:
   GET /api/v1/device-config/communication?device_id=HK00001
   ← Response:
   {
     "mqtt_broker": "20.198.101.175:8883",
     "mqtt_topic_pub": "cloudsynk/3/HK00001/telemetry",
     "mqtt_topic_sub": "cloudsynk/3/HK00001/config",
     "telemetry_interval": 300,
     "device_settings": { "Motor_On_Time": 500, "log_level": "normal" }
   }
   ↓
3. Connects to EMQX with saved credentials (TLS)
   ↓
4. Subscribes to: cloudsynk/3/HK00001/config
   ↓
5. Starts telemetry loop (every 300 seconds)
```

### Scenario 3: Admin Enables Debug Mode

```
1. Admin toggles Debug Mode ON for HK00001 in dashboard
   ↓
2. PATCH /api/device-config/HK00001/debugmode { debugMode: true }
   ↓
3. Express Backend:
   Updates SQL: debugmode=1, telemetry_interval=30, log_level="verbose"
   Calls mqttService.pushConfigUpdate(3, "HK00001", {...})
   ↓
4. MQTT PUBLISH to cloudsynk/3/HK00001/config:
   {
     "type": "config_update",
     "telemetry_interval": 30,
     "device_settings": { "Motor_On_Time": 500, "log_level": "verbose" }
   }
   ↓
5. Device receives update (<1 second latency)
   Applies: telemetry_interval=30s, log_level=verbose
   ↓
6. Device sends telemetry every 30 seconds
   Admin sees near-real-time data in dashboard
```

### Scenario 4: Telemetry Ingestion

```
1. Device encodes sensor data as hex
   ↓
2. MQTT PUBLISH to cloudsynk/3/HK00001/telemetry:
   { "device_id": "HK00001", "data": "0x1A2B3C4D5E6F..." }
   ↓
3. Python subscriber receives message
   Parses topic → client_id=3, device_id=HK00001
   Decodes hex using DecoderFactory (P1/P2/P3/H1)
   ↓
4. Subscriber inserts to SQL:
   IoT_Raw_Messages (raw payload)
   IoT_Data_Sick (decoded fields)
   ↓
5. Data available in dashboard (<5 seconds total latency)
```

### Scenario 5: Payment Failure → Device Deactivation

```
1. Client's payment fails (card expired)
   ↓
2. Razorpay retries over 3 days
   ↓
3. Razorpay sends webhook: POST /api/webhooks/razorpay
   Event: payment.failed
   ↓
4. Express Backend:
   Sets client_subscription.status = past_due
   Sets grace_period_end = now + 7 days
   (devices stay ACTIVE during grace period)
   ↓
5. Azure Function (subscription-enforcer) runs daily at 2 AM IST
   Finds subscriptions where grace_period_end < now AND status = past_due
   ↓
6. For each device in client:
   - MQTT publish: { "type": "deactivation_notice", "reason": "subscription_expired" }
   - Sets device.activation_status = INACTIVE
   ↓
7. On next connection attempt: EMQX auth hook returns DENY
   Device goes offline
   ↓
8. Client renews subscription → admin re-activates devices
```

---

## How Debug Mode Works (UI Concept)

**Important:** Device firmware never sees the `debugmode` flag. It's a dashboard convenience.

**Debug Mode ON:**
```
Backend sets in SQL:  debugmode=1, telemetry_interval=30, log_level="verbose"
Device receives:      { "telemetry_interval": 30, "device_settings": { "log_level": "verbose" } }
```

**Debug Mode OFF:**
```
Backend sets in SQL:  debugmode=0, telemetry_interval=300, log_level="normal"
Device receives:      { "telemetry_interval": 300, "device_settings": { "log_level": "normal" } }
```

Benefits: No firmware changes needed, backend controls debug behavior per device type.

---

## Scaling & HA

These steps are not yet needed but should be planned before production load increases.

### Redis Cache for Auth/ACL Performance

Every MQTT publish triggers `/api/mqtt/acl` → SQL Server. At 500 devices in debug mode (30s interval), that's ~1,000 ACL requests/minute.

**Add Azure Cache for Redis (Basic tier, ~$13/month):**

```bash
# Install ioredis on Express Backend
npm install ioredis
```

```javascript
// In mqttAuthRoutes.js — cache device status for 60 seconds
import Redis from 'ioredis';
const cache = new Redis(process.env.REDIS_URL);

router.post('/mqtt/acl', async (req, res) => {
  const { username } = req.body;
  const cacheKey = `device:state:${username}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    const device = JSON.parse(cached);
    return res.json(buildAclResponse(device, req.body));
  }

  const device = await queryDeviceFromSql(username);
  await cache.setex(cacheKey, 60, JSON.stringify(device));  // 60s TTL
  res.json(buildAclResponse(device, req.body));
});

// Call this on device activation/deactivation to invalidate immediately
async function invalidateDeviceCache(deviceId) {
  await cache.del(`device:state:${deviceId}`);
}
```

Add to Express Backend `.env`:
```env
REDIS_URL=rediss://:password@your-cache.redis.cache.windows.net:6380
```

### EMQX High Availability (2 VMs + Load Balancer)

For zero-downtime EMQX updates and device failover:

```bash
# Create second VM (vm-cloudsynk-emqx-2) with same size and setup
# Run same Docker EMQX container setup on both VMs
# Both point auth/ACL HTTP hooks to same Express Backend URL

# Azure Load Balancer (Standard, ~$0.008/hour)
# Frontend: port 8883, Backend pool: both VM IPs
# Health probe: TCP port 8883

# NSG update: remove direct port 8883 access to VMs,
# route all traffic through the load balancer
```

Devices reconnect automatically via MQTT reconnect logic within seconds of failover.

### Azure Service Bus (Webhook Reliability)

Before the Razorpay webhook goes live, add Azure Service Bus to decouple webhook receipt from processing:

```javascript
// Webhook handler: receive and enqueue immediately, process asynchronously
import { ServiceBusClient } from '@azure/service-bus';

const sbClient = new ServiceBusClient(process.env.SERVICE_BUS_CONNECTION_STRING);
const sender = sbClient.createSender('payment-events');

router.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const body = JSON.parse(req.body);

  // Verify signature first
  if (!paymentService.verifyWebhookSignature(body, req.headers['x-razorpay-signature'])) {
    return res.status(400).end();
  }

  // Respond 200 immediately — Razorpay retries on non-200
  res.status(200).json({ received: true });

  // Enqueue for reliable async processing
  await sender.sendMessages({ body: JSON.stringify(body) });
});

// Separate worker (Azure Function or background job) reads from queue and processes
```

---

## SSH Access

### From original machine (key-based)
```bash
ssh -i ~/Downloads/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175
```

### From another machine

**Option A — Copy the SSH key (recommended)**
```bash
chmod 400 vm-cloudsynk-emqx_key.pem
ssh -i path/to/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175
```

**Option B — Enable password SSH (less secure)**
```bash
sudo passwd mqttvm
sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config.d/*.conf /etc/ssh/sshd_config
sudo systemctl restart ssh
```

---

## Useful VM Commands

```bash
# Check EMQX container status
sudo docker ps

# View EMQX logs
sudo docker logs cloudsynk-emqxmqtt-broker --tail 50 -f

# Restart EMQX
sudo docker restart cloudsynk-emqxmqtt-broker

# Check subscriber service status
sudo systemctl status cloudsynk-subscriber

# View subscriber logs (real-time)
sudo journalctl -u cloudsynk-subscriber -f

# View subscriber logs (last 100 lines)
sudo journalctl -u cloudsynk-subscriber -n 100

# Restart subscriber
sudo systemctl restart cloudsynk-subscriber

# Check disk / memory / CPU
df -h && free -h
top -bn1 | head -20

# Monitor MQTT connections
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl clients list

# Check MQTT topics active
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl topics list

# Monitor message rate
watch -n 5 'sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl metrics'

# Check active subscriptions
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl subscriptions list

# Check buffered messages for subscriber (persistent session)
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl subscriptions show cloudsynk-subscriber-prod
```

---

## Monitoring & Troubleshooting

### Health Checks

**1. EMQX Broker:**
```bash
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl status
# Expected: "Node 'emqx@127.0.0.1' is started"
```

**2. Python Subscriber:**
```bash
sudo systemctl status cloudsynk-subscriber
# Expected: "Active: active (running)"
sudo journalctl -u cloudsynk-subscriber --since "5 minutes ago" | grep -i error
```

**3. Database Connectivity:**
```bash
cd /opt/cloudsynk-subscriber
source venv/bin/activate
python -c "import pyodbc; conn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};...'); print('Connected')"
```

**4. Express Backend MQTT Connection:**
```bash
pm2 logs genvolt-backend | grep -i mqtt
# Expected: "MQTT Service connected to broker"
```

### Common Issues & Solutions

**Issue 1: Device Cannot Connect**
```bash
# Check NSG rules
az network nsg rule list --nsg-name vm-cloudsynk-emqx-nsg -g CloudSynk_Prod -o table

# Check EMQX ports
sudo netstat -tlnp | grep -E '1883|8883|18083'

# Check auth logs
sudo docker logs cloudsynk-emqxmqtt-broker --tail 100 | grep -i auth
```

**Issue 2: PENDING Device Not Appearing in Admin UI**
```bash
# Verify subscriber received pre-activation message
sudo journalctl -u cloudsynk-subscriber -n 50 | grep pre-activation

# Manually test pre-activation topic
mosquitto_sub -h localhost -p 1883 \
  -u local_subscriber -P <password> \
  -t "cloudsynk/pre-activation" -v
```

**Issue 3: Device Stuck in PENDING After Activation**
```bash
# Check if retained activation payload exists on broker
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl topics list | grep pre-activation

# Verify device is subscribing to its response topic
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl subscriptions list | grep HK00001

# Re-trigger activation (idempotent) via admin UI → Activate again
```

**Issue 4: Subscriber Not Receiving Telemetry**
```bash
# Check subscriber is subscribed
sudo journalctl -u cloudsynk-subscriber -n 50 | grep subscribe

# Test topic directly
mosquitto_sub -h localhost -p 1883 -t "cloudsynk/+/+/telemetry" -v

# Check EMQX subscriptions
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl subscriptions list
```

**Issue 5: Config Updates Not Reaching Devices**
```bash
# Check Express Backend MQTT connection
curl http://localhost:3000/api/health/mqtt

# Monitor config messages
mosquitto_sub -h 20.198.101.175 -p 1883 -t "cloudsynk/+/+/config" -v

# Check EMQX ACL allows backend_publisher
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl acl reload
```

**Issue 6: Data Not Appearing in Dashboard**
```bash
# Check subscriber for SQL errors
sudo journalctl -u cloudsynk-subscriber | grep -i "sql\|error"

# Verify recent data in SQL
# SELECT TOP 10 * FROM IoT_Raw_Messages ORDER BY timestamp DESC

# Check decoder errors
sudo journalctl -u cloudsynk-subscriber | grep -i "decode error"
```

**Issue 7: Subscriber Missed Messages During Restart**

If subscriber restarted and `clean_session=False` is properly set, EMQX should replay buffered messages. Verify:
```bash
# Check buffered message count for subscriber session
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl subscriptions show cloudsynk-subscriber-prod

# Check subscriber logs after restart for "replaying buffered messages"
sudo journalctl -u cloudsynk-subscriber --since "restart time" | head -20
```

### Performance Monitoring

1. **EMQX:**
   - Connected clients: `sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl clients list | wc -l`
   - Message rate: `sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl metrics | grep messages`
   - CPU/Memory: `sudo docker stats cloudsynk-emqxmqtt-broker`

2. **Subscriber:**
   - Processing rate: check logs for "Inserted to SQL" count per minute
   - Error rate: `sudo journalctl -u cloudsynk-subscriber --since today | grep -c ERROR`

3. **SQL Database:**
   - Recent rows: `SELECT COUNT(*) FROM IoT_Data_Sick WHERE timestamp > DATEADD(hour, -1, GETDATE())`

4. **VM Resources:**
   - CPU: `top -bn1 | grep "Cpu(s)" | awk '{print $2}'`
   - Memory: `free -m | awk 'NR==2{printf "%.2f%%", $3*100/$2 }'`

### Alerting Setup (Recommended)

**Azure Monitor Alerts:**
1. VM CPU > 80% for 5 minutes
2. VM Memory > 90% for 5 minutes
3. VM disk space < 2GB
4. EMQX container restart detected

**Custom Alerts (Azure Function or Logic App):**
1. Subscriber service down > 2 minutes
2. No telemetry received in last 10 minutes
3. Error rate > 5% in subscriber logs
4. Express Backend MQTT disconnected
5. Subscription grace period expires (payment) → notify client admin before deactivation

---

## Security Best Practices

### Production Hardening Checklist

**EMQX Security:**
- [ ] Change default admin password (DONE)
- [ ] Enable TLS on port 8883
- [ ] Disable plain MQTT port 1883 for external access (keep for internal subscriber)
- [ ] Set rate limits per client (prevent pre-activation flooding)
- [ ] Enable connection limits (max connections per client)
- [ ] Restrict EMQX dashboard to specific IPs (NSG rules 1030/1040)

**VM Security:**
- [ ] Restrict SSH access to specific IPs
- [ ] Disable password authentication for SSH (key-only)
- [ ] Enable automatic security updates:
  ```bash
  sudo apt install unattended-upgrades
  sudo dpkg-reconfigure -plow unattended-upgrades
  ```
- [ ] Install fail2ban:
  ```bash
  sudo apt install fail2ban
  sudo systemctl enable fail2ban
  ```

**Database Security:**
- [ ] Use managed identity for SQL authentication instead of username/password
- [ ] Restrict SQL firewall to VM IP and Express Backend IP only

**Payment Security:**
- [ ] Validate Razorpay webhook signature on every event (implemented in PaymentService.js)
- [ ] Use UNIQUE constraint on `payment_transaction.gateway_payment_id` to prevent duplicate processing
- [ ] Log all payment events to `payment_transaction` table for audit
- [ ] Never log full card details — Razorpay handles PCI compliance, only store payment IDs
