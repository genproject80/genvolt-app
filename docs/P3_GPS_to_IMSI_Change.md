# P3 Decoder: GPS → IMSI Field Replacement

**Date:** 2026-04-10
**Reference:** `New_SS_conversion_logic.json`

---

## Summary

The P3 SICK sensor payload structure has been redefined. Blocks 2, 3, and 4 of the 64-character hex string previously carried GPS data (latitude/longitude). They now carry the device IMSI number (split across two blocks) and an unused block.

This change removes `Latitude` and `Longitude` from all layers (decoder → database → web app) and adds a single combined `IMSI` column. Blocks 2 and 3 are decoded separately as decimals then concatenated to form the full 15-digit IMSI string.

---

## Payload Block Layout

Input example: `740c020b 003da92d 0505c16b 00000000 00000000 00000000 00002f96 00000013`

| Block | Hex Chars | Old Meaning | New Meaning |
|-------|-----------|-------------|-------------|
| Block 1 | `740c020b` | Event/Signal/Motor/Wheel | **Unchanged** |
| Block 2 | `003da92d` | GPS integers (Lat LE uint16, Lon LE uint16) | IMSI part 1 → `hex_to_decimal` = **4041005** |
| Block 3 | `0505c16b` | Latitude decimal (uint32 BE) | IMSI part 2 → `hex_to_decimal` = **84263275** |
| Block 4 | `00000000` | Longitude decimal (uint32 BE) | **Unused** (skip) |
| Block 5 | `00000000` | Wheels + Average Current | **Unchanged** |
| Block 6 | `00000000` | Min Current + Max Current | **Unchanged** |
| Block 7 | `00002f96` | Flags (1 byte) + Battery Voltage | Flags now read as 2-byte word (same bit positions) |
| Block 8 | `00000013` | Debug Value | **Unchanged** |

### IMSI Combination

Both parts are converted to decimal strings and concatenated:

```
Block 2: 0x003da92d → 4041005
Block 3: 0x0505c16b → 84263275
IMSI    = "4041005" + "84263275" = "404100584263275"  (15 digits)
```

Stored as `NVARCHAR(20)` — not a numeric type — to safely preserve any leading zeros in future payloads.

### Block 7 Flags — Mask Change

| Flag | Old mask (1-byte) | New mask (2-byte word) | Effect |
|------|-------------------|------------------------|--------|
| `Train_Passed_Flag` | `0x80` (bit 7 of byte 0) | `0x8000` (bit 15 of uint16) | Equivalent — same bit |
| `Motor_ON_Flag` | `0x40` (bit 6 of byte 0) | `0x4000` (bit 14 of uint16) | Equivalent — same bit |

---

## Database Changes

**Table:** `dbo.IoT_Data_Sick_P3`

Two migrations were applied in sequence:

### Migration 1 — `p3_replace_gps_with_imsi.sql`

Removes GPS columns (blocked by an existing index on `Latitude`):

```sql
-- Drop index that depends on Latitude
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_IoT_Data_Sick_P3_Device_Ts'
      AND object_id = OBJECT_ID('dbo.IoT_Data_Sick_P3')
)
    DROP INDEX IX_IoT_Data_Sick_P3_Device_Ts ON dbo.IoT_Data_Sick_P3;

ALTER TABLE dbo.IoT_Data_Sick_P3
    DROP COLUMN Latitude, Longitude;

ALTER TABLE dbo.IoT_Data_Sick_P3
    ADD IMSI_Number BIGINT NULL, IMSI_Number_Part2 BIGINT NULL;

CREATE INDEX IX_IoT_Data_Sick_P3_Device_Ts
    ON dbo.IoT_Data_Sick_P3 (Device_ID, Timestamp);
```

### Migration 2 — `p3_combine_imsi_columns.sql`

Collapses the two intermediate columns into a single `IMSI` field:

```sql
ALTER TABLE dbo.IoT_Data_Sick_P3
    DROP COLUMN IMSI_Number, IMSI_Number_Part2;

ALTER TABLE dbo.IoT_Data_Sick_P3
    ADD IMSI NVARCHAR(20) NULL;
```

**Final schema change:** `Latitude`, `Longitude` removed → `IMSI NVARCHAR(20)` added.

---

## Files Modified

### Python — Local Subscriber

#### `decoder-script/decoders/device_decoders/p3_sick_decoder.py`

- **Removed** Block 2/3/4 GPS parsing
- **Added** IMSI combination:
  ```python
  imsi_part1 = str(int(blocks[1], 16))   # 003da92d → "4041005"
  imsi_part2 = str(int(blocks[2], 16))   # 0505c16b → "84263275"
  imsi = imsi_part1 + imsi_part2         # → "404100584263275"
  # Block 4: Unused — skip
  ```
- **Block 7 flags** updated to 2-byte word:
  ```python
  flags_word = int(block7[0:4], 16)
  TRAIN_PASSED_FLAG_MASK = 0x8000
  MOTOR_ON_FLAG_MASK = 0x4000
  ```
- **Return dict:** removed `Latitude`, `Longitude`; added `IMSI`

#### `decoder-script/local_subscriber.py`

- `P3_FIELD_MAPPING`: replaced `Latitude`/`Longitude` with `IMSI`
- `UPSERT_P3`: updated column list and `?` placeholder count (21 → 20)
- `insert_to_iot_data_sick_p3()`: updated both update and insert argument sections

---

### Node.js Web App — Decoder & Handler

#### `genvolt-app/server/decoders/hk_decoder.js`

- **Replaced** GPS block reads with:
  ```js
  const imsi = `${buf.readUInt32BE(4)}${buf.readUInt32BE(8)}`;
  // Block 4 (bytes 12-15) — Unused
  ```
- **Block 7 flags:** `readUInt8(24)` → `readUInt16BE(24)`; masks updated to `0x8000` / `0x4000`
- **Return object:** removed `Latitude`, `Longitude`; added `IMSI`

#### `genvolt-app/server/telemetry/sickP3Handler.js`

- INSERT column: `IMSI` (replaces `Latitude, Longitude`)
- Param: `imsi: { value: decoded.IMSI, type: sql.NVarChar(20) }`

---

### Node.js Web App — Controllers

#### `genvolt-app/server/controllers/p3DataController.js`

- SELECT: `p3.IMSI` (replaces `p3.Latitude`, `p3.Longitude`)
- `allowedSortFields`: replaced `'Latitude'`, `'Longitude'` with `'IMSI'`

#### `genvolt-app/server/controllers/p3DeviceDetailController.js`

- Both SELECT queries (main detail + history): `p3.IMSI`
- `responseData` top-level: `IMSI: deviceData.IMSI`
- `communication_gps` block: `imsi: deviceData.IMSI`

---

### Frontend — React Components

#### `genvolt-app/client/src/components/p3DeviceDetail/P3CommunicationGPSCard.jsx`

- Removed all GPS variables, GPS Location link, Latitude/Longitude rows, column-swap workaround
- Added single IMSI row: `const imsi = commGps?.imsi ?? data?.IMSI`
- Renamed card heading: `"Communication & GPS"` → `"Communication & IMSI"`

#### `genvolt-app/client/src/components/dashboard/P3DataTable.jsx`

- Column `gps_location` → `imsi_number` (label: "IMSI Number")
- Cell value: `row?.IMSI`

#### `genvolt-app/client/src/components/p3DeviceDetail/P3HistoricDataTable.jsx`

- Column header: `"Location"` → `"IMSI Number"`
- Cell value: `row.IMSI`
- Removed `formatLocation()` helper function

---

## Verification

After deployment, test with the reference payload:

```
Input:  740c020b003da92d0505c16b00000000000000000000000000002f9600000013
```

**Expected decoded output:**

| Field | Expected Value |
|-------|---------------|
| `Event_Type` | 7 |
| `Signal_Strength` | 4 |
| `Motor_ON_Time_sec` | 12 |
| `Motor_OFF_Time_min` | 2 |
| `Wheel_Threshold` | 11 |
| `IMSI` | `"404100584263275"` |
| `Number_of_Wheels_Detected` | 0 |
| `Motor_Current_Average_mA` | 0 |
| `Motor_Current_Min_mA` | 0 |
| `Motor_Current_Max_mA` | 0 |
| `Train_Passed_Flag` | 0 |
| `Motor_ON_Flag` | 0 |
| `Battery_Voltage_mV` | 12182 |
| `Debug_Value` | 19 |
| `Latitude` | **not present** |
| `Longitude` | **not present** |

---

## Production Deployment

### Deployment Order

> **Critical:** The DB migration must run before any new code goes live. New code writes to `IMSI`; old code writes to `Latitude`/`Longitude`. Running both simultaneously against a mismatched schema will cause INSERT failures.

```
Step 1: DB migration on cs_db_prod
Step 2: Python subscriber update (Azure VM)
Step 3: Node.js + Frontend (push decoder-migration branch → GitHub Actions auto-deploys)
```

---

### Step 1 — Production Database Migration

Connect to `cs_db_prod` via SSMS or Azure Portal Query Editor. Run both scripts in order.

**Migration 1** — `database/migrations/p3_replace_gps_with_imsi.sql`:

```sql
IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_IoT_Data_Sick_P3_Device_Ts'
      AND object_id = OBJECT_ID('dbo.IoT_Data_Sick_P3')
)
    DROP INDEX IX_IoT_Data_Sick_P3_Device_Ts ON dbo.IoT_Data_Sick_P3;

ALTER TABLE dbo.IoT_Data_Sick_P3 DROP COLUMN Latitude, Longitude;
ALTER TABLE dbo.IoT_Data_Sick_P3 ADD IMSI_Number BIGINT NULL, IMSI_Number_Part2 BIGINT NULL;

CREATE INDEX IX_IoT_Data_Sick_P3_Device_Ts
    ON dbo.IoT_Data_Sick_P3 (Device_ID, Timestamp);
```

**Migration 2** — `database/migrations/p3_combine_imsi_columns.sql`:

```sql
ALTER TABLE dbo.IoT_Data_Sick_P3 DROP COLUMN IMSI_Number, IMSI_Number_Part2;
ALTER TABLE dbo.IoT_Data_Sick_P3 ADD IMSI NVARCHAR(20) NULL;
```

**Verify:**
```sql
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'IoT_Data_Sick_P3'
ORDER BY ORDINAL_POSITION;
-- Expect: IMSI NVARCHAR present, Latitude/Longitude absent

SELECT TOP 1 IMSI FROM dbo.IoT_Data_Sick_P3;
-- Should return without error
```

---

### Step 2 — Python Subscriber (Azure VM)

Run from `E:\CloudSynk_MQTT_Setup_Testing\MQTTV2\` on your local machine:

```bash
scp decoder-script/decoders/device_decoders/p3_sick_decoder.py \
    mqttvm@20.198.101.175:/opt/cloudsynk-subscriber/decoders/device_decoders/

scp decoder-script/local_subscriber.py \
    mqttvm@20.198.101.175:/opt/cloudsynk-subscriber/
```

Then SSH into the VM and restart the service:

```bash
sudo systemctl restart cloudsynk-subscriber
sudo systemctl status cloudsynk-subscriber
sudo journalctl -u cloudsynk-subscriber -n 50 --no-pager
```

Confirm clean startup — no Python tracebacks.

---

### Step 3 — Node.js Backend + React Frontend

Push the `decoder-migration` branch to GitHub. The production workflows auto-deploy:

- `azure-backend-deploy_prod.yml` → Azure App Service (Node.js backend)
- `azure-frontend-deploy_prod.yml` → Azure Static Web Apps (React frontend, `client/dist/`)

Monitor progress in the **GitHub Actions** tab on `genproject80/genvolt-app`.

---

### Post-Deploy Verification

| Check | Command / Action | Expected |
|-------|-----------------|----------|
| DB schema | `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'IoT_Data_Sick_P3'` | `IMSI` present, `Latitude`/`Longitude` absent |
| New rows | `SELECT TOP 5 Device_ID, IMSI, CreatedAt FROM dbo.IoT_Data_Sick_P3 ORDER BY CreatedAt DESC` | 15-digit IMSI strings on new rows |
| Python | `journalctl -u cloudsynk-subscriber -f` after a live P3 message | No errors |
| Web app | Open P3 device detail on `iot.cloudsynk.net` | Card title = "Communication & IMSI"; History table = "IMSI Number" column |

---

### Rollback Notes

The DB migration is **irreversible** — `Latitude`/`Longitude` data is permanently dropped. Do not attempt schema rollback.

If code rollback is needed after the migration:
- Revert the `decoder-migration` git commit and push — GitHub Actions redeploys the prior build.
- Python: `scp` the previous files back and restart the service.
- **Note:** old code will error against the new schema (no GPS columns). A supplementary migration adding dummy nullable columns would be required to unblock old code.
