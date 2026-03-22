# MQTT Implementation - Functional Document

**Project:** GenVolt IoT Platform MQTT Migration
**Date:** March 18, 2026
**Purpose:** High-level functional specification and implementation guide
**Audience:** Technical stakeholders, project managers, architects

---

## Executive Summary

This document outlines the implementation of an MQTT-based real-time communication system for the GenVolt IoT platform. The solution replaces the existing HTTP polling mechanism with a persistent MQTT connection, enabling sub-second configuration updates to 500-600 deployed IoT devices while maintaining backward compatibility.

**Key Benefits:**
- **Real-time config updates:** < 1 second (vs 5-30 minutes with HTTP polling)
- **Scalable architecture:** Handles 1000+ devices without performance degradation
- **Zero manual provisioning:** Automated device credential management
- **Multi-tenant support:** Built-in client isolation via topic structure
- **Cost-effective:** ~$24/month infrastructure cost

---

## 1. System Architecture Overview

### Current Architecture (HTTP-Based)

```
┌─────────────┐
│   Devices   │ ──HTTP POST (every 5 min)──> Azure Function ──> SQL Database
│  (500-600)  │ <─HTTP GET (every 5 min)───  (Device Config)
└─────────────┘
                                                      │
                                                      ↓
                                              Express Backend ──> React Dashboard
```

**Limitations:**
- Config updates delayed by 5-30 minutes (polling interval)
- High HTTP request volume (4.3M requests/month)
- Device must actively poll for config changes
- No true real-time capabilities

### New Architecture (MQTT + HTTP Hybrid)

```
┌────────────────────────────────────────────────────────────────────┐
│                    DEVICE LAYER (500-600 devices)                  │
├────────────────────────────────────────────────────────────────────┤
│  STARTUP: HTTP GET → Device Config Function App                   │
│           (Gets: MQTT broker address, credentials, initial config) │
│                                                                    │
│  RUNTIME: MQTT PUBLISH → Telemetry data every 5 minutes           │
│           MQTT SUBSCRIBE ← Config updates (instant push)          │
└────────────────────────────────────────────────────────────────────┘
                              ↓↑ MQTT (Persistent Connection)
┌────────────────────────────────────────────────────────────────────┐
│                     MQTT BROKER (Azure VM)                         │
├────────────────────────────────────────────────────────────────────┤
│  EMQX Broker:                                                      │
│    • Manages 500+ concurrent connections                          │
│    • Routes telemetry to subscriber                               │
│    • Routes config updates to devices                             │
│                                                                    │
│  Python Subscriber Service:                                        │
│    • Receives all device telemetry                                │
│    • Decodes hex payloads                                         │
│    • Inserts to SQL database                                      │
└────────────────────────────────────────────────────────────────────┘
                    ↓ SQL INSERT              ↑ MQTT PUBLISH
┌────────────────────────────────────────────────────────────────────┐
│                    EXPRESS BACKEND + SQL DATABASE                  │
├────────────────────────────────────────────────────────────────────┤
│  Express Backend:                                                  │
│    • Serves dashboard API                                         │
│    • Publishes config updates via MQTT                            │
│    • Authenticates devices (HTTP auth endpoint)                   │
│                                                                    │
│  SQL Database:                                                     │
│    • Stores device credentials                                    │
│    • Stores telemetry data                                        │
│    • Stores device configurations                                 │
└────────────────────────────────────────────────────────────────────┘
                              ↑
                    React Admin Dashboard
```

---

## 2. Core Components

### 2.1 MQTT Broker (EMQX)

**Purpose:** Central message router for all device communications

**Key Features:**
- Runs in Docker container on Azure VM (B2als_v2: 2 vCPU, 4GB RAM)
- Handles 500-600 concurrent persistent connections
- Message throughput: ~1,000 messages/second
- Built-in authentication via HTTP callbacks
- Topic-based routing with wildcard support

**Ports:**
- **1883:** Internal MQTT (subscriber only)
- **8883:** External MQTT with TLS (devices + backend)
- **18083:** Web dashboard (admin only)

### 2.2 Python Subscriber Service

**Purpose:** Receives device telemetry and processes it for database storage

**Responsibilities:**
1. Subscribes to all device telemetry topics (wildcard: `cloudsynk/+/+/telemetry`)
2. Parses topic to extract client_id and device_id
3. Decodes hex payload using device-specific decoders (P1/P2/P3/HKMI/Gas)
4. Inserts raw and decoded data to SQL database

**Deployment:**
- Runs as systemd service on MQTT broker VM
- Auto-starts on VM boot
- Connects to EMQX via localhost:1883 (no encryption needed)

### 2.3 Express Backend MQTT Service

**Purpose:** Pushes real-time configuration updates to devices

**Responsibilities:**
1. Maintains persistent MQTT connection to broker
2. When admin changes device config → publishes update to device's config topic
3. Provides HTTP authentication endpoints for EMQX
4. Validates device credentials against SQL database

### 2.4 Device Config Function App (Existing)

**Purpose:** Provides initial configuration to devices on startup

**Behavior:**
- Device makes HTTP GET request on boot
- Returns: MQTT broker address, credentials, topics, initial settings
- Device then connects to MQTT broker and operates continuously

---

## 3. Topic Structure & Multi-Tenancy

### Topic Naming Convention

```
cloudsynk/{client_id}/{device_id}/telemetry    ← Device publishes sensor data
cloudsynk/{client_id}/{device_id}/config       ← Device subscribes for updates
```

**Examples:**
- Client 123, Device SICK_001 telemetry: `cloudsynk/123/SICK_001/telemetry`
- Client 123, Device SICK_001 config: `cloudsynk/123/SICK_001/config`
- Client 456, Device SICK_002 telemetry: `cloudsynk/456/SICK_002/telemetry`

### Multi-Tenant Isolation

Each device belongs to a client (stored in database). The topic structure automatically isolates clients:

```
┌─────────────────┐         ┌─────────────────┐
│   Client 123    │         │   Client 456    │
├─────────────────┤         ├─────────────────┤
│ SICK_001        │         │ SICK_002        │
│ SICK_003        │         │ HKMI_001        │
│ GAS_001         │         │ GAS_002         │
└─────────────────┘         └─────────────────┘
        │                           │
        ↓                           ↓
cloudsynk/123/*/telemetry   cloudsynk/456/*/telemetry
cloudsynk/123/*/config      cloudsynk/456/*/config

         ↓                           ↓
    MQTT Broker enforces ACL rules
    (devices can only access own topics)
```

**Security:** Devices from Client 123 cannot access topics from Client 456

---

## 4. Authentication & Authorization Flow

### 4.1 Device Authentication (Database-Backed)

**Problem:** Manually creating 500+ users in EMQX dashboard would take 40-80 hours

**Solution:** HTTP-based authentication via Express Backend

```
┌─────────────────────────────────────────────────────────────────┐
│              Device Attempts to Connect to EMQX                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        Device sends: username=SICK_001, password=xxx
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      EMQX Broker                                │
│  "I don't know this device, let me ask Express Backend..."      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        HTTP POST /api/mqtt/auth
        { username: "SICK_001", password: "xxx" }
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Express Backend                              │
│  1. Query SQL: SELECT mqtt_password_hash, mqtt_enabled          │
│                FROM device WHERE mqtt_username = 'SICK_001'     │
│  2. Verify password hash using bcrypt                           │
│  3. Check if device is enabled                                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        Returns: { result: "allow" } or { result: "deny" }
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      EMQX Broker                                │
│  If "allow" → Accept connection ✅                              │
│  If "deny"  → Reject connection ❌                              │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Zero manual EMQX configuration per device
- Credentials stored centrally in SQL database
- Instant enable/disable via database update
- Scales to unlimited devices

### 4.2 Topic Authorization (Pattern-Based ACL)

After authentication, EMQX checks if device can access specific topics:

```
┌─────────────────────────────────────────────────────────────────┐
│      Device SICK_001 tries to PUBLISH to topic                 │
│      cloudsynk/123/SICK_001/telemetry                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      EMQX Broker                                │
│  "Is this device allowed to publish to this topic?"             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        HTTP POST /api/mqtt/acl
        { username: "SICK_001", topic: "cloudsynk/123/SICK_001/telemetry",
          action: "publish" }
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Express Backend                              │
│  1. Query SQL: SELECT client_id FROM device                     │
│                WHERE mqtt_username = 'SICK_001'                 │
│     Result: client_id = 123                                     │
│                                                                 │
│  2. Check if topic matches pattern:                             │
│     Expected: cloudsynk/123/SICK_001/telemetry                  │
│     Actual:   cloudsynk/123/SICK_001/telemetry                  │
│     Match: ✅                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        Returns: { result: "allow" }
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      EMQX Broker                                │
│  Allow publish ✅                                               │
└─────────────────────────────────────────────────────────────────┘
```

**Security Rules:**
- Devices can ONLY publish to: `cloudsynk/{their_client_id}/{their_device_id}/telemetry`
- Devices can ONLY subscribe to: `cloudsynk/{their_client_id}/{their_device_id}/config`
- Any other topic access is denied

---

## 5. Data Flow Scenarios

### 5.1 Device Startup Flow

```
┌─────────────┐
│   Device    │ Powers on, needs configuration
│ SICK_001    │
└─────────────┘
      │
      │ Step 1: HTTP GET (one-time on boot)
      ↓
┌──────────────────────────────────────────┐
│   Device Config Function App (Azure)    │
│   GET /api/v1/device-config?device_id=   │
│              SICK_001                    │
└──────────────────────────────────────────┘
      │
      │ Returns JSON:
      │ {
      │   "mqtt_broker": "20.198.101.175:8883",
      │   "mqtt_username": "SICK_001",
      │   "mqtt_password": "xxx" (from device flash storage),
      │   "topic_publish": "cloudsynk/123/SICK_001/telemetry",
      │   "topic_subscribe": "cloudsynk/123/SICK_001/config",
      │   "telemetry_interval": 300,
      │   "device_settings": { Motor_On_Time: 500, ... }
      │ }
      ↓
┌─────────────┐
│   Device    │ Now has all configuration
│ SICK_001    │
└─────────────┘
      │
      │ Step 2: Connect to MQTT broker
      ↓
┌──────────────────────────────────────────┐
│         EMQX Broker                      │
│  Authenticates via HTTP → Express Backend│
│  Connection accepted ✅                  │
└──────────────────────────────────────────┘
      │
      │ Step 3: Subscribe to config topic
      ↓
┌─────────────┐
│   Device    │ Subscribed to: cloudsynk/123/SICK_001/config
│ SICK_001    │ Ready to receive instant config updates
└─────────────┘
      │
      │ Step 4: Start telemetry loop (every 300 seconds)
      │
      ↓
   RUNNING
```

**Timeline:**
- Device boot: 0 seconds
- HTTP config received: ~2 seconds
- MQTT connected: ~3 seconds
- Ready to operate: ~5 seconds

### 5.2 Telemetry Ingestion Flow

```
┌─────────────┐
│   Device    │ Collects sensor data
│ SICK_001    │
└─────────────┘
      │
      │ Encodes data as hex payload
      │ Payload: { device_id: "SICK_001", data: "0x1A2B3C..." }
      │
      │ MQTT PUBLISH to: cloudsynk/123/SICK_001/telemetry
      ↓
┌──────────────────────────────────────────┐
│         EMQX Broker                      │
│  Receives message, routes to subscriber  │
└──────────────────────────────────────────┘
      │
      │ Forwards to subscriber (subscribed to cloudsynk/+/+/telemetry)
      ↓
┌──────────────────────────────────────────┐
│     Python Subscriber Service            │
│  1. Parse topic → client_id=123,         │
│                   device_id=SICK_001     │
│  2. Decode hex using DecoderFactory      │
│     (Identifies device type: P2)         │
│  3. Extract fields:                      │
│     - Motor_RPM: 1500                    │
│     - Runtime_Min: 12450                 │
│     - GPS: 12.345, 67.890                │
│     - FaultCode: 0                       │
└──────────────────────────────────────────┘
      │
      │ Step 1: Insert raw message
      ↓
┌──────────────────────────────────────────┐
│     SQL Database                         │
│  Table: IoT_Raw_Messages                 │
│  Insert: device_id, timestamp, payload   │
└──────────────────────────────────────────┘
      │
      │ Step 2: Insert decoded data
      ↓
┌──────────────────────────────────────────┐
│     SQL Database                         │
│  Table: IoT_Data_Sick                    │
│  Insert: all decoded fields              │
└──────────────────────────────────────────┘
      │
      ↓
   Data available in dashboard (< 5 seconds total)
```

**Performance:**
- Device → EMQX: ~100ms
- EMQX → Subscriber: ~50ms
- Subscriber decode: ~100ms
- SQL insert: ~200ms
- **Total latency: ~450ms**

### 5.3 Config Update Flow (Debug Mode Example)

```
┌─────────────┐
│    Admin    │ Opens dashboard, toggles Debug Mode ON
│             │ for device SICK_001
└─────────────┘
      │
      │ HTTP PATCH /api/device-config/SICK_001/debugmode
      │ { debugMode: true }
      ↓
┌──────────────────────────────────────────┐
│       Express Backend                    │
│  1. Validate request                     │
│  2. Translate debugmode to actual values:│
│     - telemetry_interval: 300 → 30       │
│     - log_level: "normal" → "verbose"    │
│  3. Update SQL database:                 │
│     UPDATE device SET                    │
│       debugmode = 1,                     │
│       telemetry_interval = 30,           │
│       user_func_config = '...'           │
│     WHERE device_id = 'SICK_001'         │
└──────────────────────────────────────────┘
      │
      │ Step 2: Lookup device client_id from database
      │ Result: client_id = 123
      │
      │ Step 3: Publish config update via MQTT
      ↓
┌──────────────────────────────────────────┐
│       Express Backend MQTT Service       │
│  MQTT PUBLISH to:                        │
│    cloudsynk/123/SICK_001/config         │
│  Payload:                                │
│  {                                       │
│    "type": "config_update",              │
│    "timestamp": "2026-03-18T10:30:00Z",  │
│    "telemetry_interval": 30,             │
│    "device_settings": {                  │
│      "log_level": "verbose"              │
│    }                                     │
│  }                                       │
└──────────────────────────────────────────┘
      │
      │ MQTT message routed by broker
      ↓
┌──────────────────────────────────────────┐
│         EMQX Broker                      │
│  Routes message to device SICK_001       │
│  (device is subscribed to this topic)    │
└──────────────────────────────────────────┘
      │
      │ Message delivered to device
      ↓
┌─────────────┐
│   Device    │ Receives config update
│ SICK_001    │ Applies new settings:
└─────────────┘  - telemetry_interval = 30s (was 300s)
      │         - log_level = "verbose"
      │
      │ Starts sending telemetry every 30 seconds
      ↓
   Device now in debug mode
```

**Latency:**
- Admin clicks button → SQL updated: ~200ms
- SQL updated → MQTT published: ~50ms
- MQTT published → Device receives: ~100ms
- **Total latency: ~350ms (< 1 second)**

**Compare to HTTP polling:**
- Old system: 5-30 minutes delay (depending on polling interval)
- New system: < 1 second

---

## 6. Debug Mode Concept

### What is Debug Mode?

Debug mode is a **UI-only concept** that provides a convenient way for admins to quickly enable verbose logging and faster telemetry from devices.

**Important:** Device firmware never sees a "debugmode" flag. The backend translates it to actual configuration values.

### Debug Mode Translation

```
┌──────────────────────────────────────────────────────────────┐
│              ADMIN DASHBOARD (UI)                            │
│                                                              │
│  Device: SICK_001                                            │
│  [ ] Debug Mode   →   [✓] Debug Mode  (Admin toggles ON)    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│              EXPRESS BACKEND (Logic)                         │
│                                                              │
│  IF debugmode = ON:                                          │
│    telemetry_interval = 30 seconds  (was 300)               │
│    log_level = "verbose"            (was "normal")          │
│                                                              │
│  IF debugmode = OFF:                                         │
│    telemetry_interval = 300 seconds (default)               │
│    log_level = "normal"             (default)               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────────┐
│              DEVICE FIRMWARE                                 │
│                                                              │
│  Receives:                                                   │
│  {                                                           │
│    "telemetry_interval": 30,                                │
│    "device_settings": {                                      │
│      "log_level": "verbose"                                 │
│    }                                                         │
│  }                                                           │
│                                                              │
│  Device never sees "debugmode" field!                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Benefits:**
- No device firmware changes needed to support debug mode
- Backend controls what "debug mode" means
- Can customize debug behavior per device type
- Easy to extend (add new debug behaviors without device updates)

---

## 7. Implementation Phases

### Phase 1: Infrastructure Setup (Week 1)

**Objective:** Set up MQTT broker and core services

**Activities:**
1. Provision Azure VM (B2als_v2)
2. Install EMQX via Docker
3. Configure network security groups (NSG)
4. Set up DNS (mqtt.cloudsynk.net → VM IP)
5. Change default EMQX admin password

**Deliverables:**
- Running EMQX broker accessible via internet
- EMQX dashboard accessible
- VM accessible via SSH

### Phase 2: Database & Backend Integration (Week 1-2)

**Objective:** Enable database-backed authentication and MQTT publishing

**Activities:**
1. Add MQTT credential columns to device table
2. Create HTTP authentication endpoints in Express Backend
3. Configure EMQX HTTP authentication plugin
4. Create MQTT service in Express Backend
5. Update device config controller to publish via MQTT

**Deliverables:**
- Devices can authenticate via SQL database
- Express Backend can publish config updates via MQTT
- Zero manual EMQX configuration required per device

### Phase 3: Subscriber Service (Week 2)

**Objective:** Process incoming telemetry data

**Activities:**
1. Copy existing decoders to VM
2. Write Python subscriber service
3. Set up SQL database connection
4. Configure systemd service (auto-start on boot)
5. Test telemetry ingestion end-to-end

**Deliverables:**
- Subscriber service running on VM
- Telemetry data flowing to SQL database
- Dashboard shows real-time data

### Phase 4: Device Config Function Update (Week 2)

**Objective:** Provide MQTT connection details to devices on startup

**Activities:**
1. Update Device Config Function to include MQTT broker address
2. Include MQTT topics in response
3. Keep existing HTTP config fields for backward compatibility

**Deliverables:**
- Devices receive MQTT broker info on startup
- Backward compatible with existing devices

### Phase 5: Pilot Testing (Week 3-4)

**Objective:** Validate system with 10 test devices

**Activities:**
1. Select 10 test devices (mix of SICK/HKMI/Gas sensors)
2. Generate MQTT credentials via dashboard
3. Configure device firmware with MQTT credentials
4. Monitor telemetry ingestion
5. Test config update latency
6. Verify multi-client isolation

**Success Criteria:**
- All test devices connect successfully
- Telemetry data appears in dashboard < 5 seconds
- Config updates delivered < 1 second
- No cross-client data leakage

### Phase 6: Production Rollout (Month 2)

**Objective:** Migrate all 500-600 devices to MQTT

**Activities:**
1. Migrate 50 devices per week
2. Generate credentials in bulk (CSV export)
3. Monitor EMQX performance metrics
4. Keep HTTP ingest active as fallback
5. Adjust VM resources if needed

**Success Criteria:**
- All devices migrated successfully
- EMQX CPU usage < 50%
- EMQX memory usage < 3GB
- Zero data loss during migration

### Phase 7: Production Hardening (Month 3)

**Objective:** Security and performance optimization

**Activities:**
1. Enable TLS on port 8883
2. Obtain SSL certificate (Let's Encrypt)
3. Disable plain MQTT port 1883 for external access
4. Set up Azure Monitor alerts
5. Implement automated password rotation
6. Configure rate limiting per client

**Deliverables:**
- Production-grade security (TLS encryption)
- Monitoring and alerting active
- Automated credential rotation

---

## 8. Device Provisioning Workflow

### Manual Approach (NOT RECOMMENDED)

```
For each device (500 devices):
  1. Open EMQX dashboard
  2. Navigate to Authentication → Users
  3. Click "Add User"
  4. Enter username, password
  5. Save
  6. Navigate to Authorization → ACL
  7. Add publish rule for telemetry topic
  8. Add subscribe rule for config topic
  9. Save

Total time: 5-10 minutes per device
For 500 devices: 40-80 hours of manual work 😱
```

### Automated Approach (RECOMMENDED)

```
Admin creates device in dashboard:
  ↓
Express Backend auto-generates:
  - MQTT username (same as device_id)
  - MQTT password (32-char random)
  - Password hash (bcrypt)
  ↓
Stores in SQL database:
  - mqtt_username
  - mqtt_password_hash
  - mqtt_enabled = true
  ↓
Returns credentials to admin (SHOWN ONCE):
  {
    "broker": "mqtts://20.198.101.175:8883",
    "username": "SICK_001",
    "password": "a3b2c1d4e5f6...",
    "topic_publish": "cloudsynk/123/SICK_001/telemetry",
    "topic_subscribe": "cloudsynk/123/SICK_001/config"
  }
  ↓
Admin configures device firmware with credentials (one-time)
  ↓
Device connects → EMQX authenticates via HTTP → Express Backend → SQL
  ↓
Connection accepted ✅

Total time: 30 seconds per device
For 500 devices: 4 hours ✅
```

### Bulk Provisioning (50+ devices)

```
Admin uploads CSV with device list:
  device_id, client_id, model, machine_id
  SICK_001, 123, P2, MACHINE_001
  SICK_002, 123, P2, MACHINE_002
  ...
  ↓
Express Backend processes batch:
  FOR EACH device:
    - Generate MQTT credentials
    - Insert to SQL database
    - Add to results array
  ↓
Returns CSV file with all credentials:
  device_id, mqtt_username, mqtt_password, topic_publish, topic_subscribe
  SICK_001, SICK_001, a3b2c1d4..., cloudsynk/123/SICK_001/telemetry, ...
  SICK_002, SICK_002, f6e5d4c3..., cloudsynk/123/SICK_002/telemetry, ...
  ↓
Admin downloads CSV, uses for device configuration

Total time for 50 devices: 5 minutes ✅
```

---

## 9. Security Architecture

### 9.1 Authentication Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Network Security (NSG - Network Security Group)   │
├─────────────────────────────────────────────────────────────┤
│  • Port 1883: Blocked from internet (internal only)         │
│  • Port 8883: Open for devices (TLS required)               │
│  • Port 18083: Restricted to admin IPs only                 │
│  • SSH: Restricted to specific IPs                          │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: MQTT Authentication (Username + Password)         │
├─────────────────────────────────────────────────────────────┤
│  • Device provides username + password                      │
│  • EMQX validates via HTTP call to Express Backend          │
│  • Express Backend queries SQL database                     │
│  • Password verified using bcrypt                           │
│  • Device must be mqtt_enabled = true                       │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Topic Authorization (ACL)                         │
├─────────────────────────────────────────────────────────────┤
│  • Device can ONLY publish to own telemetry topic           │
│  • Device can ONLY subscribe to own config topic            │
│  • Pattern enforced: cloudsynk/{client_id}/{device_id}/*    │
│  • Any other topic access denied                            │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: TLS Encryption (Production)                       │
├─────────────────────────────────────────────────────────────┤
│  • All MQTT traffic encrypted via TLS                       │
│  • Certificate from Let's Encrypt                           │
│  • Auto-renewal every 90 days                               │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Credential Management

**Password Security:**
- 32-character random passwords (cryptographically secure)
- Stored as bcrypt hash in database (never plaintext)
- Password shown ONCE when device created
- If lost, must regenerate (cannot retrieve original)

**Password Rotation:**
- Production devices: Every 90 days
- Test devices: Every 180 days
- Compromised devices: Immediate rotation
- Automated script sends alerts to admin

**Disable Device:**
- Update database: `mqtt_enabled = 0`
- Device immediately rejected on next auth attempt
- Optional: Kick active connection via EMQX API

---

## 10. Monitoring & Troubleshooting

### 10.1 Health Checks

**EMQX Broker:**
- Connected clients count (target: 500-600)
- Message rate (target: ~100-200 msg/sec)
- CPU usage (should be < 50%)
- Memory usage (should be < 3GB)
- Authentication success/failure rate

**Python Subscriber:**
- Service status (should be "active (running)")
- Message processing rate
- Decoder failure rate
- SQL insertion errors

**Express Backend:**
- MQTT connection status
- Config push success rate
- HTTP auth endpoint response time

**SQL Database:**
- Data insertion rate
- Table row count growth
- Query performance

### 10.2 Common Issues & Solutions

**Issue: Devices cannot connect to EMQX**

**Diagnosis Flow:**
```
1. Check DNS resolution
   → nslookup mqtt.cloudsynk.net
   → Should return: 20.198.101.175

2. Check network connectivity
   → Ping 20.198.101.175
   → Test port: nc -zv 20.198.101.175 8883

3. Check NSG rules
   → Azure Portal → NSG → Verify port 8883 open

4. Check EMQX running
   → SSH to VM
   → docker ps | grep emqx

5. Check authentication
   → EMQX dashboard → Monitoring → Authentication stats
   → Express Backend logs for /api/mqtt/auth calls
```

**Issue: Telemetry not appearing in dashboard**

**Diagnosis Flow:**
```
1. Check device is publishing
   → EMQX dashboard → Monitoring → Message rate

2. Check subscriber is running
   → SSH to VM
   → sudo systemctl status cloudsynk-subscriber

3. Check subscriber logs
   → sudo journalctl -u cloudsynk-subscriber -n 100
   → Look for decode errors or SQL errors

4. Check SQL database
   → Query: SELECT TOP 10 * FROM IoT_Raw_Messages
            ORDER BY timestamp DESC

5. Verify decoder for device type
   → Check device model in database
   → Verify corresponding decoder exists
```

**Issue: Config updates not reaching devices**

**Diagnosis Flow:**
```
1. Check Express Backend MQTT connection
   → Express Backend logs for "MQTT Service connected"

2. Check config published to MQTT
   → Express Backend logs for "Config pushed to cloudsynk/..."

3. Verify device subscribed to topic
   → EMQX dashboard → Monitoring → Subscriptions
   → Look for cloudsynk/{client_id}/{device_id}/config

4. Check ACL allows backend to publish
   → EMQX dashboard → Management → Authorization
   → Verify backend_publisher has publish permission

5. Test with MQTT client
   → Use MQTTX to subscribe to config topic
   → Trigger config update from dashboard
   → Verify message received
```

---

## 11. Performance & Scalability

### 11.1 Current Capacity (B2als_v2 VM)

| Metric | Current | Maximum | Notes |
|--------|---------|---------|-------|
| Concurrent connections | 500-600 | 800 | Before performance degradation |
| Messages/second | ~100 | 1,000 | Burst capacity |
| CPU usage | 30-40% | 80% | At full load |
| Memory usage | 2GB | 3.5GB | 4GB total RAM |
| Disk I/O | Low | Medium | SSD handles well |

### 11.2 Scaling Strategy

**Vertical Scaling (Upgrade VM):**
```
Current:  B2als_v2 (2 vCPU, 4GB RAM)  → 500-600 devices
Upgrade:  B4als_v2 (4 vCPU, 8GB RAM)  → 1,500-2,000 devices
Cost:     $24/month → $36/month
```

**Horizontal Scaling (EMQX Cluster):**
```
Current:  1 VM → 500-600 devices
Cluster:  3 VMs → 1,500-1,800 devices
Benefits: High availability, load balancing
Cost:     $24/month → $72/month
```

### 11.3 Cost Analysis

**Infrastructure Costs:**
- Azure VM: $17.96/month
- Public IP: $3.65/month
- Disk (30GB SSD): $2.40/month
- **Total: $24/month**

**Cost per Device:**
- 500 devices: $0.048/device/month
- 1000 devices: $0.024/device/month (if scaling)

**Comparison to HTTP:**
- HTTP Azure Function: $17/month (4.3M requests)
- MQTT: $24/month (+$7)
- **ROI:** Real-time updates, better UX, future-ready architecture

---

## 12. Migration Strategy

### 12.1 Phased Rollout

```
┌────────────────────────────────────────────────────────────┐
│  Week 1-2: Infrastructure Setup                           │
│  • Set up EMQX, configure authentication                  │
│  • Deploy subscriber service                              │
│  • Update Express Backend                                 │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Week 3-4: Pilot Testing (10 devices)                     │
│  • Select test devices from each client                   │
│  • Monitor for 2 weeks                                    │
│  • Validate data accuracy                                 │
│  • Test config update latency                             │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Month 2: Gradual Rollout (50 devices/week)               │
│  • Migrate in batches                                     │
│  • Keep HTTP active as fallback                           │
│  • Monitor EMQX performance                               │
│  • Adjust if needed                                       │
└────────────────────────────────────────────────────────────┘
                        ↓
┌────────────────────────────────────────────────────────────┐
│  Month 3: Full Migration & Optimization                   │
│  • All devices on MQTT                                    │
│  • Enable TLS                                             │
│  • Fine-tune performance                                  │
│  • Decommission HTTP ingest (optional)                    │
└────────────────────────────────────────────────────────────┘
```

### 12.2 Rollback Plan

**If issues arise during migration:**

```
1. EMQX performance degradation
   → Pause new migrations
   → Scale up VM or add nodes
   → Resume after stabilization

2. Data loss or corruption
   → Immediately revert affected devices to HTTP
   → Investigate root cause
   → Fix decoder or subscriber logic
   → Re-migrate after fix

3. Authentication failures
   → Check Express Backend HTTP auth endpoints
   → Verify SQL database connectivity
   → Check EMQX HTTP auth plugin configuration
   → Devices fall back to HTTP if MQTT unavailable

4. Complete system failure
   → HTTP ingest remains active throughout migration
   → Devices automatically fall back to HTTP
   → Zero data loss
```

---

## 13. Success Metrics

### 13.1 Technical Metrics

| Metric | Current (HTTP) | Target (MQTT) | Measurement |
|--------|----------------|---------------|-------------|
| Config update latency | 5-30 minutes | < 1 second | Time from admin click to device receives |
| Telemetry latency | ~10 seconds | < 5 seconds | Device publish to dashboard display |
| System uptime | 99.5% | 99.9% | Monthly availability |
| Device connection success rate | N/A | > 99% | Auth success rate |
| Message delivery rate | 100% (eventual) | 100% (real-time) | QoS 1 guarantees delivery |

### 13.2 Business Metrics

| Metric | Value | Impact |
|--------|-------|--------|
| Reduced troubleshooting time | 80% reduction | Faster debug mode enables quick diagnosis |
| Infrastructure cost | +$7/month | Minimal increase for significant benefits |
| Device provisioning time | 95% reduction | 4 hours vs 40-80 hours for 500 devices |
| Admin productivity | +20% | Less time spent waiting for config updates |
| Customer satisfaction | Improved | Real-time responsiveness |

---

## 14. Appendix

### 14.1 Glossary

**MQTT:** Message Queuing Telemetry Transport - lightweight pub/sub messaging protocol
**EMQX:** Open-source MQTT broker used for message routing
**QoS:** Quality of Service - MQTT message delivery guarantee level
**ACL:** Access Control List - defines who can access which topics
**NSG:** Network Security Group - Azure firewall rules
**TLS:** Transport Layer Security - encryption protocol
**Bcrypt:** Password hashing algorithm
**systemd:** Linux service manager
**Docker:** Container platform

### 14.2 Topic Wildcards

**Single-level wildcard (+):**
- Pattern: `cloudsynk/+/SICK_001/telemetry`
- Matches: `cloudsynk/123/SICK_001/telemetry`
- Matches: `cloudsynk/456/SICK_001/telemetry`
- Does NOT match: `cloudsynk/123/SICK_002/telemetry`

**Multi-level wildcard (#):**
- Pattern: `cloudsynk/123/#`
- Matches: `cloudsynk/123/SICK_001/telemetry`
- Matches: `cloudsynk/123/SICK_001/config`
- Matches: `cloudsynk/123/SICK_002/telemetry`

**Subscriber pattern:**
- `cloudsynk/+/+/telemetry` → Receives telemetry from all clients, all devices

### 14.3 MQTT QoS Levels

**QoS 0 (At most once):**
- Fire and forget
- No acknowledgment
- Fastest, but can lose messages
- Use case: Non-critical telemetry

**QoS 1 (At least once):**
- Acknowledged delivery
- May deliver duplicate messages
- Good balance of reliability and performance
- **Used for config updates**

**QoS 2 (Exactly once):**
- Guaranteed single delivery
- Slowest due to 4-way handshake
- Use case: Critical commands only

### 14.4 Connection Details Quick Reference

| Component | Address | Port | Protocol | Credentials |
|-----------|---------|------|----------|-------------|
| EMQX Dashboard | 20.198.101.175 | 18083 | HTTP | admin / (changed) |
| EMQX Broker (Internal) | localhost | 1883 | MQTT | local_subscriber / (password) |
| EMQX Broker (External) | mqtt.cloudsynk.net | 8883 | MQTTS | device credentials |
| Express Backend | (Azure URL) | 443 | HTTPS | JWT auth |
| SQL Database | sqlserver-cs-db-prod | 1433 | TDS | genadmin / (password) |

---

## 15. Next Steps

1. **Review this document** with all stakeholders
2. **Get approval** for infrastructure costs ($24/month)
3. **Schedule infrastructure setup** (Week 1)
4. **Assign development resources** for backend integration
5. **Plan pilot testing** (identify 10 test devices)
6. **Set up monitoring dashboards** (Azure Monitor)
7. **Document device provisioning process** for operations team

---

**Document Version:** 1.0
**Last Updated:** March 18, 2026
**Next Review:** After pilot testing completion
