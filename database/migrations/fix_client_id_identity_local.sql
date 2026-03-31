-- Migration: Fix client_id to be an IDENTITY column on local dev DB
-- Root cause: local cs_db_dev was created without IDENTITY on client.client_id
--             Azure gendb_dev has IS_IDENTITY=1 (correct); this brings local into sync.
-- Note: SQL Server cannot ALTER a column to add IDENTITY - must recreate the table.

BEGIN TRANSACTION;

-- Step 1: Drop FK constraints that reference client.client_id
ALTER TABLE dbo.device         DROP CONSTRAINT FK_device_Client;
ALTER TABLE dbo.[user]         DROP CONSTRAINT FK_user_Client;
ALTER TABLE dbo.user_preferences DROP CONSTRAINT FK_user_preferences_Client;
ALTER TABLE dbo.client_device  DROP CONSTRAINT FK_client_device_Buyer;
ALTER TABLE dbo.client_device  DROP CONSTRAINT FK_client_device_Seller;
-- Self-referencing FK (parent_id -> client_id) must be dropped too
ALTER TABLE dbo.client         DROP CONSTRAINT FK_client_ParentClient;

-- Step 2: Rename existing table
EXEC sp_rename 'dbo.client', 'client_old';

-- Step 3: Recreate client with IDENTITY on client_id
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

-- Step 4: Copy existing data, preserving original IDs
SET IDENTITY_INSERT dbo.client ON;

INSERT INTO dbo.client (
    client_id, parent_id, name, email, phone, Address, contact_person,
    thinkspeak_subscription_info, city, state, is_active,
    created_by_user_id, created_at, updated_at, updated_by_user_id
)
SELECT
    client_id, parent_id, name, email, phone, Address, contact_person,
    thinkspeak_subscription_info, city, state, is_active,
    created_by_user_id, created_at, updated_at, updated_by_user_id
FROM dbo.client_old;

SET IDENTITY_INSERT dbo.client OFF;

-- Step 5: Drop old table
DROP TABLE dbo.client_old;

-- Step 6: Re-add FK constraints
ALTER TABLE dbo.client
    ADD CONSTRAINT FK_client_ParentClient
    FOREIGN KEY (parent_id) REFERENCES dbo.client(client_id);

ALTER TABLE dbo.device
    ADD CONSTRAINT FK_device_Client
    FOREIGN KEY (client_id) REFERENCES dbo.client(client_id);

ALTER TABLE dbo.[user]
    ADD CONSTRAINT FK_user_Client
    FOREIGN KEY (client_id) REFERENCES dbo.client(client_id);

ALTER TABLE dbo.user_preferences
    ADD CONSTRAINT FK_user_preferences_Client
    FOREIGN KEY (client_id) REFERENCES dbo.client(client_id);

ALTER TABLE dbo.client_device
    ADD CONSTRAINT FK_client_device_Buyer
    FOREIGN KEY (buyer_id) REFERENCES dbo.client(client_id);

ALTER TABLE dbo.client_device
    ADD CONSTRAINT FK_client_device_Seller
    FOREIGN KEY (seller_id) REFERENCES dbo.client(client_id);

COMMIT TRANSACTION;

PRINT 'Migration complete: client.client_id is now an IDENTITY column.';
