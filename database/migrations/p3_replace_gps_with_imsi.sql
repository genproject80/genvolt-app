-- P3 Table: Replace GPS columns (Latitude, Longitude) with IMSI columns
-- Run this migration BEFORE deploying updated decoder code.
--
-- Error context: IX_IoT_Data_Sick_P3_Device_Ts depends on Latitude —
-- indexes must be dropped before the column can be removed.

-- Step 1: Drop any indexes that depend on Latitude or Longitude
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_IoT_Data_Sick_P3_Device_Ts'
      AND object_id = OBJECT_ID('dbo.IoT_Data_Sick_P3')
)
    DROP INDEX IX_IoT_Data_Sick_P3_Device_Ts ON dbo.IoT_Data_Sick_P3;

-- Step 2: Drop the GPS columns
ALTER TABLE dbo.IoT_Data_Sick_P3
    DROP COLUMN Latitude, Longitude;

-- Step 3: Add IMSI columns
ALTER TABLE dbo.IoT_Data_Sick_P3
    ADD IMSI_Number       BIGINT NULL,
        IMSI_Number_Part2 BIGINT NULL;

-- Step 4: Recreate the index without the dropped columns
--   (adjust included columns / filter to match the original index definition)
CREATE INDEX IX_IoT_Data_Sick_P3_Device_Ts
    ON dbo.IoT_Data_Sick_P3 (Device_ID, Timestamp);
