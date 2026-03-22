# CloudSynk MQTT Broker - Azure VM Setup Guide

**Reference Document:** CloudSynk_MQTT_Broker_Guide_v4.docx (Section 6.1)
**Date Started:** 2026-03-18
**Status:** VM Infrastructure Ready, Subscriber Code Pending

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         DEVICE LAYER (500-600 devices)                 │
├────────────────────────────────────────────────────────────────────────┤
│  On Startup:                                                           │
│    → HTTP GET /api/v1/device-config (Device Config Function App)      │
│      ← Initial config: mqtt_broker, topics, device_settings           │
│                                                                        │
│  Continuous Operation:                                                 │
│    → MQTT PUBLISH: cloudsynk/{client_id}/{device_id}/telemetry        │
│    ← MQTT SUBSCRIBE: cloudsynk/{client_id}/{device_id}/config         │
│      (receives instant config updates from dashboard)                 │
└────────────────────────────────────────────────────────────────────────┘
                              ↓↑ MQTT TLS Port 8883
┌────────────────────────────────────────────────────────────────────────┐
│              Azure VM (vm-cloudsynk-emqx) - MQTT BROKER                │
├────────────────────────────────────────────────────────────────────────┤
│  EMQX Broker (Docker)                                                  │
│    ├─ Port 1883 (internal only - for subscriber)                      │
│    ├─ Port 8883 (TLS external - for devices & Express backend)        │
│    ├─ Port 18083 (dashboard)                                          │
│    └─ ACL: Devices publish to own /telemetry, subscribe to own /config│
│                                                                        │
│  Python Subscriber (systemd service)                                   │
│    ├─ Connects to: localhost:1883                                     │
│    ├─ Subscribes to: cloudsynk/+/+/telemetry (all device telemetry)   │
│    ├─ Decodes hex payload using existing decoders                     │
│    └─ Inserts to Azure SQL: IoT_Raw_Messages + IoT_Data_*             │
└────────────────────────────────────────────────────────────────────────┘
          ↓ SQL INSERT                              ↑ MQTT PUBLISH config
┌────────────────────────────────────────────────────────────────────────┐
│                 Azure SQL Server (sqlserver-cs-db-prod)                │
│                         Database: cs_db_prod                           │
├────────────────────────────────────────────────────────────────────────┤
│  Tables:                                                               │
│    ├─ device (device_id, client_id, debugmode, user_func_config)      │
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
│    ├─ GET /api/dashboard/* (read telemetry data)                      │
│    ├─ PUT /api/device-config/:deviceId (update config)                │
│    └─ PATCH /api/device-config/:deviceId/debugmode (toggle debug)     │
│                                                                        │
│  MQTT Publisher (mqttService.js):                                     │
│    ├─ Connects to: vm-cloudsynk-emqx:8883 (TLS)                       │
│    ├─ On config update → PUBLISH to cloudsynk/{client_id}/{device_id}/config│
│    └─ Pushes real-time config updates to devices                      │
└────────────────────────────────────────────────────────────────────────┘
                              ↓ React App
┌────────────────────────────────────────────────────────────────────────┐
│              React Frontend (genvolt-app-main/client)                  │
├────────────────────────────────────────────────────────────────────────┤
│  Admin actions:                                                        │
│    ├─ Toggle Debug Mode ON → Backend → MQTT push config update        │
│    ├─ Change Motor_On_Time → Backend → MQTT push config update        │
│    └─ View real-time telemetry from SQL database                      │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts

**Topic Structure:**
- Telemetry (device publishes): `cloudsynk/{client_id}/{device_id}/telemetry`
- Config (device subscribes): `cloudsynk/{client_id}/{device_id}/config`

**Multi-Tenant Support:**
- Each device belongs to a `client_id` (stored in database)
- Topic pattern automatically isolates clients
- No new topics needed for different clients

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
- **Zero manual EMQX configuration per device** - scales to 1000s of devices
- ACL enforcement automatic via HTTP ACL check (pattern-based)

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
| **Cost** | ~$17.96/month (~Rs.1,526/month) |

### NSG Rules (vm-cloudsynk-emqx-nsg)

| Priority | Name | Port | Protocol | Source |
|---|---|---|---|---|
| 1000 | SSH | 22 | TCP | Any |
| 1010 | MQTT | 1883 | TCP | Any |
| 1020 | MQTT-TLS | 8883 | TCP | Any |
| 1030/1040 | EMQX-Dashboard | 18083 | TCP | My IP |

### Quota Change

- **Standard Basv2 Family vCPUs** in Central India: increased from 0 to 2

---

## Completed Steps

### 1. Azure VM Created
- [x] Resource group: CloudSynk_Prod
- [x] VM: vm-cloudsynk-emqx (Standard B2als_v2)
- [x] Ubuntu Server 24.04 LTS
- [x] SSH key generated and downloaded
- [x] NSG rules configured (SSH, MQTT, MQTT-TLS, EMQX Dashboard)
- [x] Quota increased for Basv2 family (0 -> 2 vCPUs)

### 2. Docker Installed
- [x] `sudo apt update && sudo apt install -y docker.io`
- [x] `sudo systemctl enable docker && sudo systemctl start docker`
- [x] `sudo usermod -aG docker $USER`

### 3. EMQX Broker Running
- [x] Docker container: `cloudsynk-emqxmqtt-broker`
- [x] Image: `emqx/emqx:latest`
- [x] Ports: 1883 (MQTT), 8883 (MQTT-TLS), 18083 (Dashboard)
- [x] Restart policy: `always`
- [x] Dashboard accessible at `http://20.198.101.175:18083`
- [x] Default login: admin / public (CHANGE THIS)

**Command used:**
```bash
sudo docker run -d --name cloudsynk-emqxmqtt-broker \
  --restart always \
  -p 1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  emqx/emqx:latest
```

### 4. Python Environment Prepared
- [x] Python 3.12 installed (came with Ubuntu 24.04)
- [x] python3-pip, python3-venv installed
- [x] Virtual environment created at `/opt/cloudsynk-subscriber/venv`
- [x] `paho-mqtt` 2.1.0 installed
- [x] `pyodbc` 5.3.0 installed

---

## Remaining Steps

### 5. Change EMQX Dashboard Password
- [x] Login to `http://20.198.101.175:18083` with admin/public
- [x] Default password changed

### 6. Write local_subscriber.py
- [ ] Create the MQTT subscriber script that:
  - Connects to EMQX on `localhost:1883`
  - Subscribes to: `cloudsynk/+/+/telemetry` (wildcard for all clients/devices)
  - Parses topic to extract `client_id` and `device_id`
  - Uses existing Decoder Registry to decode hex payloads (P1/P2/P3/H1/Gas)
  - Inserts decoded data into Azure SQL (IoT_Raw_Messages + IoT_Data_*)
  - **Does NOT publish responses** (one-way telemetry ingestion only)
- [ ] Location on VM: `/opt/cloudsynk-subscriber/local_subscriber.py`

**Topic Parsing Example:**
```python
# Topic: cloudsynk/123/SICK_001/telemetry
# Extract: client_id=123, device_id=SICK_001
```

**Subscriber Responsibilities:**
- ✅ Receive telemetry from devices
- ✅ Decode payloads using existing decoders
- ✅ Insert to SQL database
- ❌ Does NOT handle config updates (Express Backend handles this)

### 7. Copy Decoders to VM
- [ ] Copy existing decoders from local machine to VM:
```bash
scp -i ~/Downloads/vm-cloudsynk-emqx_key.pem -r \
  "E:/OneDrive/Genvolt/Development/Sick_Sensor/Http_Ingest/decoders" \
  mqttvm@20.198.101.175:/opt/cloudsynk-subscriber/
```
- [ ] Existing decoders available locally at:
  - `Sick_Sensor/Http_Ingest/decoders/factory.py`
  - `Sick_Sensor/Http_Ingest/decoders/base.py`
  - `Sick_Sensor/Http_Ingest/decoders/device_decoders/p1_fault_decoder.py`
  - `Sick_Sensor/Http_Ingest/decoders/device_decoders/p2_sick_decoder.py`
  - `Sick_Sensor/Http_Ingest/decoders/device_decoders/p3_sick_decoder.py`
  - `Sick_Sensor/Http_Ingest/decoders/device_decoders/h1_hypure_decoder.py`
  - `Sick_Sensor/Http_Ingest/decoders/device_decoders/default.py`

### 8. Install ODBC Driver on VM
- [x] Microsoft signing key added
- [x] Microsoft repo added to apt sources
- [x] `msodbcsql18` (ODBC Driver 18) installed
- [x] `unixodbc-dev` installed

**Commands used:**
```bash
curl -s https://packages.microsoft.com/keys/microsoft.asc | sudo tee /etc/apt/trusted.gpg.d/microsoft.asc
curl -s https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
curl -s https://packages.microsoft.com/config/ubuntu/24.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt update && sudo ACCEPT_EULA=Y apt install -y msodbcsql18 unixodbc-dev
```

### 9. Set Up Environment Variables on VM
- [x] `.env` file created at `/opt/cloudsynk-subscriber/.env`
- [x] File permissions set to 600 (owner-only read/write)
- [x] Contains: DB_SERVER, DB_NAME, DB_USER, DB_PASSWORD, MQTT_BROKER, MQTT_PORT

### 10. Create systemd Service
- [ ] Create service file so subscriber auto-starts:
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

### 10a. Configure Express Backend MQTT Publisher

**Purpose:** Enable Express Backend to push real-time config updates to devices via MQTT

**Location:** `/genvolt-app-main/server/services/mqttService.js`

**Installation Steps:**

1. **Install MQTT client library:**
```bash
cd /path/to/genvolt-app-main/server
npm install mqtt
```

2. **Add environment variables to Express Backend `.env`:**
```env
MQTT_BROKER_HOST=20.198.101.175
MQTT_BROKER_PORT=8883
MQTT_BROKER_TLS=true
MQTT_BACKEND_USER=backend_publisher
MQTT_BACKEND_PASSWORD=your_secure_password_here
```

3. **Create MQTT service:** (file: `server/services/mqttService.js`)
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

  disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}

export default new MQTTService();
```

4. **Initialize in server.js:**
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

5. **Use in deviceConfigController.js:**
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

**Testing:**
```bash
# From Express Backend logs, you should see:
# "MQTT Service connected to broker"
# "Config pushed to cloudsynk/123/SICK_001/config"
```

### 11. Configure TLS (Production)
- [ ] Obtain TLS certificate (Let's Encrypt or purchased)
- [ ] Configure EMQX for TLS on port 8883
- [ ] Disable plain MQTT port 1883 for external access
- [ ] Update NSG to remove port 1883 rule

### 12. Configure EMQX Authentication & ACL (Database-Backed - SCALABLE)

**⚠️ IMPORTANT: Use database-backed authentication to avoid manual configuration per device!**

This setup allows EMQX to authenticate devices directly from your SQL database. No manual user creation needed for each of the 500-600 devices.

#### Step 12a: Database Schema Changes

Add MQTT credentials to existing device table:

```sql
-- Run on cs_db_prod database
ALTER TABLE device
ADD mqtt_username NVARCHAR(100) NULL,
    mqtt_password_hash NVARCHAR(255) NULL,
    mqtt_enabled BIT DEFAULT 1;

-- Create index for faster authentication lookups
CREATE NONCLUSTERED INDEX IX_device_mqtt_username
ON device (mqtt_username)
WHERE mqtt_enabled = 1;

-- Update existing devices with MQTT credentials (one-time migration)
-- Note: In production, use a script to generate secure passwords
UPDATE device
SET mqtt_username = device_id,
    mqtt_enabled = 1
WHERE mqtt_username IS NULL;
```

#### Step 12b: Configure EMQX Database Authentication

**Access EMQX Dashboard:** `http://20.198.101.175:18083`

**1. Create SQL Server Authentication (Management → Authentication → Create)**

- **Type:** PostgreSQL or MySQL (EMQX doesn't support SQL Server directly)

**⚠️ Workaround for SQL Server:**
Since EMQX doesn't natively support SQL Server, use one of these approaches:

**Option A: HTTP Authentication (Recommended)**
- Create a lightweight API endpoint on Express Backend that EMQX calls to verify credentials
- EMQX → HTTP GET to Express Backend → Backend queries SQL Server → Returns auth result

**Option B: Sync to PostgreSQL/MySQL**
- Create a lightweight PostgreSQL/MySQL instance on the VM
- Sync device credentials from SQL Server to PostgreSQL every hour
- EMQX queries PostgreSQL for authentication

**Option C: Built-in Database + Sync Script**
- Use EMQX built-in database
- Create a script on Express Backend that syncs device credentials to EMQX via HTTP API when devices are created/updated

**For this guide, we'll use Option A (HTTP Authentication):**

**Step 1: Create Auth Endpoint on Express Backend**

File: `/genvolt-app-main/server/routes/mqttAuthRoutes.js`

```javascript
import express from 'express';
import bcrypt from 'bcryptjs';
import sql from 'mssql';

const router = express.Router();

// EMQX HTTP Authentication Hook
router.post('/mqtt/auth', async (req, res) => {
  const { clientid, username, password } = req.body;

  try {
    const pool = await sql.connect();
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query(`
        SELECT mqtt_password_hash, mqtt_enabled, client_id
        FROM device
        WHERE mqtt_username = @username
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ result: 'deny', reason: 'User not found' });
    }

    const device = result.recordset[0];

    if (!device.mqtt_enabled) {
      return res.status(403).json({ result: 'deny', reason: 'Device disabled' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, device.mqtt_password_hash);

    if (isValid) {
      res.json({
        result: 'allow',
        is_superuser: false
      });
    } else {
      res.status(401).json({ result: 'deny', reason: 'Invalid password' });
    }
  } catch (error) {
    console.error('MQTT auth error:', error);
    res.status(500).json({ result: 'deny', reason: 'Internal error' });
  }
});

// EMQX HTTP ACL Check Hook
router.post('/mqtt/acl', async (req, res) => {
  const { clientid, username, topic, action } = req.body;

  try {
    const pool = await sql.connect();
    const result = await pool.request()
      .input('username', sql.NVarChar, username)
      .query('SELECT client_id FROM device WHERE mqtt_username = @username');

    if (result.recordset.length === 0) {
      return res.json({ result: 'deny', reason: 'Device not found' });
    }

    const device = result.recordset[0];
    const allowedClientId = device.client_id;

    // Pattern-based ACL
    if (action === 'publish') {
      const expectedTopic = `cloudsynk/${allowedClientId}/${username}/telemetry`;
      if (topic === expectedTopic) {
        return res.json({ result: 'allow' });
      }
    }

    if (action === 'subscribe') {
      const expectedTopic = `cloudsynk/${allowedClientId}/${username}/config`;
      if (topic === expectedTopic) {
        return res.json({ result: 'allow' });
      }
    }

    res.json({ result: 'deny', reason: 'Topic not allowed' });
  } catch (error) {
    console.error('MQTT ACL error:', error);
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

**Step 2: Configure EMQX HTTP Auth Plugin**

In EMQX Dashboard:

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

**Step 3: Create Backend/Subscriber Users (Manual - One Time Only)**

Create separate users for backend_publisher and local_subscriber in EMQX built-in database:

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
ALLOW publish cloudsynk/+/+/config
DENY subscribe #
```

**Rules for local_subscriber:**
```
ALLOW subscribe cloudsynk/+/+/telemetry
DENY publish #
```

#### Step 12c: Device Provisioning Workflow (Zero Manual EMQX Work)

**When Admin Creates New Device in Dashboard:**

File: `/genvolt-app-main/server/controllers/deviceController.js`

```javascript
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export const createDevice = async (req, res) => {
  const { device_id, client_id, model, machine_id } = req.body;

  try {
    // Auto-generate MQTT credentials
    const mqtt_username = device_id;
    const mqtt_password = crypto.randomBytes(16).toString('hex'); // 32 char random password
    const mqtt_password_hash = await bcrypt.hash(mqtt_password, 10);

    // Insert device with MQTT credentials
    const pool = await sql.connect();
    await pool.request()
      .input('device_id', sql.NVarChar, device_id)
      .input('client_id', sql.Int, client_id)
      .input('model', sql.NVarChar, model)
      .input('machine_id', sql.NVarChar, machine_id)
      .input('mqtt_username', sql.NVarChar, mqtt_username)
      .input('mqtt_password_hash', sql.NVarChar, mqtt_password_hash)
      .input('mqtt_enabled', sql.Bit, 1)
      .query(`
        INSERT INTO device (
          device_id, client_id, Model, machin_id,
          mqtt_username, mqtt_password_hash, mqtt_enabled
        )
        VALUES (
          @device_id, @client_id, @model, @machine_id,
          @mqtt_username, @mqtt_password_hash, @mqtt_enabled
        )
      `);

    // Return credentials (SHOW ONLY ONCE - admin must save)
    res.json({
      success: true,
      device_id,
      mqtt_credentials: {
        broker: process.env.MQTT_BROKER_URL || 'mqtts://20.198.101.175:8883',
        username: mqtt_username,
        password: mqtt_password,  // ⚠️ Display only once!
        topic_publish: `cloudsynk/${client_id}/${device_id}/telemetry`,
        topic_subscribe: `cloudsynk/${client_id}/${device_id}/config`
      },
      warning: '⚠️ Save these credentials now! Password will not be shown again.'
    });

  } catch (error) {
    console.error('Error creating device:', error);
    res.status(500).json({ error: 'Failed to create device' });
  }
};
```

**Result:**
- No manual EMQX configuration needed!
- Device credentials stored in SQL database
- EMQX authenticates via HTTP call to Express Backend
- Express Backend queries SQL Server and validates credentials
- Scales to 1000s of devices automatically

#### Summary: No Manual Work Per Device

✅ **One-time setup:** Configure HTTP authentication in EMQX
✅ **Per device:** Just create in dashboard (auto-generates credentials)
✅ **EMQX queries:** Express Backend → SQL Server
✅ **Scales to:** Unlimited devices
✅ **ACL enforcement:** Automatic via HTTP ACL check

### 13. Test End-to-End

**Test 1: Telemetry Flow (Device → SQL → Dashboard)**
- [ ] Use MQTT test client to publish telemetry:
```bash
mosquitto_pub -h 20.198.101.175 -p 1883 \
  -t "cloudsynk/123/SICK_001/telemetry" \
  -u "SICK_001" -P "device_password" \
  -m '{"device_id":"SICK_001","data":"0x1A2B3C4D..."}'
```
- [ ] Check Python subscriber logs: `sudo journalctl -u cloudsynk-subscriber -f`
- [ ] Verify data decoded and inserted to Azure SQL
- [ ] Verify data appears in web dashboard

**Test 2: Config Push Flow (Dashboard → Device)**
- [ ] Open Device Config page in dashboard
- [ ] Select device SICK_001
- [ ] Toggle Debug Mode ON or change Motor_On_Time
- [ ] Check Express Backend logs for: "Config pushed to cloudsynk/123/SICK_001/config"
- [ ] Use MQTT test client to subscribe to config topic:
```bash
mosquitto_sub -h 20.198.101.175 -p 1883 \
  -t "cloudsynk/123/SICK_001/config" \
  -u "SICK_001" -P "device_password" \
  -v
```
- [ ] Verify config update received:
```json
{
  "type": "config_update",
  "timestamp": "2026-03-18T10:30:00Z",
  "telemetry_interval": 30,
  "device_settings": {
    "Motor_On_Time": 600,
    "log_level": "verbose"
  }
}
```

**Test 3: Multi-Client Isolation**
- [ ] Create devices for different clients (client_id: 123, 456)
- [ ] Verify device from client 123 cannot subscribe to client 456 topics
- [ ] Verify ACL rules enforced by EMQX

**Test 4: Express Backend Failover**
- [ ] Disconnect Express Backend from MQTT
- [ ] Update device config in dashboard
- [ ] Verify config saved to SQL (even though MQTT push failed)
- [ ] Reconnect Express Backend
- [ ] Verify subsequent config updates work

---

## Complete Data Flow Examples

### Scenario 1: Device Startup

```
1. Device powers on
   ↓
2. HTTP GET to Device Config Function App:
   GET /api/v1/device-config/communication?device_id=SICK_001
   ← Response:
   {
     "mqtt_broker": "20.198.101.175:8883",
     "mqtt_topic_pub": "cloudsynk/123/SICK_001/telemetry",
     "mqtt_topic_sub": "cloudsynk/123/SICK_001/config",
     "telemetry_interval": 300,
     "device_settings": {
       "Motor_On_Time": 500,
       "Motor_Off_Time": 300,
       "log_level": "normal"
     }
   }
   ↓
3. Device connects to EMQX broker (TLS)
   ↓
4. Device subscribes to: cloudsynk/123/SICK_001/config
   ↓
5. Device starts telemetry loop (every 300 seconds)
```

### Scenario 2: Admin Enables Debug Mode

```
1. Admin opens dashboard → Device Config page
   ↓
2. Toggles Debug Mode ON for SICK_001
   ↓
3. Dashboard sends: PATCH /api/device-config/SICK_001/debugmode
   { "debugMode": true }
   ↓
4. Express Backend:
   - Updates SQL: debugmode=1, telemetry_interval=30, log_level="verbose"
   - Looks up device: client_id=123
   - Calls mqttService.pushConfigUpdate(123, "SICK_001", {...})
   ↓
5. Express Backend → MQTT PUBLISH:
   Topic: cloudsynk/123/SICK_001/config
   Payload: {
     "type": "config_update",
     "telemetry_interval": 30,
     "device_settings": {
       "Motor_On_Time": 500,
       "log_level": "verbose"
     }
   }
   ↓
6. EMQX routes message to SICK_001 (subscribed)
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

### Scenario 3: Telemetry Ingestion

```
1. Device collects sensor data
   ↓
2. Device encodes data as hex payload
   ↓
3. MQTT PUBLISH:
   Topic: cloudsynk/123/SICK_001/telemetry
   Payload: {
     "device_id": "SICK_001",
     "data": "0x1A2B3C4D5E6F..."
   }
   ↓
4. EMQX receives message
   ↓
5. Python Subscriber (subscribed to cloudsynk/+/+/telemetry):
   - Parses topic → client_id=123, device_id=SICK_001
   - Decodes hex using DecoderFactory (P1/P2/P3/H1)
   - Extracts fields: Motor_RPM, Runtime_Min, GPS, etc.
   ↓
6. Subscriber inserts to SQL:
   - IoT_Raw_Messages (raw payload)
   - IoT_Data_Sick (decoded fields)
   ↓
7. Data available in dashboard (<5 seconds total latency)
```

### How debugmode Works (UI Concept)

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

## SSH Access

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

## Monitoring & Troubleshooting

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
# (on your Express Backend server)
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
mosquitto_sub -h localhost -p 1883 -t "cloudsynk/+/+/telemetry" -v

# Check EMQX topic subscriptions
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl subscriptions list
```

**Issue 3: Config Updates Not Reaching Devices**
```bash
# Check Express Backend MQTT connection
# (on Express Backend)
curl http://localhost:3000/api/health/mqtt

# Monitor EMQX for config messages
mosquitto_sub -h 20.198.101.175 -p 1883 -t "cloudsynk/+/+/config" -v

# Check EMQX ACL allows backend to publish
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl acl reload
```

**Issue 4: High Memory Usage on VM**
```bash
# Check memory usage
free -h

# Check which process is using memory
ps aux --sort=-%mem | head -10

# If EMQX is using too much memory, adjust config:
# Edit EMQX config to limit connections or message queue
```

**Issue 5: Data Not Appearing in Dashboard**
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

## Security Best Practices

### Production Hardening Checklist

**1. EMQX Security:**
- [ ] Change default admin password (DONE)
- [ ] Enable TLS on port 8883
- [ ] Disable plain MQTT port 1883 for external access (keep for internal subscriber only)
- [ ] Enable per-device authentication (username/password or client certificates)
- [ ] Configure ACL rules (devices can only publish to own topics)
- [ ] Enable EMQX authentication plugin (MySQL or PostgreSQL for centralized user management)
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
- [ ] Use service principal or managed identity for SQL authentication (instead of username/password)
- [ ] Restrict SQL firewall to only allow VM IP and Express Backend IP
- [ ] Use separate SQL user for subscriber (limited permissions: INSERT only on IoT_* tables)
- [ ] Enable SQL audit logging for suspicious queries

**4. Express Backend Security:**
- [ ] Store MQTT credentials in Azure Key Vault (not .env file)
- [ ] Use TLS for MQTT connection (mqtts://)
- [ ] Implement retry logic for MQTT publish failures
- [ ] Log all config push operations for audit trail
- [ ] Validate client_id and device_id before MQTT publish (prevent topic injection)

**5. Network Security:**
- [ ] Use Azure Private Link for SQL connection (avoid public internet)
- [ ] Consider VPN or ExpressRoute for Express Backend → MQTT broker connection
- [ ] Enable DDoS protection on public IP (if handling critical infrastructure)

**6. Certificate Management (TLS):**
```bash
# Install Certbot for Let's Encrypt
sudo apt install certbot

# Obtain certificate (requires domain name pointing to VM IP)
sudo certbot certonly --standalone -d mqtt.cloudsynk.com

# Configure EMQX to use certificates
# Edit EMQX config or use dashboard to upload:
# Cert: /etc/letsencrypt/live/mqtt.cloudsynk.com/fullchain.pem
# Key: /etc/letsencrypt/live/mqtt.cloudsynk.com/privkey.pem

# Auto-renewal
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet --post-hook "docker restart cloudsynk-emqxmqtt-broker"
```

**7. Secrets Management:**
- [ ] Never commit MQTT passwords to Git
- [ ] Rotate MQTT passwords every 90 days
- [ ] Use Azure Key Vault for:
  - SQL connection strings
  - MQTT broker credentials
  - Device authentication credentials
- [ ] Implement secret rotation automation

**8. Monitoring & Incident Response:**
- [ ] Set up Azure Monitor alerts (CPU, memory, disk)
- [ ] Monitor EMQX dashboard for unusual connection patterns
- [ ] Review subscriber logs weekly for errors
- [ ] Create incident response playbook for:
  - VM down
  - Subscriber service crashed
  - MQTT broker overwhelmed
  - SQL connection failure

---

## Cleanup / Delete Resources

To remove everything and stop billing:
1. Azure Portal -> Resource groups -> CloudSynk_Prod
2. Delete the VM and associated resources (disk, NIC, public IP, NSG, VNet)
3. Or delete the entire resource group if it only contains MQTT resources

**Note:** The quota limit (Basv2 Family = 2) remains but costs nothing.

---

## Quick Reference

### Connection Details

| Component | Connection | Credentials |
|-----------|------------|-------------|
| **EMQX Dashboard** | http://20.198.101.175:18083 | admin / <changed_password> |
| **MQTT Broker (Internal)** | mqtt://localhost:1883 | local_subscriber / <password> |
| **MQTT Broker (External TLS)** | mqtts://20.198.101.175:8883 | device_id / <device_password> |
| **SSH Access** | ssh -i vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175 | Key-based |
| **SQL Database** | sqlserver-cs-db-prod.database.windows.net | genadmin / <password> |

### Topic Structure

| Topic | Direction | Purpose | Who Publishes | Who Subscribes |
|-------|-----------|---------|---------------|----------------|
| `cloudsynk/{client_id}/{device_id}/telemetry` | Device → Cloud | Send sensor data | Device | Python Subscriber |
| `cloudsynk/{client_id}/{device_id}/config` | Cloud → Device | Push config updates | Express Backend | Device |

### Service Locations

| Service | Location | Type |
|---------|----------|------|
| **EMQX Broker** | VM (Docker container) | MQTT Broker |
| **Python Subscriber** | VM (systemd service) | Telemetry Processor |
| **Express Backend** | Existing deployment | Config Publisher |
| **Device Config Function** | Azure Function | HTTP Config API |
| **SQL Database** | Azure SQL | Data Storage |

### Key Files

| File | Location | Purpose |
|------|----------|---------|
| **local_subscriber.py** | /opt/cloudsynk-subscriber/ | MQTT subscriber service |
| **Decoders** | /opt/cloudsynk-subscriber/decoders/ | Payload decoders (P1/P2/P3/H1) |
| **.env** | /opt/cloudsynk-subscriber/.env | Environment variables |
| **systemd service** | /etc/systemd/system/cloudsynk-subscriber.service | Auto-start config |
| **mqttService.js** | genvolt-app-main/server/services/ | Express MQTT client |

### Useful Commands Summary

```bash
# VM Status
ssh -i vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175
sudo docker ps
sudo systemctl status cloudsynk-subscriber

# Logs
sudo docker logs cloudsynk-emqxmqtt-broker -f
sudo journalctl -u cloudsynk-subscriber -f

# EMQX CLI
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl status
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl clients list
sudo docker exec cloudsynk-emqxmqtt-broker emqx ctl topics list

# Test MQTT
mosquitto_pub -h 20.198.101.175 -p 1883 -t "cloudsynk/123/TEST/telemetry" -m "test"
mosquitto_sub -h 20.198.101.175 -p 1883 -t "cloudsynk/+/+/config" -v

# Restart Services
sudo docker restart cloudsynk-emqxmqtt-broker
sudo systemctl restart cloudsynk-subscriber
```

---

## Device Credential Management Best Practices

### Password Generation

**For New Devices:**
```javascript
// Use cryptographically secure random password
const mqtt_password = crypto.randomBytes(16).toString('hex'); // 32 characters
// OR
const mqtt_password = crypto.randomBytes(24).toString('base64'); // 32 characters base64

// Hash with bcrypt (salt rounds: 10)
const mqtt_password_hash = await bcrypt.hash(mqtt_password, 10);
```

**For Testing/Development:**
```javascript
// Simpler passwords for test devices (DO NOT USE IN PRODUCTION)
const mqtt_password = `${device_id}_test_password`;
```

### Password Display Policy

**⚠️ CRITICAL SECURITY RULE:**
- MQTT password shown ONCE when device is created
- Admin must save password immediately (copy to clipboard, print, etc.)
- Password NEVER stored in plaintext in database (only bcrypt hash)
- If password lost, admin must regenerate (cannot retrieve original)

**Frontend Implementation:**
```jsx
// Show credentials in modal with copy button
<Modal>
  <h3>⚠️ Save MQTT Credentials Now!</h3>
  <p>Password will not be shown again.</p>
  <CodeBlock>
    Broker: mqtts://20.198.101.175:8883
    Username: {device_id}
    Password: {mqtt_password}
  </CodeBlock>
  <Button onClick={copyToClipboard}>Copy All</Button>
  <Button onClick={downloadAsFile}>Download .txt</Button>
  <Checkbox required>
    I have saved these credentials
  </Checkbox>
</Modal>
```

### Bulk Device Provisioning

**For deploying 50+ devices at once:**

```javascript
// Backend endpoint: POST /api/devices/bulk-create
export const bulkCreateDevices = async (req, res) => {
  const { devices } = req.body; // Array: [{ device_id, client_id, model }, ...]

  const results = [];

  for (const deviceData of devices) {
    const mqtt_password = crypto.randomBytes(16).toString('hex');
    const mqtt_password_hash = await bcrypt.hash(mqtt_password, 10);

    await pool.request()
      .input('device_id', sql.NVarChar, deviceData.device_id)
      .input('client_id', sql.Int, deviceData.client_id)
      .input('mqtt_username', sql.NVarChar, deviceData.device_id)
      .input('mqtt_password_hash', sql.NVarChar, mqtt_password_hash)
      .input('mqtt_enabled', sql.Bit, 1)
      .query('INSERT INTO device (...) VALUES (...)');

    results.push({
      device_id: deviceData.device_id,
      mqtt_username: deviceData.device_id,
      mqtt_password: mqtt_password, // Plain password for CSV export
    });
  }

  // Return CSV file with all credentials
  const csv = generateCSV(results);
  res.setHeader('Content-Disposition', 'attachment; filename=mqtt_credentials.csv');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
};
```

**CSV Format:**
```csv
device_id,mqtt_broker,mqtt_username,mqtt_password,topic_publish,topic_subscribe
SICK_001,mqtts://20.198.101.175:8883,SICK_001,a3b2c1d4e5f6...,cloudsynk/123/SICK_001/telemetry,cloudsynk/123/SICK_001/config
SICK_002,mqtts://20.198.101.175:8883,SICK_002,f6e5d4c3b2a1...,cloudsynk/123/SICK_002/telemetry,cloudsynk/123/SICK_002/config
```

### Password Rotation Schedule

**Recommended Rotation:**
- **Production devices:** Every 90 days (automated reminder)
- **Test devices:** Every 180 days
- **Compromised devices:** Immediate rotation

**Automated Rotation Script:**
```javascript
// Run monthly via cron job or Azure Function Timer Trigger
async function rotateExpiredPasswords() {
  const devices = await pool.request()
    .query(`
      SELECT device_id
      FROM device
      WHERE mqtt_password_updated_at < DATEADD(day, -90, GETDATE())
        AND mqtt_enabled = 1
    `);

  for (const device of devices.recordset) {
    const new_password = crypto.randomBytes(16).toString('hex');
    const new_hash = await bcrypt.hash(new_password, 10);

    await pool.request()
      .input('device_id', sql.NVarChar, device.device_id)
      .input('new_hash', sql.NVarChar, new_hash)
      .query(`
        UPDATE device
        SET mqtt_password_hash = @new_hash,
            mqtt_password_updated_at = GETDATE()
        WHERE device_id = @device_id
      `);

    // Send alert to admin
    await sendPasswordRotationAlert(device.device_id, new_password);
  }
}
```

### Credential Storage on Device

**Best Practice for Device Firmware:**
```c
// Store credentials in device flash memory (encrypted if possible)
typedef struct {
    char mqtt_broker[128];
    char mqtt_username[64];
    char mqtt_password[64];  // Encrypted at rest
    char topic_pub[128];
    char topic_sub[128];
} mqtt_config_t;

// Never hardcode credentials in firmware source code
// Load from secure storage on boot
mqtt_config_t config = load_encrypted_config();
```

---

## Comparison: Manual vs Automated Device Management

| Aspect | Manual EMQX Config | Database-Backed (Our Approach) |
|--------|-------------------|--------------------------------|
| **Setup Time per Device** | 5-10 minutes | 30 seconds (via dashboard) |
| **For 500 Devices** | 40-80 hours 😱 | 4 hours ✅ |
| **Credential Management** | EMQX built-in DB | SQL Server (centralized) |
| **Password Reset** | Manual via EMQX dashboard | API call (automated) |
| **Bulk Provisioning** | ❌ Not practical | ✅ CSV export |
| **Audit Trail** | Limited | Full audit in SQL database |
| **Integration** | Separate from device DB | Same database as device data |
| **Scalability** | ❌ Poor (manual work) | ✅ Excellent (unlimited) |
| **Disable Device** | Update EMQX user | Update SQL (instant) |
| **ACL Management** | Manual rules per device | Pattern-based (automatic) |
| **Credential Rotation** | Manual | Automated script |

---

## Next Steps

1. ✅ Complete remaining steps (6-13)
2. ✅ Test end-to-end with device simulator
3. ✅ Deploy Express Backend MQTT service (including HTTP auth endpoints)
4. ✅ Configure EMQX HTTP authentication & ACL
5. ✅ Update device table schema (add MQTT credential columns)
6. ✅ Implement device creation with auto-generated MQTT credentials
7. ✅ Enable TLS for production
8. ✅ Start pilot with 10 test devices
9. ✅ Monitor performance and iterate

**Status:** Ready for subscriber implementation (Step 6) + HTTP auth setup (Step 12)

---

## Device Provisioning - Automated Workflow

### Overview: Zero Manual EMQX Configuration Per Device

With database-backed authentication via HTTP, you never need to manually configure EMQX for each device. Here's the complete flow:

### 1. Admin Creates Device in Dashboard

**Frontend Form (React):**
```jsx
// DeviceManagement.jsx
const handleCreateDevice = async () => {
  const response = await deviceService.createDevice({
    device_id: 'SICK_001',
    client_id: 123,
    model: 'P2',
    machine_id: 'MACHINE_001'
  });

  // Display MQTT credentials to admin (ONCE)
  setMqttCredentials(response.mqtt_credentials);
  showWarning('Save these credentials! They will not be shown again.');
};
```

### 2. Backend Auto-Generates Credentials

**Express Backend:**
```javascript
// Creates device in database with auto-generated MQTT credentials
// Returns credentials to admin
```

**SQL Database:**
```
device table now contains:
├─ device_id: SICK_001
├─ client_id: 123
├─ mqtt_username: SICK_001
├─ mqtt_password_hash: $2a$10$abc123... (bcrypt hash)
└─ mqtt_enabled: 1
```

### 3. Admin Provisions Physical Device

Admin configures device firmware with credentials (one-time):
- MQTT Broker: `mqtts://20.198.101.175:8883`
- MQTT Username: `SICK_001`
- MQTT Password: `<displayed_once>`
- Topic Publish: `cloudsynk/123/SICK_001/telemetry`
- Topic Subscribe: `cloudsynk/123/SICK_001/config`

### 4. Device Connects Automatically

**Device Connection Flow:**
```
1. Device → MQTT CONNECT (username: SICK_001, password: xxx)
   ↓
2. EMQX → HTTP POST /api/mqtt/auth (Express Backend)
   ↓
3. Express Backend → SELECT from device table (SQL Server)
   ↓
4. Express Backend → Verify password hash
   ↓
5. Express Backend → Return { result: 'allow' }
   ↓
6. EMQX → Connection accepted ✅
   ↓
7. Device → MQTT SUBSCRIBE cloudsynk/123/SICK_001/config
   ↓
8. EMQX → HTTP POST /api/mqtt/acl (check subscribe permission)
   ↓
9. Express Backend → Verify topic matches device's client_id
   ↓
10. Express Backend → Return { result: 'allow' }
   ↓
11. EMQX → Subscription accepted ✅
```

**No EMQX dashboard interaction needed!**

### 5. Disable Device Remotely (If Needed)

**Admin clicks "Disable" in dashboard:**
```javascript
// Backend updates database
UPDATE device SET mqtt_enabled = 0 WHERE device_id = 'SICK_001';

// Optionally kick device off EMQX immediately
await axios.delete(`http://20.198.101.175:18083/api/v5/clients/SICK_001`, {
  auth: { username: 'admin', password: process.env.EMQX_ADMIN_PASSWORD }
});
```

When device tries to reconnect:
- EMQX → HTTP auth call → Backend sees `mqtt_enabled = 0` → Returns `deny`
- Device connection rejected

### 6. Rotate Device Password (Security)

**If device credentials compromised:**
```javascript
// Generate new password
const new_password = crypto.randomBytes(16).toString('hex');
const new_hash = await bcrypt.hash(new_password, 10);

// Update database
await pool.request()
  .input('device_id', sql.NVarChar, 'SICK_001')
  .input('new_hash', sql.NVarChar, new_hash)
  .query('UPDATE device SET mqtt_password_hash = @new_hash WHERE device_id = @device_id');

// Kick existing connection (device will reconnect with new password)
await axios.delete(`http://20.198.101.175:18083/api/v5/clients/SICK_001`, {
  auth: { username: 'admin', password: process.env.EMQX_ADMIN_PASSWORD }
});

// Display new password to admin (ONCE)
res.json({ new_password, warning: 'Update device firmware with new password' });
```

---

## EMQX Dashboard Configuration

### Access Dashboard
```
URL: http://20.198.101.175:18083
Login: admin / <your_changed_password>
```

### Key Configuration Areas

**1. Authentication** (Management → Authentication)
- ✅ **HTTP Authentication** (configured in Step 12)
  - Authenticates all devices via Express Backend API
  - No manual user creation needed
- ✅ **Built-in Database** (for backend_publisher and local_subscriber only)
  - Only 2 users need to be manually created
  - Device users (500+) authenticated via HTTP

**2. Authorization (ACL)** (Management → Authorization)
- ✅ **HTTP Authorization** (configured in Step 12)
  - Pattern-based ACL via Express Backend API
  - Automatically enforces topic restrictions per device
- ✅ **Built-in Database ACL** (for backend_publisher and local_subscriber only)
  - backend_publisher: Can publish to `cloudsynk/+/+/config`
  - local_subscriber: Can subscribe to `cloudsynk/+/+/telemetry`

**3. Monitoring** (Dashboard → Overview)
- Connected clients: Should see all devices + backend + subscriber
- Message rate: Monitor messages/second (target: ~100-200 for 500 devices)
- Topics: View active topics (cloudsynk/*/*/telemetry and config)
- Authentication stats: Monitor auth success/failure rate

**4. Alerts** (Management → Alarms)
- Set up alerts for:
  - High CPU usage (> 80%)
  - High memory usage (> 3GB)
  - Disconnected clients threshold
  - Message drop rate
  - High authentication failure rate (potential attack)

---

## Cost Summary & Scalability

### Infrastructure Costs

| Component | Monthly Cost | Notes |
|---|---|---|
| Azure VM B2als_v2 | ~$17.96 (~Rs.1,526) | 2 vCPU, 4 GB RAM |
| Public IP (Standard) | ~$3.65 (~Rs.310) | Static IP for MQTT broker |
| Standard SSD 30 GiB | ~$2.40 (~Rs.204) | OS disk |
| **VM Total** | **~$24/month (~Rs.2,040)** | |
| | | |
| Express Backend | $0 | Already deployed (App Service/Container) |
| Azure SQL | Existing | No additional cost |
| Device Config Function | Free tier | < 1M executions/month |
| **Grand Total** | **~$24/month** | **vs ~$17/month HTTP-only** |

### Cost Comparison: MQTT vs HTTP

**Current HTTP System:**
```
Azure Function (HTTP Ingest):
  500 devices × 288 requests/day = 144K/day = 4.32M/month
  Cost: ~$17/month (after free tier)

Azure Function (Device Config):
  500 devices × 48 requests/day = 24K/day = 720K/month
  Cost: Free tier

Total: ~$17/month
```

**MQTT System:**
```
Azure VM (MQTT Broker): ~$24/month
Azure Function (Device Config): Free tier (startup + debug mode polling)

Total: ~$24/month
```

**Net Difference:** +$7/month (~40% increase)

**BUT - Key Benefits:**
- Real-time config updates (< 1 second vs 5-30 minutes)
- Lower bandwidth costs (persistent connections vs HTTP overhead)
- Better scalability (EMQX can handle 10K+ connections)
- Reduced database load (no SELECT debugmode on every telemetry send)
- Future-ready for bidirectional communication (device commands, OTA updates)

### Scalability Analysis

**Current Setup (B2als_v2):**
- Can handle: 500-600 concurrent MQTT connections
- Message throughput: ~1,000 messages/second
- CPU usage: ~30-40% at full load
- Memory usage: ~2GB at full load

**If Scaling to 2,000 Devices:**
- Upgrade to: B4als_v2 (4 vCPU, 8 GB RAM) - ~$36/month
- Or: Keep current VM + add horizontal scaling (EMQX cluster)

**Cost Per Device:**
- MQTT: $24/500 = **$0.048/device/month** (~Rs.4/device/month)
- HTTP: $17/500 = **$0.034/device/month** (~Rs.2.88/device/month)

---

## Migration Strategy

### Phase 1: Pilot (2 weeks)
- [ ] Complete VM setup (Steps 6-13)
- [ ] Deploy Express Backend MQTT service
- [ ] Select 10 test devices (mix of SICK/HKMI/Gas)
- [ ] Update device configs to use MQTT
- [ ] Monitor stability, latency, data accuracy

### Phase 2: Gradual Rollout (1 month)
- [ ] Migrate 50 devices per week
- [ ] Keep HTTP endpoints active as fallback
- [ ] Monitor EMQX performance metrics
- [ ] Adjust VM resources if needed

### Phase 3: Full Migration (Month 2-3)
- [ ] All devices using MQTT for telemetry
- [ ] HTTP Device Config still used for startup
- [ ] HTTP Ingest kept for backward compatibility (legacy devices)
- [ ] Monitor cost savings and performance improvements

### Phase 4: Optimization (Month 3+)
- [ ] Implement TLS on port 8883 (disable port 1883)
- [ ] Fine-tune EMQX settings (QoS, retained messages, session expiry)
- [ ] Add MQTT-based OTA firmware updates (future enhancement)
- [ ] Consider EMQX clustering for high availability
