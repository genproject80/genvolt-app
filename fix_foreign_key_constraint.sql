-- Fix foreign key constraint that points to device_old instead of device table
-- This script drops the incorrect foreign key and recreates it correctly

USE GenVolt_dev;
GO

-- First, check if the foreign key constraint exists and get its details
PRINT 'Checking existing foreign key constraint...';
SELECT
    fk.name AS constraint_name,
    OBJECT_NAME(fk.parent_object_id) AS table_name,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
    OBJECT_NAME(fk.referenced_object_id) AS referenced_table_name,
    COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column_name
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
WHERE fk.name = 'FK_client_device_Device';

-- Drop the incorrect foreign key constraint
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_client_device_Device')
BEGIN
    PRINT 'Dropping incorrect foreign key constraint FK_client_device_Device...';
    ALTER TABLE client_device DROP CONSTRAINT FK_client_device_Device;
    PRINT 'Foreign key constraint dropped successfully.';
END
ELSE
BEGIN
    PRINT 'Foreign key constraint FK_client_device_Device not found.';
END

-- Recreate the foreign key constraint pointing to the correct device table
PRINT 'Creating correct foreign key constraint...';
ALTER TABLE client_device
ADD CONSTRAINT FK_client_device_Device
FOREIGN KEY (device_id) REFERENCES device(id)
ON DELETE CASCADE
ON UPDATE CASCADE;

PRINT 'Foreign key constraint recreated successfully pointing to device table.';

-- Verify the new constraint
PRINT 'Verifying new foreign key constraint...';
SELECT
    fk.name AS constraint_name,
    OBJECT_NAME(fk.parent_object_id) AS table_name,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
    OBJECT_NAME(fk.referenced_object_id) AS referenced_table_name,
    COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column_name
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
WHERE fk.name = 'FK_client_device_Device';

PRINT 'Foreign key constraint fix completed successfully.';