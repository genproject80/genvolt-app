# HKMI Device Config — Development Log

**Date Started:** 2026-03-26
**Status:** In Progress
**Feature:** New dashboard page for configuring HKMI devices via MQTT

---

## Overview

A new "HKMI Device Config" page under the Dashboard section that allows users to:
1. Select an HKMI device (client_id = 2)
2. View the latest config values (`Motor_ON_Time_sec`, `Motor_OFF_Time_min`, `Wheel_Threshold`) from `IoT_Data_Sick_P3` table
3. Enter new config values and publish them to the device via MQTT on topic `cloudsynk/{imei}/config`
4. See updated values after the device responds with new telemetry

---

## Files Created

### Backend (Server)

| File | Purpose |
|------|---------|
| `server/controllers/hkmiConfigController.js` | 3 endpoints: get HKMI devices, get latest config, publish config via MQTT |
| `server/routes/hkmiConfigRoutes.js` | Route definitions for `/api/hkmi-config/*` |

### Frontend (Client)

| File | Purpose |
|------|---------|
| `client/src/services/hkmiConfigService.js` | API service with `fetchHkmiDevices()`, `fetchDeviceLatestConfig()`, `publishDeviceConfig()` |
| `client/src/components/dashboard/HKMIDeviceConfig.jsx` | React component — device selector, current config display, new config form |

---

## Files Modified

| File | Change |
|------|--------|
| `server/server.js` | Added `import hkmiConfigRoutes` and `app.use('/api/hkmi-config', hkmiConfigRoutes)` |
| `client/src/pages/Dashboard/DashboardHome.jsx` | Added `import HKMIDeviceConfig` and mapping entries: `'HKMI_Config'`, `'HKMI Config'`, `'HKMI Device Config'` |

---

## Database Changes

### Dashboard entry (already inserted)

```sql
INSERT INTO dashboard (id, name, display_name, description, client_id, is_active, created_by, created_at)
VALUES (6, 'HKMI_Config', 'HKMI Device Config', 'Configure HKMI device parameters (Motor ON/OFF Time, Wheel Threshold) via MQTT', 2, 1, 1, GETUTCDATE());
```

---

## API Endpoints

### GET `/api/hkmi-config/devices`
Returns all devices where `client_id = 2` (HKMI client).

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": 1, "device_id": "HY2030", "client_id": 2, "Model": null, "machin_id": "M001", "activation_status": "ACTIVE" }
  ]
}
```

### GET `/api/hkmi-config/device/:deviceId/latest`
Returns the latest row from `IoT_Data_Sick_P3` for the given device, with only the config columns.

**Response:**
```json
{
  "success": true,
  "data": {
    "Device_ID": "HY2030",
    "Motor_ON_Time_sec": 30,
    "Motor_OFF_Time_min": 5,
    "Wheel_Threshold": 100,
    "CreatedAt": "2026-03-26T06:30:00.000Z"
  }
}
```

### POST `/api/hkmi-config/device/:deviceId/publish`
Publishes new config values to the device via MQTT.

**Request body:**
```json
{
  "Motor_ON_Time_sec": 45,
  "Motor_OFF_Time_min": 10,
  "Wheel_Threshold": 120
}
```

**MQTT topic:** `cloudsynk/{imei}/config`

**MQTT payload (published by backend):**
```json
{
  "type": "config_update",
  "timestamp": "2026-03-26T06:35:00.000Z",
  "Motor_ON_Time_sec": 45,
  "Motor_OFF_Time_min": 10,
  "Wheel_Threshold": 120
}
```

**Response:**
```json
{
  "success": true,
  "message": "Config published to device via MQTT",
  "published": true,
  "topic": "cloudsynk/{imei}/config",
  "config": { "Motor_ON_Time_sec": 45, "Motor_OFF_Time_min": 10, "Wheel_Threshold": 120 }
}
```

---

## Architecture / Data Flow

```
User selects device → GET /api/hkmi-config/device/:id/latest → Shows current values from IoT_Data_Sick_P3

User enters new values → Click "Save & Publish"
  → POST /api/hkmi-config/device/:id/publish
    → Backend calls mqttService.pushConfigUpdate(imei, config)
      → MQTT publishes to: cloudsynk/{imei}/config
        → Device receives config, applies it
        → Device sends telemetry back
          → New row inserted into IoT_Data_Sick_P3 (by local_subscriber.py or backend)
            → User clicks "Refresh" → sees updated values
```

---

## How the Dashboard System Works

The sidebar is **data-driven** from the `dashboard` table:
- `GET /api/dashboards` returns entries filtered by the user's client access
- Sidebar renders each entry using `dashboard.display_name`
- Clicking an entry sets `activeDashboard` in `DashboardContext`
- `DashboardHome.jsx` looks up the React component using `dashboardComponents[activeDashboard.name]`
- No route changes needed — all dashboards render at `/dashboard`

---

## UI Layout

The page has a two-column layout:

```
+------------------------------------------+
|  Select HKMI Device  [dropdown]          |
+------------------------------------------+
|  [success/error message if any]          |
+-------------------+----------------------+
|  Current Config   |  Send New Config     |
|                   |                      |
|  Motor ON:   30   |  Motor ON:  [input]  |
|  Motor OFF:   5   |  Motor OFF: [input]  |
|  Wheel Thr: 100   |  Wheel Thr: [input]  |
|                   |                      |
|  Last updated:    |  [Save & Publish]    |
|  2026-03-26 12:00 |                      |
|        [Refresh]  |                      |
+-------------------+----------------------+
```

---

## Device Simulator

| File | Purpose |
|------|---------|
| `device-simulator/device-simulator.js` | Node.js simulator for HY2030 — handles full pre-activation → active lifecycle |
| `device-simulator/package.json` | Dependencies (mqtt ^5.3.4) |

### How to run

```bash
cd device-simulator
npm install
npm start
```

### Lifecycle

```
Phase 1 (PENDING):
  1. Connect to mqtt://localhost:1883 as "HY2030" (no password)
  2. Subscribe to cloudsynk/pre-activation/response/HY2030
  3. Publish {"device_id":"HY2030"} to cloudsynk/pre-activation
  4. Wait for activation response (retained message from server)

Phase 2 (ACTIVE):
  5. Disconnect pre-activation client
  6. Reconnect with server-assigned username + password
  7. Subscribe to cloudsynk/{client_id}/HY2030/config
  8. Publish telemetry to cloudsynk/{client_id}/HY2030/telemetry on interval
  9. Listen for config_update messages and apply them live
 10. Listen for deactivation_notice and shut down gracefully
```

---

## Remaining / Future Work

- [ ] Test the full end-to-end flow (publish config → device responds → see updated values)
- [ ] Add input validation (min/max ranges for Motor ON Time, Motor OFF Time, Wheel Threshold)
- [ ] Add confirmation dialog before publishing config to device
- [ ] Add audit logging for config changes (who changed what, when)
- [ ] Consider adding auto-refresh (polling) after publish instead of manual Refresh button
- [ ] Fix paho-mqtt v2 deprecation warning in `local_subscriber.py` (non-blocking, cosmetic)
- [ ] Consider permissions — restrict who can publish config (currently any authenticated user)

---

## Dependencies

- **Backend MQTT**: Uses existing `mqttService.pushConfigUpdate()` from `server/services/mqttService.js`
- **Database table**: Reads from `IoT_Data_Sick_P3` (columns: `Motor_ON_Time_sec`, `Motor_OFF_Time_min`, `Wheel_Threshold`)
- **Device table**: Filters by user's client hierarchy (via `Client.getDescendantClients`)
- **MQTT broker**: EMQX running on `localhost:1883`