-- P3 Table: Drop binary flag columns (Train_Passed_Flag, Motor_ON_Flag)
-- Motor OFF time is now decoded from Block 7 and stored in the existing
-- Motor_OFF_Time_min column. Flags are no longer sent by the firmware.
--
-- Run this migration BEFORE deploying updated decoder/handler code.
--
-- Prerequisites: p3_replace_gps_with_imsi.sql and p3_combine_imsi_columns.sql
-- must already have been applied (IMSI column present, GPS columns absent).

-- Step 1: Drop index that depends on Train_Passed_Flag
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_IoT_Data_Sick_P3_TrainPassed'
      AND object_id = OBJECT_ID('dbo.IoT_Data_Sick_P3')
)
    DROP INDEX IX_IoT_Data_Sick_P3_TrainPassed ON dbo.IoT_Data_Sick_P3;

-- Step 2: Drop the flag columns
ALTER TABLE dbo.IoT_Data_Sick_P3
    DROP COLUMN Train_Passed_Flag, Motor_ON_Flag;

-- Verify
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'IoT_Data_Sick_P3'
ORDER BY ORDINAL_POSITION;
-- Expected: Train_Passed_Flag and Motor_ON_Flag absent
