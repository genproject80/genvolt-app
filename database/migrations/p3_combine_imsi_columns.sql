-- P3 Table: Combine IMSI_Number + IMSI_Number_Part2 into single IMSI column
-- Run this migration BEFORE deploying updated decoder code.
-- Prerequisite: p3_replace_gps_with_imsi.sql must have already been run.

-- Step 1: Drop the two separate IMSI columns
ALTER TABLE dbo.IoT_Data_Sick_P3
    DROP COLUMN IMSI_Number, IMSI_Number_Part2;

-- Step 2: Add single combined IMSI column
ALTER TABLE dbo.IoT_Data_Sick_P3
    ADD IMSI NVARCHAR(20) NULL;
