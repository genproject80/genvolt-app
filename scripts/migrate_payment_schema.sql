-- =============================================================================
-- Payment Services Migration Script
-- Version: 1.0.0  |  Date: 2026-03-25
-- Description: Adds subscription plans, client subscriptions, and payment
--              transaction tables required for Razorpay billing integration.
--
-- Run this script ONCE against your SQL Server database via DBeaver.
-- Tables are created only if they do not already exist (idempotent).
-- =============================================================================

USE [cs_db_dev];  -- change to your target database name

-- ---------------------------------------------------------------------------
-- 1. SubscriptionPlans
--    Defines the tiers available to clients (Basic / Pro / Enterprise).
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'SubscriptionPlans'
)
BEGIN
  CREATE TABLE SubscriptionPlans (
    plan_id                   INT            IDENTITY(1,1) PRIMARY KEY,
    name                      NVARCHAR(100)  NOT NULL,           -- "Basic", "Pro", "Enterprise"
    description               NVARCHAR(500)  NULL,
    max_devices               INT            NOT NULL,           -- -1 = unlimited
    price_monthly             DECIMAL(10,2)  NOT NULL,           -- INR amount
    price_yearly              DECIMAL(10,2)  NOT NULL,           -- INR amount (discounted)
    grace_days                INT            NOT NULL DEFAULT 7, -- grace period after expiry
    features                  NVARCHAR(MAX)  NULL,               -- JSON array: ["feature1","feature2"]
    razorpay_plan_id_monthly  NVARCHAR(100)  NULL,               -- Razorpay recurring plan ID
    razorpay_plan_id_yearly   NVARCHAR(100)  NULL,
    is_active                 BIT            NOT NULL DEFAULT 1,
    created_at                DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_at                DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );

  PRINT 'Created table: SubscriptionPlans';
END
ELSE
  PRINT 'Table already exists: SubscriptionPlans (skipped)';

-- ---------------------------------------------------------------------------
-- 2. Seed default subscription plans
--    Skip insert if plans already exist.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM SubscriptionPlans WHERE name = 'Basic')
BEGIN
  INSERT INTO SubscriptionPlans
    (name, description, max_devices, price_monthly, price_yearly, grace_days, features, is_active)
  VALUES
    (
      'Basic',
      'Ideal for small deployments. Up to 5 active devices.',
      5,
      999.00,
      9990.00,
      7,
      '["Up to 5 devices","Real-time monitoring","Email support","7-day grace period"]',
      1
    ),
    (
      'Pro',
      'For growing teams. Up to 25 active devices with priority support.',
      25,
      2999.00,
      29990.00,
      14,
      '["Up to 25 devices","Real-time monitoring","Priority email support","Advanced analytics","14-day grace period"]',
      1
    ),
    (
      'Enterprise',
      'Unlimited devices with dedicated support and custom integrations.',
      -1,
      7999.00,
      79990.00,
      30,
      '["Unlimited devices","Real-time monitoring","Dedicated support","Advanced analytics","Custom integrations","30-day grace period"]',
      1
    );

  PRINT 'Seeded 3 subscription plans (Basic, Pro, Enterprise)';
END
ELSE
  PRINT 'Subscription plans already seeded (skipped)';

-- ---------------------------------------------------------------------------
-- 3. ClientSubscriptions
--    One row per subscription period per client.
--    Status lifecycle: PENDING → ACTIVE → GRACE → EXPIRED | CANCELLED
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'ClientSubscriptions'
)
BEGIN
  CREATE TABLE ClientSubscriptions (
    subscription_id           INT            IDENTITY(1,1) PRIMARY KEY,
    client_id                 INT            NOT NULL
                                             REFERENCES client(client_id),
    plan_id                   INT            NOT NULL
                                             REFERENCES SubscriptionPlans(plan_id),
    status                    NVARCHAR(20)   NOT NULL DEFAULT 'PENDING',
                                             -- PENDING | ACTIVE | GRACE | EXPIRED | CANCELLED
    billing_cycle             NVARCHAR(10)   NOT NULL DEFAULT 'monthly',
                                             -- monthly | yearly
    start_date                DATETIME2      NULL,
    end_date                  DATETIME2      NULL,
    grace_end_date            DATETIME2      NULL,   -- end_date + grace_days
    razorpay_subscription_id  NVARCHAR(100)  NULL,
    razorpay_customer_id      NVARCHAR(100)  NULL,
    auto_renew                BIT            NOT NULL DEFAULT 1,
    cancelled_at              DATETIME2      NULL,
    cancellation_reason       NVARCHAR(500)  NULL,
    created_at                DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_at                DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    created_by_user_id        INT            NULL
                                             REFERENCES [user](user_id)
  );

  CREATE INDEX IX_ClientSubscriptions_client
    ON ClientSubscriptions(client_id);

  CREATE INDEX IX_ClientSubscriptions_status
    ON ClientSubscriptions(status);

  CREATE INDEX IX_ClientSubscriptions_end_date
    ON ClientSubscriptions(end_date)
    WHERE status IN ('ACTIVE', 'GRACE');

  PRINT 'Created table: ClientSubscriptions';
END
ELSE
  PRINT 'Table already exists: ClientSubscriptions (skipped)';

-- ---------------------------------------------------------------------------
-- 4. PaymentTransactions
--    Immutable ledger — one row per Razorpay order/payment attempt.
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'PaymentTransactions'
)
BEGIN
  CREATE TABLE PaymentTransactions (
    transaction_id        INT            IDENTITY(1,1) PRIMARY KEY,
    subscription_id       INT            NOT NULL
                                         REFERENCES ClientSubscriptions(subscription_id),
    client_id             INT            NOT NULL
                                         REFERENCES client(client_id),
    razorpay_order_id     NVARCHAR(100)  NULL,
    razorpay_payment_id   NVARCHAR(100)  NULL,
    razorpay_signature    NVARCHAR(500)  NULL,
    amount                DECIMAL(10,2)  NOT NULL,   -- INR in rupees (not paise)
    currency              NVARCHAR(5)    NOT NULL DEFAULT 'INR',
    status                NVARCHAR(20)   NOT NULL DEFAULT 'PENDING',
                                         -- PENDING | COMPLETED | FAILED | REFUNDED
    payment_mode          NVARCHAR(50)   NULL,       -- upi | card | netbanking | wallet
    failure_reason        NVARCHAR(500)  NULL,
    invoice_number        NVARCHAR(50)   NULL,       -- INV-2026-0001
    created_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE()
  );

  CREATE INDEX IX_PaymentTransactions_client
    ON PaymentTransactions(client_id);

  CREATE INDEX IX_PaymentTransactions_subscription
    ON PaymentTransactions(subscription_id);

  CREATE UNIQUE INDEX IX_PaymentTransactions_razorpay_order
    ON PaymentTransactions(razorpay_order_id)
    WHERE razorpay_order_id IS NOT NULL;

  PRINT 'Created table: PaymentTransactions';
END
ELSE
  PRINT 'Table already exists: PaymentTransactions (skipped)';

-- ---------------------------------------------------------------------------
-- 5. Add activation_blocked_reason to device table
--    Records WHY a device cannot be activated (subscription-related).
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1
  FROM   sys.columns
  WHERE  object_id = OBJECT_ID('device')
    AND  name      = 'activation_blocked_reason'
)
BEGIN
  ALTER TABLE device
    ADD activation_blocked_reason NVARCHAR(200) NULL;
    -- Values: NULL (no block) | 'NO_SUBSCRIPTION' | 'PLAN_LIMIT' |
    --         'GRACE_PERIOD'  | 'SUBSCRIPTION_EXPIRED'

  PRINT 'Added column: device.activation_blocked_reason';
END
ELSE
  PRINT 'Column already exists: device.activation_blocked_reason (skipped)';

-- ---------------------------------------------------------------------------
-- 6. Seed billing permissions
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM permissions WHERE permission_name = 'View Billing'
)
BEGIN
  INSERT INTO permissions (permission_name)
  VALUES
    ('View Billing'),
    ('Manage Subscriptions'),
    ('Override Subscription');

  PRINT 'Seeded billing permissions';
END
ELSE
  PRINT 'Billing permissions already seeded (skipped)';

-- ---------------------------------------------------------------------------
-- 7. Assign billing permissions to roles
--    SYSTEM_ADMIN and SUPER_ADMIN get all three.
--    CLIENT_ADMIN gets View Billing only.
-- ---------------------------------------------------------------------------
DECLARE @viewBillingId     INT;
DECLARE @manageSubId       INT;
DECLARE @overrideSubId     INT;
DECLARE @sysAdminRoleId    INT;
DECLARE @superAdminRoleId  INT;
DECLARE @clientAdminRoleId INT;

SELECT @viewBillingId    = permission_id FROM permissions WHERE permission_name = 'View Billing';
SELECT @manageSubId      = permission_id FROM permissions WHERE permission_name = 'Manage Subscriptions';
SELECT @overrideSubId    = permission_id FROM permissions WHERE permission_name = 'Override Subscription';
SELECT @sysAdminRoleId   = role_id       FROM role WHERE role_name = 'SYSTEM_ADMIN';
SELECT @superAdminRoleId = role_id       FROM role WHERE role_name = 'SUPER_ADMIN';
SELECT @clientAdminRoleId= role_id       FROM role WHERE role_name = 'CLIENT_ADMIN';

-- SYSTEM_ADMIN — all billing permissions
IF @sysAdminRoleId IS NOT NULL AND @viewBillingId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = @sysAdminRoleId AND permission_id = @viewBillingId)
    INSERT INTO role_permission (role_id, permission_id) VALUES (@sysAdminRoleId, @viewBillingId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = @sysAdminRoleId AND permission_id = @manageSubId)
    INSERT INTO role_permission (role_id, permission_id) VALUES (@sysAdminRoleId, @manageSubId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = @sysAdminRoleId AND permission_id = @overrideSubId)
    INSERT INTO role_permission (role_id, permission_id) VALUES (@sysAdminRoleId, @overrideSubId);
END

-- SUPER_ADMIN — all billing permissions
IF @superAdminRoleId IS NOT NULL AND @viewBillingId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = @superAdminRoleId AND permission_id = @viewBillingId)
    INSERT INTO role_permission (role_id, permission_id) VALUES (@superAdminRoleId, @viewBillingId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = @superAdminRoleId AND permission_id = @manageSubId)
    INSERT INTO role_permission (role_id, permission_id) VALUES (@superAdminRoleId, @manageSubId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = @superAdminRoleId AND permission_id = @overrideSubId)
    INSERT INTO role_permission (role_id, permission_id) VALUES (@superAdminRoleId, @overrideSubId);
END

-- CLIENT_ADMIN — View Billing only
IF @clientAdminRoleId IS NOT NULL AND @viewBillingId IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id = @clientAdminRoleId AND permission_id = @viewBillingId)
    INSERT INTO role_permission (role_id, permission_id) VALUES (@clientAdminRoleId, @viewBillingId);
END

PRINT 'Assigned billing permissions to roles';

PRINT '=== Payment schema migration complete ===';
