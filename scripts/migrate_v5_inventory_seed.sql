-- =============================================================
-- Genvolt / CloudSynk Platform — v5.0 Inventory Seed
-- Database: cs_db_dev  |  Schema: dbo
-- Idempotent: safe to run multiple times.
-- Run AFTER migrate_v5.sql
-- Covers: inventory model entries for all device types
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- Decoder logicId reference (server/decoders/logicId*.js):
--   1 = GV-M1     Voltage/Power          (voltage_mv, current_ma, power_mw)              8 bytes
--   2 = GV-ENV1   Temp/Humidity          (temperature_c, humidity_pct, pressure_hpa)      8 bytes
--   3 = GV-GPS1   GPS/Location           (latitude, longitude, altitude_m, speed, sats)  13 bytes
--   4 = GV-M2     Energy Meter v2        (+ power_factor)                                10 bytes
--   5 = GV-PRO1   Energy + Environment   (combined single frame)                         16 bytes
--   6 = GV-FLT1   Energy + GPS           (combined single frame)                         21 bytes
--   7 = EV-M1     EV Charger             (+ energy_wh session counter)                   12 bytes
--   8 = GV-ULTRA1 All Sensors            (energy + environment + GPS)                    29 bytes
-- ─────────────────────────────────────────────────────────────

-- 1. GV-M1 — already seeded by migrate_v5.sql, skip if exists
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'GV-M1')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'GV-M1',
    'GenVolt Meter v1',
    'GV',
    '[1]',
    'Default energy meter — voltage, current, power (logicId 1)'
  );
  PRINT 'Seeded: GV-M1';
END
ELSE
  PRINT 'GV-M1 already exists — skipped';

-- 2. GV-M2 — GenVolt Meter v2 (logicId 4 — adds power_factor field)
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'GV-M2')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'GV-M2',
    'GenVolt Meter v2',
    'GV',
    '[4]',
    'Energy meter v2 — voltage, current, power, power_factor (logicId 4). 10-byte payload.'
  );
  PRINT 'Seeded: GV-M2';
END
ELSE
  PRINT 'GV-M2 already exists — skipped';

-- 3. GV-ENV1 — Environmental Sensor
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'GV-ENV1')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'GV-ENV1',
    'GenVolt Environmental Sensor v1',
    'ENV',
    '[2]',
    'Ambient sensor — temperature (°C), humidity (%), pressure (hPa) (logicId 2).'
  );
  PRINT 'Seeded: GV-ENV1';
END
ELSE
  PRINT 'GV-ENV1 already exists — skipped';

-- 4. GV-GPS1 — GPS Tracker
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'GV-GPS1')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'GV-GPS1',
    'GenVolt GPS Tracker v1',
    'GPS',
    '[3]',
    'Asset tracker — latitude, longitude, altitude, speed, satellite count (logicId 3).'
  );
  PRINT 'Seeded: GV-GPS1';
END
ELSE
  PRINT 'GV-GPS1 already exists — skipped';

-- 5. GV-PRO1 — Multi-Sensor Pro (logicId 5 — combined energy + environment in one frame)
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'GV-PRO1')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'GV-PRO1',
    'GenVolt Pro Multi-Sensor v1',
    'GVP',
    '[5]',
    'Energy + environment combined frame (logicId 5). 16-byte payload: voltage, current, power, temperature, humidity, pressure.'
  );
  PRINT 'Seeded: GV-PRO1';
END
ELSE
  PRINT 'GV-PRO1 already exists — skipped';

-- 6. GV-FLT1 — Fleet Tracker (logicId 6 — combined energy + GPS in one frame)
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'GV-FLT1')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'GV-FLT1',
    'GenVolt Fleet Tracker v1',
    'FLT',
    '[6]',
    'Vehicle energy + GPS combined frame (logicId 6). 21-byte payload: voltage, current, power, lat, lng, altitude, speed, satellites.'
  );
  PRINT 'Seeded: GV-FLT1';
END
ELSE
  PRINT 'GV-FLT1 already exists — skipped';

-- 7. EV-M1 — EV Charger Meter (logicId 7 — energy + session energy_wh counter)
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'EV-M1')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'EV-M1',
    'EV Charger Meter v1',
    'EV',
    '[7]',
    'EV charging station meter (logicId 7). 12-byte payload: voltage, current, power, energy_wh (session counter).'
  );
  PRINT 'Seeded: EV-M1';
END
ELSE
  PRINT 'EV-M1 already exists — skipped';

-- 8. GV-ULTRA1 — All-in-one (logicId 8 — all sensors in a single combined frame)
IF NOT EXISTS (SELECT 1 FROM dbo.inventory WHERE model_number = 'GV-ULTRA1')
BEGIN
  INSERT INTO dbo.inventory (model_number, display_name, device_id_prefix, decoder_logic_ids, description)
  VALUES (
    'GV-ULTRA1',
    'GenVolt Ultra v1',
    'GVU',
    '[8]',
    'All-in-one combined frame (logicId 8). 29-byte payload: voltage, current, power, temperature, humidity, pressure, lat, lng, altitude, speed, satellites.'
  );
  PRINT 'Seeded: GV-ULTRA1';
END
ELSE
  PRINT 'GV-ULTRA1 already exists — skipped';

PRINT '=== v5.0 inventory seed complete ===';

-- Verify
SELECT model_number, display_name, device_id_prefix, decoder_logic_ids, is_active
FROM dbo.inventory
ORDER BY model_number;
