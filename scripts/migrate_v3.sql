-- =============================================================
-- Genvolt / CloudSynk Platform — v3.0 Migration
-- Database: cs_db_dev  |  Schema: dbo
-- Idempotent: safe to run multiple times on the same database.
-- Run this script while connected to cs_db_dev in DBeaver.
-- Covers: F1 (Admin Subscriptions), F2 (Plans), F3 (Discounts),
--         F4/F5 (Device Pause), F6 (Topic Config)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Extend ClientSubscriptions with admin management fields
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.ClientSubscriptions') AND name = 'assignment_type'
)
BEGIN
  ALTER TABLE dbo.ClientSubscriptions ADD
    assignment_type      NVARCHAR(20)  NOT NULL DEFAULT 'PAYMENT',
    -- 'PAYMENT' = paid via Razorpay | 'MANUAL' = admin-assigned | 'TRIAL' = admin trial
    assigned_by_admin_id INT           NULL REFERENCES dbo.[user](user_id),
    admin_notes          NVARCHAR(500) NULL;
  PRINT 'Extended dbo.ClientSubscriptions with admin management fields';
END
ELSE
  PRINT 'dbo.ClientSubscriptions already has admin management fields — skipped';

-- ─────────────────────────────────────────────────────────────
-- 2. ClientDiscounts — one-time admin discount per client
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE schema_id = SCHEMA_ID('dbo') AND name = 'ClientDiscounts'
)
BEGIN
  CREATE TABLE dbo.ClientDiscounts (
    discount_id       INT            IDENTITY(1,1) PRIMARY KEY,
    client_id         INT            NOT NULL REFERENCES dbo.client(client_id),
    discount_type     NVARCHAR(20)   NOT NULL,        -- 'PERCENTAGE' | 'FIXED'
    discount_value    DECIMAL(10,2)  NOT NULL,
    is_used           BIT            NOT NULL DEFAULT 0,
    created_by        INT            NOT NULL REFERENCES dbo.[user](user_id),
    created_at        DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    applied_at        DATETIME2      NULL,
    applied_to_order  NVARCHAR(100)  NULL              -- Razorpay order_id
  );

  CREATE INDEX IX_ClientDiscounts_client
    ON dbo.ClientDiscounts (client_id);

  CREATE INDEX IX_ClientDiscounts_unused
    ON dbo.ClientDiscounts (client_id)
    WHERE is_used = 0;

  PRINT 'Created table: dbo.ClientDiscounts';
END
ELSE
  PRINT 'Table dbo.ClientDiscounts already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 3. device — pause / data_enabled columns
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.device') AND name = 'data_enabled'
)
BEGIN
  ALTER TABLE dbo.device ADD
    data_enabled  BIT           NOT NULL DEFAULT 1,
    -- 1 = device may publish telemetry | 0 = blocked (paused)
    paused_by     NVARCHAR(20)  NULL,   -- 'CLIENT' | 'ADMIN'
    paused_at     DATETIME2     NULL,
    paused_reason NVARCHAR(500) NULL;
  PRINT 'Added data_enabled / pause columns to dbo.device';
END
ELSE
  PRINT 'dbo.device already has data_enabled column — skipped';

-- ─────────────────────────────────────────────────────────────
-- 4. ClientTopicConfig — per-client MQTT topic patterns
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE schema_id = SCHEMA_ID('dbo') AND name = 'ClientTopicConfig'
)
BEGIN
  CREATE TABLE dbo.ClientTopicConfig (
    config_id             INT            IDENTITY(1,1) PRIMARY KEY,
    client_id             INT            NOT NULL UNIQUE REFERENCES dbo.client(client_id),
    topic_prefix          NVARCHAR(200)  NOT NULL DEFAULT 'cloudsynk',
    -- Default topic pattern: <prefix>/<client_id>/<device_id>/<suffix>
    telemetry_suffix      NVARCHAR(200)  NOT NULL DEFAULT 'telemetry',
    config_suffix         NVARCHAR(200)  NOT NULL DEFAULT 'config',
    -- JSON: { "P1": { "telemetry_suffix": "..." }, "P3": { ... }, ... }
    device_type_overrides NVARCHAR(MAX)  NULL,
    created_by            INT            NOT NULL REFERENCES dbo.[user](user_id),
    created_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_by            INT            NULL REFERENCES dbo.[user](user_id)
  );
  PRINT 'Created table: dbo.ClientTopicConfig';
END
ELSE
  PRINT 'Table dbo.ClientTopicConfig already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 5. SubscriptionPlans — add updated_by
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.SubscriptionPlans') AND name = 'updated_by'
)
BEGIN
  ALTER TABLE dbo.SubscriptionPlans ADD
    updated_by INT NULL REFERENCES dbo.[user](user_id);
  PRINT 'Added updated_by to dbo.SubscriptionPlans';
END
ELSE
  PRINT 'dbo.SubscriptionPlans already has updated_by — skipped';

-- ─────────────────────────────────────────────────────────────
-- 6. Seed new permissions
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE permission_name = 'Manage Plans')
BEGIN
  INSERT INTO dbo.permissions (permission_name) VALUES ('Manage Plans');
  INSERT INTO dbo.permissions (permission_name) VALUES ('Manage Discounts');
  INSERT INTO dbo.permissions (permission_name) VALUES ('Pause Resume Devices');
  INSERT INTO dbo.permissions (permission_name) VALUES ('Manage Topic Config');
  PRINT 'Seeded 4 new permissions';
END
ELSE
  PRINT 'New permissions already seeded — skipped';

-- ─────────────────────────────────────────────────────────────
-- 7. Assign new permissions to roles
-- ─────────────────────────────────────────────────────────────
DECLARE @managePlansId  INT;
DECLARE @manageDiscId   INT;
DECLARE @pauseResumeId  INT;
DECLARE @topicConfigId  INT;
DECLARE @sysAdminId     INT;
DECLARE @superAdminId   INT;
DECLARE @clientAdminId  INT;

SELECT @managePlansId = permission_id FROM dbo.permissions WHERE permission_name = 'Manage Plans';
SELECT @manageDiscId  = permission_id FROM dbo.permissions WHERE permission_name = 'Manage Discounts';
SELECT @pauseResumeId = permission_id FROM dbo.permissions WHERE permission_name = 'Pause Resume Devices';
SELECT @topicConfigId = permission_id FROM dbo.permissions WHERE permission_name = 'Manage Topic Config';
SELECT @sysAdminId    = role_id       FROM dbo.role         WHERE role_name = 'SYSTEM_ADMIN';
SELECT @superAdminId  = role_id       FROM dbo.role         WHERE role_name = 'SUPER_ADMIN';
SELECT @clientAdminId = role_id       FROM dbo.role         WHERE role_name = 'CLIENT_ADMIN';

-- SYSTEM_ADMIN: all 4 new permissions
IF @sysAdminId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.role_permission WHERE role_id=@sysAdminId AND permission_id=@managePlansId)
    INSERT INTO dbo.role_permission (role_id, permission_id) VALUES (@sysAdminId, @managePlansId);
  IF NOT EXISTS (SELECT 1 FROM dbo.role_permission WHERE role_id=@sysAdminId AND permission_id=@manageDiscId)
    INSERT INTO dbo.role_permission (role_id, permission_id) VALUES (@sysAdminId, @manageDiscId);
  IF NOT EXISTS (SELECT 1 FROM dbo.role_permission WHERE role_id=@sysAdminId AND permission_id=@pauseResumeId)
    INSERT INTO dbo.role_permission (role_id, permission_id) VALUES (@sysAdminId, @pauseResumeId);
  IF NOT EXISTS (SELECT 1 FROM dbo.role_permission WHERE role_id=@sysAdminId AND permission_id=@topicConfigId)
    INSERT INTO dbo.role_permission (role_id, permission_id) VALUES (@sysAdminId, @topicConfigId);
  PRINT 'Assigned new permissions to SYSTEM_ADMIN';
END

-- SUPER_ADMIN: Manage Plans, Manage Discounts, Pause Resume (not Topic Config)
IF @superAdminId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.role_permission WHERE role_id=@superAdminId AND permission_id=@managePlansId)
    INSERT INTO dbo.role_permission (role_id, permission_id) VALUES (@superAdminId, @managePlansId);
  IF NOT EXISTS (SELECT 1 FROM dbo.role_permission WHERE role_id=@superAdminId AND permission_id=@manageDiscId)
    INSERT INTO dbo.role_permission (role_id, permission_id) VALUES (@superAdminId, @manageDiscId);
  IF NOT EXISTS (SELECT 1 FROM dbo.role_permission WHERE role_id=@superAdminId AND permission_id=@pauseResumeId)
    INSERT INTO dbo.role_permission (role_id, permission_id) VALUES (@superAdminId, @pauseResumeId);
  PRINT 'Assigned new permissions to SUPER_ADMIN';
END

-- CLIENT_ADMIN: Pause Resume Devices only
IF @clientAdminId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM dbo.role_permission WHERE role_id=@clientAdminId AND permission_id=@pauseResumeId)
    INSERT INTO dbo.role_permission (role_id, permission_id) VALUES (@clientAdminId, @pauseResumeId);
  PRINT 'Assigned Pause Resume Devices to CLIENT_ADMIN';
END

PRINT '=== v3.0 migration complete ===';
