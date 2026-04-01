-- Feature Flags table
-- Run this migration to enable the feature flag system.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'FeatureFlags')
BEGIN
  CREATE TABLE FeatureFlags (
    flag_id      INT IDENTITY(1,1) PRIMARY KEY,
    flag_name    NVARCHAR(100)  NOT NULL UNIQUE,
    display_name NVARCHAR(200)  NOT NULL,
    description  NVARCHAR(500)  NULL,
    is_enabled   BIT            NOT NULL DEFAULT 0,
    updated_at   DATETIME       NOT NULL DEFAULT GETUTCDATE(),
    updated_by   INT            NULL
  );

  -- Seed: payments / billing feature flag (disabled by default)
  INSERT INTO FeatureFlags (flag_name, display_name, description, is_enabled)
  VALUES (
    'payments_enabled',
    'Payments / Billing',
    'Controls visibility of billing, subscription plans, discounts, and payment features across the platform.',
    0
  );

  PRINT 'FeatureFlags table created and seeded.';
END
ELSE
BEGIN
  PRINT 'FeatureFlags table already exists — skipping.';
END
