-- ============================================================
-- PRODUCTION MIGRATION: cs_db_prod
-- Applies all pending changes to bring cs_db_prod in sync with cs_db_dev
--
-- What this does:
--   PART 1 - Fix IDENTITY on all primary key columns (11 tables)
--   PART 2 - Create DeviceTesting_TableConfig table
--   PART 3 - Seed DeviceTesting_TableConfig rows
--   PART 4 - Add Device Testing permissions
-- ============================================================

SET XACT_ABORT ON;  -- Auto-rollback entire transaction on any error
BEGIN TRANSACTION;

PRINT '============================================================';
PRINT 'PART 1: Adding IDENTITY to primary key columns';
PRINT '============================================================';

-- ----------------------------------------------------------------
-- STEP 1: Drop ALL foreign key constraints across all tables
-- ----------------------------------------------------------------
PRINT 'Step 1: Dropping all FK constraints...';

-- FKs on client
ALTER TABLE dbo.client          DROP CONSTRAINT FK_client_ParentClient;
ALTER TABLE dbo.client          DROP CONSTRAINT FK_client_CreatedBy;
ALTER TABLE dbo.client          DROP CONSTRAINT FK_client_UpdatedBy;

-- FKs on client_device
ALTER TABLE dbo.client_device   DROP CONSTRAINT FK_client_device_Seller;
ALTER TABLE dbo.client_device   DROP CONSTRAINT FK_client_device_Buyer;
ALTER TABLE dbo.client_device   DROP CONSTRAINT FK_client_device_Device;

-- FKs on device
ALTER TABLE dbo.device          DROP CONSTRAINT FK_device_Client;

-- FKs on user (includes self-referencing)
ALTER TABLE dbo.[user]          DROP CONSTRAINT FK_user_Client;
ALTER TABLE dbo.[user]          DROP CONSTRAINT FK_user_Role;
ALTER TABLE dbo.[user]          DROP CONSTRAINT FK_user_CreatedBy;
ALTER TABLE dbo.[user]          DROP CONSTRAINT FK_user_UpdatedBy;

-- FKs on user_preferences
ALTER TABLE dbo.user_preferences DROP CONSTRAINT FK_user_preferences_Client;
ALTER TABLE dbo.user_preferences DROP CONSTRAINT FK_user_preferences_User;

-- FKs on role_permission
ALTER TABLE dbo.role_permission  DROP CONSTRAINT FK_role_permission_Permission;
ALTER TABLE dbo.role_permission  DROP CONSTRAINT FK_role_permission_Role;

-- FKs on audit_log
ALTER TABLE dbo.audit_log        DROP CONSTRAINT FK_audit_log_User;

-- FKs on dashboard
ALTER TABLE dbo.dashboard        DROP CONSTRAINT FK_dashboard_CreatedBy;

-- FKs on IoT_Data_Sick
ALTER TABLE dbo.IoT_Data_Sick    DROP CONSTRAINT FK_iot_data_sick_Device;

-- FKs on iot_data_new
ALTER TABLE dbo.iot_data_new     DROP CONSTRAINT FK_iot_data_new_Device;

PRINT 'Step 1: Done - all FK constraints dropped.';

-- ----------------------------------------------------------------
-- STEP 2: Fix IDENTITY on each table (rename → recreate → copy → drop)
-- ----------------------------------------------------------------

-- ---- 2a: role ----
PRINT 'Step 2a: Fixing role.role_id IDENTITY...';
EXEC sp_rename 'dbo.role', 'role_old';
CREATE TABLE dbo.[role] (
    role_id    INT           NOT NULL IDENTITY(1,1),
    role_name  NVARCHAR(100) NOT NULL,
    CONSTRAINT PK_role PRIMARY KEY (role_id)
);
SET IDENTITY_INSERT dbo.[role] ON;
INSERT INTO dbo.[role] (role_id, role_name) SELECT role_id, role_name FROM dbo.role_old;
SET IDENTITY_INSERT dbo.[role] OFF;
DROP TABLE dbo.role_old;
PRINT 'Step 2a: Done.';

-- ---- 2b: permissions ----
PRINT 'Step 2b: Fixing permissions.permission_id IDENTITY...';
EXEC sp_rename 'dbo.permissions', 'permissions_old';
CREATE TABLE dbo.permissions (
    permission_id   INT           NOT NULL IDENTITY(1,1),
    permission_name NVARCHAR(100) NOT NULL,
    CONSTRAINT PK_permissions PRIMARY KEY (permission_id)
);
SET IDENTITY_INSERT dbo.permissions ON;
INSERT INTO dbo.permissions (permission_id, permission_name) SELECT permission_id, permission_name FROM dbo.permissions_old;
SET IDENTITY_INSERT dbo.permissions OFF;
DROP TABLE dbo.permissions_old;
PRINT 'Step 2b: Done.';

-- ---- 2c: user ----
PRINT 'Step 2c: Fixing user.user_id IDENTITY...';
EXEC sp_rename 'dbo.[user]', 'user_old';
CREATE TABLE dbo.[user] (
    user_id             INT           NOT NULL IDENTITY(1,1),
    client_id           INT           NOT NULL,
    first_name          NVARCHAR(100) NULL,
    last_name           NVARCHAR(100) NULL,
    email               NVARCHAR(255) NOT NULL,
    ph_no               NVARCHAR(20)  NULL,
    password            NVARCHAR(255) NOT NULL,
    user_name           NVARCHAR(50)  NOT NULL,
    is_active           BIT           NOT NULL CONSTRAINT DF_user_is_active DEFAULT (1),
    role_id             INT           NOT NULL,
    created_by_user_id  INT           NULL,
    created_at          DATETIME2     NOT NULL CONSTRAINT DF_user_created_at DEFAULT (GETUTCDATE()),
    updated_at          DATETIME2     NOT NULL CONSTRAINT DF_user_updated_at DEFAULT (GETUTCDATE()),
    updated_by_user_id  INT           NULL,
    CONSTRAINT PK_user PRIMARY KEY (user_id)
);
SET IDENTITY_INSERT dbo.[user] ON;
INSERT INTO dbo.[user] (user_id, client_id, first_name, last_name, email, ph_no, password, user_name, is_active, role_id, created_by_user_id, created_at, updated_at, updated_by_user_id)
SELECT user_id, client_id, first_name, last_name, email, ph_no, password, user_name, is_active, role_id, created_by_user_id, created_at, updated_at, updated_by_user_id FROM dbo.user_old;
SET IDENTITY_INSERT dbo.[user] OFF;
DROP TABLE dbo.user_old;
PRINT 'Step 2c: Done.';

-- ---- 2d: client ----
PRINT 'Step 2d: Fixing client.client_id IDENTITY...';
EXEC sp_rename 'dbo.client', 'client_old';
CREATE TABLE dbo.client (
    client_id                    INT           NOT NULL IDENTITY(1,1),
    parent_id                    INT           NULL,
    name                         NVARCHAR(255) NOT NULL,
    email                        NVARCHAR(255) NOT NULL,
    phone                        NVARCHAR(20)  NULL,
    Address                      NVARCHAR(500) NULL,
    contact_person               NVARCHAR(255) NULL,
    thinkspeak_subscription_info NVARCHAR(500) NULL,
    city                         NVARCHAR(100) NULL,
    state                        NVARCHAR(100) NULL,
    is_active                    BIT           NOT NULL CONSTRAINT DF_client_is_active DEFAULT (1),
    created_by_user_id           INT           NULL,
    created_at                   DATETIME2     NOT NULL CONSTRAINT DF_client_created_at DEFAULT (GETUTCDATE()),
    updated_at                   DATETIME2     NOT NULL CONSTRAINT DF_client_updated_at DEFAULT (GETUTCDATE()),
    updated_by_user_id           INT           NULL,
    CONSTRAINT PK_client PRIMARY KEY (client_id)
);
SET IDENTITY_INSERT dbo.client ON;
INSERT INTO dbo.client (client_id, parent_id, name, email, phone, Address, contact_person, thinkspeak_subscription_info, city, state, is_active, created_by_user_id, created_at, updated_at, updated_by_user_id)
SELECT client_id, parent_id, name, email, phone, Address, contact_person, thinkspeak_subscription_info, city, state, is_active, created_by_user_id, created_at, updated_at, updated_by_user_id FROM dbo.client_old;
SET IDENTITY_INSERT dbo.client OFF;
DROP TABLE dbo.client_old;
PRINT 'Step 2d: Done.';

-- ---- 2e: device ----
PRINT 'Step 2e: Fixing device.id IDENTITY...';
EXEC sp_rename 'dbo.device', 'device_old';
CREATE TABLE dbo.device (
    id                    INT            NOT NULL IDENTITY(1,1),
    device_id             NVARCHAR(100)  NOT NULL,
    channel_id            NVARCHAR(100)  NULL,
    api_key               NVARCHAR(255)  NULL,
    conversionLogic_ld    NVARCHAR(MAX)  NULL,
    TransactionTableID    INT            NULL,
    TransactionTableName  NVARCHAR(255)  NULL,
    field_id              NVARCHAR(100)  NULL,
    Model                 NVARCHAR(100)  NULL,
    machin_id             NVARCHAR(100)  NULL,
    client_id             INT            NOT NULL,
    onboarding_date       DATETIME2      NULL,
    ingest_endpoint       NVARCHAR(MAX)  NULL,
    user_func_config      NVARCHAR(MAX)  NULL,
    CONSTRAINT PK_device PRIMARY KEY (id),
    CONSTRAINT UQ_device_device_id UNIQUE (device_id)  -- required for FK_iot_data_sick_Device
);
SET IDENTITY_INSERT dbo.device ON;
INSERT INTO dbo.device (id, device_id, channel_id, api_key, conversionLogic_ld, TransactionTableID, TransactionTableName, field_id, Model, machin_id, client_id, onboarding_date, ingest_endpoint, user_func_config)
SELECT id, device_id, channel_id, api_key, conversionLogic_ld, TransactionTableID, TransactionTableName, field_id, Model, machin_id, client_id, onboarding_date, ingest_endpoint, user_func_config FROM dbo.device_old;
SET IDENTITY_INSERT dbo.device OFF;
DROP TABLE dbo.device_old;
PRINT 'Step 2e: Done.';

-- ---- 2f: audit_log ----
PRINT 'Step 2f: Fixing audit_log.audit_id IDENTITY...';
EXEC sp_rename 'dbo.audit_log', 'audit_log_old';
CREATE TABLE dbo.audit_log (
    audit_id      BIGINT         NOT NULL IDENTITY(1,1),
    user_id       INT            NULL,
    activity_type NVARCHAR(100)  NOT NULL,
    action        NVARCHAR(255)  NOT NULL,
    message       NVARCHAR(1000) NULL,
    target_type   NVARCHAR(100)  NULL,
    target_id     INT            NULL,
    details       NVARCHAR(MAX)  NULL,
    ip_address    NVARCHAR(45)   NULL,
    user_agent    NVARCHAR(500)  NULL,
    created_at    DATETIME2      NOT NULL CONSTRAINT DF_audit_log_created_at DEFAULT (GETUTCDATE()),
    CONSTRAINT PK_audit_log PRIMARY KEY (audit_id)
);
SET IDENTITY_INSERT dbo.audit_log ON;
INSERT INTO dbo.audit_log (audit_id, user_id, activity_type, action, message, target_type, target_id, details, ip_address, user_agent, created_at)
SELECT audit_id, user_id, activity_type, action, message, target_type, target_id, details, ip_address, user_agent, created_at FROM dbo.audit_log_old;
SET IDENTITY_INSERT dbo.audit_log OFF;
DROP TABLE dbo.audit_log_old;
PRINT 'Step 2f: Done.';

-- ---- 2g: dashboard ----
PRINT 'Step 2g: Fixing dashboard.id IDENTITY...';
EXEC sp_rename 'dbo.dashboard', 'dashboard_old';
CREATE TABLE dbo.dashboard (
    id           INT            NOT NULL IDENTITY(1,1),
    name         NVARCHAR(255)  NOT NULL,
    display_name NVARCHAR(255)  NOT NULL,
    description  NVARCHAR(1000) NULL,
    client_id    NVARCHAR(MAX)  NULL,
    is_active    BIT            NOT NULL CONSTRAINT DF_dashboard_is_active DEFAULT (1),
    created_by   INT            NOT NULL,
    created_at   DATETIME2      NOT NULL CONSTRAINT DF_dashboard_created_at DEFAULT (GETUTCDATE()),
    CONSTRAINT PK_dashboard PRIMARY KEY (id)
);
SET IDENTITY_INSERT dbo.dashboard ON;
INSERT INTO dbo.dashboard (id, name, display_name, description, client_id, is_active, created_by, created_at)
SELECT id, name, display_name, description, client_id, is_active, created_by, created_at FROM dbo.dashboard_old;
SET IDENTITY_INSERT dbo.dashboard OFF;
DROP TABLE dbo.dashboard_old;
PRINT 'Step 2g: Done.';

-- ---- 2h: cloud_dashboard_hkmi ----
PRINT 'Step 2h: Fixing cloud_dashboard_hkmi.id IDENTITY...';
EXEC sp_rename 'dbo.cloud_dashboard_hkmi', 'cloud_dashboard_hkmi_old';
CREATE TABLE dbo.cloud_dashboard_hkmi (
    id               INT           NOT NULL IDENTITY(1,1),
    device_id        VARCHAR(50)   NOT NULL,
    machine_id       VARCHAR(255)  NOT NULL,
    sden             VARCHAR(100)  NULL,
    den              VARCHAR(100)  NULL,
    aen              VARCHAR(100)  NULL,
    sse              VARCHAR(100)  NULL,
    curve_number     VARCHAR(100)  NULL,
    line             VARCHAR(50)   NULL,
    created_at       DATETIME2     NOT NULL CONSTRAINT DF_cloud_dash_created_at DEFAULT (GETUTCDATE()),
    updated_at       DATETIME2     NOT NULL CONSTRAINT DF_cloud_dash_updated_at DEFAULT (GETUTCDATE()),
    grease_left      DECIMAL(18,4) NULL,
    last_service_date DATE         NULL,
    div_rly          VARCHAR(100)  NULL,
    section          VARCHAR(100)  NULL,
    last_cof_date    DATE          NULL,
    last_cof_value   DECIMAL(18,4) NULL,
    CONSTRAINT PK_cloud_dashboard_hkmi PRIMARY KEY (id)
);
SET IDENTITY_INSERT dbo.cloud_dashboard_hkmi ON;
INSERT INTO dbo.cloud_dashboard_hkmi (id, device_id, machine_id, sden, den, aen, sse, curve_number, line, created_at, updated_at, grease_left, last_service_date, div_rly, section, last_cof_date, last_cof_value)
SELECT id, device_id, machine_id, sden, den, aen, sse, curve_number, line, created_at, updated_at, grease_left, last_service_date, div_rly, section, last_cof_date, last_cof_value FROM dbo.cloud_dashboard_hkmi_old;
SET IDENTITY_INSERT dbo.cloud_dashboard_hkmi OFF;
DROP TABLE dbo.cloud_dashboard_hkmi_old;
PRINT 'Step 2h: Done.';

-- ---- 2i: iot_data_new ----
PRINT 'Step 2i: Fixing iot_data_new.id IDENTITY...';
EXEC sp_rename 'dbo.iot_data_new', 'iot_data_new_old';
CREATE TABLE dbo.iot_data_new (
    id                BIGINT         NOT NULL IDENTITY(1,1),
    device_id         INT            NOT NULL,
    timestamp         DATETIME2      NOT NULL CONSTRAINT DF_iot_data_new_ts DEFAULT (GETUTCDATE()),
    sensor_type       NVARCHAR(100)  NULL,
    sensor_value      DECIMAL(18,4)  NULL,
    unit              NVARCHAR(50)   NULL,
    quality_indicator INT            NULL,
    data_json         NVARCHAR(MAX)  NULL,
    created_at        DATETIME2      NOT NULL CONSTRAINT DF_iot_data_new_created_at DEFAULT (GETUTCDATE()),
    CONSTRAINT PK_iot_data_new PRIMARY KEY (id)
);
SET IDENTITY_INSERT dbo.iot_data_new ON;
INSERT INTO dbo.iot_data_new (id, device_id, timestamp, sensor_type, sensor_value, unit, quality_indicator, data_json, created_at)
SELECT id, device_id, timestamp, sensor_type, sensor_value, unit, quality_indicator, data_json, created_at FROM dbo.iot_data_new_old;
SET IDENTITY_INSERT dbo.iot_data_new OFF;
DROP TABLE dbo.iot_data_new_old;
PRINT 'Step 2i: Done.';

-- ---- 2j: client_device ----
PRINT 'Step 2j: Fixing client_device.id IDENTITY...';
EXEC sp_rename 'dbo.client_device', 'client_device_old';
CREATE TABLE dbo.client_device (
    id            INT       NOT NULL IDENTITY(1,1),
    seller_id     INT       NOT NULL,
    buyer_id      INT       NOT NULL,
    device_id     INT       NOT NULL,
    transfer_date DATETIME2 NOT NULL CONSTRAINT DF_client_device_transfer_date DEFAULT (GETUTCDATE()),
    CONSTRAINT PK_client_device PRIMARY KEY (id)
);
SET IDENTITY_INSERT dbo.client_device ON;
INSERT INTO dbo.client_device (id, seller_id, buyer_id, device_id, transfer_date)
SELECT id, seller_id, buyer_id, device_id, transfer_date FROM dbo.client_device_old;
SET IDENTITY_INSERT dbo.client_device OFF;
DROP TABLE dbo.client_device_old;
PRINT 'Step 2j: Done.';

-- ---- 2k: user_preferences ----
PRINT 'Step 2k: Fixing user_preferences.id IDENTITY...';
EXEC sp_rename 'dbo.user_preferences', 'user_preferences_old';
CREATE TABLE dbo.user_preferences (
    id               INT           NOT NULL IDENTITY(1,1),
    user_id          INT           NOT NULL,
    client_id        INT           NOT NULL,
    preference_name  NVARCHAR(255) NOT NULL,
    preference_value NVARCHAR(255) NOT NULL,
    CONSTRAINT PK_user_preferences PRIMARY KEY (id)
);
SET IDENTITY_INSERT dbo.user_preferences ON;
INSERT INTO dbo.user_preferences (id, user_id, client_id, preference_name, preference_value)
SELECT id, user_id, client_id, preference_name, preference_value FROM dbo.user_preferences_old;
SET IDENTITY_INSERT dbo.user_preferences OFF;
DROP TABLE dbo.user_preferences_old;
PRINT 'Step 2k: Done.';

-- ----------------------------------------------------------------
-- STEP 3: Re-add all FK constraints
-- ----------------------------------------------------------------
PRINT 'Step 3: Re-adding all FK constraints...';

-- client self-reference
ALTER TABLE dbo.client ADD CONSTRAINT FK_client_ParentClient
    FOREIGN KEY (parent_id) REFERENCES dbo.client(client_id);

-- client → user
ALTER TABLE dbo.client ADD CONSTRAINT FK_client_CreatedBy
    FOREIGN KEY (created_by_user_id) REFERENCES dbo.[user](user_id);
ALTER TABLE dbo.client ADD CONSTRAINT FK_client_UpdatedBy
    FOREIGN KEY (updated_by_user_id) REFERENCES dbo.[user](user_id);

-- device → client
ALTER TABLE dbo.device ADD CONSTRAINT FK_device_Client
    FOREIGN KEY (client_id) REFERENCES dbo.client(client_id);

-- user → client, role (self-ref FKs on user)
ALTER TABLE dbo.[user] ADD CONSTRAINT FK_user_Client
    FOREIGN KEY (client_id) REFERENCES dbo.client(client_id);
ALTER TABLE dbo.[user] ADD CONSTRAINT FK_user_Role
    FOREIGN KEY (role_id) REFERENCES dbo.[role](role_id);
ALTER TABLE dbo.[user] ADD CONSTRAINT FK_user_CreatedBy
    FOREIGN KEY (created_by_user_id) REFERENCES dbo.[user](user_id);
ALTER TABLE dbo.[user] ADD CONSTRAINT FK_user_UpdatedBy
    FOREIGN KEY (updated_by_user_id) REFERENCES dbo.[user](user_id);

-- user_preferences → user, client
ALTER TABLE dbo.user_preferences ADD CONSTRAINT FK_user_preferences_Client
    FOREIGN KEY (client_id) REFERENCES dbo.client(client_id);
ALTER TABLE dbo.user_preferences ADD CONSTRAINT FK_user_preferences_User
    FOREIGN KEY (user_id) REFERENCES dbo.[user](user_id);

-- role_permission → role, permissions
ALTER TABLE dbo.role_permission ADD CONSTRAINT FK_role_permission_Role
    FOREIGN KEY (role_id) REFERENCES dbo.[role](role_id);
ALTER TABLE dbo.role_permission ADD CONSTRAINT FK_role_permission_Permission
    FOREIGN KEY (permission_id) REFERENCES dbo.permissions(permission_id);

-- audit_log → user
ALTER TABLE dbo.audit_log ADD CONSTRAINT FK_audit_log_User
    FOREIGN KEY (user_id) REFERENCES dbo.[user](user_id);

-- dashboard → user
ALTER TABLE dbo.dashboard ADD CONSTRAINT FK_dashboard_CreatedBy
    FOREIGN KEY (created_by) REFERENCES dbo.[user](user_id);

-- client_device → client, device
ALTER TABLE dbo.client_device ADD CONSTRAINT FK_client_device_Seller
    FOREIGN KEY (seller_id) REFERENCES dbo.client(client_id);
ALTER TABLE dbo.client_device ADD CONSTRAINT FK_client_device_Buyer
    FOREIGN KEY (buyer_id) REFERENCES dbo.client(client_id);
ALTER TABLE dbo.client_device ADD CONSTRAINT FK_client_device_Device
    FOREIGN KEY (device_id) REFERENCES dbo.device(id);

-- iot_data_new → device
ALTER TABLE dbo.iot_data_new ADD CONSTRAINT FK_iot_data_new_Device
    FOREIGN KEY (device_id) REFERENCES dbo.device(id);

-- IoT_Data_Sick → device
ALTER TABLE dbo.IoT_Data_Sick ADD CONSTRAINT FK_iot_data_sick_Device
    FOREIGN KEY (Device_ID) REFERENCES dbo.device(device_id);

PRINT 'Step 3: Done - all FK constraints restored.';
PRINT 'PART 1 complete: IDENTITY added to all 11 tables.';

-- ============================================================
PRINT '============================================================';
PRINT 'PART 2: Creating DeviceTesting_TableConfig table';
PRINT '============================================================';

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DeviceTesting_TableConfig' AND xtype='U')
BEGIN
    CREATE TABLE dbo.DeviceTesting_TableConfig (
        config_id    INT           NOT NULL IDENTITY(1,1),
        table_key    VARCHAR(50)   NOT NULL,
        table_name   VARCHAR(100)  NOT NULL,
        display_name VARCHAR(100)  NOT NULL,
        is_active    BIT           DEFAULT 1,
        icon_name    VARCHAR(50)   DEFAULT 'DocumentTextIcon',
        is_exportable BIT          DEFAULT 1,
        sort_order   INT           DEFAULT 0,
        column_config NVARCHAR(MAX) NULL,
        created_at   DATETIME      DEFAULT GETDATE(),
        created_by   INT           NULL,
        updated_at   DATETIME      NULL,
        updated_by   INT           NULL,
        CONSTRAINT PK_DeviceTesting_TableConfig PRIMARY KEY (config_id),
        CONSTRAINT UQ_DeviceTesting_table_key UNIQUE (table_key)
    );
    PRINT 'Created DeviceTesting_TableConfig table.';
END
ELSE
    PRINT 'DeviceTesting_TableConfig already exists, skipping.';

-- ============================================================
PRINT '============================================================';
PRINT 'PART 3: Seeding DeviceTesting_TableConfig';
PRINT '============================================================';

IF NOT EXISTS (SELECT 1 FROM dbo.DeviceTesting_TableConfig WHERE table_key = 'raw_messages')
BEGIN
    INSERT INTO dbo.DeviceTesting_TableConfig (table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config)
    VALUES (
        'raw_messages', 'IoT_Raw_Messages', 'Raw Messages', 'DocumentTextIcon', 1, 1,
        '[
            {"field":"Entry_ID","header":"Entry ID","type":"number","sortable":true},
            {"field":"CreatedAt","header":"Created At (IST)","type":"datetime","sortable":true,"format":"utc_to_ist"},
            {"field":"Device_ID","header":"Device ID","type":"string","sortable":true,"searchable":true},
            {"field":"LogicId","header":"Logic ID","type":"number","sortable":true},
            {"field":"RawJson","header":"Raw JSON","type":"json","sortable":false}
        ]'
    );
    PRINT 'Seeded: raw_messages (IoT_Raw_Messages)';
END

IF NOT EXISTS (SELECT 1 FROM dbo.DeviceTesting_TableConfig WHERE table_key = 'sick_data')
BEGIN
    INSERT INTO dbo.DeviceTesting_TableConfig (table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config)
    VALUES (
        'sick_data', 'IoT_Data_Sick', 'SICK Data (P1/P2)', 'CpuChipIcon', 1, 2,
        '[
            {"field":"Entry_ID","header":"Entry ID","type":"number","sortable":true},
            {"field":"CreatedAt","header":"Created At (IST)","type":"datetime","sortable":true,"format":"utc_to_ist"},
            {"field":"Device_ID","header":"Device ID","type":"string","sortable":true,"searchable":true},
            {"field":"MessageType","header":"Message Type","type":"string","sortable":true},
            {"field":"GSM_Signal_Strength","header":"GSM Signal","type":"number","sortable":true},
            {"field":"Motor_ON_Time_sec","header":"Motor ON (sec)","type":"number","sortable":true},
            {"field":"Latitude","header":"Latitude","type":"number","sortable":true},
            {"field":"Longitude","header":"Longitude","type":"number","sortable":true},
            {"field":"Fault_Code","header":"Fault Code","type":"string","sortable":true}
        ]'
    );
    PRINT 'Seeded: sick_data (IoT_Data_Sick)';
END

IF NOT EXISTS (SELECT 1 FROM dbo.DeviceTesting_TableConfig WHERE table_key = 'sick_data_p3')
BEGIN
    INSERT INTO dbo.DeviceTesting_TableConfig (table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config)
    VALUES (
        'sick_data_p3', 'IoT_Data_Sick_P3', 'SICK Data (P3)', 'BoltIcon', 1, 3,
        '[
            {"field":"Entry_ID","header":"Entry ID","type":"number","sortable":true},
            {"field":"CreatedAt","header":"Created At (IST)","type":"datetime","sortable":true,"format":"utc_to_ist"},
            {"field":"Device_ID","header":"Device ID","type":"string","sortable":true,"searchable":true},
            {"field":"Event_Type","header":"Event Type","type":"string","sortable":true},
            {"field":"Event_Type_Description","header":"Description","type":"string","sortable":true},
            {"field":"Signal_Strength","header":"Signal","type":"number","sortable":true},
            {"field":"Battery_Voltage_mV","header":"Battery (mV)","type":"number","sortable":true}
        ]'
    );
    PRINT 'Seeded: sick_data_p3 (IoT_Data_Sick_P3)';
END

-- ============================================================
PRINT '============================================================';
PRINT 'PART 4: Adding Device Testing permissions';
PRINT '============================================================';

-- Add permissions if not present
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE permission_name = 'View Device Testing')
BEGIN
    INSERT INTO dbo.permissions (permission_name) VALUES ('View Device Testing');
    PRINT 'Added permission: View Device Testing';
END

IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE permission_name = 'Manage Device Testing Tables')
BEGIN
    INSERT INTO dbo.permissions (permission_name) VALUES ('Manage Device Testing Tables');
    PRINT 'Added permission: Manage Device Testing Tables';
END

-- Assign "View Device Testing" to SYSTEM_ADMIN, SUPER_ADMIN, CLIENT_ADMIN
INSERT INTO dbo.role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM dbo.[role] r CROSS JOIN dbo.permissions p
WHERE r.role_name IN ('SYSTEM_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN')
  AND p.permission_name = 'View Device Testing'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.role_permission rp
    WHERE rp.role_id = r.role_id AND rp.permission_id = p.permission_id
  );
PRINT 'Assigned View Device Testing to SYSTEM_ADMIN, SUPER_ADMIN, CLIENT_ADMIN.';

-- Assign "Manage Device Testing Tables" to SYSTEM_ADMIN only
INSERT INTO dbo.role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM dbo.[role] r CROSS JOIN dbo.permissions p
WHERE r.role_name = 'SYSTEM_ADMIN'
  AND p.permission_name = 'Manage Device Testing Tables'
  AND NOT EXISTS (
    SELECT 1 FROM dbo.role_permission rp
    WHERE rp.role_id = r.role_id AND rp.permission_id = p.permission_id
  );
PRINT 'Assigned Manage Device Testing Tables to SYSTEM_ADMIN.';

COMMIT TRANSACTION;

PRINT '';
PRINT '============================================================';
PRINT 'Migration complete. Summary:';
PRINT '  PART 1 - IDENTITY added: client, device, user, role,';
PRINT '           permissions, audit_log, dashboard,';
PRINT '           cloud_dashboard_hkmi, iot_data_new,';
PRINT '           client_device, user_preferences';
PRINT '  PART 2 - DeviceTesting_TableConfig table created';
PRINT '  PART 3 - DeviceTesting_TableConfig seeded (3 rows)';
PRINT '  PART 4 - Device Testing permissions added';
PRINT '============================================================';
