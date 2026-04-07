# Plan: Add `isActive` to `config_update` MQTT Messages

## Context

The device firmware uses the `isActive` field received on the `cloudsynk/<IMEI>/config` topic to decide whether to send telemetry. Currently, `telemetryConfig` messages already include `isActive`, but `config_update` messages do **not**. This means when a config push is sent to a device, it doesn't reinforce the telemetry active/inactive state, which can cause the device to miss its expected state.

**Goal:** Every message sent to a device on the config topic should include `isActive` so the device always knows whether it should be sending telemetry.

## Changes (3 files, ~7 lines + 1 bug fix)

### 1. `server/services/mqttService.js` — line 148

Add `isActive` parameter to `pushConfigUpdate` and include it in the payload.

```js
// Before:
async pushConfigUpdate(imei, config) {
  // ...
  const payload = {
    type: 'config_update',
    timestamp: new Date().toISOString(),
    ...config,
  };

// After:
async pushConfigUpdate(imei, config, isActive = 1) {
  // ...
  const payload = {
    type: 'config_update',
    timestamp: new Date().toISOString(),
    ...config,
    isActive: isActive ? 1 : 0,  // placed AFTER spread so DB value always wins
  };
```

### 2. `server/controllers/deviceController.js` — lines 1021, 1033

Add `data_enabled` to the SELECT query and pass it to `pushConfigUpdate`.

- **Line 1021:** Add `data_enabled` to SELECT:
  ```sql
  SELECT device_id, client_id, activation_status, imei, data_enabled FROM dbo.device ...
  ```
- **Line 1033:** Pass `data_enabled`:
  ```js
  await mqttService.pushConfigUpdate(device.imei, config, device.data_enabled);
  ```

### 3. `server/controllers/hkmiConfigController.js` — lines 119, 138

Add `data_enabled` to the SELECT query and pass it to `pushConfigUpdate`.

- **Line 119:** Add `data_enabled` to SELECT:
  ```sql
  SELECT id, device_id, imei, data_enabled FROM device ...
  ```
- **Line 138:** Pass `data_enabled`:
  ```js
  const published = await mqttService.pushConfigUpdate(imei, config, device.data_enabled);
  ```

### 4. Bug Fix: `server/controllers/deviceController.js` — line 900

**Bug:** `reactivateDevice` handler references undeclared variable `config` in audit log, causing `ReferenceError: config is not defined` → server returns 400.

- **Line 900:** Change `JSON.stringify({ config })` to `JSON.stringify({ reactivated: true })`
  ```js
  // Before:
  details: JSON.stringify({ config }),
  // After:
  details: JSON.stringify({ reactivated: true }),
  ```

## No Frontend Changes Needed

The existing **Pause/Resume** buttons on `ClientDeviceDashboard.jsx` and `DeviceManagement.jsx` already serve as the activate/deactivate telemetry controls. They call `pushActiveStatus` which sends `isActive: 0|1` via `telemetryConfig` messages. No additional UI toggle is needed.

## JSON Payloads After Changes

### Activate (PENDING → ACTIVE) — unchanged
```json
{
  "type": "telemetryConfig",
  "isActive": 1,
  "mqtt_username": "HK00053",
  "mqtt_password": "a1b2c3d4..."
}
```

### Deactivate (ACTIVE → INACTIVE) — unchanged
```json
{
  "type": "deactivation_notice",
  "status": "deactivated",
  "reason": "admin_action",
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

### Reactivate (INACTIVE → ACTIVE) — unchanged
```json
{
  "type": "telemetryConfig",
  "isActive": 1,
  "mqtt_username": "HK00053",
  "mqtt_password": "newRandomPass..."
}
```

### Pause Telemetry — unchanged
```json
{
  "type": "telemetryConfig",
  "isActive": 0,
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

### Resume Telemetry — unchanged
```json
{
  "type": "telemetryConfig",
  "isActive": 1,
  "timestamp": "2026-04-07T12:00:00.000Z"
}
```

### Rotate Credentials — unchanged
```json
{
  "type": "telemetryConfig",
  "isActive": 1,
  "mqtt_username": "HK00053",
  "mqtt_password": "brandNewPass..."
}
```

### Config Push — THIS IS THE ONE CHANGE
```json
{
  "type": "config_update",
  "timestamp": "2026-04-07T12:00:00.000Z",
  "Motor_ON_Time_sec": 300,
  "Motor_OFF_Time_min": 10,
  "Wheel_Threshold": 500,
  "isActive": 1
}
```
The `isActive` value reflects the device's current `data_enabled` state from the database (1 if active, 0 if paused).

## Result: All Config Topic Messages Will Include `isActive`

| Method | Message Type | `isActive` |
|---|---|---|
| `publishTelemetryConfig` | `telemetryConfig` | Already included (hardcoded `1`) |
| `pushActiveStatus` | `telemetryConfig` | Already included (`0` or `1`) |
| `pushConfigUpdate` | `config_update` | **Added by this change** |
| `publishDeactivationNotice` | `deactivation_notice` | N/A (device being deactivated) |

## Verification

1. Start the backend server
2. Use the DeviceConfigModal to push a config update to an ACTIVE device
3. Monitor MQTT broker (or device logs) — confirm the `config_update` message on `cloudsynk/<IMEI>/config` now includes `"isActive": 1` (or `0` if device is paused)
4. Pause the device via the UI, then push config again — confirm `"isActive": 0`
5. Test reactivating an INACTIVE device — confirm it no longer returns a 400 error
