# Data Source Mapping Enhancement

## Overview

This document describes the implementation plan for **Dynamic Data Source Mapping** - a feature that allows administrators to configure which database tables and columns are used to retrieve reported device telemetry data for comparison with desired settings (`user_func_config`).

**Related Documentation:**
- [DEVICE_CONFIG_UI_PLAN.md](./DEVICE_CONFIG_UI_PLAN.md) - Parent UI plan
- [DEVICE_SETTINGS_SYNC_PLAN.md](./DEVICE_SETTINGS_SYNC_PLAN.md) - Desired vs Reported state management

---

## Problem Statement

The current architecture in `DEVICE_SETTINGS_SYNC_PLAN.md` hardcodes `IoT_Data_Sick_P3` as the source for reported device settings. However:

- **Different device types** have different telemetry tables (SICK P3, Gas Sensor, Custom devices)
- **Column names differ** between tables (e.g., `Motor_On_Time` vs `Motor_ON_Time_sec`)
- **New device types** require code changes to add support

**Solution:** A configurable mapping system that allows administrators to define which table and columns to query for each device type, managed through the Admin UI.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Admin UI (React)                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Data Source Mapping (New Admin Section)                    ││
│  │  ├── Device Type: SICK_P3                                   ││
│  │  │   └── Table: IoT_Data_Sick_P3                            ││
│  │  │       └── Field Mappings:                                ││
│  │  │           Motor_On_Time → Motor_ON_Time_sec              ││
│  │  │           Motor_Off_Time → Motor_OFF_Time_min            ││
│  │  │           debugmode → Debug_Value                        ││
│  │  ├── Device Type: GAS_SENSOR                                ││
│  │  │   └── Table: IoT_Data_Gas_Sensor                         ││
│  │  │       └── Field Mappings:                                ││
│  │  │           alarm_threshold → Current_PPM                  ││
│  │  └── Device Type: CUSTOM_XYZ                                ││
│  │      └── Table: Client_Custom_Data_Table                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Express API)                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  GET /api/device-settings/:deviceId                         ││
│  │    1. Get device info (including device type/Model)         ││
│  │    2. Lookup data source mapping for device type            ││
│  │    3. Build dynamic SQL query from mapping                  ││
│  │    4. Execute query against mapped table                    ││
│  │    5. Return comparison with field labels                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Database (SQL Server)                       │
├─────────────────────────────────────────────────────────────────┤
│  device_type_data_source (NEW)                                   │
│  ├── id: 1, device_type: 'SICK_P3', table: 'IoT_Data_Sick_P3'  │
│  ├── id: 2, device_type: 'GAS_SENSOR', table: 'IoT_Data_Gas'   │
│  └── id: 3, device_type: 'CUSTOM', table: 'Custom_Table'       │
│                                                                  │
│  device_type_field_mapping (NEW)                                 │
│  ├── data_source_id: 1, desired: 'Motor_On_Time',              │
│  │   reported: 'Motor_ON_Time_sec'                              │
│  └── data_source_id: 1, desired: 'debugmode',                  │
│      reported: 'Debug_Value'                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### `device_type_data_source`

Defines which telemetry table contains reported data for each device type.

```sql
CREATE TABLE device_type_data_source (
    id INT IDENTITY(1,1) PRIMARY KEY,

    -- Device type identification
    device_type NVARCHAR(50) NOT NULL,           -- e.g., 'SICK_P3', 'GAS_SENSOR'
    display_name NVARCHAR(100) NULL,             -- Friendly name for UI (e.g., 'SICK P3 Sensors')

    -- Table configuration
    table_name NVARCHAR(128) NOT NULL,           -- e.g., 'IoT_Data_Sick_P3'
    schema_name NVARCHAR(128) NOT NULL DEFAULT 'dbo', -- SQL schema

    -- Key columns for querying
    device_id_column NVARCHAR(128) NOT NULL DEFAULT 'Device_ID',  -- Column to match device
    timestamp_column NVARCHAR(128) NOT NULL DEFAULT 'CreatedAt',  -- Column for ordering

    -- Telemetry freshness settings
    stale_threshold_minutes INT NOT NULL DEFAULT 90, -- When to show "unknown" status

    -- Metadata
    is_active BIT NOT NULL DEFAULT 1,
    created_by_user_id INT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_by_user_id INT NULL,
    updated_at DATETIME2 NULL,

    -- Constraints
    CONSTRAINT UQ_data_source_device_type UNIQUE (device_type),
    CONSTRAINT FK_data_source_created_by
        FOREIGN KEY (created_by_user_id) REFERENCES [user](user_id),
    CONSTRAINT FK_data_source_updated_by
        FOREIGN KEY (updated_by_user_id) REFERENCES [user](user_id)
);

-- Indexes
CREATE INDEX IX_data_source_device_type ON device_type_data_source(device_type);
CREATE INDEX IX_data_source_active ON device_type_data_source(is_active);
```

### `device_type_field_mapping`

Maps `user_func_config` fields to telemetry table columns.

```sql
CREATE TABLE device_type_field_mapping (
    id INT IDENTITY(1,1) PRIMARY KEY,

    -- Parent reference
    data_source_id INT NOT NULL,

    -- Field mapping
    desired_field NVARCHAR(100) NOT NULL,        -- Field in user_func_config (e.g., 'Motor_On_Time')
    reported_column NVARCHAR(128) NOT NULL,      -- Column in telemetry table (e.g., 'Motor_ON_Time_sec')

    -- Display settings
    display_label NVARCHAR(100) NULL,            -- Friendly name (e.g., 'Motor On Time (sec)')
    display_order INT NOT NULL DEFAULT 0,        -- Order in UI

    -- Data type for validation/formatting
    data_type NVARCHAR(20) NOT NULL DEFAULT 'number', -- 'number', 'string', 'boolean', 'datetime'

    -- Comparison settings
    comparison_enabled BIT NOT NULL DEFAULT 1,   -- Include in sync status comparison

    -- Constraints
    CONSTRAINT FK_field_mapping_source
        FOREIGN KEY (data_source_id) REFERENCES device_type_data_source(id) ON DELETE CASCADE,
    CONSTRAINT UQ_field_mapping_source_field
        UNIQUE (data_source_id, desired_field)
);

-- Indexes
CREATE INDEX IX_field_mapping_source ON device_type_field_mapping(data_source_id);
CREATE INDEX IX_field_mapping_order ON device_type_field_mapping(data_source_id, display_order);
```

### New Permissions

```sql
-- Add new permissions
INSERT INTO permissions (permission_name) VALUES
('View Data Source Mapping'),
('Manage Data Source Mapping');

-- Assign to SYSTEM_ADMIN (role_id = 1)
INSERT INTO role_permission (role_id, permission_id)
SELECT 1, permission_id FROM permissions
WHERE permission_name IN ('View Data Source Mapping', 'Manage Data Source Mapping');

-- Assign to SUPER_ADMIN (role_id = 2)
INSERT INTO role_permission (role_id, permission_id)
SELECT 2, permission_id FROM permissions
WHERE permission_name IN ('View Data Source Mapping', 'Manage Data Source Mapping');

-- Verify
SELECT p.permission_name, r.role_name
FROM permissions p
JOIN role_permission rp ON p.permission_id = rp.permission_id
JOIN role r ON rp.role_id = r.role_id
WHERE p.permission_name LIKE '%Data Source%';
```

### Seed Initial Data

```sql
-- Seed SICK P3 mapping (based on existing DEVICE_SETTINGS_SYNC_PLAN.md)
INSERT INTO device_type_data_source
(device_type, display_name, table_name, schema_name, device_id_column, timestamp_column, stale_threshold_minutes, created_by_user_id)
VALUES
('SICK_P3', 'SICK P3 Sensors', 'IoT_Data_Sick_P3', 'dbo', 'Device_ID', 'CreatedAt', 90, 1);

-- Get the inserted ID
DECLARE @sickP3Id INT = SCOPE_IDENTITY();

-- Seed field mappings for SICK P3
INSERT INTO device_type_field_mapping
(data_source_id, desired_field, reported_column, display_label, display_order, data_type)
VALUES
(@sickP3Id, 'Motor_On_Time', 'Motor_ON_Time_sec', 'Motor On Time (sec)', 1, 'number'),
(@sickP3Id, 'Motor_Off_Time', 'Motor_OFF_Time_min', 'Motor Off Time (min)', 2, 'number'),
(@sickP3Id, 'Wheels_Configured', 'Wheel_Threshold', 'Wheel Threshold', 3, 'number'),
(@sickP3Id, 'debugmode', 'Debug_Value', 'Debug Mode', 4, 'number');

-- Seed Gas Sensor mapping (example)
INSERT INTO device_type_data_source
(device_type, display_name, table_name, schema_name, device_id_column, timestamp_column, stale_threshold_minutes, created_by_user_id)
VALUES
('GAS_SENSOR', 'Gas Sensors', 'IoT_Data_Gas_Sensor', 'dbo', 'Device_ID', 'CreatedAt', 60, 1);

DECLARE @gasId INT = SCOPE_IDENTITY();

INSERT INTO device_type_field_mapping
(data_source_id, desired_field, reported_column, display_label, display_order, data_type)
VALUES
(@gasId, 'alarm_threshold_ppm', 'Current_Alarm_PPM', 'Alarm Threshold (PPM)', 1, 'number'),
(@gasId, 'sampling_interval_sec', 'Sample_Interval', 'Sampling Interval (sec)', 2, 'number');
```

---

## API Specification

### Data Source Mapping Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/data-source-mappings` | View Data Source Mapping | List all device type mappings |
| GET | `/api/data-source-mappings/:id` | View Data Source Mapping | Get single mapping with fields |
| POST | `/api/data-source-mappings` | Manage Data Source Mapping | Create new mapping |
| PUT | `/api/data-source-mappings/:id` | Manage Data Source Mapping | Update mapping |
| DELETE | `/api/data-source-mappings/:id` | Manage Data Source Mapping | Delete mapping |

### Table Discovery Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/api/data-source-mappings/tables` | Manage Data Source Mapping | List available database tables |
| GET | `/api/data-source-mappings/tables/:tableName/columns` | Manage Data Source Mapping | List columns for a table |

---

### GET `/api/data-source-mappings`

List all configured data source mappings.

**Response:**
```json
{
  "success": true,
  "data": {
    "mappings": [
      {
        "id": 1,
        "device_type": "SICK_P3",
        "display_name": "SICK P3 Sensors",
        "table_name": "IoT_Data_Sick_P3",
        "schema_name": "dbo",
        "device_id_column": "Device_ID",
        "timestamp_column": "CreatedAt",
        "stale_threshold_minutes": 90,
        "is_active": true,
        "field_count": 4,
        "created_at": "2026-01-20T10:00:00Z",
        "created_by_name": "Admin User",
        "fields": [
          {
            "id": 1,
            "desired_field": "Motor_On_Time",
            "reported_column": "Motor_ON_Time_sec",
            "display_label": "Motor On Time (sec)",
            "display_order": 1,
            "data_type": "number",
            "comparison_enabled": true
          },
          {
            "id": 2,
            "desired_field": "Motor_Off_Time",
            "reported_column": "Motor_OFF_Time_min",
            "display_label": "Motor Off Time (min)",
            "display_order": 2,
            "data_type": "number",
            "comparison_enabled": true
          }
        ]
      },
      {
        "id": 2,
        "device_type": "GAS_SENSOR",
        "display_name": "Gas Sensors",
        "table_name": "IoT_Data_Gas_Sensor",
        "field_count": 2
      }
    ]
  }
}
```

---

### GET `/api/data-source-mappings/:id`

Get single mapping with all field details.

**Response:**
```json
{
  "success": true,
  "data": {
    "mapping": {
      "id": 1,
      "device_type": "SICK_P3",
      "display_name": "SICK P3 Sensors",
      "table_name": "IoT_Data_Sick_P3",
      "schema_name": "dbo",
      "device_id_column": "Device_ID",
      "timestamp_column": "CreatedAt",
      "stale_threshold_minutes": 90,
      "is_active": true,
      "created_at": "2026-01-20T10:00:00Z",
      "created_by_user_id": 1,
      "created_by_name": "Admin User",
      "updated_at": null,
      "fields": [
        {
          "id": 1,
          "desired_field": "Motor_On_Time",
          "reported_column": "Motor_ON_Time_sec",
          "display_label": "Motor On Time (sec)",
          "display_order": 1,
          "data_type": "number",
          "comparison_enabled": true
        }
      ]
    }
  }
}
```

---

### POST `/api/data-source-mappings`

Create new data source mapping.

**Request Body:**
```json
{
  "device_type": "CUSTOM_DEVICE",
  "display_name": "Custom Device Type",
  "table_name": "IoT_Data_Custom",
  "schema_name": "dbo",
  "device_id_column": "DeviceID",
  "timestamp_column": "RecordedAt",
  "stale_threshold_minutes": 120,
  "fields": [
    {
      "desired_field": "setting_a",
      "reported_column": "SettingA_Value",
      "display_label": "Setting A",
      "display_order": 1,
      "data_type": "number",
      "comparison_enabled": true
    },
    {
      "desired_field": "setting_b",
      "reported_column": "SettingB_Value",
      "display_label": "Setting B",
      "display_order": 2,
      "data_type": "string",
      "comparison_enabled": true
    }
  ]
}
```

**Validation Rules:**
- `device_type`: Required, unique, 1-50 characters
- `table_name`: Required, must exist in database
- `device_id_column`: Required, must exist in specified table
- `timestamp_column`: Required, must exist in specified table
- `fields[].reported_column`: Must exist in specified table

**Response (201):**
```json
{
  "success": true,
  "message": "Data source mapping created successfully",
  "data": {
    "mapping": { ... }
  }
}
```

---

### PUT `/api/data-source-mappings/:id`

Update existing mapping.

**Request Body:** Same structure as POST (fields array replaces all existing fields)

---

### DELETE `/api/data-source-mappings/:id`

Delete mapping and all associated field mappings (cascade).

**Response:**
```json
{
  "success": true,
  "message": "Data source mapping deleted successfully"
}
```

---

### GET `/api/data-source-mappings/tables`

List available database tables for selection.

**Response:**
```json
{
  "success": true,
  "data": {
    "tables": [
      {
        "schema": "dbo",
        "name": "IoT_Data_Sick_P3",
        "row_count": 15420,
        "in_use": true,
        "used_by": "SICK_P3"
      },
      {
        "schema": "dbo",
        "name": "IoT_Data_Gas_Sensor",
        "row_count": 8234,
        "in_use": true,
        "used_by": "GAS_SENSOR"
      },
      {
        "schema": "dbo",
        "name": "IoT_Raw_Messages",
        "row_count": 52341,
        "in_use": false,
        "used_by": null
      },
      {
        "schema": "dbo",
        "name": "Custom_Client_Data",
        "row_count": 1234,
        "in_use": false,
        "used_by": null
      }
    ]
  }
}
```

**SQL Query:**
```sql
SELECT
    s.name AS schema_name,
    t.name AS table_name,
    p.rows AS row_count,
    ds.device_type AS used_by
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
LEFT JOIN device_type_data_source ds ON t.name = ds.table_name AND s.name = ds.schema_name
WHERE t.name LIKE 'IoT_%' OR t.name LIKE '%_Data%' OR t.name LIKE '%Sensor%'
ORDER BY t.name;
```

---

### GET `/api/data-source-mappings/tables/:tableName/columns`

List columns for a specific table.

**Response:**
```json
{
  "success": true,
  "data": {
    "table_name": "IoT_Data_Sick_P3",
    "schema_name": "dbo",
    "columns": [
      { "name": "id", "type": "int", "nullable": false, "is_identity": true },
      { "name": "Device_ID", "type": "nvarchar(50)", "nullable": false, "is_identity": false },
      { "name": "Motor_ON_Time_sec", "type": "int", "nullable": true, "is_identity": false },
      { "name": "Motor_OFF_Time_min", "type": "int", "nullable": true, "is_identity": false },
      { "name": "Wheel_Threshold", "type": "int", "nullable": true, "is_identity": false },
      { "name": "Debug_Value", "type": "int", "nullable": true, "is_identity": false },
      { "name": "CreatedAt", "type": "datetime2", "nullable": false, "is_identity": false }
    ]
  }
}
```

**SQL Query:**
```sql
SELECT
    c.name AS column_name,
    t.name + CASE
        WHEN t.name IN ('nvarchar', 'varchar', 'char') THEN '(' + CAST(c.max_length AS VARCHAR) + ')'
        WHEN t.name IN ('decimal', 'numeric') THEN '(' + CAST(c.precision AS VARCHAR) + ',' + CAST(c.scale AS VARCHAR) + ')'
        ELSE ''
    END AS data_type,
    c.is_nullable,
    c.is_identity
FROM sys.columns c
INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(@schemaName + '.' + @tableName)
ORDER BY c.column_id;
```

---

## Backend Implementation

### File Structure

```
server/
├── routes/
│   └── dataSourceMappingRoutes.js      (NEW)
├── controllers/
│   └── dataSourceMappingController.js  (NEW)
├── models/
│   └── DataSourceMapping.js            (NEW)
├── middleware/
│   └── dataSourceMappingValidation.js  (NEW)
└── server.js                           (UPDATE - add route)
```

### Dynamic Query Builder

The key backend logic that builds SQL queries based on mappings:

```javascript
// dataSourceMappingController.js

/**
 * Get reported data for a device using dynamic mapping
 * @param {string} deviceId - The device identifier
 * @param {string} deviceType - The device type/Model (e.g., 'SICK_P3')
 * @returns {Object} Reported data with mapping info
 */
async function getReportedDataForDevice(deviceId, deviceType) {
    // 1. Get data source mapping for this device type
    const dataSource = await DataSourceMapping.findByDeviceType(deviceType);

    if (!dataSource) {
        return {
            data: null,
            mapping: null,
            error: 'No data source configured for this device type'
        };
    }

    // 2. Get field mappings
    const fieldMappings = await DataSourceMapping.getFieldMappings(dataSource.id);

    if (fieldMappings.length === 0) {
        return {
            data: null,
            mapping: { device_type: deviceType, table_name: dataSource.table_name },
            error: 'No field mappings configured for this device type'
        };
    }

    // 3. Validate table exists (security check)
    const tableExists = await validateTableExists(dataSource.schema_name, dataSource.table_name);
    if (!tableExists) {
        logger.error(`Data source table does not exist: ${dataSource.schema_name}.${dataSource.table_name}`);
        return {
            data: null,
            mapping: { device_type: deviceType, table_name: dataSource.table_name },
            error: 'Data source table not found'
        };
    }

    // 4. Build dynamic SELECT query
    // IMPORTANT: Column names are validated against sys.columns, not user input
    const validatedColumns = await validateColumns(
        dataSource.schema_name,
        dataSource.table_name,
        fieldMappings.map(f => f.reported_column)
    );

    const columnList = validatedColumns.map(c => `[${c}]`).join(', ');

    const query = `
        SELECT TOP 1
            ${columnList},
            [${dataSource.timestamp_column}] AS reported_at
        FROM [${dataSource.schema_name}].[${dataSource.table_name}]
        WHERE [${dataSource.device_id_column}] = @deviceId
        ORDER BY [${dataSource.timestamp_column}] DESC
    `;

    // 5. Execute query with parameterized device ID
    const pool = await getPool();
    const request = pool.request();
    request.input('deviceId', sql.NVarChar, deviceId);

    const result = await request.query(query);

    if (result.recordset.length === 0) {
        return {
            data: null,
            mapping: buildMappingInfo(dataSource, fieldMappings),
            error: null
        };
    }

    // 6. Transform result to standardized format
    const reported = result.recordset[0];
    const reportedAt = reported.reported_at;
    delete reported.reported_at;

    return {
        data: {
            ...reported,
            reported_at: reportedAt
        },
        mapping: buildMappingInfo(dataSource, fieldMappings),
        stale_threshold_minutes: dataSource.stale_threshold_minutes,
        error: null
    };
}

/**
 * Validate that a table exists in the database
 */
async function validateTableExists(schemaName, tableName) {
    const pool = await getPool();
    const result = await pool.request()
        .input('schemaName', sql.NVarChar, schemaName)
        .input('tableName', sql.NVarChar, tableName)
        .query(`
            SELECT 1 FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
        `);
    return result.recordset.length > 0;
}

/**
 * Validate that columns exist in a table (returns only valid columns)
 */
async function validateColumns(schemaName, tableName, columns) {
    const pool = await getPool();
    const result = await pool.request()
        .input('schemaName', sql.NVarChar, schemaName)
        .input('tableName', sql.NVarChar, tableName)
        .query(`
            SELECT c.name
            FROM sys.columns c
            INNER JOIN sys.tables t ON c.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE s.name = @schemaName AND t.name = @tableName
        `);

    const existingColumns = result.recordset.map(r => r.name);
    return columns.filter(c => existingColumns.includes(c));
}

/**
 * Build mapping info for API response
 */
function buildMappingInfo(dataSource, fieldMappings) {
    return {
        device_type: dataSource.device_type,
        display_name: dataSource.display_name,
        table_name: dataSource.table_name,
        field_mappings: fieldMappings.map(f => ({
            desired: f.desired_field,
            reported: f.reported_column,
            label: f.display_label || f.desired_field,
            data_type: f.data_type,
            comparison_enabled: f.comparison_enabled
        }))
    };
}
```

### Updated Device Settings Controller

Update the existing `deviceSettingsController.js` to use dynamic mappings:

```javascript
// deviceSettingsController.js

const { getReportedDataForDevice } = require('./dataSourceMappingController');

/**
 * GET /api/device-settings/:deviceId
 * Get device settings with desired vs reported comparison
 */
async function getDeviceSettings(req, res) {
    try {
        const { deviceId } = req.params;

        // 1. Get device info including device type (Model field)
        const device = await Device.findByDeviceId(deviceId);

        if (!device) {
            return res.status(404).json({
                success: false,
                message: 'Device not found'
            });
        }

        // Check RBAC access
        if (!await canAccessDevice(req.user, device.id)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied to this device'
            });
        }

        const deviceType = device.Model; // e.g., 'SICK_P3'

        // 2. Get desired config from device.user_func_config
        let desiredConfig = {};
        try {
            desiredConfig = JSON.parse(device.user_func_config || '{}');
        } catch (e) {
            logger.warn(`Invalid JSON in user_func_config for device ${deviceId}`);
        }

        // 3. Get reported data using dynamic mapping
        const reportedData = await getReportedDataForDevice(deviceId, deviceType);

        // 4. Calculate sync status using mapped fields
        const syncStatus = calculateSyncStatus(
            desiredConfig,
            reportedData,
            device.config_updated_at,
            device.config_version
        );

        return res.json({
            success: true,
            data: {
                device: {
                    id: device.id,
                    device_id: deviceId,
                    Model: deviceType,
                    client_name: device.client_name
                },
                desired: desiredConfig,
                reported: reportedData.data,
                mapping_info: reportedData.mapping,
                sync_status: syncStatus
            }
        });

    } catch (error) {
        logger.error('Error getting device settings:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve device settings'
        });
    }
}

/**
 * Calculate sync status between desired and reported values
 */
function calculateSyncStatus(desiredConfig, reportedData, configUpdatedAt, configVersion) {
    const now = new Date();

    // Case 1: No mapping configured
    if (!reportedData.mapping) {
        return {
            status: 'no_mapping',
            reason: reportedData.error || 'No data source mapping configured',
            config_version: configVersion
        };
    }

    // Case 2: No reported data
    if (!reportedData.data) {
        return {
            status: 'unknown',
            reason: 'No telemetry data received yet',
            config_version: configVersion
        };
    }

    const reportedAt = new Date(reportedData.data.reported_at);
    const minutesSince = (now - reportedAt) / 60000;

    // Case 3: Stale telemetry
    if (minutesSince > reportedData.stale_threshold_minutes) {
        return {
            status: 'unknown',
            reason: `No recent telemetry (last: ${Math.round(minutesSince)} min ago)`,
            config_version: configVersion,
            last_telemetry: reportedAt.toISOString(),
            minutes_since_telemetry: Math.round(minutesSince)
        };
    }

    // Case 4: Config updated after last telemetry
    if (configUpdatedAt && new Date(configUpdatedAt) > reportedAt) {
        return {
            status: 'pending',
            reason: 'Waiting for device acknowledgment',
            config_version: configVersion,
            last_config_update: configUpdatedAt,
            last_telemetry: reportedAt.toISOString()
        };
    }

    // Case 5: Compare fields using mapping
    const fieldComparison = {};
    let allMatch = true;

    for (const mapping of reportedData.mapping.field_mappings) {
        if (!mapping.comparison_enabled) continue;

        const desiredValue = desiredConfig[mapping.desired];
        const reportedValue = reportedData.data[mapping.reported];
        const match = desiredValue === reportedValue;

        if (!match) allMatch = false;

        fieldComparison[mapping.desired] = {
            desired: desiredValue,
            reported: reportedValue,
            match: match,
            label: mapping.label
        };
    }

    return {
        status: allMatch ? 'applied' : 'out_of_sync',
        config_version: configVersion,
        last_config_update: configUpdatedAt,
        last_telemetry: reportedAt.toISOString(),
        minutes_since_telemetry: Math.round(minutesSince),
        field_comparison: fieldComparison,
        all_match: allMatch
    };
}
```

---

## Frontend Implementation

### File Structure

```
client/src/
├── pages/Admin/
│   └── DataSourceMappingManagement.jsx     (NEW - Main page)
├── components/
│   └── dataSourceMapping/                   (NEW directory)
│       ├── DataSourceList.jsx              (List of mappings)
│       ├── DataSourceCard.jsx              (Single mapping card)
│       ├── FieldMappingTable.jsx           (Field mappings table)
│       └── TableColumnPicker.jsx           (Table/column selector)
├── components/modals/
│   ├── AddDataSourceModal.jsx              (NEW)
│   ├── EditDataSourceModal.jsx             (NEW)
│   └── DeleteDataSourceModal.jsx           (NEW)
├── services/
│   └── dataSourceMappingService.js         (NEW)
├── hooks/
│   └── useDataSourceMappingPermissions.js  (NEW)
└── context/
    └── DataSourceMappingContext.jsx        (NEW - optional)
```

### Service Layer

```javascript
// services/dataSourceMappingService.js

import api from './api';

export const dataSourceMappingService = {
    // Get all mappings
    async getAll() {
        const response = await api.get('/data-source-mappings');
        return response.data;
    },

    // Get single mapping by ID
    async getById(id) {
        const response = await api.get(`/data-source-mappings/${id}`);
        return response.data;
    },

    // Create new mapping
    async create(data) {
        const response = await api.post('/data-source-mappings', data);
        return response.data;
    },

    // Update mapping
    async update(id, data) {
        const response = await api.put(`/data-source-mappings/${id}`, data);
        return response.data;
    },

    // Delete mapping
    async delete(id) {
        const response = await api.delete(`/data-source-mappings/${id}`);
        return response.data;
    },

    // Get available tables
    async getTables() {
        const response = await api.get('/data-source-mappings/tables');
        return response.data;
    },

    // Get columns for a table
    async getTableColumns(tableName) {
        const response = await api.get(`/data-source-mappings/tables/${tableName}/columns`);
        return response.data;
    }
};
```

---

## UI Specifications

### Main Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Data Source Mapping                                              │
│ Configure which tables and columns to use for reported data     │
├─────────────────────────────────────────────────────────────────┤
│ [Statistics Cards]                                               │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                │
│ │ Total   │ │ Active  │ │ Tables  │ │ Fields  │                │
│ │    3    │ │    3    │ │    3    │ │   12    │                │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘                │
├─────────────────────────────────────────────────────────────────┤
│ [Search]                          [+ New Data Source Mapping]   │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Device Type   │ Table Name        │ Fields │ Status │Actions│ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ SICK_P3       │ IoT_Data_Sick_P3  │ 4      │ Active │ ✎ 🗑 │ │
│ │ GAS_SENSOR    │ IoT_Data_Gas      │ 2      │ Active │ ✎ 🗑 │ │
│ │ CUSTOM_XYZ    │ Custom_Data_Tbl   │ 5      │ Active │ ✎ 🗑 │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Add/Edit Data Source Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ Add Data Source Mapping                                     [X] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Device Type *                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ SICK_P3                                                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ℹ Must match the Model field in the device table               │
│                                                                 │
│ Display Name                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ SICK P3 Sensors                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ──────────────────── Table Configuration ────────────────────   │
│                                                                 │
│ Data Table *                              [🔄 Refresh]          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Select a table...                                       ▼   │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ IoT_Data_Sick_P3 (15,420 rows)                         │ │ │
│ │ │ IoT_Data_Gas_Sensor (8,234 rows) - In use by GAS_SENS  │ │ │
│ │ │ IoT_Raw_Messages (52,341 rows)                         │ │ │
│ │ │ Custom_Client_Data (1,234 rows)                        │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Device ID Column *                Timestamp Column *            │
│ ┌──────────────────────┐          ┌──────────────────────────┐ │
│ │ Device_ID        ▼   │          │ CreatedAt            ▼   │ │
│ └──────────────────────┘          └──────────────────────────┘ │
│                                                                 │
│ Stale Threshold (minutes)                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 90                                                          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ℹ Data older than this will show "Unknown" sync status          │
│                                                                 │
│ ──────────────────── Field Mappings ─────────────────────────   │
│                                                                 │
│ Map user_func_config fields to telemetry table columns          │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Desired Field     │ Reported Column      │ Label    │ Del  │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ [Motor_On_Time  ] │ [Motor_ON_Time_sec▼] │ [Motor On] │ 🗑 │ │
│ │ [Motor_Off_Time ] │ [Motor_OFF_Time_min▼]│ [Motor Of] │ 🗑 │ │
│ │ [debugmode      ] │ [Debug_Value      ▼] │ [Debug   ] │ 🗑 │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [+ Add Field Mapping]                                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                     [Cancel]  [Save Mapping]    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Integration with Admin Panel

### Sidebar Update

Add a new sidebar item in the Admin Panel:

```html
<li>
    <a href="#" onclick="switchSection('data-source-mapping')"
       class="sidebar-item flex items-center gap-3 px-3 py-2 rounded text-gray-300"
       data-section="data-source-mapping">
        <i class="fas fa-database w-5"></i> Data Source Mapping
    </a>
</li>
```

### Header Context

Update the page header when this section is active:

```javascript
if (section === 'data-source-mapping') {
    document.querySelector('header h2').textContent = 'Data Source Mapping';
    document.querySelector('header p').textContent = 'Configure telemetry tables for device types';
}
```

---

## Security Considerations

### 1. SQL Injection Prevention

- **Table/column names cannot be parameterized** in SQL
- All table names are validated against `INFORMATION_SCHEMA.TABLES`
- All column names are validated against `sys.columns`
- Only whitelisted tables (matching pattern `IoT_%`, `%_Data%`, `%Sensor%`) are shown

### 2. Access Control

- Only SYSTEM_ADMIN and SUPER_ADMIN can manage mappings
- VIEW permission allows read-only access
- MANAGE permission required for create/update/delete

### 3. Audit Trail

- All changes logged with user ID and timestamp
- `created_by_user_id` and `updated_by_user_id` track who made changes

---

## Implementation Checklist

### Phase 1: Database (Day 1)
- [ ] Backup existing tables
- [ ] Create `device_type_data_source` table
- [ ] Create `device_type_field_mapping` table
- [ ] Add new permissions
- [ ] Assign permissions to roles
- [ ] Seed initial data for SICK_P3

### Phase 2: Backend API (Days 2-3)
- [ ] Create `DataSourceMapping` model
- [ ] Create `dataSourceMappingController.js`
- [ ] Create `dataSourceMappingRoutes.js`
- [ ] Implement table/column discovery endpoints
- [ ] Implement CRUD endpoints
- [ ] Add validation middleware
- [ ] Update `deviceSettingsController.js` to use dynamic mappings
- [ ] Register routes in `server.js`
- [ ] Write API tests

### Phase 3: Frontend (Days 4-5)
- [ ] Create `dataSourceMappingService.js`
- [ ] Create `DataSourceMappingManagement.jsx` page
- [ ] Create `AddDataSourceModal.jsx`
- [ ] Create `EditDataSourceModal.jsx`
- [ ] Create `TableColumnPicker.jsx` component
- [ ] Add tab/section to Admin Panel
- [ ] Update sidebar navigation

### Phase 4: Integration (Day 6)
- [ ] Update Device Settings modal to display mapping info
- [ ] Handle devices with no mapping gracefully
- [ ] Test with multiple device types
- [ ] End-to-end testing

### Phase 5: Documentation & Polish (Day 7)
- [ ] Update UI prototype HTML
- [ ] Update related documentation
- [ ] Code review
- [ ] Final testing

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Device type has no mapping | Show desired config only, display "No data source configured" message |
| Table doesn't exist | Error logged, API returns error, UI shows warning |
| Column doesn't exist | Skip that field in query, log warning |
| Mapping deleted while in use | Devices fall back to "no mapping" state |
| New device type added | Admin must create mapping before comparison works |
| Field added to `user_func_config` | Admin must add field mapping to see comparison |
| Table renamed in database | Mapping becomes invalid, admin must update |

---

## Verification Queries

### Check Mappings

```sql
-- View all data source mappings
SELECT
    ds.id,
    ds.device_type,
    ds.display_name,
    ds.table_name,
    ds.is_active,
    COUNT(fm.id) AS field_count
FROM device_type_data_source ds
LEFT JOIN device_type_field_mapping fm ON ds.id = fm.data_source_id
GROUP BY ds.id, ds.device_type, ds.display_name, ds.table_name, ds.is_active;

-- View field mappings for a device type
SELECT
    ds.device_type,
    fm.desired_field,
    fm.reported_column,
    fm.display_label,
    fm.data_type
FROM device_type_data_source ds
JOIN device_type_field_mapping fm ON ds.id = fm.data_source_id
WHERE ds.device_type = 'SICK_P3'
ORDER BY fm.display_order;
```

### Test Dynamic Query

```sql
-- Simulate what the API would query for a SICK_P3 device
DECLARE @deviceId NVARCHAR(50) = 'SICK_001';

SELECT TOP 1
    [Motor_ON_Time_sec],
    [Motor_OFF_Time_min],
    [Wheel_Threshold],
    [Debug_Value],
    [CreatedAt] AS reported_at
FROM [dbo].[IoT_Data_Sick_P3]
WHERE [Device_ID] = @deviceId
ORDER BY [CreatedAt] DESC;
```

---

## References

- [DEVICE_CONFIG_UI_PLAN.md](./DEVICE_CONFIG_UI_PLAN.md) - Main device configuration UI plan
- [DEVICE_SETTINGS_SYNC_PLAN.md](./DEVICE_SETTINGS_SYNC_PLAN.md) - Desired vs Reported state management
- [deviceController.js](../server/controllers/deviceController.js) - RBAC pattern reference
