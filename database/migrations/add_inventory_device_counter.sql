-- Migration: Add device_counter to inventory table
-- Each model tracks how many devices have been created, used to auto-generate device IDs.
-- Device ID format: {device_id_prefix}{zero-padded counter}, minimum 7 characters total.
--
-- Step 1: Add the column (defaults to 0 so the ALTER succeeds even with existing rows).
-- Step 2: Back-fill each model's counter from the actual device count in dbo.device.

-- Step 1: Add column if it does not already exist
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.inventory')
  AND name = 'device_counter'
)
BEGIN
  ALTER TABLE dbo.inventory
    ADD device_counter INT NOT NULL DEFAULT 0;

  PRINT 'Column device_counter added to dbo.inventory';
END
ELSE
BEGIN
  PRINT 'Column device_counter already exists on dbo.inventory — skipped ADD';
END

-- Step 2: Back-fill counter from existing device rows.
-- Wrapped in EXEC() so SQL Server compiles it at runtime (after the ALTER TABLE above),
-- avoiding "Invalid column name" errors when the column is freshly added.
EXEC(N'
  UPDATE inv
  SET    inv.device_counter = d.cnt
  FROM   dbo.inventory AS inv
  JOIN   (
           SELECT model_number, COUNT(*) AS cnt
           FROM   dbo.device
           WHERE  model_number IS NOT NULL
           GROUP  BY model_number
         ) AS d ON d.model_number = inv.model_number;
');

PRINT 'device_counter back-filled from existing device rows';
