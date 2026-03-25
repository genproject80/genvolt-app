-- ============================================================
-- CloudSynk MQTT Migration
-- Run against: cs_db_prod
-- Safe to re-run — each block checks before altering
-- ============================================================

-- ────────────────────────────────────────────
-- 1. Device lifecycle columns
-- ────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'activation_status')
    ALTER TABLE device ADD activation_status NVARCHAR(20) NOT NULL DEFAULT 'PENDING';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'mqtt_password')
    ALTER TABLE device ADD mqtt_password NVARCHAR(255) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'mqtt_username')
    ALTER TABLE device ADD mqtt_username NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'device_type')
    ALTER TABLE device ADD device_type NVARCHAR(50) NULL;
-- P1 | P2 | P3 | HKMI | GAS — reported by device on pre-activation

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'firmware_version')
    ALTER TABLE device ADD firmware_version NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'mac_address')
    ALTER TABLE device ADD mac_address NVARCHAR(50) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'first_seen')
    ALTER TABLE device ADD first_seen DATETIME NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'last_seen')
    ALTER TABLE device ADD last_seen DATETIME NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'activated_at')
    ALTER TABLE device ADD activated_at DATETIME NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'activated_by')
    ALTER TABLE device ADD activated_by INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'deactivated_at')
    ALTER TABLE device ADD deactivated_at DATETIME NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'deactivated_by')
    ALTER TABLE device ADD deactivated_by INT NULL;

-- ────────────────────────────────────────────
-- 2. Indexes
-- ────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_device_activation_status')
    CREATE INDEX IX_device_activation_status ON device (activation_status);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_device_mqtt_username')
    CREATE NONCLUSTERED INDEX IX_device_mqtt_username ON device (mqtt_username);

-- ────────────────────────────────────────────
-- 3. Migrate existing devices to ACTIVE
--    (devices already in the system are considered active)
-- ────────────────────────────────────────────

UPDATE device
SET activation_status = 'ACTIVE',
    mqtt_username     = device_id
WHERE activation_status = 'PENDING'
  AND client_id IS NOT NULL;  -- has a client = was already provisioned

-- ────────────────────────────────────────────
-- 4. Payment tables (optional — skip if not doing payment yet)
-- ────────────────────────────────────────────

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payment_plan')
BEGIN
    CREATE TABLE payment_plan (
        id               INT           IDENTITY(1,1) PRIMARY KEY,
        name             NVARCHAR(50)  NOT NULL,
        device_quota     INT           NOT NULL,
        price_monthly    DECIMAL(10,2) NOT NULL,
        price_annual     DECIMAL(10,2) NOT NULL,
        currency         NVARCHAR(10)  NOT NULL DEFAULT 'INR',
        razorpay_plan_id NVARCHAR(100) NULL,
        features         NVARCHAR(MAX) NULL,
        is_active        BIT           NOT NULL DEFAULT 1,
        created_at       DATETIME      NOT NULL DEFAULT GETUTCDATE()
    );

    -- Seed default plans
    INSERT INTO payment_plan (name, device_quota, price_monthly, price_annual, currency)
    VALUES
        ('Starter',    10,  2999,  29999,  'INR'),
        ('Growth',     50,  9999,  99999,  'INR'),
        ('Enterprise', 200, 29999, 299999, 'INR');
END

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'client_subscription')
    CREATE TABLE client_subscription (
        id                       INT           IDENTITY(1,1) PRIMARY KEY,
        client_id                INT           NOT NULL,
        plan_id                  INT           NOT NULL REFERENCES payment_plan(id),
        status                   NVARCHAR(20)  NOT NULL DEFAULT 'trialing',
        -- trialing | active | past_due | cancelled | expired
        razorpay_subscription_id NVARCHAR(100) NULL,
        billing_cycle            NVARCHAR(10)  NOT NULL DEFAULT 'monthly',
        current_period_start     DATETIME      NULL,
        current_period_end       DATETIME      NULL,
        grace_period_end         DATETIME      NULL,
        trial_end                DATETIME      NULL,
        cancelled_at             DATETIME      NULL,
        created_at               DATETIME      NOT NULL DEFAULT GETUTCDATE(),
        updated_at               DATETIME      NOT NULL DEFAULT GETUTCDATE()
    );

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payment_transaction')
    CREATE TABLE payment_transaction (
        id                 INT           IDENTITY(1,1) PRIMARY KEY,
        client_id          INT           NOT NULL,
        subscription_id    INT           NULL REFERENCES client_subscription(id),
        gateway            NVARCHAR(20)  NOT NULL,
        gateway_payment_id NVARCHAR(100) NOT NULL,
        amount             DECIMAL(10,2) NOT NULL,
        currency           NVARCHAR(10)  NOT NULL DEFAULT 'INR',
        status             NVARCHAR(20)  NOT NULL,
        event_type         NVARCHAR(50)  NOT NULL,
        raw_payload        NVARCHAR(MAX) NULL,
        created_at         DATETIME      NOT NULL DEFAULT GETUTCDATE()
    );

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('device') AND name = 'subscription_id')
    ALTER TABLE device ADD subscription_id INT NULL REFERENCES client_subscription(id);

-- ────────────────────────────────────────────
-- 5. Verify
-- ────────────────────────────────────────────

SELECT
    name,
    CASE
        WHEN name IN ('activation_status','mqtt_password','mqtt_username',
                      'device_type','firmware_version','mac_address',
                      'first_seen','last_seen','activated_at','activated_by',
                      'deactivated_at','deactivated_by','subscription_id')
        THEN '✅ added'
        ELSE '   existing'
    END AS status
FROM sys.columns
WHERE object_id = OBJECT_ID('device')
ORDER BY column_id;
