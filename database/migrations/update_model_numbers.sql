/*
  Update model_number in inventory and device tables
  ───────────────────────────────────────────────────
  HK  →  HKSS2WCV1
  HY  →  HYPEOP1WCV1

  model_number is the PK of dbo.inventory and FK in dbo.device,
  so we: INSERT new row → UPDATE device FK → DELETE old row.
  Wrapped in a transaction for safety.
*/

BEGIN TRANSACTION;

BEGIN TRY

  -- ============================================================
  -- 1. HK → HKSS2WCV1
  -- ============================================================

  -- Insert new inventory row copying all data
  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids,
     description, is_active, created_at, updated_at, device_counter)
  SELECT
    'HKSS2WCV1', display_name, device_id_prefix, decoder_logic_ids,
    description, is_active, created_at, GETUTCDATE(), device_counter
  FROM dbo.inventory
  WHERE model_number = 'HK';

  -- Update device references
  UPDATE dbo.device
  SET model_number = 'HKSS2WCV1'
  WHERE model_number = 'HK';

  -- Delete old row
  DELETE FROM dbo.inventory WHERE model_number = 'HK';

  PRINT 'HK → HKSS2WCV1 done';

  -- ============================================================
  -- 2. HY → HYPEOP1WCV1
  -- ============================================================

  INSERT INTO dbo.inventory
    (model_number, display_name, device_id_prefix, decoder_logic_ids,
     description, is_active, created_at, updated_at, device_counter)
  SELECT
    'HYPEOP1WCV1', display_name, device_id_prefix, decoder_logic_ids,
    description, is_active, created_at, GETUTCDATE(), device_counter
  FROM dbo.inventory
  WHERE model_number = 'HY';

  UPDATE dbo.device
  SET model_number = 'HYPEOP1WCV1'
  WHERE model_number = 'HY';

  DELETE FROM dbo.inventory WHERE model_number = 'HY';

  PRINT 'HY → HYPEOP1WCV1 done';

  -- ============================================================
  -- Verify
  -- ============================================================
  SELECT model_number, display_name, device_id_prefix, device_counter
  FROM dbo.inventory
  WHERE model_number IN ('HKSS2WCV1', 'HYPEOP1WCV1');

  COMMIT TRANSACTION;
  PRINT 'All model_number updates committed successfully.';

END TRY
BEGIN CATCH
  ROLLBACK TRANSACTION;
  PRINT 'ERROR — transaction rolled back:';
  PRINT ERROR_MESSAGE();
END CATCH;
