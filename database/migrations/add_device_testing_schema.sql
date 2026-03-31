-- Migration: Add Device Testing Schema
-- Run this script once against your Azure SQL Server (gendb)

-- Step 1: Create table configuration storage
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DeviceTesting_TableConfig' AND xtype='U')
BEGIN
    CREATE TABLE DeviceTesting_TableConfig (
        config_id       INT PRIMARY KEY IDENTITY(1,1),
        table_key       VARCHAR(50) UNIQUE NOT NULL,
        table_name      VARCHAR(100) NOT NULL,
        display_name    VARCHAR(100) NOT NULL,
        is_active       BIT DEFAULT 1,
        icon_name       VARCHAR(50) DEFAULT 'DocumentTextIcon',
        is_exportable   BIT DEFAULT 1,
        sort_order      INT DEFAULT 0,
        column_config   NVARCHAR(MAX),  -- JSON string with column definitions
        created_at      DATETIME DEFAULT GETDATE(),
        created_by      INT,
        updated_at      DATETIME,
        updated_by      INT
    );
    PRINT 'Created DeviceTesting_TableConfig table';
END
ELSE
BEGIN
    PRINT 'DeviceTesting_TableConfig table already exists, skipping';
END

-- Step 2: Add permissions (only if they don't already exist)
IF NOT EXISTS (SELECT 1 FROM permissions WHERE permission_name = 'View Device Testing')
BEGIN
    INSERT INTO permissions (permission_name) VALUES ('View Device Testing');
    PRINT 'Added permission: View Device Testing';
END

IF NOT EXISTS (SELECT 1 FROM permissions WHERE permission_name = 'Manage Device Testing Tables')
BEGIN
    INSERT INTO permissions (permission_name) VALUES ('Manage Device Testing Tables');
    PRINT 'Added permission: Manage Device Testing Tables';
END

-- Step 3: Assign "View Device Testing" to SYSTEM_ADMIN (role_id=1) and SUPER_ADMIN (role_id=2)
-- Adjust role_ids if your environment uses different values
IF NOT EXISTS (
    SELECT 1 FROM role_permission rp
    JOIN permissions p ON rp.permission_id = p.permission_id
    WHERE rp.role_id = 1 AND p.permission_name = 'View Device Testing'
)
BEGIN
    INSERT INTO role_permission (role_id, permission_id)
    SELECT 1, permission_id FROM permissions WHERE permission_name = 'View Device Testing';
    PRINT 'Assigned View Device Testing to role_id=1 (SYSTEM_ADMIN)';
END

IF NOT EXISTS (
    SELECT 1 FROM role_permission rp
    JOIN permissions p ON rp.permission_id = p.permission_id
    WHERE rp.role_id = 2 AND p.permission_name = 'View Device Testing'
)
BEGIN
    INSERT INTO role_permission (role_id, permission_id)
    SELECT 2, permission_id FROM permissions WHERE permission_name = 'View Device Testing';
    PRINT 'Assigned View Device Testing to role_id=2 (SUPER_ADMIN)';
END

-- Step 4: Assign "Manage Device Testing Tables" to SYSTEM_ADMIN only (role_id=1)
IF NOT EXISTS (
    SELECT 1 FROM role_permission rp
    JOIN permissions p ON rp.permission_id = p.permission_id
    WHERE rp.role_id = 1 AND p.permission_name = 'Manage Device Testing Tables'
)
BEGIN
    INSERT INTO role_permission (role_id, permission_id)
    SELECT 1, permission_id FROM permissions WHERE permission_name = 'Manage Device Testing Tables';
    PRINT 'Assigned Manage Device Testing Tables to role_id=1 (SYSTEM_ADMIN)';
END

PRINT 'Migration complete.';