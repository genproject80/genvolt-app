-- ============================================================
-- CloudSynk Platform — Consolidated Migration Script
-- Database: cs_db_dev  |  Schema: dbo
-- Idempotent: safe to run multiple times on the same database.
--
-- Sources (applied in dependency order):
--   migrate_payment_schema.sql  — SubscriptionPlans, ClientSubscriptions, PaymentTransactions
--   migrate_mqtt.sql            — device lifecycle columns, legacy payment tables
--   migrate_v3.sql              — ClientDiscounts, ClientTopicConfig, pause columns, permissions
--   migrate_v4.sql              — IMEI protocol, DeviceTelemetry
--   migrate_v5.sql              — inventory table, model_number FK
--   migrate_v5_inventory_seed.sql — device model catalogue
--   migrate_feature_flags.sql   — FeatureFlags table
--
-- Layout:
--   Block 1  — DDL   (CREATE TABLE, ALTER TABLE column additions)
--   Block 2  — Sequences (dbo.device_id_seq — used by NEXT VALUE FOR in app code)
--   Block 3  — Indexes
--   Block 4  — Seed data & back-fills (DML)
--   Block 5  — Permissions & role assignments
-- ============================================================

USE [cs_db_dev];

-- ============================================================
-- BLOCK 1: TABLE DEFINITIONS & COLUMN ALTERATIONS (DDL)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1.1  SubscriptionPlans
--      Defines the plan tiers available to clients.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'SubscriptionPlans'
)
BEGIN
  CREATE TABLE dbo.SubscriptionPlans
  (
    plan_id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    description NVARCHAR(500) NULL,
    max_devices INT NOT NULL,
    -- -1 = unlimited
    price_monthly DECIMAL(10,2) NOT NULL,
    price_yearly DECIMAL(10,2) NOT NULL,
    grace_days INT NOT NULL DEFAULT 7,
    features NVARCHAR(MAX) NULL,
    -- JSON array
    razorpay_plan_id_monthly NVARCHAR(100) NULL,
    razorpay_plan_id_yearly NVARCHAR(100) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_by INT NULL REFERENCES dbo.[user](user_id)
    -- added v3.0
  );
  PRINT 'Created table: dbo.SubscriptionPlans';
END
ELSE
BEGIN
  -- v3.0 column — add if the table was created before that migration
  IF NOT EXISTS (
    SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.SubscriptionPlans') AND name = 'updated_by'
  )
  BEGIN
    ALTER TABLE dbo.SubscriptionPlans ADD
      updated_by INT NULL REFERENCES dbo.[user](user_id);
    PRINT 'Added updated_by to dbo.SubscriptionPlans';
  END
  ELSE
    PRINT 'Table dbo.SubscriptionPlans already exists — skipped';
END

-- ─────────────────────────────────────────────────────────────
-- 1.2  ClientSubscriptions
--      One row per subscription period per client.
--      Status lifecycle: PENDING → ACTIVE → GRACE → EXPIRED | CANCELLED
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'ClientSubscriptions'
)
BEGIN
  CREATE TABLE dbo.ClientSubscriptions
  (
    subscription_id INT IDENTITY(1,1) PRIMARY KEY,
    client_id INT NOT NULL REFERENCES dbo.client(client_id),
    plan_id INT NOT NULL REFERENCES dbo.SubscriptionPlans(plan_id),
    status NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- PENDING | ACTIVE | GRACE | EXPIRED | CANCELLED
    billing_cycle NVARCHAR(10) NOT NULL DEFAULT 'monthly',
    -- monthly | yearly
    start_date DATETIME2 NULL,
    end_date DATETIME2 NULL,
    grace_end_date DATETIME2 NULL,
    -- end_date + grace_days
    razorpay_subscription_id NVARCHAR(100) NULL,
    razorpay_customer_id NVARCHAR(100) NULL,
    auto_renew BIT NOT NULL DEFAULT 1,
    cancelled_at DATETIME2 NULL,
    cancellation_reason NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    created_by_user_id INT NULL REFERENCES dbo.[user](user_id),
    -- v3.0: admin management fields
    assignment_type NVARCHAR(20) NOT NULL DEFAULT 'PAYMENT',
    -- PAYMENT | MANUAL | TRIAL
    assigned_by_admin_id INT NULL REFERENCES dbo.[user](user_id),
    admin_notes NVARCHAR(500) NULL
  );
  PRINT 'Created table: dbo.ClientSubscriptions';
END
ELSE
BEGIN
  -- v3.0 columns — add if the table was created before that migration
  IF NOT EXISTS (
    SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.ClientSubscriptions') AND name = 'assignment_type'
  )
  BEGIN
    ALTER TABLE dbo.ClientSubscriptions ADD
      assignment_type      NVARCHAR(20)  NOT NULL DEFAULT 'PAYMENT',
      assigned_by_admin_id INT           NULL REFERENCES dbo.[user](user_id),
      admin_notes          NVARCHAR(500) NULL;
    PRINT 'Extended dbo.ClientSubscriptions with admin management fields';
  END
  ELSE
    PRINT 'Table dbo.ClientSubscriptions already exists — skipped';
END

-- ─────────────────────────────────────────────────────────────
-- 1.3  PaymentTransactions
--      Immutable ledger — one row per Razorpay order / payment attempt.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'PaymentTransactions'
)
BEGIN
  CREATE TABLE dbo.PaymentTransactions
  (
    transaction_id INT IDENTITY(1,1) PRIMARY KEY,
    subscription_id INT NOT NULL REFERENCES dbo.ClientSubscriptions(subscription_id),
    client_id INT NOT NULL REFERENCES dbo.client(client_id),
    razorpay_order_id NVARCHAR(100) NULL,
    razorpay_payment_id NVARCHAR(100) NULL,
    razorpay_signature NVARCHAR(500) NULL,
    amount DECIMAL(10,2) NOT NULL,
    -- INR in rupees (not paise)
    currency NVARCHAR(5) NOT NULL DEFAULT 'INR',
    status NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- PENDING | COMPLETED | FAILED | REFUNDED
    payment_mode NVARCHAR(50) NULL,
    -- upi | card | netbanking | wallet
    failure_reason NVARCHAR(500) NULL,
    invoice_number NVARCHAR(50) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  PRINT 'Created table: dbo.PaymentTransactions';
END
ELSE
  PRINT 'Table dbo.PaymentTransactions already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.4  payment_plan  (legacy — migrate_mqtt.sql)
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1
FROM sys.tables
WHERE name = 'payment_plan')
BEGIN
  CREATE TABLE payment_plan
  (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(50) NOT NULL,
    device_quota INT NOT NULL,
    price_monthly DECIMAL(10,2) NOT NULL,
    price_annual DECIMAL(10,2) NOT NULL,
    currency NVARCHAR(10) NOT NULL DEFAULT 'INR',
    razorpay_plan_id NVARCHAR(100) NULL,
    features NVARCHAR(MAX) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE()
  );
  PRINT 'Created table: payment_plan';
END
ELSE
  PRINT 'Table payment_plan already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.5  client_subscription  (legacy — migrate_mqtt.sql)
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1
FROM sys.tables
WHERE name = 'client_subscription')
BEGIN
  CREATE TABLE client_subscription
  (
    id INT IDENTITY(1,1) PRIMARY KEY,
    client_id INT NOT NULL,
    plan_id INT NOT NULL REFERENCES payment_plan(id),
    status NVARCHAR(20) NOT NULL DEFAULT 'trialing',
    -- trialing | active | past_due | cancelled | expired
    razorpay_subscription_id NVARCHAR(100) NULL,
    billing_cycle NVARCHAR(10) NOT NULL DEFAULT 'monthly',
    current_period_start DATETIME NULL,
    current_period_end DATETIME NULL,
    grace_period_end DATETIME NULL,
    trial_end DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME NOT NULL DEFAULT GETUTCDATE()
  );
  PRINT 'Created table: client_subscription';
END
ELSE
  PRINT 'Table client_subscription already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.6  payment_transaction  (legacy — migrate_mqtt.sql)
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1
FROM sys.tables
WHERE name = 'payment_transaction')
BEGIN
  CREATE TABLE payment_transaction
  (
    id INT IDENTITY(1,1) PRIMARY KEY,
    client_id INT NOT NULL,
    subscription_id INT NULL REFERENCES client_subscription(id),
    gateway NVARCHAR(20) NOT NULL,
    gateway_payment_id NVARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency NVARCHAR(10) NOT NULL DEFAULT 'INR',
    status NVARCHAR(20) NOT NULL,
    event_type NVARCHAR(50) NOT NULL,
    raw_payload NVARCHAR(MAX) NULL,
    created_at DATETIME NOT NULL DEFAULT GETUTCDATE()
  );
  PRINT 'Created table: payment_transaction';
END
ELSE
  PRINT 'Table payment_transaction already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.7  ClientDiscounts  (v3.0)
--      One-time admin discount per client.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'ClientDiscounts'
)
BEGIN
  CREATE TABLE dbo.ClientDiscounts
  (
    discount_id INT IDENTITY(1,1) PRIMARY KEY,
    client_id INT NOT NULL REFERENCES dbo.client(client_id),
    discount_type NVARCHAR(20) NOT NULL,
    -- PERCENTAGE | FIXED
    discount_value DECIMAL(10,2) NOT NULL,
    is_used BIT NOT NULL DEFAULT 0,
    created_by INT NOT NULL REFERENCES dbo.[user](user_id),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    applied_at DATETIME2 NULL,
    applied_to_order NVARCHAR(100) NULL
    -- Razorpay order_id
  );
  PRINT 'Created table: dbo.ClientDiscounts';
END
ELSE
  PRINT 'Table dbo.ClientDiscounts already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.8  ClientTopicConfig  (v3.0)
--      Per-client MQTT topic patterns.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'ClientTopicConfig'
)
BEGIN
  CREATE TABLE dbo.ClientTopicConfig
  (
    config_id INT IDENTITY(1,1) PRIMARY KEY,
    client_id INT NOT NULL UNIQUE REFERENCES dbo.client(client_id),
    topic_prefix NVARCHAR(200) NOT NULL DEFAULT 'cloudsynk',
    -- Default topic pattern: <prefix>/<client_id>/<device_id>/<suffix>
    telemetry_suffix NVARCHAR(200) NOT NULL DEFAULT 'telemetry',
    config_suffix NVARCHAR(200) NOT NULL DEFAULT 'config',
    -- JSON: { "P1": { "telemetry_suffix": "..." }, "P3": { ... }, ... }
    device_type_overrides NVARCHAR(MAX) NULL,
    created_by INT NOT NULL REFERENCES dbo.[user](user_id),
    created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    updated_by INT NULL REFERENCES dbo.[user](user_id)
  );
  PRINT 'Created table: dbo.ClientTopicConfig';
END
ELSE
  PRINT 'Table dbo.ClientTopicConfig already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.9  DeviceTelemetry  (v4.0)
--      Stores raw + decoded telemetry from all devices.
--      decoded_data is a JSON column — schema varies by logicId.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'DeviceTelemetry'
)
BEGIN
  CREATE TABLE dbo.DeviceTelemetry
  (
    telemetry_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    device_id NVARCHAR(50) NOT NULL,
    -- matches device.device_id
    imei NVARCHAR(20) NULL,
    logic_id INT NOT NULL,
    -- decoder selector
    raw_payload NVARCHAR(MAX) NOT NULL,
    -- original JSON string from device
    decoded_data NVARCHAR(MAX) NULL,
    -- JSON of decoded fields (varies by logicId)
    received_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  );
  PRINT 'Created table: dbo.DeviceTelemetry';
END
ELSE
  PRINT 'Table dbo.DeviceTelemetry already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.10  inventory  (v5.0)
--       Device model registry: decoder logic IDs and device_id prefix.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'inventory'
)
BEGIN
  CREATE TABLE dbo.inventory
  (
    model_number NVARCHAR(50) NOT NULL,
    display_name NVARCHAR(100) NOT NULL,
    device_id_prefix NVARCHAR(20) NOT NULL,
    decoder_logic_ids NVARCHAR(200) NOT NULL CONSTRAINT DF_inventory_decoder  DEFAULT ('[]'),
    description NVARCHAR(500) NULL,
    is_active BIT NOT NULL CONSTRAINT DF_inventory_active   DEFAULT (1),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_inventory_created  DEFAULT (GETUTCDATE()),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_inventory_updated  DEFAULT (GETUTCDATE()),
    CONSTRAINT PK_inventory PRIMARY KEY (model_number)
  );
  PRINT 'Created table: dbo.inventory';
END
ELSE
  PRINT 'Table dbo.inventory already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.11  FeatureFlags
--       Platform feature flag toggles.
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (
  SELECT 1
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'FeatureFlags'
)
BEGIN
  CREATE TABLE dbo.FeatureFlags
  (
    flag_id INT IDENTITY(1,1) PRIMARY KEY,
    flag_name NVARCHAR(100) NOT NULL UNIQUE,
    display_name NVARCHAR(200) NOT NULL,
    description NVARCHAR(500) NULL,
    is_enabled BIT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT GETUTCDATE(),
    updated_by INT NULL
  );
  PRINT 'Created table: dbo.FeatureFlags';
END
ELSE
  PRINT 'Table dbo.FeatureFlags already exists — skipped';

-- ─────────────────────────────────────────────────────────────
-- 1.12  ALTER TABLE dbo.device — add columns
-- ─────────────────────────────────────────────────────────────

-- MQTT lifecycle columns (migrate_mqtt.sql)
IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'activation_status')
  ALTER TABLE dbo.device ADD activation_status NVARCHAR(20) NOT NULL DEFAULT 'PENDING';

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'mqtt_password')
  ALTER TABLE dbo.device ADD mqtt_password NVARCHAR(255) NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'mqtt_username')
  ALTER TABLE dbo.device ADD mqtt_username NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'device_type')
  ALTER TABLE dbo.device ADD device_type NVARCHAR(50) NULL;
-- P1 | P2 | P3 | HKMI | GAS — reported by device on pre-activation

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'firmware_version')
  ALTER TABLE dbo.device ADD firmware_version NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'mac_address')
  ALTER TABLE dbo.device ADD mac_address NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'first_seen')
  ALTER TABLE dbo.device ADD first_seen DATETIME NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'last_seen')
  ALTER TABLE dbo.device ADD last_seen DATETIME NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'activated_at')
  ALTER TABLE dbo.device ADD activated_at DATETIME NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'activated_by')
  ALTER TABLE dbo.device ADD activated_by INT NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'deactivated_at')
  ALTER TABLE dbo.device ADD deactivated_at DATETIME NULL;

IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'deactivated_by')
  ALTER TABLE dbo.device ADD deactivated_by INT NULL;

-- FK to legacy client_subscription (migrate_mqtt.sql)
-- TRY/CATCH: client_subscription may not exist on all environments
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.device') AND name = 'subscription_id')
BEGIN TRY
  ALTER TABLE dbo.device ADD subscription_id INT NULL REFERENCES client_subscription(id);
END TRY
BEGIN CATCH
  PRINT 'Warning: subscription_id FK skipped — ' + ERROR_MESSAGE();
END CATCH

-- v3.0: pause / data_enabled columns
IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'data_enabled')
BEGIN
  ALTER TABLE dbo.device ADD
    data_enabled  BIT            NOT NULL DEFAULT 1,
    -- 1 = device may publish telemetry | 0 = blocked (paused)
    paused_by     NVARCHAR(20)   NULL,      -- CLIENT | ADMIN
    paused_at     DATETIME2      NULL,
    paused_reason NVARCHAR(500)  NULL;
  PRINT 'Added data_enabled / pause columns to dbo.device';
END
ELSE
  PRINT 'dbo.device already has data_enabled column — skipped';

-- v4.0: IMEI column
IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'imei')
  ALTER TABLE dbo.device ADD imei NVARCHAR(20) NULL;

-- v4.0: make device_id nullable (auto-registered devices arrive with only an IMEI)
-- TRY/CATCH: fails silently when device_id is a PRIMARY KEY column
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.device') AND name = 'device_id' AND is_nullable = 0
)
BEGIN
  BEGIN TRY
    ALTER TABLE dbo.device ALTER COLUMN device_id NVARCHAR(50) NULL;
    PRINT 'Made dbo.device.device_id nullable';
  END TRY
  BEGIN CATCH
    PRINT 'Warning: device_id nullable change skipped — ' + ERROR_MESSAGE();
  END CATCH
END
ELSE
  PRINT 'dbo.device.device_id already nullable — skipped';

-- v4.0: make client_id nullable (pre-activation devices have no client yet)
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.device') AND name = 'client_id' AND is_nullable = 0
)
BEGIN
  BEGIN TRY
    ALTER TABLE dbo.device ALTER COLUMN client_id INT NULL;
    PRINT 'Made dbo.device.client_id nullable';
  END TRY
  BEGIN CATCH
    PRINT 'Warning: client_id nullable change skipped — ' + ERROR_MESSAGE();
  END CATCH
END
ELSE
  PRINT 'dbo.device.client_id already nullable — skipped';

-- v4.0: plain-text MQTT password for reboot recovery
--       In production: encrypt this column at the application layer.
IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'mqtt_password_plain')
  ALTER TABLE dbo.device ADD mqtt_password_plain NVARCHAR(100) NULL;

-- v5.0: model_number FK to inventory (inventory table must exist — created above in 1.10)
IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'model_number')
BEGIN
  ALTER TABLE dbo.device
    ADD model_number NVARCHAR(50) NULL
        CONSTRAINT FK_device_inventory FOREIGN KEY REFERENCES dbo.inventory(model_number);
  PRINT 'Added column: dbo.device.model_number';
END
ELSE
  PRINT 'dbo.device.model_number already exists — skipped';

-- payment_schema: records why a device cannot be activated (subscription-related)
IF NOT EXISTS (SELECT 1
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'activation_blocked_reason')
  ALTER TABLE dbo.device ADD activation_blocked_reason NVARCHAR(200) NULL;
-- Values: NULL (no block) | 'NO_SUBSCRIPTION' | 'PLAN_LIMIT' |
--         'GRACE_PERIOD'  | 'SUBSCRIPTION_EXPIRED'

PRINT '--- Block 1: DDL complete ---';

-- ============================================================
-- BLOCK 2: SEQUENCES
-- ============================================================

-- dbo.device_id_seq
-- Provides the numeric id for dbo.device.id on every INSERT.
-- Referenced in code via:  NEXT VALUE FOR dbo.device_id_seq
--   • server/services/mqttListenerService.js
--   • scripts/local_subscriber.py
IF NOT EXISTS (
  SELECT 1
FROM sys.sequences
WHERE schema_id = SCHEMA_ID('dbo') AND name = 'device_id_seq'
)
BEGIN
  CREATE SEQUENCE dbo.device_id_seq
    AS INT
    START WITH 1
    INCREMENT BY 1
    MINVALUE 1
    NO MAXVALUE
    NO CYCLE
    CACHE 50;

  -- Advance past any rows that already exist so the next INSERT
  -- does not collide with a pre-existing id value.
  -- ALTER SEQUENCE RESTART WITH does not accept variables — use dynamic SQL.
  DECLARE @maxDeviceId  INT;
  DECLARE @restartSql   NVARCHAR(200);
  SELECT @maxDeviceId = ISNULL(MAX(id), 0)
  FROM dbo.device;
  IF @maxDeviceId > 0
  BEGIN
    SET @restartSql = N'ALTER SEQUENCE dbo.device_id_seq RESTART WITH '
                    + CAST(@maxDeviceId + 1 AS NVARCHAR(20));
    EXEC sp_executesql @restartSql;
  END

  PRINT 'Created sequence: dbo.device_id_seq';
END
ELSE
  PRINT 'Sequence dbo.device_id_seq already exists — skipped';

PRINT '--- Block 2: Sequences complete ---';

-- ============================================================
-- BLOCK 3: INDEXES
-- All CREATE INDEX statements use sp_executesql so that column
-- and table references are resolved at execution time, not at
-- parse time.  This avoids "Invalid column name" errors when
-- the column was added by an ALTER TABLE earlier in this batch.
-- ============================================================

-- dbo.device — activation_status  (migrate_mqtt.sql)
IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'IX_device_activation_status')
  EXEC sp_executesql N'CREATE INDEX IX_device_activation_status ON dbo.device (activation_status)';

-- dbo.device — mqtt_username  (migrate_mqtt.sql)
IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'IX_device_mqtt_username')
  EXEC sp_executesql N'CREATE NONCLUSTERED INDEX IX_device_mqtt_username ON dbo.device (mqtt_username)';

-- dbo.device — imei unique  (v4.0)
IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'IX_device_imei')
  EXEC sp_executesql N'CREATE UNIQUE INDEX IX_device_imei ON dbo.device (imei) WHERE imei IS NOT NULL';

-- dbo.device — model_number  (v5.0)
IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.device') AND name = 'IX_device_model_number')
  EXEC sp_executesql N'CREATE INDEX IX_device_model_number ON dbo.device (model_number) WHERE model_number IS NOT NULL';

-- dbo.ClientSubscriptions  (payment_schema)
IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.ClientSubscriptions') AND name = 'IX_ClientSubscriptions_client')
  EXEC sp_executesql N'CREATE INDEX IX_ClientSubscriptions_client ON dbo.ClientSubscriptions (client_id)';

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.ClientSubscriptions') AND name = 'IX_ClientSubscriptions_status')
  EXEC sp_executesql N'CREATE INDEX IX_ClientSubscriptions_status ON dbo.ClientSubscriptions (status)';

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.ClientSubscriptions') AND name = 'IX_ClientSubscriptions_end_date')
  EXEC sp_executesql N'CREATE INDEX IX_ClientSubscriptions_end_date ON dbo.ClientSubscriptions (end_date) WHERE status IN (''ACTIVE'', ''GRACE'')';

-- dbo.PaymentTransactions  (payment_schema)
IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.PaymentTransactions') AND name = 'IX_PaymentTransactions_client')
  EXEC sp_executesql N'CREATE INDEX IX_PaymentTransactions_client ON dbo.PaymentTransactions (client_id)';

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.PaymentTransactions') AND name = 'IX_PaymentTransactions_subscription')
  EXEC sp_executesql N'CREATE INDEX IX_PaymentTransactions_subscription ON dbo.PaymentTransactions (subscription_id)';

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.PaymentTransactions') AND name = 'IX_PaymentTransactions_razorpay_order')
  EXEC sp_executesql N'CREATE UNIQUE INDEX IX_PaymentTransactions_razorpay_order ON dbo.PaymentTransactions (razorpay_order_id) WHERE razorpay_order_id IS NOT NULL';

-- dbo.ClientDiscounts  (v3.0)
IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.ClientDiscounts') AND name = 'IX_ClientDiscounts_client')
  EXEC sp_executesql N'CREATE INDEX IX_ClientDiscounts_client ON dbo.ClientDiscounts (client_id)';

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.ClientDiscounts') AND name = 'IX_ClientDiscounts_unused')
  EXEC sp_executesql N'CREATE INDEX IX_ClientDiscounts_unused ON dbo.ClientDiscounts (client_id) WHERE is_used = 0';

-- dbo.DeviceTelemetry  (v4.0)
IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.DeviceTelemetry') AND name = 'IX_DeviceTelemetry_device')
  EXEC sp_executesql N'CREATE INDEX IX_DeviceTelemetry_device ON dbo.DeviceTelemetry (device_id, received_at DESC)';

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.DeviceTelemetry') AND name = 'IX_DeviceTelemetry_imei')
  EXEC sp_executesql N'CREATE INDEX IX_DeviceTelemetry_imei ON dbo.DeviceTelemetry (imei, received_at DESC)';

IF NOT EXISTS (SELECT 1
FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.DeviceTelemetry') AND name = 'IX_DeviceTelemetry_logicId')
  EXEC sp_executesql N'CREATE INDEX IX_DeviceTelemetry_logicId ON dbo.DeviceTelemetry (logic_id, received_at DESC)';

PRINT '--- Block 3: Indexes complete ---';

-- ============================================================
-- BLOCK 4: SEED DATA & BACK-FILLS (DML)
-- ============================================================

-- 4.1  SubscriptionPlans seed  (payment_schema)
IF NOT EXISTS (SELECT 1
FROM dbo.SubscriptionPlans
WHERE name = 'Basic')
BEGIN
  INSERT INTO dbo.SubscriptionPlans
    (name, description, max_devices, price_monthly, price_yearly, grace_days, features, is_active)
  VALUES
    (
      'Basic',
      'Ideal for small deployments. Up to 5 active devices.',
      5, 999.00, 9990.00, 7,
      '["Up to 5 devices","Real-time monitoring","Email support","7-day grace period"]',
      1
    ),
    (
      'Pro',
      'For growing teams. Up to 25 active devices with priority support.',
      25, 2999.00, 29990.00, 14,
      '["Up to 25 devices","Real-time monitoring","Priority email support","Advanced analytics","14-day grace period"]',
      1
    ),
    (
      'Enterprise',
      'Unlimited devices with dedicated support and custom integrations.',
      -1, 7999.00, 79990.00, 30,
      '["Unlimited devices","Real-time monitoring","Dedicated support","Advanced analytics","Custom integrations","30-day grace period"]',
      1
    );
  PRINT 'Seeded 3 subscription plans (Basic, Pro, Enterprise)';
END
ELSE
  PRINT 'Subscription plans already seeded — skipped';

-- 4.2  Legacy payment_plan seed  (migrate_mqtt.sql)
IF NOT EXISTS (SELECT 1
FROM payment_plan
WHERE name = 'Starter')
BEGIN
  INSERT INTO payment_plan
    (name, device_quota, price_monthly, price_annual, currency)
  VALUES
    ('Starter', 10, 2999, 29999, 'INR'),
    ('Growth', 50, 9999, 99999, 'INR'),
    ('Enterprise', 200, 29999, 299999, 'INR');
  PRINT 'Seeded legacy payment_plan (Starter, Growth, Enterprise)';
END
ELSE
  PRINT 'Legacy payment_plan already seeded — skipped';

-- 4.3  inventory seed  (v5.0 + v5_inventory_seed)
--      Decoder logicId reference (server/decoders/logicId*.js):
--        1 = GV-M1     Voltage/Power          8 bytes
--        2 = GV-ENV1   Temp/Humidity          8 bytes
--        3 = GV-GPS1   GPS/Location          13 bytes
--        4 = GV-M2     Energy Meter v2       10 bytes
--        5 = GV-PRO1   Energy + Environment  16 bytes
--        6 = GV-FLT1   Energy + GPS          21 bytes
--        7 = EV-M1     EV Charger            12 bytes
--        8 = GV-ULTRA1 All Sensors           29 bytes
IF NOT EXISTS (SELECT 1
FROM dbo.inventory
WHERE model_number = 'GV-M1')
BEGIN
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES
    ('GV-M1', 'GenVolt Meter v1', 'GV', '[1]',
      'Default energy meter — voltage, current, power (logicId 1)');
  PRINT 'Seeded: GV-M1';
END

IF NOT EXISTS (SELECT 1
FROM dbo.inventory
WHERE model_number = 'GV-M2')
BEGIN
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES
    ('GV-M2', 'GenVolt Meter v2', 'GV', '[4]',
      'Energy meter v2 — voltage, current, power, power_factor (logicId 4). 10-byte payload.');
  PRINT 'Seeded: GV-M2';
END

IF NOT EXISTS (SELECT 1
FROM dbo.inventory
WHERE model_number = 'GV-ENV1')
BEGIN
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES
    ('GV-ENV1', 'GenVolt Environmental Sensor v1', 'ENV', '[2]',
      'Ambient sensor — temperature (°C), humidity (%), pressure (hPa) (logicId 2).');
  PRINT 'Seeded: GV-ENV1';
END

IF NOT EXISTS (SELECT 1
FROM dbo.inventory
WHERE model_number = 'GV-GPS1')
BEGIN
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES
    ('GV-GPS1', 'GenVolt GPS Tracker v1', 'GPS', '[3]',
      'Asset tracker — latitude, longitude, altitude, speed, satellite count (logicId 3).');
  PRINT 'Seeded: GV-GPS1';
END

IF NOT EXISTS (SELECT 1
FROM dbo.inventory
WHERE model_number = 'GV-PRO1')
BEGIN
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES
    ('GV-PRO1', 'GenVolt Pro Multi-Sensor v1', 'GVP', '[5]',
      'Energy + environment combined frame (logicId 5). 16-byte payload: voltage, current, power, temperature, humidity, pressure.');
  PRINT 'Seeded: GV-PRO1';
END

IF NOT EXISTS (SELECT 1
FROM dbo.inventory
WHERE model_number = 'GV-FLT1')
BEGIN
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES
    ('GV-FLT1', 'GenVolt Fleet Tracker v1', 'FLT', '[6]',
      'Vehicle energy + GPS combined frame (logicId 6). 21-byte payload: voltage, current, power, lat, lng, altitude, speed, satellites.');
  PRINT 'Seeded: GV-FLT1';
END

IF NOT EXISTS (SELECT 1
FROM dbo.inventory
WHERE model_number = 'EV-M1')
BEGIN
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES
    ('EV-M1', 'EV Charger Meter v1', 'EV', '[7]',
      'EV charging station meter (logicId 7). 12-byte payload: voltage, current, power, energy_wh (session counter).');
  PRINT 'Seeded: EV-M1';
END

IF NOT EXISTS (SELECT 1
FROM dbo.inventory
WHERE model_number = 'GV-ULTRA1')
BEGIN
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES
    ('GV-ULTRA1', 'GenVolt Ultra v1', 'GVU', '[8]',
      'All-in-one combined frame (logicId 8). 29-byte payload: voltage, current, power, temperature, humidity, pressure, lat, lng, altitude, speed, satellites.');
  PRINT 'Seeded: GV-ULTRA1';
END

-- 4.4  FeatureFlags seed
IF NOT EXISTS (SELECT 1
FROM dbo.FeatureFlags
WHERE flag_name = 'payments_enabled')
BEGIN
  INSERT INTO dbo.FeatureFlags
    (flag_name, display_name, description, is_enabled)
  VALUES
    (
      'payments_enabled',
      'Payments / Billing',
      'Controls visibility of billing, subscription plans, discounts, and payment features across the platform.',
      0
  );
  PRINT 'Seeded FeatureFlags: payments_enabled';
END
ELSE
  PRINT 'FeatureFlags: payments_enabled already exists — skipped';

-- 4.5  Back-fill existing devices with default model (v5.0)
--      Uses dynamic SQL so the column reference resolves at runtime.
EXEC sp_executesql N'
  UPDATE dbo.device
  SET model_number = ''GV-M1''
  WHERE model_number IS NULL;
';
PRINT 'Back-filled existing devices with model_number = GV-M1';

-- 4.6  Migrate pre-existing provisioned devices to ACTIVE (migrate_mqtt.sql)
--      Devices already in the system (client_id IS NOT NULL) are considered active.
--      Uses dynamic SQL: activation_status / mqtt_username were added in this batch.
EXEC sp_executesql N'
  UPDATE dbo.device
  SET activation_status = ''ACTIVE'',
      mqtt_username     = device_id
  WHERE activation_status = ''PENDING''
    AND client_id IS NOT NULL;
';
PRINT 'Migrated pre-existing provisioned devices to ACTIVE';

PRINT '--- Block 4: Seed data complete ---';

-- ============================================================
-- BLOCK 5: PERMISSIONS & ROLE ASSIGNMENTS
-- ============================================================

-- 5.1  Seed permissions
IF NOT EXISTS (SELECT 1
FROM dbo.permissions
WHERE permission_name = 'Manage Plans')
BEGIN
  INSERT INTO dbo.permissions
    (permission_name)
  VALUES
    ('Manage Plans'),
    ('Manage Discounts'),
    ('Pause Resume Devices'),
    ('Manage Topic Config');
  PRINT 'Seeded v3.0 permissions';
END
ELSE
  PRINT 'v3.0 permissions already seeded — skipped';

IF NOT EXISTS (SELECT 1
FROM dbo.permissions
WHERE permission_name = 'View Billing')
BEGIN
  INSERT INTO dbo.permissions
    (permission_name)
  VALUES
    ('View Billing'),
    ('Manage Subscriptions'),
    ('Override Subscription');
  PRINT 'Seeded billing permissions';
END
ELSE
  PRINT 'Billing permissions already seeded — skipped';

-- 5.2  Resolve permission and role IDs
DECLARE @managePlansId  INT;
DECLARE @manageDiscId   INT;
DECLARE @pauseResumeId  INT;
DECLARE @topicConfigId  INT;
DECLARE @viewBillingId  INT;
DECLARE @manageSubId    INT;
DECLARE @overrideSubId  INT;
DECLARE @sysAdminId     INT;
DECLARE @superAdminId   INT;
DECLARE @clientAdminId  INT;

SELECT @managePlansId  = permission_id
FROM dbo.permissions
WHERE permission_name = 'Manage Plans';
SELECT @manageDiscId   = permission_id
FROM dbo.permissions
WHERE permission_name = 'Manage Discounts';
SELECT @pauseResumeId  = permission_id
FROM dbo.permissions
WHERE permission_name = 'Pause Resume Devices';
SELECT @topicConfigId  = permission_id
FROM dbo.permissions
WHERE permission_name = 'Manage Topic Config';
SELECT @viewBillingId  = permission_id
FROM dbo.permissions
WHERE permission_name = 'View Billing';
SELECT @manageSubId    = permission_id
FROM dbo.permissions
WHERE permission_name = 'Manage Subscriptions';
SELECT @overrideSubId  = permission_id
FROM dbo.permissions
WHERE permission_name = 'Override Subscription';
SELECT @sysAdminId     = role_id
FROM dbo.role
WHERE role_name = 'SYSTEM_ADMIN';
SELECT @superAdminId   = role_id
FROM dbo.role
WHERE role_name = 'SUPER_ADMIN';
SELECT @clientAdminId  = role_id
FROM dbo.role
WHERE role_name = 'CLIENT_ADMIN';

-- SYSTEM_ADMIN — all permissions
IF @sysAdminId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@sysAdminId AND permission_id=@managePlansId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@sysAdminId, @managePlansId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@sysAdminId AND permission_id=@manageDiscId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@sysAdminId, @manageDiscId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@sysAdminId AND permission_id=@pauseResumeId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@sysAdminId, @pauseResumeId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@sysAdminId AND permission_id=@topicConfigId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@sysAdminId, @topicConfigId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@sysAdminId AND permission_id=@viewBillingId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@sysAdminId, @viewBillingId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@sysAdminId AND permission_id=@manageSubId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@sysAdminId, @manageSubId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@sysAdminId AND permission_id=@overrideSubId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@sysAdminId, @overrideSubId);
  PRINT 'Assigned all permissions to SYSTEM_ADMIN';
END

-- SUPER_ADMIN — everything except Manage Topic Config
IF @superAdminId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@superAdminId AND permission_id=@managePlansId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@superAdminId, @managePlansId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@superAdminId AND permission_id=@manageDiscId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@superAdminId, @manageDiscId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@superAdminId AND permission_id=@pauseResumeId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@superAdminId, @pauseResumeId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@superAdminId AND permission_id=@viewBillingId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@superAdminId, @viewBillingId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@superAdminId AND permission_id=@manageSubId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@superAdminId, @manageSubId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@superAdminId AND permission_id=@overrideSubId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@superAdminId, @overrideSubId);
  PRINT 'Assigned permissions to SUPER_ADMIN';
END

-- CLIENT_ADMIN — Pause Resume Devices + View Billing
IF @clientAdminId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@clientAdminId AND permission_id=@pauseResumeId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@clientAdminId, @pauseResumeId);
  IF NOT EXISTS (SELECT 1
  FROM dbo.role_permission
  WHERE role_id=@clientAdminId AND permission_id=@viewBillingId)
    INSERT INTO dbo.role_permission
    (role_id, permission_id)
  VALUES
    (@clientAdminId, @viewBillingId);
  PRINT 'Assigned permissions to CLIENT_ADMIN';
END

PRINT '--- Block 5: Permissions complete ---';

-- ============================================================
-- VERIFY
-- ============================================================

SELECT
  name,
  CASE
    WHEN name IN (
      'activation_status','mqtt_password','mqtt_username','device_type',
      'firmware_version','mac_address','first_seen','last_seen',
      'activated_at','activated_by','deactivated_at','deactivated_by',
      'subscription_id','data_enabled','paused_by','paused_at','paused_reason',
      'imei','mqtt_password_plain','model_number','activation_blocked_reason'
    )
    THEN '+ added / verified'
    ELSE '  existing'
  END AS status
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.device')
ORDER BY column_id;

SELECT model_number, display_name, device_id_prefix, decoder_logic_ids, is_active
FROM dbo.inventory
ORDER BY model_number;

PRINT '=== Consolidated migration complete ===';
