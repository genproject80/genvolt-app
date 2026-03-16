# Dashboard Changes Documentation

This document outlines all changes made to the Genvolt application dashboards.

---

## GPS Latitude & Longitude Column Swap

### Overview
The Latitude and Longitude values were swapped in the database columns. To display them correctly, we updated the frontend code to read from the swapped columns.

### Implementation Details

**Database Column Mapping:**
- Display Latitude → Read from database `Longitude` column
- Display Longitude → Read from database `Latitude` column

### Files Modified

#### 1. Dashboard Table Component
**File:** `client/src/components/dashboard/IoTDataTable.jsx`
**Lines:** 256-257
**Dashboards Affected:** HKMI Dashboard, Railway Dashboard

**Change Made:**
```javascript
// Before:
const lat = row?.Latitude;
const lng = row?.Longitude;

// After:
const lat = row?.Longitude;
const lng = row?.Latitude;
```

**Impact:**
- GPS location column in both HKMI and Railway dashboard tables now displays correct coordinates
- Format: `latitude,longitude` with 4 decimal places

---

#### 2. Device Detail Page - Communication & GPS Card
**File:** `client/src/components/deviceDetail/CommunicationGPSCard.jsx`
**Lines:** 23-24

**Change Made:**
```javascript
// Before:
const latitude = data?.Latitude;
const longitude = data?.Longitude;

// After:
const latitude = data?.Longitude;
const longitude = data?.Latitude;
```

**Impact:**
- GPS coordinates display correctly in the device detail page
- "View on Maps" button now opens Google Maps with correct coordinates
- Individual Latitude and Longitude fields show correct values (6 decimal places)

---

#### 3. Device Detail Page - Historic Data Table
**File:** `client/src/components/deviceDetail/HistoricDataTable.jsx`
**Line:** 250

**Change Made:**
```javascript
// Before:
{formatLocation(row.Latitude, row.Longitude)}

// After:
{formatLocation(row.Longitude, row.Latitude)}
```

**Impact:**
- Historic data table location column displays correct GPS coordinates
- Format: `latitude, longitude` with 6 decimal places

---

## Default Data Sorting by Entry_ID

### Overview
Updated the default sorting behavior for the IoT Data Table to display the latest data received first, based on Entry_ID in descending order.

### Implementation Details

**File:** `client/src/components/dashboard/IoTDataTable.jsx`
**Lines:** 183-184
**Dashboards Affected:** HKMI Dashboard, Railway Dashboard

**Change Made:**
```javascript
// Before:
const [sortField, setSortField] = useState('Timestamp');
const [sortOrder, setSortOrder] = useState('DESC');

// After:
const [sortField, setSortField] = useState('Entry_ID');
const [sortOrder, setSortOrder] = useState('DESC');
```

**Impact:**
- Data in both HKMI and Railway dashboards now sorts by Entry_ID in descending order by default
- Latest data entries appear at the top of the table
- Entry_ID represents the most recent data received from the devices
- Users can still manually change the sort order by clicking on column headers

---

## Motor Run Count Last 24Hrs Column

### Overview
Added a new column to both HKMI and Railway dashboards that displays the count of motor runs in the last 24 hours for each device.

### Business Logic
The motor is counted as "ran" when:
1. Number of Wheels Detected > Number of Wheels Configured
2. AND Train_Passed = 1

The column displays the total count of such events in the last 24 hours for each device.

### Implementation Details

#### Backend Changes

**File:** `server/controllers/iotDataController.js`

**Main Data Query (Lines 290-300):**
Added a LEFT JOIN with subquery to calculate motor run count:
```sql
LEFT JOIN (
  SELECT
    Device_ID,
    COUNT(*) as Motor_Run_Count_Last_24Hrs
  FROM iot_data_sick
  WHERE Device_ID IN (${devicePlaceholders})
    AND CreatedAt >= DATEADD(hour, -24, GETDATE())
    AND Number_of_Wheels_Detected > Number_of_Wheels_Configured
    AND Train_Passed = 1
  GROUP BY Device_ID
) motor_run ON iot.Device_ID = motor_run.Device_ID
```

**Note:** Uses `CreatedAt` field instead of `Timestamp` because the `Timestamp` field is NULL for all records in the database.

**Export Query (Lines 550-560):**
Same subquery logic added to the CSV/JSON export endpoint to ensure exported data includes motor run count.

#### Frontend Changes

**File:** `client/src/components/dashboard/IoTDataTable.jsx`

**Column Definition (Line 211):**
```javascript
{ key: 'motor_run_count', label: 'Motor Run Count Last 24Hrs', sortable: false, width: 'w-24', wrapHeader: true }
```

**Cell Formatting (Lines 266-268):**
```javascript
case 'motor_run_count':
  // Display motor run count for last 24 hours
  return row?.Motor_Run_Count_Last_24Hrs || 0;
```

### Files Modified

1. **Backend Controller:** `server/controllers/iotDataController.js`
   - Lines 290-300: Added motor run count subquery to main data query
   - Lines 550-560: Added motor run count subquery to export query
   - Line 277: Added motor run count to SELECT fields in main query
   - Line 537: Added motor run count to SELECT fields in export query

2. **Frontend Table Component:** `client/src/components/dashboard/IoTDataTable.jsx`
   - Line 211: Added column definition
   - Lines 266-268: Added cell formatting logic

### Impact

**Dashboards Affected:**
- HKMI Dashboard
- Railway Dashboard

**Features:**
- New column displays motor run count for last 24 hours
- Shows count of events where wheels detected exceeds configured AND train passed
- Updates automatically with rolling 24-hour window
- Displays "0" when no motor runs detected
- Column is non-sortable (calculated aggregate field)
- Included in CSV/JSON exports

### Technical Notes

- The count is calculated using SQL window over the last 24 hours from current time
- Uses `CreatedAt` field for time-based filtering (not `Timestamp` which is NULL in the database)
- Uses LEFT JOIN to ensure devices with zero motor runs still appear in results
- Time calculation uses SQL Server's `DATEADD(hour, -24, GETDATE())` with `CreatedAt` field
- Column is non-sortable because it's a calculated aggregate from a joined subquery
- Zero values are handled gracefully with `|| 0` fallback in frontend

### Important: Timestamp Field Issue

**Problem Discovered:** The `Timestamp` field in the `iot_data_sick` table is NULL for all 72,860+ records in the database.

**Available Timestamp Fields:**
- `CreatedAt` - Record creation timestamp (populated for all records)
- `InsertedAt` - Record insertion timestamp (populated for all records)
- `Timestamp` - NULL for all records ❌

**Solution Applied:**
All time-based queries use `CreatedAt` field instead of `Timestamp` to ensure the motor run count calculation works correctly.

**Data Validation Results:**
- Total records with motor runs (last 24 hours): 8 devices, 245 events
- Total records with motor runs (all-time): 26 devices, 23,341 events
- Percentage of records meeting motor run criteria: 32.04%

---

## Metrics Cards Changes

### Overview
Changes related to metrics cards and dashboard analytics displays.

### Files Modified

*(Note: Please add specific metrics card changes here as they are implemented)*

---

## Testing Checklist

### GPS Location Display
- [ ] HKMI Dashboard - GPS location column shows correct coordinates
- [ ] Railway Dashboard - GPS location column shows correct coordinates
- [ ] Device Detail Page - GPS card shows correct latitude
- [ ] Device Detail Page - GPS card shows correct longitude
- [ ] Device Detail Page - "View on Maps" opens correct location
- [ ] Historic Data Table - Location column shows correct coordinates

### Data Sorting
- [ ] HKMI Dashboard - Data sorted by Entry_ID descending by default
- [ ] Railway Dashboard - Data sorted by Entry_ID descending by default
- [ ] Latest entries appear at the top of the table
- [ ] Manual column sorting still works correctly

### Motor Run Count Last 24Hrs
- [ ] HKMI Dashboard - Motor Run Count column displays correctly
- [ ] Railway Dashboard - Motor Run Count column displays correctly
- [ ] Column shows "0" when no motor runs in last 24 hours
- [ ] Column shows correct count when devices have motor runs
- [ ] Count updates with rolling 24-hour window
- [ ] CSV export includes Motor_Run_Count_Last_24Hrs column
- [ ] JSON export includes Motor_Run_Count_Last_24Hrs field
- [ ] Column header wraps properly on smaller screens
- [ ] Values align correctly with other numeric columns

### Metrics Cards
- [ ] *(Add metrics card testing items as implemented)*

---

## Rollback Instructions

### GPS Changes
If needed, to revert the GPS changes, swap the column references back:

1. **IoTDataTable.jsx (lines 256-257):**
   ```javascript
   const lat = row?.Latitude;
   const lng = row?.Longitude;
   ```

2. **CommunicationGPSCard.jsx (lines 23-24):**
   ```javascript
   const latitude = data?.Latitude;
   const longitude = data?.Longitude;
   ```

3. **HistoricDataTable.jsx (line 250):**
   ```javascript
   {formatLocation(row.Latitude, row.Longitude)}
   ```

### Sorting Changes
If needed, to revert the default sorting back to Timestamp:

1. **IoTDataTable.jsx (line 183):**
   ```javascript
   const [sortField, setSortField] = useState('Timestamp');
   ```

### Motor Run Count Changes
If needed, to remove the Motor Run Count column:

1. **IoTDataTable.jsx (line 211):**
   Remove the column definition:
   ```javascript
   // Remove this line:
   { key: 'motor_run_count', label: 'Motor Run Count Last 24Hrs', sortable: false, width: 'w-24', wrapHeader: true },
   ```

2. **IoTDataTable.jsx (lines 266-268):**
   Remove the case statement:
   ```javascript
   // Remove this case:
   case 'motor_run_count':
     return row?.Motor_Run_Count_Last_24Hrs || 0;
   ```

3. **iotDataController.js (lines 290-300 in main query):**
   Remove the LEFT JOIN subquery:
   ```javascript
   // Remove this entire LEFT JOIN:
   LEFT JOIN (
     SELECT
       Device_ID,
       COUNT(*) as Motor_Run_Count_Last_24Hrs
     FROM iot_data_sick
     WHERE Device_ID IN (${devicePlaceholders})
       AND CreatedAt >= DATEADD(hour, -24, GETDATE())
       AND Number_of_Wheels_Detected > Number_of_Wheels_Configured
       AND Train_Passed = 1
     GROUP BY Device_ID
   ) motor_run ON iot.Device_ID = motor_run.Device_ID
   ```

4. **iotDataController.js (line 277):**
   Remove from SELECT fields:
   ```javascript
   // Remove this line:
   motor_run.Motor_Run_Count_Last_24Hrs
   ```

5. **iotDataController.js (lines 550-560 in export query):**
   Remove the same LEFT JOIN subquery from export query

6. **iotDataController.js (line 537):**
   Remove from export SELECT fields:
   ```javascript
   // Remove this line:
   motor_run.Motor_Run_Count_Last_24Hrs
   ```

---

## Notes

### GPS Changes
- All GPS changes maintain the same display format and validation logic
- No backend changes were required as the fix was implemented on the frontend
- The swap ensures that displayed coordinates match the actual physical location
- Google Maps integration continues to work correctly with the swapped values

### Sorting Changes
- Default sorting changed from Timestamp to Entry_ID for more accurate "latest data" display
- Entry_ID is auto-incremented and represents the order data was inserted into the database
- Users can still manually sort by any column by clicking column headers
- Sort order remains descending (DESC) to show latest entries first

### Motor Run Count Changes
- No database schema changes required - uses existing columns from iot_data_sick table
- Calculation performed at query time using SQL aggregation
- Uses `CreatedAt` field for time-based queries (not `Timestamp` which is NULL for all records)
- LEFT JOIN ensures devices with zero motor runs still appear in the table
- Count automatically updates with rolling 24-hour window on each page load
- Performance impact minimal as subquery filters by same device IDs as main query
- Column intentionally made non-sortable to avoid complex query performance issues
- Export functionality (CSV/JSON) includes the calculated motor run count

---

**Document Created:** 2025-12-19
**Last Updated:** 2025-12-19
**Version:** 1.3

---

## Changelog

### Version 1.3 (2025-12-19)
- Fixed motor run count calculation to use `CreatedAt` field instead of `Timestamp`
- Added timestamp field issue documentation and data validation results
- Updated all SQL queries in documentation to reflect correct field usage

### Version 1.2 (2025-12-19)
- Added Motor Run Count Last 24Hrs column feature
- Added testing checklist and rollback instructions for motor run count

### Version 1.1 (2025-12-19)
- Added default data sorting by Entry_ID

### Version 1.0 (2025-12-19)
- Initial documentation with GPS latitude/longitude swap fix
