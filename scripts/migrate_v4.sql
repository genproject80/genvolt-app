-- =============================================================
-- Genvolt / CloudSynk Platform — v4.0 Migration
-- Database: cs_db_dev  |  Schema: dbo
-- Idempotent: safe to run multiple times.
-- Run AFTER migrate_v3.sql
-- Covers: IMEI-based device protocol, DeviceTelemetry table,
--         reboot recovery, auto-registration via pre-activation
-- =============================================================

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
-- 2. Make device_id nullable
--    Devices auto-registered via pre-activation arrive with only
--    an IMEI. device_id is assigned by admin during activation.
-- ─────────────────────────────────────────────────────────────
-- Check current nullability first. If already nullable, this is a no-op.
-- SQL Server requires dropping and recreating dependent constraints
-- if any exist. Run the check below first:
--
--   SELECT is_nullable FROM sys.columns
--   WHERE object_id = OBJECT_ID('dbo.device') AND name = 'device_id'
--   -- is_nullable = 1 means already nullable, skip this step
--
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.device') AND name = 'device_id' AND is_nullable = 0
)
BEGIN
  ALTER TABLE dbo.device ALTER COLUMN device_id NVARCHAR(50) NULL;
  PRINT 'Made dbo.device.device_id nullable';
END
ELSE
  PRINT 'dbo.device.device_id already nullable — skipped';

-- ─────────────────────────────────────────────────────────────
-- 3. Add mqtt_password_plain for reboot recovery
--    Stores the plain-text MQTT password so the server can
--    re-send telemetryConfig if the device reboots and the
--    broker has lost its retained message store.
--    In production: encrypt this column at the application layer.
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
-- 4. Create DeviceTelemetry table
--    Stores raw + decoded telemetry from all devices.
--    decoded_data is a JSON column — schema varies by logicId.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE schema_id = SCHEMA_ID('dbo') AND name = 'DeviceTelemetry'
)
BEGIN
  CREATE TABLE dbo.DeviceTelemetry (
    telemetry_id  BIGINT         IDENTITY(1,1) PRIMARY KEY,
    device_id     NVARCHAR(50)   NOT NULL,   -- e.g. "HY2030", matches device.device_id
    imei          NVARCHAR(20)   NULL,
    logic_id      INT            NOT NULL,   -- decoder selector
    raw_payload   NVARCHAR(MAX)  NOT NULL,   -- original JSON string from device
    decoded_data  NVARCHAR(MAX)  NULL,       -- JSON of decoded fields (varies by logicId)
    received_at   DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );

  CREATE INDEX IX_DeviceTelemetry_device
    ON dbo.DeviceTelemetry (device_id, received_at DESC);

  CREATE INDEX IX_DeviceTelemetry_imei
    ON dbo.DeviceTelemetry (imei, received_at DESC);

  CREATE INDEX IX_DeviceTelemetry_logicId
    ON dbo.DeviceTelemetry (logic_id, received_at DESC);

  PRINT 'Created table: dbo.DeviceTelemetry';
END
ELSE
  PRINT 'Table dbo.DeviceTelemetry already exists — skipped';

PRINT '=== v4.0 migration complete ===';
