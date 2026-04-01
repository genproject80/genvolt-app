-- =============================================================
-- Genvolt / CloudSynk Platform — v5.0 Migration
-- Database: cs_db_dev  |  Schema: dbo
-- Idempotent: safe to run multiple times.
-- Run AFTER migrate_v4.sql
-- Covers: inventory (device model registry), model_number FK on device
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Create inventory table
--    Stores device model definitions: decoder logic IDs and
--    the device_id prefix used during activation.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE schema_id = SCHEMA_ID('dbo') AND name = 'inventory'
)
BEGIN
  CREATE TABLE dbo.inventory (
    model_number      NVARCHAR(50)   NOT NULL,
    display_name      NVARCHAR(100)  NOT NULL,
    device_id_prefix  NVARCHAR(20)   NOT NULL,
    decoder_logic_ids NVARCHAR(200)  NOT NULL CONSTRAINT DF_inventory_decoder DEFAULT ('[]'),
    description       NVARCHAR(500)  NULL,
    is_active         BIT            NOT NULL CONSTRAINT DF_inventory_active  DEFAULT (1),
    created_at        DATETIME2      NOT NULL CONSTRAINT DF_inventory_created DEFAULT (GETUTCDATE()),
    updated_at        DATETIME2      NOT NULL CONSTRAINT DF_inventory_updated DEFAULT (GETUTCDATE()),
    CONSTRAINT PK_inventory PRIMARY KEY (model_number)
  );
  PRINT 'Created table: dbo.inventory';
END
ELSE
  PRINT 'Table dbo.inventory already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 2. Seed default model
--    Matches existing hardcoded 'GV' prefix and logicId 1
--    used by all devices created before this migration.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'GV-M1')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'GV-M1',
    'GenVolt Meter v1',
    'GV',
    '[1]',
    'Default energy meter — voltage, current, power (logicId 1)'
  );
  PRINT 'Seeded inventory: GV-M1';
END
ELSE
  PRINT 'Seed GV-M1 already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 3. Add model_number FK column to device table
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.device') AND name = 'model_number'
)
BEGIN
  ALTER TABLE dbo.device
    ADD model_number NVARCHAR(50) NULL
        CONSTRAINT FK_device_inventory FOREIGN KEY REFERENCES dbo.inventory(model_number);

  PRINT 'Added column: dbo.device.model_number';
END
ELSE
  PRINT 'dbo.device.model_number already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 4. Index on device.model_number for filter queries
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.device') AND name = 'IX_device_model_number'
)
BEGIN
  -- Use dynamic SQL so the column reference is resolved at runtime,
  -- not at parse time (SQL Server would fail if model_number didn't exist yet).
  EXEC sp_executesql N'
    CREATE INDEX IX_device_model_number
      ON dbo.device (model_number)
      WHERE model_number IS NOT NULL;
  ';
  PRINT 'Created index: IX_device_model_number';
END
ELSE
  PRINT 'Index IX_device_model_number already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 5. Back-fill existing devices with GV-M1 as default model
--    Only devices whose device_id starts with 'GV' (or all
--    existing devices with no model assigned yet).
-- ─────────────────────────────────────────────────────────────
-- Use dynamic SQL for the same reason as the index above.
EXEC sp_executesql N'
  UPDATE dbo.device
  SET model_number = ''GV-M1''
  WHERE model_number IS NULL;
';
PRINT 'Back-filled existing devices with model_number = GV-M1';

PRINT '=== v5.0 migration complete ===';
