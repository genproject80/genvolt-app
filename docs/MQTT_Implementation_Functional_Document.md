# MQTT Implementation - Functional Document

**Project:** CloudSynk IoT Platform - MQTT Device Lifecycle & Payment Gateway
**Date:** March 23, 2026
**Version:** 2.1 (Updated - Payment Gateway & Architecture Review)
**Purpose:** High-level functional specification, implementation guide, and operations reference
**Audience:** Technical stakeholders, project managers, architects, operations

---

## Executive Summary

This document describes the complete MQTT-based device communication system for the CloudSynk IoT platform. Version 2.0 introduces a **device activation lifecycle** — devices now start in a pre-activation state and only gain full MQTT access after an admin assigns them to a client and explicitly activates them. All existing telemetry ingestion, config push, debug mode, and operational flows are preserved unchanged.

**Key Capabilities:**
- **Zero-touch device pre-registration:** Devices auto-register on first power-on via a shared pre-activation topic
- **Admin-controlled activation:** No device goes live without explicit admin approval
- **Payment-plan enforcement:** Deactivate devices when subscriptions lapse; re-activate on renewal
- **Real-time config updates:** < 1 second latency for config pushes post-activation
- **Scalable architecture:** Handles 1000+ devices; zero manual EMQX config per device
- **Multi-tenant isolation:** Topics scoped per `client_id`/`device_id` post-activation
- **Database-backed auth:** EMQX authenticates via HTTP call to Express Backend → SQL Server
- **Automated billing lifecycle:** Payment gateway webhooks drive device activation and deactivation automatically

---

## 1. Device Lifecycle States

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEVICE LIFECYCLE                            │
│                                                                 │
│   Power ON        Admin Action         Admin Action             │
│      │                │                    │                    │
│      ▼                ▼                    ▼                    │
│  [PENDING] ──────> [ACTIVE] ──────────> [INACTIVE]             │
│  (pre-activation)  (assigned +          (deactivated /         │
│                     enabled)             payment lapsed)        │
│                        │                    │                   │
│                        └────────────────────┘                  │
│                         Re-activate possible                    │
└─────────────────────────────────────────────────────────────────┘
```

| State | Description | MQTT Access | Data Ingestion |
|-------|-------------|-------------|----------------|
| `PENDING` | Device first powered on, not yet assigned | Pre-activation topic only | None |
| `ACTIVE` | Assigned to client, activated by admin | Full telemetry + config topics | Yes |
| `INACTIVE` | Deactivated by admin / payment lapsed | Blocked | No |

---

## 2. System Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                    DEVICE LAYER (500-600 devices)                      │
├────────────────────────────────────────────────────────────────────────┤
│  PENDING State (First Boot):                                           │
│    → MQTT PUBLISH: cloudsynk/pre-activation                           │
│      Payload: { device_id, firmware_version, device_type, mac }       │
│                                                                        │
│  ACTIVE State (Post Activation):                                       │
│    → HTTP GET /api/v1/device-config (Device Config Function App)      │
│      ← Initial config: mqtt_broker, topics, device_settings           │
│    → MQTT PUBLISH: cloudsynk/{IMEI}/telemetry                         │
│    ← MQTT SUBSCRIBE: cloudsynk/{IMEI}/config                          │
│      (receives instant config updates from dashboard)                 │
│                                                                        │
│  INACTIVE State:                                                       │
│    → MQTT connection rejected by broker (ACL blocked)                 │
└────────────────────────────────────────────────────────────────────────┘
                              ↓↑ MQTT TLS Port 8883
┌────────────────────────────────────────────────────────────────────────┐
│              Azure VM (vm-cloudsynk-emqx) - MQTT BROKER                │
├────────────────────────────────────────────────────────────────────────┤
│  EMQX Broker (Docker)                                                  │
│    ├─ Port 1883 (internal only - for local subscriber)               │
│    ├─ Port 8883 (TLS external - for devices & Express backend)        │
│    ├─ Port 18083 (dashboard)                                          │
│    └─ Auth/ACL: HTTP hooks → Express Backend → SQL Server             │
│                                                                        │
│  Pre-activation Listener (within Python subscriber service):           │
│    ├─ Subscribes to: cloudsynk/pre-activation                        │
│    └─ Upserts new devices in DB with activation_status = PENDING      │
│                                                                        │
│  Python Subscriber (systemd service):                                  │
│    ├─ Connects to: localhost:1883                                     │
│    ├─ Subscribes to: cloudsynk/+/telemetry (all active devices)       │
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
│    ├─ GET  /api/devices/pending          (pre-activation list)        │
│    ├─ POST /api/devices/:id/activate     (assign + enable)            │
│    ├─ POST /api/devices/:id/deactivate   (disable)                    │
│    ├─ POST /api/devices/:id/reactivate   (re-enable)                  │
│    ├─ POST /api/mqtt/auth                (EMQX auth hook)             │
│    ├─ POST /api/mqtt/acl                 (EMQX ACL hook)              │
│    ├─ GET  /api/dashboard/*              (read telemetry data)        │
│    ├─ PUT  /api/device-config/:deviceId  (update config)              │
│    └─ PATCH /api/device-config/:deviceId/debugmode (toggle debug)    │
│                                                                        │
│  MQTT Publisher (mqttService.js):                                     │
│    ├─ Connects to: vm-cloudsynk-emqx:8883 (TLS)                       │
│    ├─ Publishes activation payload on device activation               │
│    └─ On config update → PUBLISH to cloudsynk/{IMEI}/config                │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ React App
┌────────────────────────────────────────────────────────────────────────┐
│              React Frontend (genvolt-app-main/client)                  │
├────────────────────────────────────────────────────────────────────────┤
│  Admin actions:                                                        │
│    ├─ View Pending Devices → Assign & Activate flow                   │
│    ├─ Toggle Debug Mode ON → Backend → MQTT push config update        │
│    ├─ Change Motor_On_Time → Backend → MQTT push config update        │
│    ├─ Deactivate Device (ACTIVE → INACTIVE)                           │
│    └─ View real-time telemetry from SQL database                      │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

**Topic Structure:**
- Pre-activation (any device): `cloudsynk/pre-activation`
- Telemetry (active device publishes): `cloudsynk/{IMEI}/telemetry`
- Config (active device subscribes): `cloudsynk/{IMEI}/config`

**Multi-Tenant Support:**
- Each active device belongs to a `client_id` (stored in database)
- Topic pattern automatically isolates clients
- PENDING devices share one common pre-activation topic

**Debug Mode (UI Concept Only):**
- `debugmode` flag stored in database for UI state tracking
- When toggled ON, backend translates to actual config changes:
  - `telemetry_interval`: 300s → 30s (faster telemetry)
  - `log_level`: "normal" → "verbose"
- Device receives actual config values, not the debugmode flag
- No device firmware changes needed to support debug mode

**Device Authentication (Database-Backed):**
- Device credentials stored in SQL database (`device` table)
- EMQX authenticates via HTTP call to Express Backend
- Express Backend queries SQL Server and validates credentials
- **Zero manual EMQX configuration per device** — scales to 1000s of devices
- ACL enforcement automatic via HTTP ACL check

---

## 3. VM Resource Details

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
| **Cost** | ~$24/month |

### NSG Rules (vm-cloudsynk-emqx-nsg)

| Priority | Name | Port | Protocol | Source |
|---|---|---|---|---|
| 1000 | SSH | 22 | TCP | Any |
| 1010 | MQTT | 1883 | TCP | Any |
| 1020 | MQTT-TLS | 8883 | TCP | Any |
| 1030/1040 | EMQX-Dashboard | 18083 | TCP | My IP |

---

## 4. Topic Structure

### Pre-activation Topic (All Devices - First Boot)

```
cloudsynk/pre-activation
```

- **Who publishes:** Any device, regardless of status (PENDING or restarted INACTIVE)
- **Payload:**
```json
{
  "device_id": "HK00001",
  "firmware_version": "2.1.0",
  "device_type": "P3",
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "timestamp": "2026-03-23T10:00:00Z"
}
```
- **Who subscribes:** Python subscriber pre-activation listener
- **EMQX ACL:** Open publish for all, only local subscriber subscribes

### Active Device Topics (Post Activation)

```
cloudsynk/{IMEI}/telemetry   ← Device publishes sensor data
cloudsynk/{IMEI}/config      ← Device subscribes for config updates
```

**Examples:**
- `cloudsynk/HK00001/telemetry`
- `cloudsynk/HK00001/config`

### Activation Handshake via Config Topic

When a device is activated, the backend publishes a retained telemetryConfig message to the device's config topic. The device subscribes to `cloudsynk/{IMEI}/config` during Phase 1 (pre-activation) to receive its credentials:

```
cloudsynk/{IMEI}/config   ← Backend publishes retained activation payload
```

**Activation payload:**
```json
{
  "status": "activated",
  "client_id": 3,
  "telemetry_topic": "cloudsynk/HK00001/telemetry",
  "config_topic": "cloudsynk/HK00001/config",
  "mqtt_username": "HK00001",
  "mqtt_password": "generated_secret",
  "config": {
    "telemetry_interval": 300,
    "motor_on_time": 30,
    "debug_mode": false
  }
}
```

---

## 5. Authentication & ACL Flow

### 5.1 EMQX HTTP Auth Hook → Express Backend

EMQX calls `POST /api/mqtt/auth` for every device connection attempt.

```
Device connects with:  username=HK00001, password=xxx
         ↓
EMQX calls: POST /api/mqtt/auth
         ↓
Express queries: SELECT activation_status, mqtt_password FROM device WHERE device_id = 'HK00001'
         ↓
┌──────────────────────────────────────────────────┐
│ Status    │ Password match │ Result               │
├──────────────────────────────────────────────────┤
│ PENDING   │ N/A            │ ALLOW (pre-act only) │
│ ACTIVE    │ Yes            │ ALLOW                │
│ ACTIVE    │ No             │ DENY                 │
│ INACTIVE  │ Any            │ DENY                 │
│ Not found │ Any            │ DENY                 │
└──────────────────────────────────────────────────┘
```

**Special rule for PENDING devices:** Devices in PENDING state are allowed to connect but are restricted via ACL to only publish to `cloudsynk/pre-activation`.

### 5.2 EMQX HTTP ACL Hook → Express Backend

EMQX calls `POST /api/mqtt/acl` before allowing publish/subscribe to any topic.

```
Request: { username: "HK00001", topic: "cloudsynk/HK00001/telemetry", action: "publish" }
         ↓
Express queries device activation_status and client_id
         ↓
┌────────────────────────────────────────────────────────────────────────────────┐
│ Device Status │ Topic                                    │ Action    │ Result  │
├────────────────────────────────────────────────────────────────────────────────┤
│ PENDING       │ cloudsynk/pre-activation                 │ publish   │ ALLOW   │
│ PENDING       │ cloudsynk/{IMEI}/config                 │ subscribe │ ALLOW   │
│ PENDING       │ anything else                            │ any       │ DENY    │
│ ACTIVE        │ cloudsynk/{IMEI}/telemetry               │ publish  │ ALLOW   │
│ ACTIVE        │ cloudsynk/{IMEI}/config                  │ subscribe │ ALLOW   │
│ ACTIVE        │ other client's topics                    │ any       │ DENY    │
│ INACTIVE      │ any topic                                │ any       │ DENY    │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Backend & Subscriber Users (Manual - One Time Setup)

These service accounts are created directly in EMQX built-in database (not via HTTP auth):

- **backend_publisher** — Express Backend MQTT publisher
  - ACL: `ALLOW publish cloudsynk/+/config`
  - ACL: `DENY subscribe #`
- **local_subscriber** — Python subscriber on VM
  - ACL: `ALLOW subscribe cloudsynk/+/telemetry` and `ALLOW subscribe cloudsynk/pre-activation`
  - ACL: `DENY publish #`

---

## 6. Device Activation Flow (Detailed)

```
Step 1: Device powers on
        └─> Connects to EMQX (username = device_id, no password or factory password)
        └─> Publishes to cloudsynk/pre-activation
            { device_id: "HK00001", device_type: "P3", firmware: "2.1.0", mac: "AA:BB:..." }

Step 2: Python pre-activation listener receives message
        └─> Checks if device_id exists in device table
            ├─ If NEW: inserts with activation_status = PENDING, no client_id
            └─ If EXISTS (INACTIVE): updates last_seen timestamp only

Step 3: Admin opens "Pending Devices" page in UI
        └─> Sees list of PENDING devices with device_id, device_type, first_seen, last_seen

Step 4: Admin selects a device → clicks "Assign & Activate"
        └─> Modal opens: select client, confirm device type, set initial config

Step 5: Admin confirms → POST /api/devices/:id/activate { client_id: 3 }
        Backend:
        ├─ Sets device.activation_status = ACTIVE
        ├─ Sets device.client_id = 3
        ├─ Generates MQTT credentials (username = device_id, password = random secret)
        ├─ Stores bcrypt-hashed password in device.mqtt_password
        ├─ Publishes retained activation payload to cloudsynk/{IMEI}/config
        └─ Creates audit log entry

Step 6: Device receives activation payload
        └─> Saves new credentials + assigned topics locally
        └─> Reconnects to EMQX with new credentials
        └─> Calls Device Config Function App to get initial config
        └─> Starts publishing to cloudsynk/HK00001/telemetry
        └─> Subscribes to cloudsynk/HK00001/config

Step 7: Data flows normally
        └─> Python subscriber ingests telemetry → SQL
        └─> Dashboard shows live device data
```

---

## 7. Device Deactivation Flow

```
Trigger: Admin clicks "Deactivate" (manual) OR payment plan expires (automated)

POST /api/devices/:id/deactivate
        ├─ Sets device.activation_status = INACTIVE
        ├─ Stores deactivated_at, deactivated_by
        ├─ Invalidates MQTT credentials
        ├─ Publishes deactivation notice to cloudsynk/{IMEI}/config:
        │    { "status": "deactivated", "reason": "subscription_expired" }
        └─ Creates audit log entry

Result:
        ├─ On next EMQX auth check → DENY (activation_status = INACTIVE)
        ├─ Device loses connection
        └─ Device falls back to pre-activation topic on next boot
```

---

## 8. Database Schema Changes

### Updates to `device` table (lifecycle columns — new in v2.0)

```sql
ALTER TABLE device ADD
  activation_status   NVARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  -- values: PENDING | ACTIVE | INACTIVE
  mqtt_password       NVARCHAR(255) NULL,
  -- bcrypt-hashed MQTT password, generated on activation
  device_type         NVARCHAR(50)  NULL,
  -- P1 | P2 | P3 | HKMI | GAS (reported by device on pre-activation)
  firmware_version    NVARCHAR(50)  NULL,
  mac_address         NVARCHAR(50)  NULL,
  first_seen          DATETIME      NULL,
  -- timestamp of first pre-activation message
  last_seen           DATETIME      NULL,
  -- timestamp of last any message
  activated_at        DATETIME      NULL,
  activated_by        INT           NULL,
  -- FK to user table (admin who activated)
  deactivated_at      DATETIME      NULL,
  deactivated_by      INT           NULL;
  -- FK to user table (admin who deactivated)
```

### Columns already added (v1.0 schema)

```sql
-- Run on cs_db_prod database (already done)
ALTER TABLE device
ADD mqtt_username      NVARCHAR(100) NULL,
    mqtt_password_hash NVARCHAR(255) NULL,
    mqtt_enabled       BIT DEFAULT 1;

-- Index for faster authentication lookups
CREATE NONCLUSTERED INDEX IX_device_mqtt_username
ON device (mqtt_username)
WHERE mqtt_enabled = 1;
```

### Index (new in v2.0)

```sql
CREATE INDEX IX_device_activation_status ON device (activation_status);
```

---

## 9. Implementation Steps

### Step 1: Azure VM Created ✅
- [x] Resource group: CloudSynk_Prod
- [x] VM: vm-cloudsynk-emqx (Standard B2als_v2)
- [x] Ubuntu Server 24.04 LTS
- [x] SSH key generated and downloaded
- [x] NSG rules configured (SSH, MQTT, MQTT-TLS, EMQX Dashboard)
- [x] Quota increased for Basv2 family (0 → 2 vCPUs)

### Step 2: Docker Installed ✅
```bash
sudo apt update && sudo apt install -y docker.io
sudo systemctl enable docker && sudo systemctl start docker
sudo usermod -aG docker $USER
```

### Step 3: EMQX Broker Running ✅

Docker container: `cloudsynk-emqxmqtt-broker`, Image: `emqx/emqx:latest`

```bash
sudo docker run -d --name cloudsynk-emqxmqtt-broker \
  --restart always \
  -p 1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  emqx/emqx:latest
```

- Ports: 1883 (MQTT internal), 8883 (MQTT-TLS), 18083 (Dashboard)
- Dashboard accessible at `http://20.198.101.175:18083`
- Default login: admin / public (changed)

### Step 4: Python Environment Prepared ✅
- [x] Python 3.12 installed (came with Ubuntu 24.04)
- [x] python3-pip, python3-venv installed
- [x] Virtual environment created at `/opt/cloudsynk-subscriber/venv`
- [x] `paho-mqtt` 2.1.0 installed
- [x] `pyodbc` 5.3.0 installed

### Step 5: Change EMQX Dashboard Password ✅
- [x] Login to `http://20.198.101.175:18083` with admin/public
- [x] Default password changed

### Step 6: Write local_subscriber.py

Create the MQTT subscriber script at `/opt/cloudsynk-subscriber/local_subscriber.py`:

**Responsibilities:**
- ✅ Subscribe to `cloudsynk/+/telemetry` — receive telemetry from ACTIVE devices
- ✅ Subscribe to `cloudsynk/pre-activation` — register PENDING devices
- ✅ Decode payloads using existing decoders (P1/P2/P3/H1/Gas)
- ✅ Insert to SQL database (IoT_Raw_Messages + IoT_Data_*)
- ❌ Does NOT handle config updates (Express Backend handles this)

**Topic Parsing Example:**
```python
# Topic: cloudsynk/SICK_001/telemetry
# Extract: device_id=SICK_001
parts = topic.split('/')
device_id = parts[1]
```

**Pre-activation Handler:**
```python
PREACTIVATION_TOPIC = "cloudsynk/pre-activation"

def on_preactivation_message(client, userdata, message):
    payload = json.loads(message.payload)
    device_id = payload.get("device_id")
    device_type = payload.get("device_type")
    firmware_version = payload.get("firmware_version")
    mac_address = payload.get("mac_address")

    # Upsert into device table
    db.execute("""
        MERGE device AS target
        USING (VALUES (@device_id, @device_type, @firmware, @mac, GETUTCDATE()))
          AS source (device_id, device_type, firmware_version, mac_address, last_seen)
        ON target.device_id = source.device_id
        WHEN MATCHED THEN
          UPDATE SET last_seen = source.last_seen
        WHEN NOT MATCHED THEN
          INSERT (device_id, device_type, firmware_version, mac_address,
                  activation_status, first_seen, last_seen)
          VALUES (source.device_id, source.device_type, source.firmware_version,
                  source.mac_address, 'PENDING', GETUTCDATE(), GETUTCDATE());
    """, payload)
```

### Step 7: Copy Decoders to VM

```bash
scp -i ~/Downloads/vm-cloudsynk-emqx_key.pem -r \
  "E:/OneDrive/Genvolt/Development/Sick_Sensor/Http_Ingest/decoders" \
  mqttvm@20.198.101.175:/opt/cloudsynk-subscriber/
```

Existing decoders location:
- `Sick_Sensor/Http_Ingest/decoders/factory.py`
- `Sick_Sensor/Http_Ingest/decoders/base.py`
- `Sick_Sensor/Http_Ingest/decoders/device_decoders/p1_fault_decoder.py`
- `Sick_Sensor/Http_Ingest/decoders/device_decoders/p2_sick_decoder.py`
- `Sick_Sensor/Http_Ingest/decoders/device_decoders/p3_sick_decoder.py`
- `Sick_Sensor/Http_Ingest/decoders/device_decoders/h1_hypure_decoder.py`
- `Sick_Sensor/Http_Ingest/decoders/device_decoders/default.py`

### Step 8: Install ODBC Driver on VM ✅

```bash
curl -s https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
curl -s https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
curl -s https://packages.microsoft.com/config/ubuntu/24.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt update && sudo ACCEPT_EULA=Y apt install -y msodbcsql18 unixodbc-dev
```

### Step 9: Set Up Environment Variables on VM ✅

- `.env` created at `/opt/cloudsynk-subscriber/.env`
- File permissions set to 600 (owner-only read/write)
- Contains: `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `MQTT_BROKER`, `MQTT_PORT`

### Step 10: Create systemd Service

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

### Step 10a: Configure Express Backend MQTT Publisher

**Purpose:** Enable Express Backend to push real-time config updates and activation payloads to devices via MQTT.

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
import logger from '../utils/logger.js';

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

    const topic = `cloudsynk/${deviceId}/config`;
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

    const topic = `cloudsynk/${deviceId}/config`;
    const payload = {
      status: 'activated',
      client_id: clientId,
      telemetry_topic: `cloudsynk/${deviceId}/telemetry`,
      config_topic: `cloudsynk/${deviceId}/config`,
      mqtt_username: deviceId,
      mqtt_password: mqttPassword,
      config: initialConfig
    };

    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
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

// After database connection
mqttService.connect();

// Graceful shutdown
process.on('SIGTERM', () => {
  mqttService.disconnect();
  // ... existing shutdown code
});
```

**5. Use in deviceConfigController.js:**
```javascript
import mqttService from '../services/mqttService.js';

export const updateDeviceConfig = async (req, res) => {
  // ... validation and database update ...

  // Push config via MQTT
  try {
    await mqttService.pushConfigUpdate(
      device.client_id,
      deviceId,
      {
        telemetry_interval: config.telemetry_interval,
        device_settings: config.device_settings
      }
    );
  } catch (mqttError) {
    logger.error('MQTT push failed:', mqttError);
    // Don't fail the request if MQTT push fails
  }

  res.json({ success: true, config_pushed: true });
};
```

### Step 11: Configure TLS (Production)

- [ ] Obtain TLS certificate (Let's Encrypt or purchased)
- [ ] Configure EMQX for TLS on port 8883
- [ ] Disable plain MQTT port 1883 for external access
- [ ] Update NSG to remove port 1883 rule

### Step 12: Configure EMQX Authentication & ACL (Database-Backed)

**⚠️ IMPORTANT: Use HTTP-based authentication to avoid manual configuration per device!**

#### Step 12a: Database Schema (see Section 8 above)

Run the `ALTER TABLE device ADD ...` statements to add lifecycle columns.

#### Step 12b: Configure EMQX HTTP Auth Plugin

**Access EMQX Dashboard:** `http://20.198.101.175:18083`

**Step 1: Create Auth Endpoint on Express Backend**

File: `/genvolt-app-main/server/routes/mqttAuthRoutes.js`

```javascript
import express from 'express';
import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { getPool } from '../config/database.js';

const router = express.Router();

// EMQX HTTP Authentication Hook
// Called by EMQX for every device connection attempt
router.post('/mqtt/auth', async (req, res) => {
  const { clientid, username, password } = req.body;

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, username)
      .query(`
        SELECT activation_status, mqtt_password, client_id
        FROM device
        WHERE device_id = @deviceId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ result: 'deny', reason: 'Device not found' });
    }

    const device = result.recordset[0];

    // INACTIVE devices are always denied
    if (device.activation_status === 'INACTIVE') {
      return res.status(403).json({ result: 'deny', reason: 'Device deactivated' });
    }

    // PENDING devices are allowed to connect (ACL will restrict topics)
    if (device.activation_status === 'PENDING') {
      return res.json({ result: 'allow', is_superuser: false });
    }

    // ACTIVE devices: verify password
    if (device.activation_status === 'ACTIVE') {
      if (!device.mqtt_password || !password) {
        return res.status(401).json({ result: 'deny', reason: 'No credentials' });
      }
      const isValid = await bcrypt.compare(password, device.mqtt_password);
      if (isValid) {
        return res.json({ result: 'allow', is_superuser: false });
      } else {
        return res.status(401).json({ result: 'deny', reason: 'Invalid password' });
      }
    }

    res.status(403).json({ result: 'deny', reason: 'Unknown state' });
  } catch (error) {
    logger.error('MQTT auth error:', error);
    res.status(500).json({ result: 'deny', reason: 'Internal error' });
  }
});

// EMQX HTTP ACL Check Hook
// Called by EMQX before allowing publish/subscribe to any topic
router.post('/mqtt/acl', async (req, res) => {
  const { clientid, username, topic, action } = req.body;

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

    // PENDING: only allow pre-activation topic
    if (device.activation_status === 'PENDING') {
      if (action === 'publish' && topic === 'cloudsynk/pre-activation') {
        return res.json({ result: 'allow' });
      }
      if (action === 'subscribe' && topic === `cloudsynk/${username}/config`) {
        return res.json({ result: 'allow' });
      }
      return res.json({ result: 'deny', reason: 'Pending device restricted to pre-activation topic' });
    }

    // ACTIVE: pattern-based ACL for own client/device topics
    if (device.activation_status === 'ACTIVE') {
      const clientId = device.client_id;

      if (action === 'publish') {
        const expectedTopic = `cloudsynk/${username}/telemetry`;
        if (topic === expectedTopic) {
          return res.json({ result: 'allow' });
        }
      }

      if (action === 'subscribe') {
        const expectedTopic = `cloudsynk/${username}/config`;
        if (topic === expectedTopic) {
          return res.json({ result: 'allow' });
        }
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

**Step 2: Configure EMQX HTTP Auth Plugin (EMQX Dashboard)**

**Management → Authentication → Create**
- **Type:** HTTP
- **Method:** POST
- **Authentication URL:** `http://your-express-backend.azurewebsites.net/api/mqtt/auth`
- **Request Body:**
  ```json
  {
    "clientid": "${clientid}",
    "username": "${username}",
    "password": "${password}"
  }
  ```
- **Success Condition:** HTTP Status = 200 and response contains `"result": "allow"`

**Management → Authorization → Create**
- **Type:** HTTP
- **Method:** POST
- **ACL URL:** `http://your-express-backend.azurewebsites.net/api/mqtt/acl`
- **Request Body:**
  ```json
  {
    "clientid": "${clientid}",
    "username": "${username}",
    "topic": "${topic}",
    "action": "${action}"
  }
  ```
- **Success Condition:** HTTP Status = 200 and response contains `"result": "allow"`

**Step 3: Create Backend/Subscriber Users (One-Time Only)**

Create service account users in EMQX built-in database:

**Management → Authentication → Built-in Database → Users → Add**

**User 1: backend_publisher**
- Username: `backend_publisher`
- Password: `<secure_password>`
- Is Superuser: No

**User 2: local_subscriber**
- Username: `local_subscriber`
- Password: `<secure_password>`
- Is Superuser: No

**Management → Authorization → Built-in Database → Rules → Add**

**Rules for backend_publisher:**
```
ALLOW publish cloudsynk/+/config
DENY subscribe #
```

**Rules for local_subscriber:**
```
ALLOW subscribe cloudsynk/+/telemetry
ALLOW subscribe cloudsynk/pre-activation
DENY publish #
```

#### Step 12c: Device Provisioning Workflow (Updated for Activation Lifecycle)

**When Admin Activates a PENDING Device:**

File: `/genvolt-app-main/server/controllers/deviceController.js`

```javascript
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mqttService from '../services/mqttService.js';

export const activateDevice = async (req, res) => {
  const { id } = req.params;
  const { client_id, initial_config } = req.body;

  try {
    const pool = await getPool();

    // Auto-generate MQTT credentials on activation
    const mqtt_password = crypto.randomBytes(16).toString('hex');
    const mqtt_password_hash = await bcrypt.hash(mqtt_password, 10);

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
    const config = initial_config || { telemetry_interval: 300, motor_on_time: 30 };

    // Publish activation payload to device via MQTT
    // Device is listening on cloudsynk/{IMEI}/config
    try {
      await mqttService.publishActivationPayload(
        device.device_id,
        device.client_id,
        mqtt_password,  // plain text, device will save this
        config
      );
    } catch (mqttError) {
      logger.error('MQTT activation push failed:', mqttError);
      // Device will retry via pre-activation topic on next boot
    }

    res.json({
      success: true,
      message: 'Device activated successfully',
      data: {
        device_id: device.device_id,
        client_id: device.client_id,
        activation_status: 'ACTIVE',
        activated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Error activating device:', error);
    res.status(500).json({ error: 'Failed to activate device' });
  }
};
```

**Result:**
- No manual EMQX configuration needed per device
- Device credentials stored in SQL database
- EMQX authenticates via HTTP call to Express Backend
- Express Backend queries SQL Server and validates credentials
- Scales to 1000s of devices automatically

#### Summary: No Manual Work Per Device

✅ **One-time setup:** Configure HTTP authentication in EMQX
✅ **PENDING devices:** Auto-register on first boot
✅ **Activation:** Admin assigns client → credentials generated + pushed via MQTT
✅ **EMQX queries:** Express Backend → SQL Server
✅ **Scales to:** Unlimited devices
✅ **ACL enforcement:** Automatic via HTTP ACL check

### Step 13: Test End-to-End

**Test 1: Pre-activation Flow**
- [ ] Power on new device (or simulate with mosquitto_pub)
```bash
mosquitto_pub -h 20.198.101.175 -p 1883 \
  -t "cloudsynk/pre-activation" \
  -u "HK00001" \
  -m '{"device_id":"HK00001","device_type":"P3","firmware_version":"2.1.0","mac_address":"AA:BB:CC:DD:EE:FF"}'
```
- [ ] Check device appears in Pending Devices page
- [ ] Activate device via admin UI
- [ ] Verify device receives activation payload

**Test 2: Telemetry Flow (Active Device → SQL → Dashboard)**
- [ ] Use MQTT test client to publish telemetry with activated credentials:
```bash
mosquitto_pub -h 20.198.101.175 -p 1883 \
  -t "cloudsynk/HK00001/telemetry" \
  -u "HK00001" -P "device_mqtt_password" \
  -m '{"device_id":"HK00001","data":"0x1A2B3C4D..."}'
```
- [ ] Check Python subscriber logs: `sudo journalctl -u cloudsynk-subscriber -f`
- [ ] Verify data decoded and inserted to Azure SQL
- [ ] Verify data appears in web dashboard

**Test 3: Config Push Flow (Dashboard → Device)**
- [ ] Open Device Config page in dashboard
- [ ] Select device HK00001
- [ ] Toggle Debug Mode ON or change Motor_On_Time
- [ ] Check Express Backend logs for: "Config pushed to cloudsynk/HK00001/config"
- [ ] Use MQTT test client to subscribe to config topic:
```bash
mosquitto_sub -h 20.198.101.175 -p 1883 \
  -t "cloudsynk/HK00001/config" \
  -u "HK00001" -P "device_mqtt_password" \
  -v
```
- [ ] Verify config update received:
```json
{
  "type": "config_update",
  "timestamp": "2026-03-23T10:30:00Z",
  "telemetry_interval": 30,
  "device_settings": {
    "Motor_On_Time": 600,
    "log_level": "verbose"
  }
}
```

**Test 4: Multi-Client Isolation**
- [ ] Activate devices for different clients (client_id: 3, 5)
- [ ] Verify device from client 3 cannot publish/subscribe to client 5 topics
- [ ] Verify ACL rules enforced by EMQX

**Test 5: Deactivation**
- [ ] Deactivate HK00001 via admin UI
- [ ] Verify device loses MQTT connection on next auth check
- [ ] Verify device cannot re-connect while INACTIVE
- [ ] Re-activate and verify telemetry resumes

**Test 6: Express Backend Failover**
- [ ] Disconnect Express Backend from MQTT
- [ ] Update device config in dashboard
- [ ] Verify config saved to SQL (even though MQTT push failed)
- [ ] Reconnect Express Backend
- [ ] Verify subsequent config updates work

---

## 10. New API Endpoints

### Device Lifecycle Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/devices/pending` | List all PENDING devices |
| `POST` | `/api/devices/:id/activate` | Assign client + activate device |
| `POST` | `/api/devices/:id/deactivate` | Deactivate an active device |
| `POST` | `/api/devices/:id/reactivate` | Re-activate an inactive device |

### MQTT Hooks (called by EMQX, not by frontend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/mqtt/auth` | EMQX authentication hook |
| `POST` | `/api/mqtt/acl` | EMQX topic ACL hook |

### Request/Response Examples

**GET /api/devices/pending**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "device_id": "HK00001",
      "device_type": "P3",
      "firmware_version": "2.1.0",
      "first_seen": "2026-03-23T10:00:00Z",
      "last_seen": "2026-03-23T10:05:00Z"
    }
  ],
  "meta": { "total": 1 }
}
```

**POST /api/devices/:id/activate**
```json
// Request
{
  "client_id": 3,
  "initial_config": {
    "telemetry_interval": 300,
    "motor_on_time": 30
  }
}

// Response
{
  "success": true,
  "message": "Device activated successfully",
  "data": {
    "device_id": "HK00001",
    "client_id": 3,
    "activation_status": "ACTIVE",
    "activated_at": "2026-03-23T10:10:00Z"
  }
}
```

---

## 11. Frontend UI Changes

### 11.1 New: Pending Devices Page

**Location:** Admin → Devices → Pending Devices (or badge on main Devices page)

**Features:**
- Table: device_id, device_type, firmware_version, first_seen, last_seen
- "Activate" button per row → opens activation modal
- Badge count showing number of pending devices
- Auto-refresh every 30 seconds (or WebSocket push)

**Activation Modal:**
- Select Client dropdown (searchable)
- Confirm device type
- Set initial config (telemetry interval, motor on time, etc.)
- Confirm button → calls POST /api/devices/:id/activate

### 11.2 Updated: Device List Page

- New "Status" column: `PENDING` | `ACTIVE` | `INACTIVE` with colored badges
- Filter by status
- "Deactivate" button on ACTIVE devices
- "Re-activate" button on INACTIVE devices
- PENDING devices link to activation flow

### 11.3 Device Detail Page

- Show activation_status prominently
- Show activated_by / activated_at
- Show deactivated reason if INACTIVE
- "Deactivate Device" button (admin only) with confirmation dialog

---

## 12. Complete Data Flow Examples

### Scenario 1: New Device First Boot (Pre-activation)

```
1. New device powers on
   ↓
2. Device has no credentials, connects to EMQX with just device_id as username
   ↓
3. EMQX calls POST /api/mqtt/auth { username: "HK00001" }
   Express: device found, status = PENDING → ALLOW
   ↓
4. Device publishes to cloudsynk/pre-activation:
   { "device_id": "HK00001", "device_type": "P3", "firmware_version": "2.1.0" }
   ↓
5. EMQX calls POST /api/mqtt/acl { topic: "cloudsynk/pre-activation", action: "publish" }
   Express: PENDING device + correct topic → ALLOW
   ↓
6. Python pre-activation listener receives message
   Upserts device in SQL with activation_status = PENDING
   ↓
7. Admin sees HK00001 in Pending Devices page
   ↓
8. Admin assigns to client 3, sets config, confirms
   POST /api/devices/42/activate { client_id: 3 }
   ↓
9. Backend generates MQTT credentials, updates device status to ACTIVE
   Publishes retained activation payload to cloudsynk/HK00001/config
   ↓
10. Device receives activation payload, saves credentials and topics
    ↓
11. Device reconnects with new credentials, calls Device Config Function App
    Starts publishing telemetry to cloudsynk/HK00001/telemetry
```

### Scenario 2: Active Device Startup

```
1. Device powers on (already ACTIVE)
   ↓
2. HTTP GET to Device Config Function App:
   GET /api/v1/device-config/communication?device_id=HK00001
   ← Response:
   {
     "mqtt_broker": "20.198.101.175:8883",
     "mqtt_topic_pub": "cloudsynk/HK00001/telemetry",
     "mqtt_topic_sub": "cloudsynk/HK00001/config",
     "telemetry_interval": 300,
     "device_settings": {
       "Motor_On_Time": 500,
       "Motor_Off_Time": 300,
       "log_level": "normal"
     }
   }
   ↓
3. Device connects to EMQX broker (TLS, with saved MQTT credentials)
   ↓
4. Device subscribes to: cloudsynk/HK00001/config
   ↓
5. Device starts telemetry loop (every 300 seconds)
```

### Scenario 3: Admin Enables Debug Mode

```
1. Admin opens dashboard → Device Config page
   ↓
2. Toggles Debug Mode ON for HK00001
   ↓
3. Dashboard sends: PATCH /api/device-config/HK00001/debugmode
   { "debugMode": true }
   ↓
4. Express Backend:
   - Updates SQL: debugmode=1, telemetry_interval=30, log_level="verbose"
   - Looks up device: client_id=3
   - Calls mqttService.pushConfigUpdate(3, "HK00001", {...})
   ↓
5. Express Backend → MQTT PUBLISH:
   Topic: cloudsynk/HK00001/config
   Payload: {
     "type": "config_update",
     "telemetry_interval": 30,
     "device_settings": {
       "Motor_On_Time": 500,
       "log_level": "verbose"
     }
   }
   ↓
6. EMQX routes message to HK00001 (subscribed)
   ↓
7. Device receives config update (<1 second latency)
   ↓
8. Device applies new settings:
   - telemetry_interval = 30s (was 300s)
   - log_level = "verbose"
   ↓
9. Device starts sending telemetry every 30 seconds
   ↓
10. Admin sees near-real-time data in dashboard
```

### Scenario 4: Telemetry Ingestion

```
1. Device collects sensor data
   ↓
2. Device encodes data as hex payload
   ↓
3. MQTT PUBLISH:
   Topic: cloudsynk/HK00001/telemetry
   Payload: {
     "device_id": "HK00001",
     "data": "0x1A2B3C4D5E6F..."
   }
   ↓
4. EMQX receives message
   ↓
5. Python Subscriber (subscribed to cloudsynk/+/telemetry):
   - Parses topic → device_id=HK00001
   - Decodes hex using DecoderFactory (P1/P2/P3/H1)
   - Extracts fields: Motor_RPM, Runtime_Min, GPS, etc.
   ↓
6. Subscriber inserts to SQL:
   - IoT_Raw_Messages (raw payload)
   - IoT_Data_Sick (decoded fields)
   ↓
7. Data available in dashboard (<5 seconds total latency)
```

---

## 13. How Debug Mode Works (UI Concept)

**Important:** Device firmware never sees the `debugmode` flag. It's a dashboard convenience that translates to actual config values.

**When Admin Toggles Debug Mode ON:**
```
Backend sets:
  debugmode = 1 (database only, for UI state)
  telemetry_interval = 30 (device sees this)
  log_level = "verbose" (device sees this)

Device receives:
  { "telemetry_interval": 30, "device_settings": { "log_level": "verbose" } }
  (No mention of "debugmode")
```

**When Admin Toggles Debug Mode OFF:**
```
Backend sets:
  debugmode = 0 (database only)
  telemetry_interval = 300 (back to normal)
  log_level = "normal"

Device receives:
  { "telemetry_interval": 300, "device_settings": { "log_level": "normal" } }
```

**Benefits:**
- No device firmware changes needed to support debug mode
- Backend has full control over debug behavior
- Can customize debug settings per device type (P1/P2/P3/HKMI)
- Easy to add new debug behaviors without device updates

---

## 14. Payment Plan Integration

The `activation_status` field enables payment-plan-based access control:

| Plan Status | Device Status | Action |
|------------|---------------|--------|
| Active subscription | ACTIVE | Normal operation |
| Payment failed | ACTIVE → INACTIVE | Automated deactivation via cron job |
| Subscription renewed | INACTIVE → ACTIVE | Re-activation via admin or automated |
| New device purchase | PENDING → ACTIVE | Admin activation flow |

**Automated deactivation cron job (future):**

```
POST /api/devices/check-subscriptions  (runs daily)
  ├─ Query devices where subscription_end_date < today AND activation_status = ACTIVE
  ├─ For each: POST /api/devices/:id/deactivate { reason: "subscription_expired" }
  └─ Send notification email to client admin
```

---

## 15. Implementation Phases

### Phase 1 — Database & Backend (Week 1-2)
- [ ] Add lifecycle columns to `device` table (activation_status, mqtt_password, device_type, first_seen, last_seen, activated_by, deactivated_by)
- [ ] Build `POST /api/mqtt/auth` — lifecycle-aware EMQX auth hook
- [ ] Build `POST /api/mqtt/acl` — lifecycle-aware EMQX ACL hook
- [ ] Build `GET /api/devices/pending` — list pending devices
- [ ] Build `POST /api/devices/:id/activate` — assign + activate
- [ ] Build `POST /api/devices/:id/deactivate` — deactivate
- [ ] Build `POST /api/devices/:id/reactivate` — re-activate

### Phase 2 — MQTT Services (Week 2-3)
- [ ] Build/update `server/services/mqttService.js` — add `publishActivationPayload` method
- [ ] Update Python subscriber to add pre-activation listener
- [ ] Configure EMQX auth + ACL HTTP hooks (Management → Authentication/Authorization)
- [ ] Create backend_publisher and local_subscriber service accounts in EMQX

### Phase 3 — Frontend (Week 3-4)
- [ ] Build Pending Devices page with auto-refresh
- [ ] Build Activation Modal (assign client + initial config)
- [ ] Update Device List page with status column + filter
- [ ] Add Deactivate / Re-activate actions to Device Detail page
- [ ] Badge count for pending devices in nav

### Phase 4 — Testing & Hardening (Week 4-5)
- [ ] End-to-end: device boot → pre-activation → admin activates → telemetry flows
- [ ] End-to-end: admin deactivates → device loses access
- [ ] End-to-end: device re-activates → telemetry resumes
- [ ] Load test: 500 devices in PENDING state simultaneously
- [ ] Security test: INACTIVE device cannot access any topic
- [ ] TLS certificate setup for production (port 8883)

### Phase 5 — Payment Plan Automation (Future)
- [ ] Add subscription_end_date to client or device table
- [ ] Build automated deactivation cron job
- [ ] Build client notification emails on deactivation
- [ ] Build self-service re-activation flow

---

## 16. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Rogue device flooding pre-activation topic | Rate limit per IP on EMQX; backend deduplicates by device_id |
| INACTIVE device replaying old credentials | EMQX auth hook checks activation_status on every connection |
| Device spoofing another device_id | MAC address cross-check on activation |
| PENDING device accessing active topics | ACL hook blocks all topics except pre-activation |
| MQTT password brute force | bcrypt hashed passwords; EMQX connection rate limiting |
| Plain-text telemetry interception | TLS on port 8883 (production) |
| Backend MQTT credentials leakage | Credentials in .env, not in source code |

### Production Hardening Checklist

**1. EMQX Security:**
- [ ] Change default admin password (DONE)
- [ ] Enable TLS on port 8883
- [ ] Disable plain MQTT port 1883 for external access (keep for internal subscriber only)
- [ ] Set rate limits per client (prevent abuse)
- [ ] Enable connection limits (max connections per client)

**2. VM Security:**
- [ ] Restrict SSH access to specific IPs (update NSG rule priority 1000)
- [ ] Disable password authentication for SSH (key-only)
- [ ] Enable automatic security updates:
  ```bash
  sudo apt install unattended-upgrades
  sudo dpkg-reconfigure -plow unattended-upgrades
  ```
- [ ] Install fail2ban for SSH brute-force protection:
  ```bash
  sudo apt install fail2ban
  sudo systemctl enable fail2ban
  ```
- [ ] Restrict EMQX dashboard to specific IPs (NSG rule 1030/1040)

**3. Database Security:**
- [ ] Use service principal or managed identity for SQL authentication
- [ ] Restrict SQL firewall to only allow VM IP and Express Backend IP

---

## 17. Infrastructure Summary

| Setting | Value |
|---------|-------|
| VM | vm-cloudsynk-emqx (Standard B2als_v2, 2 vCPU, 4 GB RAM) |
| Region | Central India |
| Public IP | 20.198.101.175 |
| MQTT Internal | Port 1883 (subscriber only) |
| MQTT TLS | Port 8883 (devices + backend) |
| EMQX Dashboard | Port 18083 |
| Cost | ~$24/month |

---

## 18. SSH Access

### From the original machine (key-based)
```bash
ssh -i ~/Downloads/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175
```

### From another machine

**Option A — Copy the SSH key (recommended, more secure)**
1. Transfer `vm-cloudsynk-emqx_key.pem` to the other machine (USB, secure file share, etc.)
2. On Linux/Mac, set correct permissions: `chmod 400 vm-cloudsynk-emqx_key.pem`
3. Connect:
```bash
ssh -i path/to/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175
```

**Option B — Enable password-based SSH (convenient, less secure)**

Run these on the VM (from an existing SSH session):
```bash
# Set a password for mqttvm
sudo passwd mqttvm

# Enable password authentication
sudo sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config.d/*.conf /etc/ssh/sshd_config

# Restart SSH service
sudo systemctl restart ssh
```

Then from any machine:
```bash
ssh mqttvm@20.198.101.175
```

---

## 19. Useful VM Commands

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

# Check disk usage
df -h

# Check memory usage
free -h

# Check CPU usage
top -bn1 | head -20

# Monitor MQTT connections
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl clients list

# Check MQTT topics
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl topics list

# Monitor message rate
watch -n 5 'sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl metrics'
```

---

## 20. Monitoring & Troubleshooting

### Health Checks

**1. EMQX Broker Health:**
```bash
# Check if EMQX is running
sudo docker ps | grep emqx

# Check EMQX metrics
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl status

# Expected output: "Node 'emqx@127.0.0.1' is started"
```

**2. Python Subscriber Health:**
```bash
# Check service status
sudo systemctl status cloudsynk-subscriber

# Expected: "Active: active (running)"

# Check recent logs for errors
sudo journalctl -u cloudsynk-subscriber --since "5 minutes ago" | grep -i error
```

**3. Database Connectivity:**
```bash
# Test SQL connection from subscriber
cd /opt/cloudsynk-subscriber
source venv/bin/activate
python -c "import pyodbc; conn = pyodbc.connect('DRIVER={ODBC Driver 18 for SQL Server};...'); print('Connected')"
```

**4. Express Backend MQTT Connection:**
```bash
# Check Express logs for MQTT connection
pm2 logs genvolt-backend | grep -i mqtt

# Expected: "MQTT Service connected to broker"
```

### Common Issues & Solutions

**Issue 1: Devices Cannot Connect to EMQX**
```bash
# Check NSG rules
az network nsg rule list --nsg-name vm-cloudsynk-emqx-nsg -g CloudSynk_Prod -o table

# Check EMQX ports are listening
sudo netstat -tlnp | grep -E '1883|8883|18083'

# Check EMQX authentication logs
sudo docker logs cloudsynk-emqxmqtt-broker --tail 100 | grep -i auth
```

**Issue 2: Subscriber Not Receiving Messages**
```bash
# Check subscriber is subscribed to correct topic
sudo journalctl -u cloudsynk-subscriber -n 50 | grep -i subscribe

# Test with mosquitto client
mosquitto_sub -h localhost -p 1883 -t "cloudsynk/+/telemetry" -v

# Check EMQX topic subscriptions
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl subscriptions list
```

**Issue 3: Config Updates Not Reaching Devices**
```bash
# Check Express Backend MQTT connection
curl http://localhost:3000/api/health/mqtt

# Monitor EMQX for config messages
mosquitto_sub -h 20.198.101.175 -p 1883 -t "cloudsynk/+/config" -v

# Check EMQX ACL allows backend to publish
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl acl reload
```

**Issue 4: Device Stuck in PENDING — Activation Payload Not Received**
```bash
# Check if device is subscribed to response topic
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl subscriptions list | grep pre-activation

# Manually re-publish activation payload via Express Backend
# POST /api/devices/:id/activate again (idempotent)
```

**Issue 5: High Memory Usage on VM**
```bash
# Check memory usage
free -h

# Check which process is using memory
ps aux --sort=-%mem | head -10
```

**Issue 6: Data Not Appearing in Dashboard**
```bash
# Check subscriber logs for SQL errors
sudo journalctl -u cloudsynk-subscriber | grep -i sql

# Verify data in SQL database
# Run query: SELECT TOP 10 * FROM IoT_Raw_Messages ORDER BY timestamp DESC

# Check decoder errors
sudo journalctl -u cloudsynk-subscriber | grep -i "decode error"
```

### Performance Monitoring

**Key Metrics to Watch:**

1. **EMQX Metrics:**
   - Connected clients: `sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl clients list | wc -l`
   - Message rate: `sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl metrics | grep messages`
   - CPU/Memory: `sudo docker stats cloudsynk-emqxmqtt-broker`

2. **Subscriber Metrics:**
   - Message processing rate: Check logs for "Inserted to SQL" count per minute
   - Error rate: `sudo journalctl -u cloudsynk-subscriber --since today | grep -c ERROR`
   - Decoder failures: `sudo journalctl -u cloudsynk-subscriber | grep -c "Failed to decode"`

3. **SQL Database:**
   - Row count growth: `SELECT COUNT(*) FROM IoT_Data_Sick WHERE timestamp > DATEADD(hour, -1, GETDATE())`
   - Insertion latency: Monitor timestamp difference between device send and SQL insert

4. **VM Resources:**
   - CPU: `top -bn1 | grep "Cpu(s)" | awk '{print $2}'`
   - Memory: `free -m | awk 'NR==2{printf "%.2f%%", $3*100/$2 }'`
   - Disk I/O: `iostat -x 1 5`

### Alerting Setup (Recommended)

**Azure Monitor Alerts:**
1. VM CPU > 80% for 5 minutes
2. VM Memory > 90% for 5 minutes
3. VM disk space < 2GB
4. EMQX container restart detected

**Custom Alerts (via Azure Function or Logic App):**
1. Subscriber service down for > 2 minutes
2. No telemetry received in last 10 minutes
3. Error rate > 5% in subscriber logs
4. Express Backend MQTT disconnected

---

---

## 21. Payment Gateway Implementation Plan

### 21.1 Recommended Gateway

**Primary: Razorpay**
- Best fit for India-based B2B SaaS (INR + USD, GST compliance built-in)
- Native subscription billing with automatic retries and dunning management
- Webhook-first design — payment events push to your backend immediately
- Customer portal out of the box for invoice history
- Supports UPI, Net Banking, Cards, International

**Alternative: Stripe**
- Better if targeting international clients heavily
- More mature subscription API, excellent docs
- India support is full as of 2023 (domestic payments via Stripe India)

**Recommendation: Start with Razorpay.** If you expand internationally or need Stripe-specific features (usage-based billing, metered plans), migrate or dual-run later.

---

### 21.2 Subscription Model Design

**Billing unit: per client, not per device.**
Each client subscribes to a plan that includes a device quota. Clients pay monthly/annually and can activate devices up to their quota.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SUBSCRIPTION MODEL                           │
│                                                                 │
│  payment_plan         client_subscription       device          │
│  ─────────────        ──────────────────        ──────          │
│  id                   id                        id              │
│  name (Basic/Pro)     client_id ──────────────> client_id       │
│  device_quota         plan_id ──────────────>   activation_status│
│  price_monthly        status (active/lapsed)    subscription_id─┘│
│  price_annual         razorpay_sub_id                           │
│  features (JSON)      current_period_end                        │
│                       grace_period_end                          │
│                       payment_method                            │
└─────────────────────────────────────────────────────────────────┘
```

**Example Plans:**

| Plan | Device Quota | Price (monthly) | Price (annual) |
|------|-------------|-----------------|----------------|
| Starter | 10 devices | ₹2,999 / $36 | ₹29,999 / $360 |
| Growth | 50 devices | ₹9,999 / $120 | ₹99,999 / $1,200 |
| Enterprise | 200 devices | ₹29,999 / $360 | ₹2,99,999 / $3,600 |
| Custom | Unlimited | Negotiated | Negotiated |

---

### 21.3 Database Schema

```sql
-- Payment plans (defined by you, not client-editable)
CREATE TABLE payment_plan (
  id                INT           IDENTITY PRIMARY KEY,
  name              NVARCHAR(50)  NOT NULL,        -- 'Starter', 'Growth', 'Enterprise'
  device_quota      INT           NOT NULL,         -- max devices allowed
  price_monthly     DECIMAL(10,2) NOT NULL,
  price_annual      DECIMAL(10,2) NOT NULL,
  currency          NVARCHAR(10)  NOT NULL DEFAULT 'INR',
  razorpay_plan_id  NVARCHAR(100) NULL,            -- Razorpay plan ID for recurring billing
  stripe_price_id   NVARCHAR(100) NULL,            -- Stripe price ID (if used)
  features          NVARCHAR(MAX) NULL,            -- JSON: extra features per plan
  is_active         BIT           NOT NULL DEFAULT 1,
  created_at        DATETIME      NOT NULL DEFAULT GETUTCDATE()
);

-- Client subscriptions (one active per client at a time)
CREATE TABLE client_subscription (
  id                     INT           IDENTITY PRIMARY KEY,
  client_id              INT           NOT NULL REFERENCES client(client_id),
  plan_id                INT           NOT NULL REFERENCES payment_plan(id),
  status                 NVARCHAR(20)  NOT NULL DEFAULT 'trialing',
  -- values: trialing | active | past_due | cancelled | expired
  razorpay_subscription_id NVARCHAR(100) NULL,   -- Razorpay subscription ID
  razorpay_customer_id     NVARCHAR(100) NULL,
  stripe_subscription_id   NVARCHAR(100) NULL,   -- Stripe subscription ID (if used)
  billing_cycle          NVARCHAR(10)  NOT NULL DEFAULT 'monthly', -- monthly | annual
  current_period_start   DATETIME      NULL,
  current_period_end     DATETIME      NULL,      -- next billing date
  grace_period_end       DATETIME      NULL,      -- devices deactivated AFTER this, not immediately
  trial_end              DATETIME      NULL,
  cancelled_at           DATETIME      NULL,
  cancel_reason          NVARCHAR(255) NULL,
  created_at             DATETIME      NOT NULL DEFAULT GETUTCDATE(),
  updated_at             DATETIME      NOT NULL DEFAULT GETUTCDATE()
);

-- Payment transaction log (audit trail)
CREATE TABLE payment_transaction (
  id                  INT           IDENTITY PRIMARY KEY,
  client_id           INT           NOT NULL REFERENCES client(client_id),
  subscription_id     INT           NULL REFERENCES client_subscription(id),
  gateway             NVARCHAR(20)  NOT NULL,  -- 'razorpay' | 'stripe'
  gateway_payment_id  NVARCHAR(100) NOT NULL,
  gateway_order_id    NVARCHAR(100) NULL,
  amount              DECIMAL(10,2) NOT NULL,
  currency            NVARCHAR(10)  NOT NULL DEFAULT 'INR',
  status              NVARCHAR(20)  NOT NULL,  -- 'captured' | 'failed' | 'refunded'
  event_type          NVARCHAR(50)  NOT NULL,  -- 'subscription.charged' | 'payment.failed' etc.
  raw_payload         NVARCHAR(MAX) NULL,      -- full webhook JSON for debugging
  created_at          DATETIME      NOT NULL DEFAULT GETUTCDATE()
);

-- Link device to subscription (tracks which subscription activated a device)
ALTER TABLE device ADD
  subscription_id INT NULL REFERENCES client_subscription(id);

-- Indexes
CREATE INDEX IX_client_subscription_client_id ON client_subscription (client_id);
CREATE INDEX IX_client_subscription_status    ON client_subscription (status);
CREATE INDEX IX_payment_transaction_client_id ON payment_transaction (client_id);
```

---

### 21.4 Payment Gateway Integration Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PAYMENT FLOW OVERVIEW                             │
│                                                                      │
│  Client Admin UI                                                     │
│    ├─ Subscribe / Upgrade plan                                       │
│    ├─ View invoices & billing history                                │
│    └─ Manage payment method                                          │
│         │                                                            │
│         ▼ POST /api/subscriptions/create                             │
│  Express Backend (PaymentService.js)                                 │
│    ├─ Creates Razorpay subscription                                  │
│    ├─ Returns checkout URL / payment link                            │
│    └─ Stores pending subscription in client_subscription             │
│         │                                                            │
│         ▼ Client completes payment on Razorpay hosted page           │
│  Razorpay / Stripe                                                   │
│    ├─ Processes payment                                              │
│    ├─ Sends webhook events to Express Backend                        │
│    │    ├─ subscription.activated → set status = active             │
│    │    ├─ subscription.charged   → extend current_period_end       │
│    │    ├─ payment.failed         → set status = past_due           │
│    │    ├─ subscription.cancelled → set status = cancelled          │
│    │    └─ subscription.completed → set status = expired            │
│    │                                                                  │
│         ▼ POST /api/webhooks/razorpay (or /stripe)                  │
│  Webhook Handler (SubscriptionService.js)                            │
│    ├─ Validates webhook signature                                    │
│    ├─ Updates client_subscription.status                            │
│    ├─ On activation → no device changes (admin still activates)     │
│    ├─ On past_due → start grace period timer                        │
│    └─ On expired/cancelled → deactivate all client devices          │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 21.5 Key Backend Services

#### PaymentService.js (`server/services/paymentService.js`)

```javascript
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

class PaymentService {

  // Create a new subscription for a client
  async createSubscription(clientId, planId, billingCycle) {
    const pool = await getPool();

    // Get plan details
    const planResult = await pool.request()
      .input('planId', planId)
      .query('SELECT * FROM payment_plan WHERE id = @planId AND is_active = 1');

    const plan = planResult.recordset[0];
    if (!plan) throw new Error('Plan not found');

    // Create Razorpay subscription
    const razorpayPlanId = plan.razorpay_plan_id;
    const subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      quantity: 1,
      total_count: billingCycle === 'annual' ? 1 : 12,
      notify_info: {
        notify_phone: 1,
        notify_email: 1
      }
    });

    // Store in DB as 'created' (not yet active)
    await pool.request()
      .input('clientId', clientId)
      .input('planId', planId)
      .input('billingCycle', billingCycle)
      .input('razorpaySubId', subscription.id)
      .query(`
        INSERT INTO client_subscription
          (client_id, plan_id, billing_cycle, status, razorpay_subscription_id, created_at, updated_at)
        VALUES
          (@clientId, @planId, @billingCycle, 'created', @razorpaySubId, GETUTCDATE(), GETUTCDATE())
      `);

    return {
      subscription_id: subscription.id,
      short_url: subscription.short_url  // Razorpay-hosted payment page
    };
  }

  // Verify webhook signature (Razorpay)
  verifyWebhookSignature(body, signature) {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest('hex');
    return expectedSignature === signature;
  }

  // Get active subscription and check device quota
  async checkDeviceQuota(clientId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('clientId', clientId)
      .query(`
        SELECT cs.id, cs.status, pp.device_quota,
               (SELECT COUNT(*) FROM device
                WHERE client_id = @clientId AND activation_status = 'ACTIVE') AS active_devices
        FROM client_subscription cs
        JOIN payment_plan pp ON cs.plan_id = pp.id
        WHERE cs.client_id = @clientId AND cs.status IN ('trialing', 'active')
      `);

    if (result.recordset.length === 0) {
      return { allowed: false, reason: 'No active subscription' };
    }

    const sub = result.recordset[0];
    if (sub.active_devices >= sub.device_quota) {
      return {
        allowed: false,
        reason: `Device quota reached (${sub.active_devices}/${sub.device_quota}). Upgrade plan to activate more devices.`,
        active_devices: sub.active_devices,
        quota: sub.device_quota
      };
    }

    return { allowed: true, active_devices: sub.active_devices, quota: sub.device_quota };
  }
}

export default new PaymentService();
```

#### SubscriptionService.js (`server/services/subscriptionService.js`)

```javascript
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import mqttService from './mqttService.js';
import sql from 'mssql';

class SubscriptionService {

  // Handle Razorpay webhook events
  async handleRazorpayEvent(event, payload) {
    logger.info(`Razorpay webhook: ${event}`);

    switch (event) {
      case 'subscription.activated':
        await this.onSubscriptionActivated(payload.subscription.entity);
        break;
      case 'subscription.charged':
        await this.onSubscriptionCharged(payload.subscription.entity, payload.payment.entity);
        break;
      case 'subscription.pending':
      case 'payment.failed':
        await this.onPaymentFailed(payload.subscription?.entity, payload.payment?.entity);
        break;
      case 'subscription.cancelled':
      case 'subscription.completed':
      case 'subscription.expired':
        await this.onSubscriptionEnded(payload.subscription.entity, event);
        break;
      default:
        logger.info(`Unhandled Razorpay event: ${event}`);
    }
  }

  async onSubscriptionActivated(subscription) {
    const pool = await getPool();
    await pool.request()
      .input('razorpaySubId', sql.NVarChar, subscription.id)
      .input('periodStart', sql.DateTime, new Date(subscription.current_start * 1000))
      .input('periodEnd', sql.DateTime, new Date(subscription.current_end * 1000))
      .query(`
        UPDATE client_subscription
        SET status = 'active',
            current_period_start = @periodStart,
            current_period_end = @periodEnd,
            grace_period_end = NULL,
            updated_at = GETUTCDATE()
        WHERE razorpay_subscription_id = @razorpaySubId
      `);
    logger.info(`Subscription activated: ${subscription.id}`);
  }

  async onSubscriptionCharged(subscription, payment) {
    const pool = await getPool();

    // Extend billing period
    await pool.request()
      .input('razorpaySubId', sql.NVarChar, subscription.id)
      .input('periodEnd', sql.DateTime, new Date(subscription.current_end * 1000))
      .query(`
        UPDATE client_subscription
        SET status = 'active',
            current_period_end = @periodEnd,
            grace_period_end = NULL,
            updated_at = GETUTCDATE()
        WHERE razorpay_subscription_id = @razorpaySubId
      `);

    // Log the transaction
    await this._logTransaction(subscription, payment, 'subscription.charged', 'captured');
    logger.info(`Subscription renewed: ${subscription.id}`);
  }

  async onPaymentFailed(subscription, payment) {
    if (!subscription) return;

    const pool = await getPool();
    const GRACE_PERIOD_DAYS = 7;  // Give clients 7 days before deactivating devices

    const gracePeriodEnd = new Date();
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + GRACE_PERIOD_DAYS);

    await pool.request()
      .input('razorpaySubId', sql.NVarChar, subscription.id)
      .input('gracePeriodEnd', sql.DateTime, gracePeriodEnd)
      .query(`
        UPDATE client_subscription
        SET status = 'past_due',
            grace_period_end = @gracePeriodEnd,
            updated_at = GETUTCDATE()
        WHERE razorpay_subscription_id = @razorpaySubId
      `);

    if (payment) await this._logTransaction(subscription, payment, 'payment.failed', 'failed');
    logger.warn(`Payment failed for subscription: ${subscription.id}. Grace period until ${gracePeriodEnd.toISOString()}`);
    // TODO: Send notification email to client admin
  }

  async onSubscriptionEnded(subscription, eventType) {
    const pool = await getPool();

    // Get client_id for this subscription
    const subResult = await pool.request()
      .input('razorpaySubId', sql.NVarChar, subscription.id)
      .query('SELECT id, client_id FROM client_subscription WHERE razorpay_subscription_id = @razorpaySubId');

    if (subResult.recordset.length === 0) return;
    const { id: subscriptionId, client_id: clientId } = subResult.recordset[0];

    // Mark subscription ended
    await pool.request()
      .input('subId', sql.Int, subscriptionId)
      .input('status', sql.NVarChar, 'expired')
      .query(`
        UPDATE client_subscription
        SET status = @status, updated_at = GETUTCDATE()
        WHERE id = @subId
      `);

    // Deactivate all ACTIVE devices for this client
    await this.deactivateAllClientDevices(clientId, subscriptionId, 'subscription_ended');
    logger.info(`Subscription ended (${eventType}): all devices for client ${clientId} deactivated`);
  }

  // Deactivate all active devices for a client (called on subscription end or grace period expiry)
  async deactivateAllClientDevices(clientId, subscriptionId, reason) {
    const pool = await getPool();

    const devicesResult = await pool.request()
      .input('clientId', sql.Int, clientId)
      .query(`
        SELECT device_id FROM device
        WHERE client_id = @clientId AND activation_status = 'ACTIVE'
      `);

    for (const device of devicesResult.recordset) {
      // Send deactivation notice via MQTT (device may or may not receive it)
      try {
        await mqttService.pushConfigUpdate(clientId, device.device_id, {
          type: 'deactivation_notice',
          status: 'deactivated',
          reason
        });
      } catch (mqttErr) {
        logger.error(`MQTT deactivation notice failed for ${device.device_id}:`, mqttErr);
      }
    }

    // Bulk update device status
    await pool.request()
      .input('clientId', sql.Int, clientId)
      .input('deactivatedAt', sql.DateTime, new Date())
      .query(`
        UPDATE device
        SET activation_status = 'INACTIVE',
            deactivated_at = @deactivatedAt
        WHERE client_id = @clientId AND activation_status = 'ACTIVE'
      `);

    logger.info(`Deactivated ${devicesResult.recordset.length} devices for client ${clientId}`);
  }

  async _logTransaction(subscription, payment, eventType, status) {
    const pool = await getPool();
    const subResult = await pool.request()
      .input('razorpaySubId', sql.NVarChar, subscription.id)
      .query('SELECT id, client_id FROM client_subscription WHERE razorpay_subscription_id = @razorpaySubId');

    if (subResult.recordset.length === 0) return;
    const { id: subscriptionId, client_id: clientId } = subResult.recordset[0];

    await pool.request()
      .input('clientId', sql.Int, clientId)
      .input('subscriptionId', sql.Int, subscriptionId)
      .input('gatewayPaymentId', sql.NVarChar, payment.id)
      .input('amount', sql.Decimal, payment.amount / 100)
      .input('currency', sql.NVarChar, payment.currency.toUpperCase())
      .input('status', sql.NVarChar, status)
      .input('eventType', sql.NVarChar, eventType)
      .query(`
        INSERT INTO payment_transaction
          (client_id, subscription_id, gateway, gateway_payment_id, amount, currency, status, event_type, created_at)
        VALUES
          (@clientId, @subscriptionId, 'razorpay', @gatewayPaymentId, @amount, @currency, @status, @eventType, GETUTCDATE())
      `);
  }
}

export default new SubscriptionService();
```

---

### 21.6 Webhook Handler Endpoint

```javascript
// server/routes/paymentRoutes.js
import express from 'express';
import paymentService from '../services/paymentService.js';
import subscriptionService from '../services/subscriptionService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Razorpay webhook — must use raw body for signature verification
router.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const body = JSON.parse(req.body);

  // Always respond 200 quickly — Razorpay retries on non-200
  res.status(200).json({ received: true });

  // Validate signature
  if (!paymentService.verifyWebhookSignature(body, signature)) {
    logger.error('Invalid Razorpay webhook signature');
    return;
  }

  // Process asynchronously after responding
  try {
    await subscriptionService.handleRazorpayEvent(body.event, body.payload);
  } catch (err) {
    logger.error('Error processing Razorpay webhook:', err);
  }
});

// Get subscription status for client (frontend)
router.get('/subscriptions/status', authenticateToken, async (req, res) => {
  const clientId = req.user.client_id;
  const pool = await getPool();

  const result = await pool.request()
    .input('clientId', clientId)
    .query(`
      SELECT cs.status, cs.billing_cycle, cs.current_period_end, cs.grace_period_end,
             pp.name as plan_name, pp.device_quota,
             (SELECT COUNT(*) FROM device WHERE client_id = @clientId AND activation_status = 'ACTIVE') AS active_devices
      FROM client_subscription cs
      JOIN payment_plan pp ON cs.plan_id = pp.id
      WHERE cs.client_id = @clientId AND cs.status NOT IN ('expired', 'cancelled')
    `);

  res.json({ success: true, data: result.recordset[0] || null });
});

export default router;
```

Add to `server.js`:
```javascript
import paymentRoutes from './routes/paymentRoutes.js';
app.use('/api', paymentRoutes);
```

---

### 21.7 Device Quota Check on Activation

Update the `activateDevice` controller to check subscription quota before proceeding:

```javascript
// In deviceController.js — add quota check before activation
import paymentService from '../services/paymentService.js';

export const activateDevice = async (req, res) => {
  const { client_id } = req.body;

  // Check device quota before activating
  const quotaCheck = await paymentService.checkDeviceQuota(client_id);
  if (!quotaCheck.allowed) {
    return res.status(403).json({
      success: false,
      error: quotaCheck.reason,
      data: { active_devices: quotaCheck.active_devices, quota: quotaCheck.quota }
    });
  }

  // ... proceed with activation as before
};
```

---

### 21.8 Grace Period Enforcement (Scheduled Job)

Razorpay retries failed payments automatically (typically 3 attempts over several days). The grace period is set server-side when payment first fails. A daily scheduled job deactivates devices whose grace period has expired:

```javascript
// server/jobs/subscriptionEnforcer.js
// Run daily via Azure Function timer trigger or node-cron

import { getPool } from '../config/database.js';
import subscriptionService from '../services/subscriptionService.js';
import sql from 'mssql';

export async function enforceExpiredGracePeriods() {
  const pool = await getPool();

  // Find subscriptions past grace period, still showing active devices
  const result = await pool.request()
    .query(`
      SELECT id, client_id
      FROM client_subscription
      WHERE status = 'past_due'
        AND grace_period_end < GETUTCDATE()
    `);

  for (const sub of result.recordset) {
    await subscriptionService.deactivateAllClientDevices(sub.client_id, sub.id, 'grace_period_expired');

    await pool.request()
      .input('id', sql.Int, sub.id)
      .query(`UPDATE client_subscription SET status = 'expired', updated_at = GETUTCDATE() WHERE id = @id`);
  }
}
```

---

### 21.9 Environment Variables (Payment)

```env
# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_secret_here
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here

# Payment Config
SUBSCRIPTION_GRACE_PERIOD_DAYS=7
PAYMENT_CURRENCY=INR
```

---

### 21.10 New API Endpoints (Payment)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/subscriptions/create` | Admin | Create new subscription, returns Razorpay checkout URL |
| `GET` | `/api/subscriptions/status` | Client Admin | Current plan, device count, billing date |
| `GET` | `/api/subscriptions/invoices` | Client Admin | Invoice history |
| `POST` | `/api/subscriptions/cancel` | Admin | Cancel subscription at period end |
| `POST` | `/api/subscriptions/upgrade` | Admin | Upgrade plan (prorated billing) |
| `POST` | `/api/webhooks/razorpay` | Public (signature-verified) | Razorpay event hook |

---

## 22. Architecture Changes & Recommendations

### 22.1 Current Architecture Gaps

The following gaps exist in the current architecture and should be addressed:

| Gap | Risk | Priority |
|-----|------|----------|
| No message queue between webhook → device lifecycle | Webhook processing failure = missed payment event | High |
| Single MQTT broker (no HA) | EMQX VM going down = all devices lose connectivity | High |
| Python subscriber is a single process | Subscriber crash = data loss during downtime | Medium |
| No dead-letter handling for failed SQL inserts | Corrupted/unsupported payloads are silently dropped | Medium |
| No API rate limiting on EMQX auth/ACL hooks | Malicious device flood could overload Express Backend | Medium |
| Device Config Function App not in this repo | Device startup config is a separate service with no docs here | Low |

---

### 22.2 Recommended Architecture Changes

#### Change 1: Add Azure Service Bus for Webhook Reliability

**Problem:** If the webhook handler throws or the DB is unavailable, Razorpay retries but you may miss state transitions.

**Solution:** Webhook handler pushes event to Azure Service Bus queue → separate worker processes it. Guarantees at-least-once delivery.

```
Razorpay Webhook
      ↓
POST /api/webhooks/razorpay
      ↓ (respond 200 immediately)
Azure Service Bus Queue: payment-events
      ↓ (worker reads queue)
SubscriptionService.handleRazorpayEvent()
      ↓
SQL + MQTT device deactivation
```

**Azure Service Bus** is already available in your subscription and fits well with the Azure-native stack.

---

#### Change 2: EMQX High Availability (for production scale)

**Problem:** Single EMQX instance = single point of failure. If the VM is patched or restarts, all devices disconnect simultaneously.

**Solution for 500-600 devices:** EMQX clustering with 2 nodes behind Azure Load Balancer.

```
Azure Load Balancer (port 8883)
     ├─ vm-emqx-1 (primary)
     └─ vm-emqx-2 (secondary, hot standby)
```

- Both nodes share the same auth/ACL config (HTTP hooks to same Express Backend)
- Device reconnect on failover is automatic (MQTT reconnect logic)
- Cost: ~$48/month for 2× Standard B2als_v2 VMs

**Near-term workaround (lower cost):** Use EMQX's built-in persistence + configure Azure VM auto-restart. Not HA, but recovers in ~2 minutes.

---

#### Change 3: Add Azure Cache for Redis for Auth/ACL Performance

**Problem:** Every MQTT packet triggers `POST /api/mqtt/acl` to Express Backend → SQL Server. At 500 devices × frequent publishes, this is a significant SQL load.

**Solution:** Cache device auth results in Redis with a short TTL (30–60 seconds).

```javascript
// In mqttAuthRoutes.js
import redis from 'ioredis';
const cache = new redis(process.env.REDIS_URL);

router.post('/mqtt/acl', async (req, res) => {
  const { username } = req.body;
  const cacheKey = `device:acl:${username}`;

  // Check cache first
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // ... query SQL ...

  // Cache result for 60 seconds
  await cache.setex(cacheKey, 60, JSON.stringify(result));
  res.json(result);
});

// On device deactivation, invalidate cache immediately
async function invalidateDeviceCache(deviceId) {
  await cache.del(`device:acl:${deviceId}`);
  await cache.del(`device:auth:${deviceId}`);
}
```

Azure Cache for Redis Basic tier: ~$13/month. Reduces SQL auth queries by ~95%.

---

#### Change 4: Move Subscription Enforcer to Azure Function

**Problem:** Running a cron job inside the Express Backend couples billing logic to your API server. Server restarts miss scheduled runs.

**Solution:** Azure Function with Timer trigger (daily at 2 AM IST).

```
Azure Function: subscription-enforcer
  ├─ Trigger: Timer (0 0 20 * * * = 2 AM IST daily)
  ├─ Queries: subscriptions where grace_period_end < NOW()
  └─ Calls: POST /api/internal/deactivate-expired-subscriptions
            (internal endpoint, IP-restricted to Azure Function outbound IP)
```

This is consistent with the existing Device Config Function App pattern already in your stack.

---

#### Change 5: Telemetry Buffering for Subscriber Resilience

**Problem:** If the Python subscriber crashes or SQL is briefly unavailable, MQTT messages in-flight are lost. EMQX holds messages for persistent sessions, but the subscriber uses `clean=True`.

**Solution:** Change subscriber to use persistent MQTT session (`clean=False`, `client_id` fixed) + add local file-based fallback buffer.

```python
# local_subscriber.py
mqtt_client = mqtt.Client(
    client_id="cloudsynk-subscriber-prod",
    clean_session=False  # EMQX will queue messages during downtime
)
```

EMQX will buffer up to N messages per subscriber while it's offline and replay on reconnect.

---

### 22.3 Updated Architecture Diagram (Target State)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DEVICE LAYER (500-600 devices)                    │
│  PENDING → pre-activation topic                                      │
│  ACTIVE  → cloudsynk/{IMEI}/telemetry                               │
│  INACTIVE→ blocked by EMQX auth                                      │
└──────────────────────────────────────────────────────────────────────┘
                         ↓↑ MQTT TLS 8883
         ┌───────────────────────────────────┐
         │   Azure Load Balancer (port 8883)  │  ← Change 2
         │   ├─ vm-emqx-1                    │
         │   └─ vm-emqx-2                    │
         └───────────────┬───────────────────┘
                         │
          ┌──────────────▼───────────────────┐
          │  Redis Cache (Azure Cache)        │  ← Change 3
          │  ACL/Auth results cached 60s      │
          └──────────────┬───────────────────┘
                         │ HTTP auth/acl hooks
┌────────────────────────▼──────────────────────────────────────────────┐
│                 Express Backend (Azure App Service)                    │
│  ├─ Device Lifecycle APIs  (activate / deactivate / pending)         │
│  ├─ Payment APIs           (subscriptions / invoices)                │
│  ├─ MQTT Auth/ACL Hooks    (/api/mqtt/auth, /api/mqtt/acl)           │
│  └─ Webhook Handler        (/api/webhooks/razorpay)                  │
│             ↓ enqueue event                                          │
│   Azure Service Bus: payment-events queue                ← Change 1  │
│             ↓ worker reads                                           │
│   SubscriptionService → deactivates devices on payment failure       │
└───────────────────────────────────────────────────────────────────────┘
              ↓ SQL                 ↑ MQTT publish config
┌─────────────────────────────┐    ┌──────────────────────────────────┐
│ Azure SQL Server             │    │ Razorpay / Stripe               │
│  device, client_subscription│    │  ├─ Subscription billing         │
│  payment_plan, transactions │    │  ├─ Failed payment retries       │
│  IoT_Data_*, IoT_Raw_Msgs   │    │  └─ Webhook events              │
└─────────────────────────────┘    └──────────────────────────────────┘
              ↑
┌─────────────────────────────┐
│ Azure Functions              │
│  ├─ Device Config Fn App    │  ← existing
│  └─ subscription-enforcer   │  ← Change 4: daily grace period check
└─────────────────────────────┘
```

---

## 23. Architectural Insights & Decisions

### 23.1 Revenue Model: Per-Client Subscription is the Right Choice

**Don't bill per-device.** Billing per device creates friction for customers ("will adding one more sensor cost me more?") and creates churn risk. Per-client subscription with a device quota:
- Predictable revenue for you
- Predictable cost for customers
- Customers upgrade plans when they hit quota, not when they add a device
- Easier to sell "upgrade for 50% more devices" than "each device is ₹X/month"

---

### 23.2 The Grace Period is Critical for Retention

Never deactivate devices the instant a payment fails. A 7-day grace period is industry standard. Reasons:
- Card expiry, bank downtime, or UPI failure are usually resolved within 1–3 days
- Immediate deactivation alienates customers for what is often not their fault
- Razorpay auto-retries failed payments; let the retry window happen inside the grace period
- The deactivation notice message sent via MQTT (`{ "reason": "subscription_expired" }`) gives operational devices a chance to display a warning on-site before going offline

---

### 23.3 Idempotent Webhook Handlers are Non-Negotiable

Razorpay (and Stripe) will retry webhooks if your endpoint doesn't return 200. The same `subscription.charged` event can arrive 2–3 times. Your handler must be idempotent:
- Use `gateway_payment_id` as a unique key in `payment_transaction` with a UNIQUE constraint
- Check if the event has already been processed before acting
- `UPDATE ... WHERE status != 'active'` is safer than unconditional UPDATE

---

### 23.4 MQTT Auth/ACL Hook Latency Matters

Every device publish goes through the ACL hook. At 500 devices publishing every 5 minutes, that's 100 ACL requests per minute at minimum — potentially 10× more during debug mode (30s interval). If the Express Backend is under load during a deploy or DB spike, devices will be denied and data will be lost.

Mitigations in priority order:
1. **Redis cache** (Change 3) — eliminates 95% of SQL queries
2. **Separate the auth/ACL endpoint** from the main API server using a lightweight Express instance with only the auth routes and no middleware overhead
3. **Return `allow` optimistically for ACTIVE devices during brief Express downtime** — not recommended for security but acceptable as a degraded-mode fallback

---

### 23.5 Device Config Function App Should Be Documented Here

The "Device Config Function App" is referenced in the data flow (Scenario 2: Active Device Startup) but is a separate Azure Function not covered in this document. This creates a knowledge gap: if that Function is misconfigured or returns wrong MQTT topics, an ACTIVE device will publish to the wrong topic and its telemetry will silently vanish.

**Recommended action:** Add the Device Config Function App's API contract to this document (request/response schema, which database tables it reads). At minimum, the response must include:
- `mqtt_broker`: `20.198.101.175:8883`
- `mqtt_topic_pub`: `cloudsynk/{IMEI}/telemetry`
- `mqtt_topic_sub`: `cloudsynk/{IMEI}/config`
- `mqtt_username`: `{device_id}`
- `mqtt_password`: (device retrieves its own password — or activation payload already provided it)

---

### 23.6 Activation Payload Delivery is Best-Effort

When a device is activated, the backend publishes a retained telemetryConfig message to `cloudsynk/{IMEI}/config`. The device subscribes to `cloudsynk/{IMEI}/config` during Phase 1 to receive its credentials. This is best-effort without retained messages: if the device has disconnected between publishing its pre-activation message and the admin clicking "Activate", the payload is never received.

**Solution:** Use QoS 1 with a retained message:

```javascript
// In mqttService.js publishActivationPayload
this.client.publish(topic, JSON.stringify(payload), {
  qos: 1,
  retain: true  // Device will receive it even if it reconnects later
}, callback);
```

With `retain: true`, EMQX stores the last activation payload on that topic. The device subscribes on reconnect and immediately gets the payload. After processing, the device should publish an acknowledgement and the backend should clear the retained message.

---

### 23.7 Plan for Subscription Upgrades Without Downtime

When a client upgrades from Starter (10 devices) to Growth (50 devices), the new quota must take effect immediately — no device restart, no re-authentication. This is already handled: the quota check only happens at activation time, and EMQX never re-validates already-connected devices. An upgrade is a simple `UPDATE client_subscription SET plan_id = @newPlan`.

---

*Document Version 2.1 — Updated March 23, 2026*
*Previous version: v2.0 (March 23, 2026) | v1.0 (March 18, 2026)*
