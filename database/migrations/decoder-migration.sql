-- ============================================================
-- CONSOLIDATED MIGRATION
--
-- PART 1 — Drop and recreate dbo.DeviceTelemetry
-- PART 2 — Upsert HK and HY rows in inventory,
--           populate device.model_number (longest-prefix match),
--           report any unmatched devices
-- PART 3 — Drop legacy device.Model column (model_number is
--           the single model identifier, FK to inventory)
--
-- Decoder reference:
--   HK → logic_id 1  (hk_decoder.js)   P3 SICK sensor     32-byte payload
--   HY → logic_id 2  (hy_decoder.js)   P4 HyPure device   28-byte payload
-- ============================================================

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- ─────────────────────────────────────────────────────────────
-- PART 1: dbo.DeviceTelemetry table (drop + recreate)
-- ─────────────────────────────────────────────────────────────
PRINT '--- PART 1: dbo.DeviceTelemetry ---';

IF OBJECT_ID('dbo.DeviceTelemetry', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.DeviceTelemetry;
    PRINT 'Dropped existing: dbo.DeviceTelemetry';
END

-- Sequence that drives entry_id — created once, survives table drops/recreates.
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE schema_id = SCHEMA_ID('dbo') AND name = 'telemetry_entry_id_seq')
BEGIN
    CREATE SEQUENCE dbo.telemetry_entry_id_seq
        AS BIGINT
        START WITH 1
        INCREMENT BY 1
        NO CYCLE;
    PRINT 'Created sequence: dbo.telemetry_entry_id_seq';
END
ELSE
    PRINT 'Sequence dbo.telemetry_entry_id_seq already exists — skipped';

CREATE TABLE dbo.DeviceTelemetry (
    entry_id      BIGINT           NOT NULL DEFAULT (NEXT VALUE FOR dbo.telemetry_entry_id_seq),
    device_id     NVARCHAR(128)    NOT NULL,
    imei          NVARCHAR(50)     NOT NULL,
    logic_id      INT              NOT NULL,
    created_at    DATETIME2        NOT NULL,
    raw_payload   NVARCHAR(MAX)    NOT NULL,   -- full JSON payload as received
    decoded_json  NVARCHAR(MAX)    NULL,        -- decoded result, populated post-processing
    CONSTRAINT PK_DeviceTelemetry PRIMARY KEY (entry_id)
);

CREATE INDEX IX_DeviceTelemetry_DeviceId  ON dbo.DeviceTelemetry (device_id);
CREATE INDEX IX_DeviceTelemetry_CreatedAt ON dbo.DeviceTelemetry (created_at);

PRINT 'Created: dbo.DeviceTelemetry';

-- ─────────────────────────────────────────────────────────────
-- PART 2: Inventory upsert + device.model_number population
-- ─────────────────────────────────────────────────────────────
PRINT '--- PART 2: Inventory upsert ---';

-- Temporarily drop FK so we can safely delete stale inventory rows.
-- It is recreated after the upserts and model_number population below.
IF EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE  name = 'FK_device_inventory'
      AND  parent_object_id = OBJECT_ID('dbo.device')
)
BEGIN
    ALTER TABLE dbo.device DROP CONSTRAINT FK_device_inventory;
    PRINT 'Dropped: FK_device_inventory';
END

-- Remove any inventory entries that are neither HK nor HY
DELETE FROM inventory
WHERE model_number NOT IN ('HK', 'HY');

-- HK
IF NOT EXISTS (SELECT 1 FROM inventory WHERE model_number = 'HK')
BEGIN
    INSERT INTO inventory
        (model_number, display_name, device_id_prefix, decoder_logic_ids, description, is_active)
    VALUES
        ('HK', 'HK Device', 'HK', '[1]',
         'P3 SICK sensor — event-based train detection, GPS, current monitoring, battery (logicId 1). 32-byte payload.',
         1);
    PRINT 'Inserted: HK';
END
ELSE
BEGIN
    UPDATE inventory
    SET display_name       = 'HK Device',
        device_id_prefix   = 'HK',
        decoder_logic_ids  = '[1]',
        description        = 'P3 SICK sensor — event-based train detection, GPS, current monitoring, battery (logicId 1). 32-byte payload.',
        is_active          = 1
    WHERE model_number = 'HK';
    PRINT 'Updated: HK';
END

-- HY
IF NOT EXISTS (SELECT 1 FROM inventory WHERE model_number = 'HY')
BEGIN
    INSERT INTO inventory
        (model_number, display_name, device_id_prefix, decoder_logic_ids, description, is_active)
    VALUES
        ('HY', 'HY Device', 'HY', '[2]',
         'P4 HyPure — status/fault flags, electrical readings, temperature, pressure, runtime counters (logicId 2). 28-byte payload.',
         1);
    PRINT 'Inserted: HY';
END
ELSE
BEGIN
    UPDATE inventory
    SET display_name       = 'HY Device',
        device_id_prefix   = 'HY',
        decoder_logic_ids  = '[2]',
        description        = 'P4 HyPure — status/fault flags, electrical readings, temperature, pressure, runtime counters (logicId 2). 28-byte payload.',
        is_active          = 1
    WHERE model_number = 'HY';
    PRINT 'Updated: HY';
END

-- ─────────────────────────────────────────────────────────────
-- Populate device.model_number from inventory prefix match.
-- Longest-prefix match (ORDER BY LEN DESC) so a more specific
-- prefix (e.g. 'HKS') beats a shorter one ('HK') if such
-- entries are ever added to inventory.
-- Must run before FK is recreated so all rows are valid.
-- ─────────────────────────────────────────────────────────────
PRINT '--- PART 2: Populate device.model_number ---';

UPDATE d
SET    d.model_number = inv.model_number
FROM   dbo.device AS d
CROSS APPLY (
    SELECT TOP 1 i.model_number
    FROM   dbo.inventory AS i
    WHERE  i.is_active = 1
      AND  LEFT(d.device_id, LEN(i.device_id_prefix)) = i.device_id_prefix
    ORDER BY LEN(i.device_id_prefix) DESC   -- longest prefix wins
) AS inv
WHERE  d.model_number IS NULL
    OR d.model_number <> inv.model_number;  -- also fix stale/wrong values

PRINT CONCAT('device.model_number rows updated: ', @@ROWCOUNT);

-- Report devices whose prefix did not match any inventory entry
IF EXISTS (
    SELECT 1
    FROM   dbo.device AS d
    WHERE  d.model_number IS NULL
      AND  NOT EXISTS (
               SELECT 1
               FROM   dbo.inventory AS i
               WHERE  i.is_active = 1
                 AND  LEFT(d.device_id, LEN(i.device_id_prefix)) = i.device_id_prefix
           )
)
BEGIN
    PRINT 'WARNING: The following device_ids did not match any inventory prefix and were left unchanged:';
    SELECT device_id, model_number
    FROM   dbo.device
    WHERE  model_number IS NULL
      AND  NOT EXISTS (
               SELECT 1
               FROM   dbo.inventory AS i
               WHERE  i.is_active = 1
                 AND  LEFT(device_id, LEN(i.device_id_prefix)) = i.device_id_prefix
           );
END
ELSE
BEGIN
    PRINT 'All devices matched an inventory prefix.';
END

-- Recreate FK now that device.model_number is populated with valid values
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE  name = 'FK_device_inventory'
      AND  parent_object_id = OBJECT_ID('dbo.device')
)
BEGIN
    ALTER TABLE dbo.device
        ADD CONSTRAINT FK_device_inventory
        FOREIGN KEY (model_number) REFERENCES dbo.inventory (model_number);
    PRINT 'Recreated: FK_device_inventory';
END

-- ─────────────────────────────────────────────────────────────
-- PART 3: Drop legacy device.Model column
--
-- model_number is now the single model identifier (FK to inventory).
-- The old freeform Model column is redundant and is removed here.
-- ─────────────────────────────────────────────────────────────
PRINT '--- PART 3: Drop legacy device.Model column ---';

IF EXISTS (
    SELECT 1
    FROM   sys.columns
    WHERE  object_id = OBJECT_ID('dbo.device')
      AND  name = 'Model'
)
BEGIN
    ALTER TABLE dbo.device DROP COLUMN Model;
    PRINT 'Dropped column: dbo.device.Model';
END
ELSE
BEGIN
    PRINT 'Column dbo.device.Model does not exist — skipped.';
END

COMMIT TRANSACTION;
PRINT '============================================================';
PRINT 'Migration complete.';
PRINT '============================================================';
