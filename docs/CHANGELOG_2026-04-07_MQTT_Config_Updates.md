# MQTT Config & Device Management Changes

**Date:** 2026-04-07, 13:30 IST

---

## 1. Added `isActive` to `config_update` MQTT Messages

**Problem:** The `config_update` message sent to devices on `cloudsynk/<IMEI>/config` did not include the `isActive` field. This meant devices didn't know whether to send telemetry after receiving a config push.

**Changes:**

- **`server/services/mqttService.js`** — Added `isActive` parameter to `pushConfigUpdate(imei, config, isActive = 1)`. The field is placed after the `...config` spread so the DB value always takes precedence.
- **`server/controllers/deviceController.js`** — Added `data_enabled` to the SELECT query in `pushDeviceConfig` and passed it to `pushConfigUpdate`.
- **`server/controllers/hkmiConfigController.js`** — Added `data_enabled` to the SELECT query in `publishDeviceConfig` and passed it to `pushConfigUpdate`.

**Result:** `config_update` payloads now include `"isActive": 1` or `"isActive": 0` based on the device's `data_enabled` state in the database.

---

## 2. Bug Fix: `reactivateDevice` — `ReferenceError: config is not defined`

**Problem:** The `reactivateDevice` handler in `deviceController.js` referenced an undeclared variable `config` in the audit log (`JSON.stringify({ config })`), causing a `ReferenceError` and returning a 400 error to the client. The device was actually reactivated in the DB and via MQTT, but the handler crashed at the audit log step.

**Fix:** Changed `JSON.stringify({ config })` to `JSON.stringify({ reactivated: true })` in `deviceController.js`.

---

## 3. Removed `publishDeactivationNotice` MQTT Functionality

**Problem:** The `deactivation_notice` message sent to devices before deactivation was unnecessary. Deactivation already NULLs MQTT credentials in the DB, so the EMQX auth hook automatically rejects subsequent connection attempts. The call in `subscriptionService.js` also had a bug (passing `clientId` instead of `imei`).

**Changes:**

- **`server/controllers/deviceController.js`** — Removed the MQTT deactivation notice block from `deactivateDevice`.
- **`server/services/subscriptionService.js`** — Removed the MQTT deactivation notice loop from subscription expiry handling.
- **`server/services/mqttService.js`** — Removed the `publishDeactivationNotice` method entirely.

---

## 4. Hidden Deactivate & Reactivate Buttons from UI

**Problem:** The Deactivate and Reactivate buttons were not needed in the UI.

**Changes:**

- **`client/src/pages/Admin/DeviceManagement.jsx`** — Removed the Deactivate (`NoSymbolIcon`) and Reactivate (`ArrowPathIcon`) buttons from the actions column.
- **`client/src/pages/Admin/ClientDeviceDashboard.jsx`** — Removed the same buttons.

**Note:** The backend API endpoints (`/api/devices/:id/deactivate` and `/api/devices/:id/reactivate`) remain intact for subscription expiry and future API use.

---

## 5. Changed Pause/Resume Message Type from `telemetryConfig` to `teleActive`

**Problem:** Pause/resume messages used `"type": "telemetryConfig"` which was the same type as activation credential messages, making it ambiguous for the device firmware.

**Fix:** Changed the `type` field in `pushActiveStatus` (`server/services/mqttService.js`) from `"telemetryConfig"` to `"teleActive"`.

**Payload after change:**
```json
{
  "type": "teleActive",
  "isActive": 0,
  "timestamp": "2026-04-07T08:00:00.000Z"
}
```

---

## Diagnostic Logging Added (temporary)

- **`server/routes/mqttAuthRoutes.js`** — Added logging for MQTT auth attempts (`username`, `hasPassword`) and detailed password mismatch diagnostics (`hashLen`, `plainInDB`, `plainMatchesHash`, `deviceSentSameAsPlain`). These can be removed once the HK00055 credential issue is resolved.

---

## Files Modified

| File | Changes |
|------|---------|
| `server/services/mqttService.js` | Added `isActive` to `pushConfigUpdate`, removed `publishDeactivationNotice`, changed pause/resume type to `teleActive` |
| `server/controllers/deviceController.js` | Added `data_enabled` to config push query, fixed `reactivateDevice` bug, removed deactivation notice |
| `server/controllers/hkmiConfigController.js` | Added `data_enabled` to config push query |
| `server/services/subscriptionService.js` | Removed deactivation notice loop |
| `server/routes/mqttAuthRoutes.js` | Added diagnostic auth logging (temporary) |
| `client/src/pages/Admin/DeviceManagement.jsx` | Removed Deactivate/Reactivate buttons |
| `client/src/pages/Admin/ClientDeviceDashboard.jsx` | Removed Deactivate/Reactivate buttons |
