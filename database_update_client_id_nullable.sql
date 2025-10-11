-- Update device table to allow NULL values for client_id column
-- This allows devices to be created without being assigned to a specific client

USE GenVolt_dev;
GO

-- Make client_id column nullable
ALTER TABLE device
ALTER COLUMN client_id INT NULL;
GO

-- Add a comment to document this change
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Client ID - nullable to allow devices without client assignment',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'device',
    @level2type = N'COLUMN', @level2name = N'client_id';
GO

PRINT 'Successfully updated device.client_id column to allow NULL values';