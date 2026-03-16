# Device Settings - Desired vs Reported State Management

## Overview

This document describes the implementation plan for managing the conflict between **Desired settings** (admin-configured) and **Reported settings** (device telemetry) in the Device Settings UI.

**Related Documentation:**
- [DEVICE_CONFIG_UI_PLAN.md](./DEVICE_CONFIG_UI_PLAN.md) - Parent plan (extends Phase 6)
- [DeviceConfig_DB/IMPLEMENTATION_PLAN.md](../../DeviceConfig_DB/IMPLEMENTATION_PLAN.md) - Azure Function for device config

---

## Problem Statement

Two sources of device settings create potential conflict:

| Source | Table/Column | Purpose |
|--------|--------------|---------|
| **Desired State** | `device.user_func_config` | Admin-configured settings via UI |
| **Reported State** | `IoT_Data_Sick_P3` | Device telemetry (max every 1 hour) |

**Example Conflict:** Admin sets `Motor_On_Time=20` but device reports `Motor_ON_Time_sec=15`.

**Solution:** Side-by-side comparison UI with automatic sync status tracking.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin UI (React)                          │
│  ┌─────────────────────┬─────────────────────┐              │
│  │  DESIRED (Editable) │  REPORTED (Read-Only)│              │
│  ├─────────────────────┼─────────────────────┤              │
│  │  Motor_On_Time: 20  │  Motor_ON_Time_sec: 20  [Match]    │
│  │  Motor_Off_Time: 12 │  Motor_OFF_Time_min: 15 [Differs]  │
│  │  debugmode: 0       │  Debug_Value: 0         [Match]    │
│  └─────────────────────┴─────────────────────┘              │
│  [Sync Status: OUT OF SYNC] Last reported: 30 min ago       │
└─────────────────────────────────────────────────────────────┘
            │ PUT                          │ SELECT
            ▼                              ▼
┌───────────────────────┐      ┌───────────────────────┐
│   device table        │      │   IoT_Data_Sick_P3    │
│   - user_func_config  │      │   - Motor_ON_Time_sec │
│   - config_version    │      │   - Motor_OFF_Time_min│
│   - config_status     │      │   - Debug_Value       │
│   - config_updated_at │      │   - CreatedAt         │
└───────────────────────┘      └───────────────────────┘
```

---

## Field Mapping

The field names differ between Desired (admin config) and Reported (telemetry):

| Desired (`user_func_config`) | Reported (`IoT_Data_Sick_P3`) | Type |
|------------------------------|-------------------------------|------|
| `Motor_On_Time`              | `Motor_ON_Time_sec`           | INT  |
| `Motor_Off_Time`             | `Motor_OFF_Time_min`          | INT  |
| `Wheels_Configured`          | `Wheel_Threshold`             | INT  |
| `debugmode`                  | `Debug_Value`                 | INT  |

---

## Sync Status Logic

| Status | Condition | Color |
|--------|-----------|-------|
| `applied` | All mapped fields match | Green |
| `pending` | Config updated AFTER last telemetry | Yellow |
| `out_of_sync` | Any mapped field differs | Red |
| `unknown` | No telemetry OR last telemetry > 90 minutes | Gray |

### Status Calculation Pseudocode

```javascript
function calculateSyncStatus(desiredConfig, reportedData, configUpdatedAt) {
  // Case 1: No reported data
  if (!reportedData) return { status: 'unknown', reason: 'No telemetry data yet' };

  // Case 2: Stale telemetry (>90 min)
  const minutesSince = (now - reportedData.CreatedAt) / 60000;
  if (minutesSince > 90) return { status: 'unknown', reason: 'No recent telemetry' };

  // Case 3: Config updated after last telemetry
  if (configUpdatedAt > reportedData.CreatedAt) {
    return { status: 'pending', reason: 'Waiting for device acknowledgment' };
  }

  // Case 4: Compare fields using mapping
  const allMatch = compareFields(desiredConfig, reportedData, fieldMapping);
  return {
    status: allMatch ? 'applied' : 'out_of_sync',
    field_comparison: getFieldComparison(desiredConfig, reportedData, fieldMapping)
  };
}
```

---

## Database Schema Changes

### New Columns on `device` Table

```sql
-- Backup first
SELECT * INTO device_backup_settings FROM device;

-- Add tracking columns
ALTER TABLE device ADD config_version INT NOT NULL DEFAULT 1;
ALTER TABLE device ADD config_status NVARCHAR(20) NOT NULL DEFAULT 'unknown';
ALTER TABLE device ADD config_updated_at DATETIME2 NULL;

-- Constraint for valid status values
ALTER TABLE device ADD CONSTRAINT CK_device_config_status
CHECK (config_status IN ('pending', 'applied', 'out_of_sync', 'unknown'));

-- Index for status queries
CREATE NONCLUSTERED INDEX IX_device_config_status
ON device (config_status) INCLUDE (device_id, config_version, config_updated_at);
```

### New Permissions

```sql
INSERT INTO permissions (permission_name) VALUES
('View Device Settings'),
('Edit Device Settings'),
('Toggle Config Mode');

-- Assign to SYSTEM_ADMIN (role_id = 1)
INSERT INTO role_permission (role_id, permission_id)
SELECT 1, permission_id FROM permissions
WHERE permission_name IN ('View Device Settings', 'Edit Device Settings', 'Toggle Config Mode');

-- Assign to SUPER_ADMIN (role_id = 2)
INSERT INTO role_permission (role_id, permission_id)
SELECT 2, permission_id FROM permissions
WHERE permission_name IN ('View Device Settings', 'Edit Device Settings', 'Toggle Config Mode');

-- Assign View + Toggle to CLIENT_ADMIN (role_id = 3)
INSERT INTO role_permission (role_id, permission_id)
SELECT 3, permission_id FROM permissions
WHERE permission_name IN ('View Device Settings', 'Toggle Config Mode');
```

---

## API Specification

### Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/device-settings/:deviceId` | View Device Settings | Get desired + reported comparison |
| PUT | `/api/device-settings/:deviceId` | Edit Device Settings | Update desired settings |
| PUT | `/api/device-settings/:deviceId/config-mode` | Toggle Config Mode | Toggle debug mode |

### GET Response Structure

```json
{
  "success": true,
  "data": {
    "device": {
      "id": 1,
      "device_id": "SICK_001",
      "Model": "SICK_P3",
      "client_name": "Acme Corp"
    },
    "desired": {
      "Motor_On_Time": 20,
      "Motor_Off_Time": 12,
      "Wheels_Configured": 100,
      "debugmode": 0
    },
    "reported": {
      "Motor_ON_Time_sec": 20,
      "Motor_OFF_Time_min": 15,
      "Wheel_Threshold": 100,
      "Debug_Value": 0,
      "reported_at": "2026-01-20T10:30:00Z"
    },
    "sync_status": {
      "status": "out_of_sync",
      "config_version": 3,
      "last_config_update": "2026-01-20T09:00:00Z",
      "last_telemetry": "2026-01-20T10:30:00Z",
      "minutes_since_telemetry": 30,
      "field_comparison": {
        "Motor_On_Time": { "desired": 20, "reported": 20, "match": true },
        "Motor_Off_Time": { "desired": 12, "reported": 15, "match": false },
        "Wheels_Configured": { "desired": 100, "reported": 100, "match": true },
        "debugmode": { "desired": 0, "reported": 0, "match": true }
      },
      "all_match": false
    }
  }
}
```

### PUT Request Body (Update Settings)

```json
{
  "Motor_On_Time": 25,
  "Motor_Off_Time": 15,
  "Wheels_Configured": 100,
  "debugmode": 0
}
```

### Key SQL Queries

**Get Latest P3 Telemetry:**
```sql
SELECT TOP 1
  Motor_ON_Time_sec,
  Motor_OFF_Time_min,
  Wheel_Threshold,
  Debug_Value,
  CreatedAt
FROM IoT_Data_Sick_P3
WHERE Device_ID = @deviceId
ORDER BY CreatedAt DESC
```

**Update Device Settings:**
```sql
UPDATE device
SET
  user_func_config = @userFuncConfig,
  config_version = config_version + 1,
  config_updated_at = GETUTCDATE(),
  config_status = 'pending'
WHERE id = @deviceId
```

---

## Frontend UI Specification

### Modal Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Device Settings - SICK_001                            [X]  │
├─────────────────────────────────────────────────────────────┤
│  [Status Badge] Last Reported: 30 minutes ago               │
├────────────────────────────┬────────────────────────────────┤
│  DESIRED (Editable)        │  REPORTED (Read-Only)          │
├────────────────────────────┼────────────────────────────────┤
│  Motor On Time (sec)       │  Motor ON Time sec             │
│  [    20    ]              │  20                       [✓]  │
├────────────────────────────┼────────────────────────────────┤
│  Motor Off Time (min)      │  Motor OFF Time min            │
│  [    12    ]              │  15                       [✗]  │
├────────────────────────────┼────────────────────────────────┤
│  Wheels Configured         │  Wheel Threshold               │
│  [   100    ]              │  100                      [✓]  │
├────────────────────────────┼────────────────────────────────┤
│  Debug Mode                │  Debug Value                   │
│  [ OFF Toggle ]            │  0                        [✓]  │
├────────────────────────────┴────────────────────────────────┤
│  Config Version: 3    Updated: Jan 20, 2026 09:00 AM        │
├─────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Save Settings]      │
└─────────────────────────────────────────────────────────────┘
```

### Status Badge Styling

| Status | Background | Text | Icon |
|--------|------------|------|------|
| Applied | `bg-green-100` | `text-green-800` | CheckCircle |
| Pending | `bg-yellow-100` | `text-yellow-800` | Clock |
| Out of Sync | `bg-red-100` | `text-red-800` | ExclamationTriangle |
| Unknown | `bg-gray-100` | `text-gray-800` | QuestionMarkCircle |

### Match Indicators

| Match | Icon | Color |
|-------|------|-------|
| Values match | ✓ | Green |
| Values differ | ✗ | Red |
| Reported N/A | — | Gray |

---

## File Structure

### New Files to Create

```
genvolt-app-main/
├── server/
│   ├── routes/
│   │   └── deviceSettingsRoutes.js          # Route definitions
│   ├── controllers/
│   │   └── deviceSettingsController.js      # API handlers
│   └── middleware/
│       └── deviceSettingsValidation.js      # Input validation
└── client/src/
    ├── services/
    │   └── deviceSettingsService.js         # API service
    └── components/
        ├── modals/
        │   └── DeviceSettingsModal.jsx      # Main modal
        └── deviceSettings/
            ├── SyncStatusBadge.jsx          # Status indicator
            └── FieldComparisonRow.jsx       # Field row UI
```

### Files to Modify

| File | Changes |
|------|---------|
| `server/server.js` | Register `deviceSettingsRoutes` |
| Device list component | Add "Settings" action button |

---

## Edge Cases

| Scenario | Status | UI Behavior |
|----------|--------|-------------|
| New device, no telemetry | `unknown` | "No telemetry data received yet", reported shows "N/A" |
| Device offline (>90 min) | `unknown` | "Last data: X hours ago" warning |
| Just updated config | `pending` | Yellow badge, "Waiting for device acknowledgment" |
| Partial match | `out_of_sync` | Per-field match indicators (some ✓, some ✗) |
| Non-P3 device | N/A | Show desired only, hide comparison columns |

---

## Integration with Existing Plans

This feature **extends Phase 6** of [DEVICE_CONFIG_UI_PLAN.md](./DEVICE_CONFIG_UI_PLAN.md):

- **Replaces** simple Edit modal with side-by-side comparison
- **Adds** sync status tracking at database level
- **Adds** config version tracking for audit trail
- **Reuses** existing device hierarchy and RBAC patterns

---

## Implementation Checklist

### Phase 1: Database Migration
- [ ] Backup device table
- [ ] Add `config_version` column
- [ ] Add `config_status` column
- [ ] Add `config_updated_at` column
- [ ] Add constraint and index
- [ ] Add new permissions
- [ ] Assign permissions to roles

### Phase 2: Backend API
- [ ] Create `deviceSettingsController.js`
- [ ] Implement sync status calculation
- [ ] Create `deviceSettingsRoutes.js`
- [ ] Create validation middleware
- [ ] Register routes in `server.js`
- [ ] Test endpoints with Postman/curl

### Phase 3: Frontend Components
- [ ] Create `deviceSettingsService.js`
- [ ] Create `SyncStatusBadge.jsx`
- [ ] Create `FieldComparisonRow.jsx`
- [ ] Create `DeviceSettingsModal.jsx`
- [ ] Add "Settings" button to device list
- [ ] Test modal functionality

### Phase 4: Testing
- [ ] Test with device that has P3 data
- [ ] Test with device that has no P3 data
- [ ] Test with stale telemetry (>90 min)
- [ ] Test config update → pending status
- [ ] Test permission restrictions
- [ ] Verify RBAC hierarchy filtering

---

## Verification

### 1. Database

```sql
-- Verify columns added
SELECT config_version, config_status, config_updated_at
FROM device WHERE id = 1;

-- Verify permissions
SELECT p.permission_name, r.role_name
FROM permissions p
JOIN role_permission rp ON p.permission_id = rp.permission_id
JOIN role r ON rp.role_id = r.role_id
WHERE p.permission_name LIKE '%Device Settings%' OR p.permission_name = 'Toggle Config Mode';
```

### 2. Backend API

```bash
# Get settings comparison
curl -H "Authorization: Bearer <token>" \
  http://localhost:5000/api/device-settings/SICK_001

# Update settings
curl -X PUT -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"Motor_On_Time": 25, "debugmode": 1}' \
  http://localhost:5000/api/device-settings/SICK_001

# Toggle config mode
curl -X PUT -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}' \
  http://localhost:5000/api/device-settings/SICK_001/config-mode
```

### 3. Frontend

1. Login as SYSTEM_ADMIN
2. Navigate to Admin Panel → Devices
3. Click "Settings" on a SICK P3 device
4. Verify side-by-side display
5. Edit a value and save
6. Verify status changes to "Pending"
7. Wait for next telemetry and verify status updates

---

## References

- [deviceController.js](../server/controllers/deviceController.js) - RBAC pattern reference
- [p3DataController.js](../server/controllers/p3DataController.js) - P3 query pattern reference
- [05_create_iot_data_sick_p3.sql](../../Sick_Sensor/FunctionApp/optionA_http/sql_migrations/05_create_iot_data_sick_p3.sql) - P3 table schema
