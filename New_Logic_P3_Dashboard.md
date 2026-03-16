# P3 Logic Dashboard - Requirements & Development Documentation

**Document Version:** 1.1
**Created:** 2026-01-04
**Project:** GenVolt IoT Dashboard
**Database:** gendb_dev (Development)

---

## Quick Reference: Feature Checklist

This section provides a comprehensive checklist of all features implemented in the P3 Dashboard and Device Detail Page. Use this as a reference when replicating these features for other device types.

### P3 Dashboard Features

#### Data & Filtering
- [ ] **Hierarchy Filtering** - Filter by SDEN, DEN, AEN, SSE (4-level management hierarchy)
- [ ] **Search** - Search by Device_ID, machine_id, section
- [ ] **Event Date Filter** - Date picker to filter Motor Runs and Train Passed counts by specific date (defaults to today)
- [ ] **Pagination** - 20 records per page, max 100
- [ ] **Sorting** - Sortable columns with ASC/DESC toggle

#### Actions
- [ ] **Export CSV** - Export data to CSV format
- [ ] **Export JSON** - Export data to JSON format
- [ ] **Refresh Button** - Manual data refresh with loading spinner animation (maintains current page)

#### Visual Indicators
- [ ] **GSM Signal Strength** - 6-bar visual indicator (0-6 scale)
- [ ] **Grease Level** - Color-coded: Green (≥8kg), Yellow (5-8kg), Red (<5kg)
- [ ] **Device Status Badge** - Active (green) or Inactive (red) with "last seen" time
  - Active: Data received within last 90 minutes
  - Inactive: No data in last 90 minutes
  - Time format: `Xm ago` (minutes), `Xh ago` (hours), `Xd ago` (days)

#### Calculated Columns
- [ ] **Motor Runs** - COUNT of records where `Event_Type = 2` (filtered by Event Date if selected)
- [ ] **Train Passed** - COUNT of records where `Event_Type = 2 OR Event_Type = 3` (filtered by Event Date if selected)
- [ ] **Minutes Since Last Data** - DATEDIFF from last `CreatedAt` to current time
- [ ] **Days Since Service** - DATEDIFF from `last_service_date` to today

---

### P3 Device Detail Page Features

**Route:** `/dashboard/p3-device/:entryId`

#### Current Device Status Card (NEW - Top Section)
- [ ] **Device Status** - Shows real-time status from latest record (Active/Inactive within 90 min)
- [ ] **Communication** - Based on actual GSM signal strength (0-6 scale) with timestamp
  - Connected (green): GSM ≥ 4
  - Weak Signal (yellow): GSM 2-3
  - Poor Signal (orange): GSM 1
  - No Signal (red): GSM 0
- [ ] **Last Event Date** - Shows relative time (e.g., "5 min ago") from latest record
- [ ] **Timestamp Display** - Communication shows "As of [full date & time]"
- [ ] **Info Banner** - Explains this shows real-time vs historical data

#### Device Information Card
- [ ] Device ID display
- [ ] Entry ID display
- [ ] Record Time (formatted as locale date/time string for the selected historic record)

#### Machine Configuration Card
- [ ] Motor On Time (seconds)
- [ ] Motor Off Time (minutes)
- [ ] Wheel Threshold (number of wheels configured)

#### Communication & GPS Card
- [ ] GSM Signal strength with color-coded badge (Excellent/Good/Fair/Poor/No Signal)
- [ ] GPS Location link (opens Google Maps in new tab)
- [ ] Latitude display (6 decimal places)
- [ ] Longitude display (6 decimal places)
- [ ] **Note:** DB columns are swapped - frontend uses `data.Longitude` for latitude and `data.Latitude` for longitude

#### Device Health Card (Historical Record Data)
- [ ] Battery Status - Color-coded text (Full/Good=green, Low=yellow, Critical=red) from selected record
- [ ] Motor Status - Badge: Running (green), Stopped (gray), Fault (red) from selected record
- [ ] **Note:** Removed "Current Status" and "Communication" - these are now in Current Device Status card

#### Technical Details & Raw Data Card
- [ ] Wheels Detected (`Number_of_Wheels_Detected`)
- [ ] Motor Current Avg (`Motor_Current_Average_mA`) with "mA" suffix
- [ ] Motor Current Min (`Motor_Current_Min_mA`) with "mA" suffix
- [ ] Motor Current Max (`Motor_Current_Max_mA`) with "mA" suffix
- [ ] Battery Voltage (`Battery_Voltage_mV`) with "mV" suffix
- [ ] Raw Hex Data display (uppercase, from `HexField` column)
- [ ] Troubleshoot button

#### Historic Data Table
- [ ] **Time Range Filter** - Options: all, 2h, 24h, 7d, 30d
- [ ] **Date Filter** - Specific date picker (YYYY-MM-DD)
- [ ] **Status Filter** - Options: all, active, fault
- [ ] **Search** - Search within history records
- [ ] **Pagination** - Paginated history with page navigation
- [ ] **Export CSV** - Export historical data
- [ ] **Refresh** - Reload history data
- [ ] **Row Click** - View button loads entry details (updates page URL with new Entry_ID)

#### Historic Data Table Columns
| Column | Database Field | Display Format |
|--------|----------------|----------------|
| Timestamp | `CreatedAt` | Locale date/time string |
| Entry ID | `Entry_ID` | With # prefix (e.g., #1338379) |
| GSM Signal | `Signal_Strength` | X/6 with color-coded badge |
| Motor Status | `Motor_ON_Flag` | Badge: "Running" (green) or "Stopped" (gray) |
| Current (mA) | `Motor_Current_Average_mA` | With "mA" suffix |
| Motor On Time | `Motor_ON_Time_sec` | Raw numeric (seconds) |
| Motor Off Time | `Motor_OFF_Time_min` | Raw numeric (minutes) |
| Wheels Configured | `Wheel_Threshold` | Raw numeric |
| Location | `Longitude`, `Latitude` | "lat, long" format (DB columns swapped) |
| Event Type | `Event_Type`, `Event_Type_Description` | Badge + description text |
| Actions | - | View button |

#### Event Type Color Coding
| Event Type | Color | CSS Classes | Meaning |
|------------|-------|-------------|---------|
| Type 4 | Red | `bg-red-100 text-red-800` | Low Battery |
| Type 2, 3 | Blue | `bg-blue-100 text-blue-800` | Train Pass Events |
| Other | Gray | `bg-gray-100 text-gray-600` | Other events |

---

### API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/p3-data` | Get paginated P3 dashboard data |
| GET | `/api/p3-data/export` | Export P3 data (CSV/JSON) |
| GET | `/api/p3-data/stats` | Get P3 statistics |
| GET | `/api/p3-device-details/:entryId` | Get device details for specific entry |
| GET | `/api/p3-device-details/:entryId/history` | Get historical data with filters |

---

### Files to Create (for replication)

#### Backend (Server)
| File | Description |
|------|-------------|
| `controllers/p3DataController.js` | Dashboard data controller |
| `controllers/p3DeviceDetailController.js` | Device detail controller |
| `routes/p3DataRoutes.js` | Dashboard API routes |
| `routes/p3DeviceDetailRoutes.js` | Device detail API routes |

#### Frontend (Client)
| File | Description |
|------|-------------|
| `services/p3DataService.js` | API service for data fetching |
| `context/P3DeviceDetailContext.jsx` | State management context |
| `pages/Dashboard/P3DeviceDetailPage.jsx` | Main detail page |
| `components/dashboard/P3DataTable.jsx` | Dashboard data table |
| `components/dashboard/P3Dashboard.jsx` | Dashboard container |
| `components/p3DeviceDetail/P3DeviceInformationCard.jsx` | Device info card |
| `components/p3DeviceDetail/P3MachineConfigurationCard.jsx` | Config card |
| `components/p3DeviceDetail/P3CommunicationGPSCard.jsx` | GPS card |
| `components/p3DeviceDetail/P3FaultDiagnosticsCard.jsx` | Health card |
| `components/p3DeviceDetail/P3TechnicalDetailsCard.jsx` | Technical details card |
| `components/p3DeviceDetail/P3HistoricDataTable.jsx` | History table |
| `components/p3DeviceDetail/index.js` | Component exports |

#### Modified Files
| File | Changes Required |
|------|------------------|
| `server/server.js` | Import and register new routes |
| `client/src/App.jsx` | Add context provider and route |

---

## 1. Overview

The P3 Dashboard is a new dashboard for viewing event-based SICK sensor data from the `IoT_Data_Sick_P3` table. It follows the same architectural patterns as the existing HKMI dashboard but queries P3-specific data with calculated metrics for Motor Runs and Train Passed counts.

### 1.1 Protocol Reference
- **Protocol Version:** P3 Logic (Logic ID = 3)
- **Device Prefix:** HK (e.g., HK00036, HK00044, HK00052)
- **Database Table:** `IoT_Data_Sick_P3`
- **Decoder Class:** `P3SickDecoder`

---

## 2. Requirements

### 2.1 Data Sources

The dashboard combines data from two tables:

| Table | Purpose |
|-------|---------|
| `IoT_Data_Sick_P3` | Event-based sensor readings (GPS, signal, events, battery) |
| `cloud_dashboard_hkmi` | Device configuration and hierarchy mapping |

### 2.2 Table Columns Required

**From `cloud_dashboard_hkmi`:**
| Column | Description |
|--------|-------------|
| machine_id | Machine identifier |
| sden, den, aen, sse | Management hierarchy (4 levels) |
| div_rly | Division/Railway |
| section | Geographic section |
| curve_number | Track curve identifier |
| line | Line designation |
| grease_left | Remaining grease in kg |
| last_service_date | Last maintenance date |

**From `IoT_Data_Sick_P3`:**
| Column | Description |
|--------|-------------|
| Device_ID | Device identifier |
| Latitude, Longitude | GPS coordinates |
| Signal_Strength | GSM signal (0-6 scale) |

**Calculated Columns:**
| Column | Calculation |
|--------|-------------|
| Motor Runs | COUNT of records where `Event_Type = 2` (filtered by Event Date if selected) |
| Train Passed | COUNT of records where `Event_Type = 2 OR Event_Type = 3` (filtered by Event Date if selected) |
| Device Status | `Active` if data received within last 90 minutes, otherwise `Inactive` |
| Minutes Since Last Data | DATEDIFF(MINUTE) from last `CreatedAt` to current time |
| Days Since Service | DATEDIFF from `last_service_date` to today |

### 2.3 P3 Event Types

| Code | Event Type Description |
|------|------------------------|
| 0 | Event_Idle |
| 1 | Event_Power_ON |
| 2 | Event_Train_Pass_Normal |
| 3 | Event_Train_Pass |
| 4 | Event_Low_Battery |
| 5 | Event_Heartbit |
| 6 | Event_Invalid |

### 2.4 Features Required

1. **Hierarchy Filtering** - Filter by SDEN, DEN, AEN, SSE (same as HKMI)
2. **Pagination** - 20 records per page, max 100
3. **Search** - Search by Device_ID, machine_id, section
4. **Sorting** - Sortable columns with ASC/DESC toggle
5. **Export** - CSV and JSON export functionality
6. **Refresh** - Manual data refresh button to reload latest device data
7. **Event Date Filter** - Date picker to filter Motor Runs and Train Passed counts by specific date
8. **Visual Indicators**:
   - GSM Signal Strength: 6-bar visual indicator
   - Grease Level: Color-coded (Green ≥8kg, Yellow 5-8kg, Red <5kg)
   - Device Status: Badge showing Active (green) or Inactive (red) with "last seen" time

### 2.6 Refresh Button Functionality

The Refresh button allows users to manually reload the P3 device data without navigating away from the page.

**Features:**
- **Location:** Between the Search field and Export buttons in the table header
- **Icon:** Circular arrow refresh icon
- **Loading State:** Icon animates (spins) while data is being fetched
- **Disabled State:** Button is disabled during data loading to prevent duplicate requests
- **Page Preservation:** Maintains current page number when refreshing

**Implementation:**
```jsx
<button
  onClick={() => loadP3Data({ page: pagination.page })}
  disabled={loading}
  className="inline-flex items-center px-3 py-2 border border-gray-300..."
  title="Refresh data"
>
  <svg className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`}>
    {/* Refresh icon SVG path */}
  </svg>
  Refresh
</button>
```

**Use Cases:**
- Check for newly reported device data
- Verify device status changes after maintenance
- Update Device Status indicators (Active/Inactive) without page reload

### 2.7 Event Date Filter

The Event Date filter allows users to view Motor Runs and Train Passed counts for a specific date instead of all-time totals.

**Features:**
- **Location:** Left side of the table header toolbar
- **Format:** HTML5 date input (YYYY-MM-DD)
- **Default Value:** Today's date (automatically set on page load)
- **Clear Button:** X button appears to clear the filter (shows all-time counts)
- **Auto-refresh:** Data automatically reloads when date changes

**Behavior:**
- **Default (today's date):** Shows Motor Runs and Train Passed counts for today only
- **Date selected:** Shows counts only for events that occurred on the selected date
- **Date cleared:** Shows all-time counts for Motor Runs and Train Passed

**Backend Implementation:**
```sql
-- Date filter applied to Motor Runs and Train Passed subqueries
WHERE Device_ID IN (...)
  AND Event_Type = 2
  AND CAST(CreatedAt AS DATE) = @eventDate  -- Only when date is selected
```

**API Parameter:**
| Parameter | Type | Format | Description |
|-----------|------|--------|-------------|
| event_date | String | YYYY-MM-DD | Optional date filter for event counts |

**Use Cases:**
- View daily Motor Runs and Train Passed counts
- Analyze device activity on specific dates
- Compare activity between different days

### 2.5 Device Status Logic

The Device Status column indicates whether a device is actively reporting data.

**Logic:**
- **Active** (Green badge): Device has sent data within the last **90 minutes**
- **Inactive** (Red badge): No data received in the last **90 minutes**

**SQL Implementation:**
```sql
CASE
  WHEN DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) <= 90 THEN 'Active'
  ELSE 'Inactive'
END AS Device_Status,
DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) AS Minutes_Since_Last_Data
```

**UI Display:**
- Shows status badge (Active/Inactive)
- Shows "last seen" time formatted as:
  - `Xm ago` for minutes (< 60 minutes)
  - `Xh ago` for hours (< 24 hours)
  - `Xd ago` for days (≥ 24 hours)

---

## 3. Development Implementation

### 3.1 Files Created

#### Backend (Server)

| File | Path | Description |
|------|------|-------------|
| p3DataController.js | `server/controllers/p3DataController.js` | Controller with 3 functions: `getP3Data`, `exportP3Data`, `getP3Stats` |
| p3DataRoutes.js | `server/routes/p3DataRoutes.js` | Express routes with validation middleware |

#### Frontend (Client)

| File | Path | Description |
|------|------|-------------|
| p3DataService.js | `client/src/services/p3DataService.js` | API service for P3 data fetching |
| P3DataTable.jsx | `client/src/components/dashboard/P3DataTable.jsx` | Data table component |
| P3Dashboard.jsx | `client/src/components/dashboard/P3Dashboard.jsx` | Main dashboard container |

#### Modified Files

| File | Changes |
|------|---------|
| `server/server.js` | Added P3 route import and registration |
| `client/src/pages/Dashboard/DashboardHome.jsx` | Added P3 dashboard component mapping |

### 3.2 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/iot-data/p3` | Get P3 data with pagination, filtering, sorting |
| GET | `/api/iot-data/p3/export` | Export P3 data (JSON/CSV format) |
| GET | `/api/iot-data/p3/stats` | Get P3 statistics and event breakdown |

#### Query Parameters for GET /api/iot-data/p3

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| device_ids | Array/String | - | Filter by specific device IDs |
| page | Integer | 1 | Page number |
| limit | Integer | 20 | Records per page (max 100) |
| search | String | - | Search term |
| sort_field | String | CreatedAt | Field to sort by |
| sort_order | String | DESC | ASC or DESC |
| sden | String | - | SDEN hierarchy filter |
| den | String | - | DEN hierarchy filter |
| aen | String | - | AEN hierarchy filter |
| sse | String | - | SSE hierarchy filter |
| event_date | String | - | Date filter for Motor Runs/Train Passed counts (YYYY-MM-DD) |

### 3.3 SQL Query Logic

The main data query performs:

1. **Latest Record Selection**: Gets the most recent P3 record per device using `MAX(CreatedAt)` with `INNER JOIN`
2. **HKMI Join**: Left joins with `cloud_dashboard_hkmi` to get hierarchy and configuration data
3. **Motor Runs Calculation**: Subquery counting `Event_Type = 2` per device
4. **Train Passed Calculation**: Subquery counting `Event_Type = 2 OR Event_Type = 3` per device
5. **Hierarchy Filtering**: Optional WHERE clauses for SDEN, DEN, AEN, SSE
6. **Pagination**: Uses SQL Server `OFFSET...FETCH NEXT` syntax

---

## 4. Database Setup

### 4.1 Dashboard Entry

Insert a new dashboard entry in the `dashboard` table:

```sql
INSERT INTO dashboard (name, display_name, description, client_id, is_active, created_by, created_at)
VALUES (
    'P3',
    'P3 Dashboard',
    'P3 Logic - Event-based SICK sensor dashboard with motor runs and train detection',
    2,  -- Same client_id as HKMI
    1,
    1,
    GETUTCDATE()
);
```

### 4.2 Device Registration

Register P3 devices in the `device` table:

```sql
INSERT INTO device (device_id, client_id, created_at)
VALUES
    ('HK00036', 2, GETUTCDATE()),
    ('HK00044', 2, GETUTCDATE()),
    ('HK00052', 2, GETUTCDATE());
```

### 4.3 HKMI Configuration Data

Insert device configuration in `cloud_dashboard_hkmi`:

```sql
INSERT INTO cloud_dashboard_hkmi (device_id, machine_id, sden, den, aen, sse, curve_number, line, created_at, updated_at, grease_left, last_service_date, div_rly, section)
VALUES
    ('HK00036', '100571', 'SDEN CO', 'DEN North', 'AEN NMH', 'SSE JAO', '105', 'SL', GETUTCDATE(), GETUTCDATE(), 150.000, '2025-12-15', 'RTM/WR', 'BEC-RTM'),
    ('HK00044', '100572', 'SDEN CO', 'DEN North', 'AEN NMH', 'SSE JAO', '106', 'DN', GETUTCDATE(), GETUTCDATE(), 120.000, '2025-12-20', 'RTM/WR', 'JAO-KYN'),
    ('HK00052', '100573', 'SDEN CO', 'DEN South', 'AEN MBQ', 'SSE PNL', '107', 'UP', GETUTCDATE(), GETUTCDATE(), 85.000, '2025-12-25', 'RTM/CR', 'PNL-CST');
```

### 4.4 Sample P3 Data

Insert test records in `IoT_Data_Sick_P3`:

```sql
INSERT INTO IoT_Data_Sick_P3 (Entry_ID, CreatedAt, Device_ID, Event_Type, Event_Type_Description, Signal_Strength, Motor_ON_Time_sec, Motor_OFF_Time_min, Wheel_Threshold, Latitude, Longitude, Number_of_Wheels_Detected, Motor_Current_Average_mA, Motor_Current_Min_mA, Motor_Current_Max_mA, Train_Passed_Flag, Motor_ON_Flag, Battery_Voltage_mV, Debug_Value, Timestamp)
VALUES
    (1, GETUTCDATE(), 'HK00036', 2, 'Event_Train_Pass_Normal', 4, 15, 1, 10, 19.0760, 72.8777, 12, 850, 100, 1200, 1, 1, 12000, 0, GETUTCDATE()),
    (2, GETUTCDATE(), 'HK00036', 3, 'Event_Train_Pass', 5, 20, 2, 10, 19.0760, 72.8777, 15, 900, 150, 1300, 1, 1, 11800, 0, GETUTCDATE()),
    (3, GETUTCDATE(), 'HK00044', 2, 'Event_Train_Pass_Normal', 3, 12, 1, 8, 18.9750, 72.8258, 10, 780, 80, 1100, 1, 1, 11500, 0, GETUTCDATE()),
    (4, GETUTCDATE(), 'HK00044', 5, 'Event_Heartbit', 4, 0, 0, 8, 18.9750, 72.8258, 0, 0, 0, 0, 0, 0, 11200, 0, GETUTCDATE()),
    (5, GETUTCDATE(), 'HK00052', 2, 'Event_Train_Pass_Normal', 5, 18, 1, 12, 19.1176, 72.9060, 14, 920, 120, 1400, 1, 1, 12200, 0, GETUTCDATE()),
    (6, GETUTCDATE(), 'HK00052', 4, 'Event_Low_Battery', 2, 0, 0, 12, 19.1176, 72.9060, 0, 0, 0, 0, 0, 0, 10500, 0, GETUTCDATE());
```

---

## 5. Dashboard Component Mapping

The P3 dashboard is registered in `DashboardHome.jsx` with multiple name variants:

```javascript
const dashboardComponents = {
  // ... existing dashboards
  'P3': P3Dashboard,
  'P3_Dashboard': P3Dashboard,
  'P3 Dashboard': P3Dashboard,
  'P3Dashboard': P3Dashboard,
  'P3_Logic': P3Dashboard,
  'P3 Logic': P3Dashboard
};
```

---

## 6. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        P3 Dashboard UI                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            ManagementHierarchyFilters                    │   │
│  │  [SDEN ▼] [DEN ▼] [AEN ▼] [SSE ▼] [Apply] [Clear]      │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    P3DataTable                           │   │
│  │  ┌───────────────────────────────────────────────────────┐│  │
│  │  │ Date:[📅____] Search:[____][🔍] [🔄] [CSV] [JSON]    ││  │
│  │  └───────────────────────────────────────────────────────┘│  │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ Machine│Device│Hierarchy│Div/Rly│GPS  │GSM│... │    │   │
│  │  │ ID     │ID    │         │       │     │   │    │    │   │
│  │  ├─────────────────────────────────────────────────┤    │   │
│  │  │ 100571 │HK036 │SDEN→... │RTM/WR │19..,│▂▄▆│... │    │   │
│  │  │ 100572 │HK044 │SDEN→... │RTM/WR │18..,│▂▄ │... │    │   │
│  │  │ 100573 │HK052 │SDEN→... │RTM/CR │19..,│▂▄▆│... │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │  [◀ Prev] [1] [2] [3] [Next ▶]  Showing 1-20 of 50     │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     p3DataService.js                            │
│  fetchP3Data() → GET /api/iot-data/p3                          │
│  exportP3Data() → GET /api/iot-data/p3/export                  │
│  fetchP3Stats() → GET /api/iot-data/p3/stats                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Express Backend                             │
│  p3DataRoutes.js → p3DataController.js                         │
│  - Authentication (JWT)                                         │
│  - Validation (express-validator)                               │
│  - Audit Logging                                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SQL Server (gendb_dev)                      │
│  ┌──────────────────┐  ┌─────────────────────────┐             │
│  │ IoT_Data_Sick_P3 │  │ cloud_dashboard_hkmi    │             │
│  │ - Entry_ID       │  │ - device_id             │             │
│  │ - Device_ID      │◄─┤ - machine_id            │             │
│  │ - Event_Type     │  │ - sden, den, aen, sse   │             │
│  │ - Signal_Strength│  │ - grease_left           │             │
│  │ - Latitude/Long  │  │ - last_service_date     │             │
│  │ - Battery_mV     │  │ - div_rly, section      │             │
│  └──────────────────┘  └─────────────────────────┘             │
│                                                                 │
│  ┌──────────────────┐  ┌─────────────────────────┐             │
│  │ device           │  │ dashboard               │             │
│  │ - device_id      │  │ - id                    │             │
│  │ - client_id      │  │ - name ('P3')           │             │
│  └──────────────────┘  │ - client_id             │             │
│                        └─────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Testing Checklist

### 7.1 Database Setup
- [ ] Dashboard entry created in `dashboard` table
- [ ] Devices registered in `device` table with correct `client_id`
- [ ] HKMI configuration data inserted for devices
- [ ] Sample P3 data inserted in `IoT_Data_Sick_P3` table

### 7.2 Backend Testing
- [ ] Server starts without errors
- [ ] GET `/api/iot-data/p3` returns data
- [ ] GET `/api/iot-data/p3?event_date=2026-01-05` filters counts by date
- [ ] GET `/api/iot-data/p3/export?format=csv` downloads CSV
- [ ] GET `/api/iot-data/p3/stats` returns statistics
- [ ] Hierarchy filters work correctly

### 7.3 Frontend Testing
- [ ] P3 Dashboard appears in sidebar
- [ ] Data table loads with correct columns
- [ ] Hierarchy filters work
- [ ] Search functionality works
- [ ] Pagination works
- [ ] Sorting works
- [ ] Export CSV/JSON works
- [ ] Refresh button reloads data
- [ ] Refresh button shows spinning icon while loading
- [ ] Event Date picker displays and clears correctly
- [ ] Motor Runs/Train Passed counts change when date is selected
- [ ] GSM signal bars display correctly
- [ ] Grease level colors display correctly
- [ ] Motor Runs and Train Passed counts display
- [ ] Device Status shows Active/Inactive correctly

---

## 8. Troubleshooting

### Issue: Dashboard shows "No Data Available"
**Cause:** `filteredDeviceIds` is empty because devices aren't registered or not linked to correct client.

**Solution:**
1. Verify devices exist in `device` table with correct `client_id`
2. Verify `cloud_dashboard_hkmi` has entries for those devices
3. Check browser console for API errors

### Issue: Motor Runs / Train Passed shows 0
**Cause:** No P3 data records with matching Event_Type values.

**Solution:**
1. Insert test data with `Event_Type = 2` and `Event_Type = 3`
2. Verify data exists: `SELECT * FROM IoT_Data_Sick_P3 WHERE Event_Type IN (2, 3)`

### Issue: GPS Location shows "-"
**Cause:** Latitude/Longitude values are NULL or 0.

**Solution:**
1. Insert P3 data with valid GPS coordinates
2. Check the P3 decoder is correctly populating these fields

### Issue: GPS Coordinates are Swapped in Database
**Cause:** The P3 decoder stores Latitude values in the `Longitude` column and Longitude values in the `Latitude` column.

**Solution (Frontend Workaround):**
The frontend components swap the values when displaying:
- `P3CommunicationGPSCard.jsx`: Uses `data.Longitude` for latitude display and `data.Latitude` for longitude display
- `P3HistoricDataTable.jsx`: Calls `formatLocation(row.Longitude, row.Latitude)` to swap the values

**Note:** This is a data layer issue. If the decoder is fixed in the future, these frontend swaps will need to be reverted.

---

## 9. P3 Device Detail Page

### 9.1 Overview

The P3 Device Detail Page provides a comprehensive view of individual device data from the `IoT_Data_Sick_P3` table. Users navigate to this page by clicking on a device record in the P3 Data Table. The layout mirrors the HKMI device detail page but displays P3-specific data and metrics.

**Route:** `/dashboard/p3-device/:entryId`

### 9.2 UI Layout

The page follows the design layout with the following sections:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [← Back]  Motor Device HK00001                                         │
│            Entry #1338379 - Machine ID                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐        │
│  │ Device           │ │ Machine          │ │ Communication    │        │
│  │ Information      │ │ Configuration    │ │ & GPS            │        │
│  │                  │ │                  │ │                  │        │
│  │ Device ID: HK001 │ │ Motor On: 10s    │ │ GSM Signal: 5    │        │
│  │ Entry ID: 1338379│ │ Motor Off: 20min │ │ [View on Maps]   │        │
│  │ Record Time: ... │ │ Wheels: 4        │ │ Lat: 23.341565   │        │
│  └──────────────────┘ └──────────────────┘ │ Long: 75.508460  │        │
│                                             └──────────────────┘        │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Fault Information & Diagnostics                               │      │
│  │ ┌────────────────┐ ┌────────────────┐                        │      │
│  │ │ Current Status │ │ Last Event     │                        │      │
│  │ │ ● Device Active│ │ Oct 24, 2023   │                        │      │
│  │ └────────────────┘ └────────────────┘                        │      │
│  │ ┌────────────────┐                                           │      │
│  │ │ Battery Status │   System Health:                          │      │
│  │ │ Full & Charging│   Motor Status: [Fault]                   │      │
│  │ └────────────────┘   Communication: [Connected]              │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Technical Details & Raw Data                                  │      │
│  │                                                               │      │
│  │ Performance Metrics          Raw Hex Data    [Troubleshoot]  │      │
│  │ Motor ON Time: 10 seconds    ┌────────────────────────────┐  │      │
│  │ Motor OFF Time: 0 seconds    │ 050A010A4B0017000000C69E.. │  │      │
│  │ Current Draw: 99 mA          └────────────────────────────┘  │      │
│  │ Duty Cycle: 100.0%                                           │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐      │
│  │ Historic Data for Motor Device HK00001    [Export CSV][Refresh]│    │
│  │ ┌──────────────────────────────────────────────────────────┐ │      │
│  │ │ Time Range [▼] │ Date [📅] │ Status [▼] │ Search [____]  │ │      │
│  │ └──────────────────────────────────────────────────────────┘ │      │
│  │ ┌──────────────────────────────────────────────────────────┐ │      │
│  │ │ Timestamp │ Entry │ GSM │ Motor │ Current │ ... │ Actions│ │      │
│  │ │───────────│───────│─────│───────│─────────│─────│────────│ │      │
│  │ │ ...       │ #1234 │ 5/6 │ Run   │ 99 mA   │ ... │ [View] │ │      │
│  │ └──────────────────────────────────────────────────────────┘ │      │
│  └──────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Card Components

| Component | Description | Data Source |
|-----------|-------------|-------------|
| `P3CurrentDeviceStatusCard` (NEW) | Real-time device status, GSM-based communication with timestamp, Last Event Date | `latest_device_status` |
| `P3DeviceInformationCard` | Device ID, Entry ID, Record Time (for selected record) | `device_information` |
| `P3MachineConfigurationCard` | Motor On/Off times, Wheel threshold | `machine_configuration` |
| `P3CommunicationGPSCard` | GSM Signal with badge, GPS coordinates, Google Maps link | `communication_gps` |
| `P3FaultDiagnosticsCard` | Battery Status, Motor Status (from selected historic record) | `fault_diagnostics` |
| `P3TechnicalDetailsCard` | Wheels detected, Motor currents (Avg/Min/Max), Battery voltage, Raw Hex data | `technical_details` |
| `P3HistoricDataTable` | Paginated history with filters | `/api/p3-device-details/:entryId/history` |

**Important Changes:**
- **Current Device Status Card:** NEW component at the top showing real-time status from the latest device record
- **Device Health Card:** Removed "Current Status" and "Communication" fields - these now appear in the Current Device Status card with proper real-time data
- **Last Event Date:** Moved from Device Information card to Current Device Status card

### 9.4 Files Created

#### Backend (Server)

| File | Path | Description |
|------|------|-------------|
| `p3DeviceDetailController.js` | `server/controllers/p3DeviceDetailController.js` | Controller with `getP3DeviceDetails` and `getP3DeviceHistory` |
| `p3DeviceDetailRoutes.js` | `server/routes/p3DeviceDetailRoutes.js` | Express routes with validation |

#### Frontend (Client)

| File | Path | Description |
|------|------|-------------|
| `P3DeviceDetailContext.jsx` | `client/src/context/P3DeviceDetailContext.jsx` | Context provider for state management |
| `P3DeviceDetailPage.jsx` | `client/src/pages/Dashboard/P3DeviceDetailPage.jsx` | Main page component |
| `P3CurrentDeviceStatusCard.jsx` (NEW) | `client/src/components/p3DeviceDetail/` | Real-time device status card (top section) |
| `P3DeviceInformationCard.jsx` | `client/src/components/p3DeviceDetail/` | Device info card (Last Event Date removed) |
| `P3MachineConfigurationCard.jsx` | `client/src/components/p3DeviceDetail/` | Machine config card |
| `P3CommunicationGPSCard.jsx` | `client/src/components/p3DeviceDetail/` | Communication & GPS card |
| `P3FaultDiagnosticsCard.jsx` | `client/src/components/p3DeviceDetail/` | Device Health card (Current Status & Communication removed) |
| `P3TechnicalDetailsCard.jsx` | `client/src/components/p3DeviceDetail/` | Technical details card |
| `P3HistoricDataTable.jsx` | `client/src/components/p3DeviceDetail/` | Historic data table |
| `index.js` | `client/src/components/p3DeviceDetail/` | Component exports |

#### Modified Files

| File | Changes |
|------|---------|
| `server/server.js` | Added P3 device detail routes import and registration |
| `client/src/App.jsx` | Added P3DeviceDetailProvider and route `/dashboard/p3-device/:entryId` |
| `client/src/components/dashboard/P3DataTable.jsx` | Updated row click to navigate to `/dashboard/p3-device/:entryId` |

### 9.5 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/p3-device-details/:entryId` | Get detailed P3 device info for specific entry |
| GET | `/api/p3-device-details/:entryId/history` | Get historical P3 data with filters |

#### Query Parameters for History Endpoint

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeRange` | String | `all` | `all`, `2h`, `24h`, `7d`, `30d` |
| `status` | String | `all` | `all`, `active`, `fault` |
| `search` | String | - | Search term |
| `date` | String | - | Specific date (YYYY-MM-DD) |
| `page` | Integer | 1 | Page number |
| `limit` | Integer | 20 | Records per page (max 100) |
| `sortField` | String | `CreatedAt` | Sort field |
| `sortOrder` | String | `DESC` | `ASC` or `DESC` |

### 9.6 API Response Structure

**GET /api/p3-device-details/:entryId**

```json
{
  "success": true,
  "message": "P3 device details retrieved successfully",
  "data": {
    "Device_ID": "HK00001",
    "Entry_ID": 1338379,
    "Latitude": 23.341565,
    "Longitude": 75.508460,
    "GSM_Signal_Strength": 5,
    "Motor_Current_mA": 99,
    "Motor_ON_Time_sec": 10,
    "Motor_OFF_Time_min": 20,
    "Number_of_Wheels_Configured": 4,
    "Number_of_Wheels_Detected": 4,

    "device_information": {
      "device_id": "HK00001",
      "machine_id": "100571",
      "client_id": 2,
      "record_time": "2026-01-05T10:30:00.000Z",
      "device_type": "P3 Motor Device",
      "latest_record_date": "2026-01-05T11:45:00.000Z"
    },

    "latest_device_status": {
      "device_status": "Active",
      "gsm_signal": 5,
      "last_record_time": "2026-01-05T11:45:00.000Z"
    },

    "machine_configuration": {
      "motor_on_time_sec": 10,
      "motor_off_time_min": 20,
      "wheel_threshold": 4
    },

    "communication_gps": {
      "gsm_signal": 5,
      "latitude": 23.341565,
      "longitude": 75.508460
    },

    "fault_diagnostics": {
      "device_status": "Active",
      "minutes_since_last_data": 15,
      "battery_status": "Battery Full & Charging",
      "battery_voltage_mv": 12000,
      "motor_status": "Running",
      "motor_on_flag": 1,
      "train_passed_flag": 1,
      "event_type": 2,
      "event_type_description": "Event_Train_Pass_Normal"
    },

    "technical_details": {
      "wheels_detected": 4,
      "current_draw_ma": 99,
      "current_min_ma": 50,
      "current_max_ma": 150,
      "battery_voltage_mv": 12000,
      "raw_hex_data": "050A010A4B0017000000C69E...",
      "debug_value": 0
    },

    "hierarchy_info": {
      "sden": "SDEN CO",
      "den": "DEN North",
      "aen": "AEN NMH",
      "sse": "SSE JAO",
      "div_rly": "RTM/WR",
      "section": "BEC-RTM",
      "curve_number": "105",
      "line": "SL",
      "grease_left": 150.000,
      "last_service_date": "2025-12-15",
      "machine_id": "100571"
    }
  }
}
```

### 9.7 Battery Status Logic

| Voltage (mV) | Status |
|--------------|--------|
| ≥ 4000 | Battery Full & Charging |
| ≥ 3700 | Battery Good |
| ≥ 3400 | Battery Low |
| < 3400 | Battery Critical |

### 9.8 Navigation Flow

```
┌────────────────────────┐
│   P3 Dashboard         │
│   (/dashboard)         │
│                        │
│   P3 Data Table        │
│   ┌────────────────┐   │
│   │ HK00001  │ ... │───┼──────► /dashboard/p3-device/1338379
│   │ HK00002  │ ... │   │
│   └────────────────┘   │
└────────────────────────┘
                              ┌────────────────────────┐
                              │  P3 Device Detail Page │
                              │                        │
                              │  [← Back] (returns to  │
                              │           /dashboard)  │
                              │                        │
                              │  Historic Data Table   │
                              │  ┌────────────────┐    │
                              │  │ Entry #1234 ───┼────┼──► /dashboard/p3-device/1234
                              │  │ Entry #1235    │    │    (updates same page)
                              │  └────────────────┘    │
                              └────────────────────────┘
```

### 9.9 Technical Details Card Columns

The Technical Details & Raw Data card displays the following performance metrics:

| Display Label | Database Column | Description |
|---------------|-----------------|-------------|
| Wheels Detected | `Number_of_Wheels_Detected` | Number of wheels detected by sensor |
| Motor Current (Avg) | `Motor_Current_Average_mA` | Average motor current in mA |
| Motor Current (Min) | `Motor_Current_Min_mA` | Minimum motor current in mA |
| Motor Current (Max) | `Motor_Current_Max_mA` | Maximum motor current in mA |
| Battery Voltage | `Battery_Voltage_mV` | Battery voltage in mV |

**Raw Hex Data Section:**
- Displays the raw hexadecimal data from `HexField` column
- Formatted in uppercase
- Includes "Troubleshoot" button for debugging

### 9.10 Historic Data Table Columns

The Historic Data Table displays historical records for the selected device with the following columns:

| Display Column | Database Column(s) | Description |
|----------------|-------------------|-------------|
| Timestamp | `CreatedAt` | Formatted as locale date/time string |
| Entry ID | `Entry_ID` | Displayed with # prefix (e.g., #1338379) |
| GSM Signal | `Signal_Strength` | Shown as X/6 with color-coded badge |
| Motor Status | `Motor_ON_Flag` | Badge: "Running" (green) or "Stopped" (gray) |
| Current (mA) | `Motor_Current_Average_mA` | With "mA" suffix |
| Motor On Time (sec) | `Motor_ON_Time_sec` | Raw numeric value |
| Motor Off Time (min) | `Motor_OFF_Time_min` | Raw numeric value |
| Wheels Configured | `Wheel_Threshold` | Number of wheels configured |
| Location | `Longitude`, `Latitude` | Formatted as "lat, long" (DB columns are swapped) |
| Event Type | `Event_Type`, `Event_Type_Description` | Badge with type number + description text |
| Actions | - | View button to load entry details |

**Event Type Color Coding:**
| Event Type | Color | Meaning |
|------------|-------|---------|
| Type 4 | Red (`bg-red-100 text-red-800`) | Low Battery |
| Type 2, 3 | Blue (`bg-blue-100 text-blue-800`) | Train Pass Events |
| Other Types | Gray (`bg-gray-100 text-gray-600`) | Other events |

**Event Type Display:**
The Event Type column displays both the numeric type and its description:
```jsx
<div className="flex flex-col gap-1">
  <span className={`px-2 py-0.5 text-xs rounded inline-block w-fit ${colorClass}`}>
    Type {row.Event_Type}
  </span>
  {row.Event_Type_Description && (
    <span className="text-xs text-gray-500 whitespace-nowrap">
      {row.Event_Type_Description}
    </span>
  )}
</div>
```

### 9.11 Testing Checklist

#### Backend Testing
- [ ] GET `/api/p3-device-details/:entryId` returns correct data structure
- [ ] GET `/api/p3-device-details/:entryId/history` returns paginated history
- [ ] History filters (timeRange, status, search, date) work correctly
- [ ] Pagination works correctly
- [ ] 404 returned for non-existent Entry_ID
- [ ] Authentication required for all endpoints

#### Frontend Testing
- [ ] Clicking row in P3DataTable navigates to `/dashboard/p3-device/:entryId`
- [ ] Device Information card displays correctly
- [ ] Machine Configuration card displays correctly
- [ ] Communication & GPS card displays correctly
- [ ] "View on Maps" opens Google Maps with correct coordinates
- [ ] GSM Signal badge shows correct status (Excellent/Good/Fair/Poor)
- [ ] Fault Diagnostics card displays device status (Active/Inactive)
- [ ] Battery status shows correctly based on voltage
- [ ] Motor status indicator works
- [ ] Technical Details card shows performance metrics
- [ ] Raw Hex data displays correctly
- [ ] Historic Data Table loads and displays
- [ ] History filters (Time Range, Date, Status, Search) work
- [ ] Pagination in history table works
- [ ] Clicking history row updates page with new Entry_ID
- [ ] Back button returns to dashboard
- [ ] Loading spinner shows while data loads
- [ ] Error state displays when data fetch fails

---

## 10. Current Device Status Card Implementation (2026-01-06)

### 10.1 Problem Identified

The original implementation of the P3 Device Detail Page had a critical UX issue with the "Device Health" card:

**Issue:** The "Current Status" and "Communication" fields were misleading when viewing historical records.

- **Current Status** showed "Device Inactive" even when the record was valid at the time it was created
- **Communication** showed "Disconnected" based on record age, not actual GSM signal strength
- Both fields used `DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE())` which compared the historic record's timestamp against the current time

**Example Problem:**
- Entry_ID 1485535 was created on Jan 5, 2026 at 10:00 AM
- When viewing this record on Jan 6, 2026, it showed:
  - Current Status: "Device Inactive" ❌ (because >90 min old from NOW)
  - Communication: "Disconnected" ❌ (derived from inactive status)
  - Battery Status: "Battery Full & Charging" ✅ (correct from record)
  - Motor Status: "Running" ✅ (correct from record)

This was confusing because the battery was full and motor was running, yet the device appeared "inactive" and "disconnected".

### 10.2 Solution Implemented

Created a new **"Current Device Status"** card that always shows the real-time status based on the **latest device record**, separate from the historical record being viewed.

#### Changes Made:

1. **New Component: P3CurrentDeviceStatusCard.jsx**
   - Positioned at the top of the page (above all other cards)
   - Blue gradient background to distinguish from historical data
   - 3-column layout:
     - **Device Status**: Active/Inactive based on latest record
     - **Communication**: Based on actual GSM signal (0-6 scale) from latest record, with full timestamp
     - **Last Event Date**: Relative time display (e.g., "5 min ago")

2. **Backend Changes: p3DeviceDetailController.js**
   - Added new query to fetch latest device status by Device_ID:
     ```sql
     SELECT TOP 1
       p3.CreatedAt,
       p3.Signal_Strength,
       CASE
         WHEN DATEDIFF(MINUTE, p3.CreatedAt, GETUTCDATE()) <= 90 THEN 'Active'
         ELSE 'Inactive'
       END AS Device_Status
     FROM [IoT_Data_Sick_P3] p3
     WHERE p3.Device_ID = @deviceId
     ORDER BY p3.CreatedAt DESC
     ```
   - Added `latest_device_status` object to API response

3. **Updated P3FaultDiagnosticsCard.jsx (Device Health)**
   - Removed "Current Status" field
   - Removed "Communication" field
   - Now only shows Battery Status and Motor Status (from the selected historic record)

4. **Updated P3DeviceInformationCard.jsx**
   - Removed "Last Event Date" (moved to Current Device Status card)

### 10.3 Communication Status Logic

The new Communication status uses actual GSM signal strength (0-6 scale):

| GSM Signal | Status | Badge Color |
|------------|--------|-------------|
| 6 | Connected | Green |
| 5 | Connected | Green |
| 4 | Connected | Green |
| 3 | Weak Signal | Yellow |
| 2 | Weak Signal | Yellow |
| 1 | Poor Signal | Orange |
| 0 | No Signal | Red |

**Timestamp Display:**
- Shows: "As of Jan 6, 2026, 02:30:45 PM"
- Clarifies that the communication status is based on the latest record with exact date/time

### 10.4 Benefits

1. **Clear Separation**: Real-time status vs historical record data
2. **Accurate Communication**: Based on actual GSM signal, not record age
3. **Better UX**: Info banner explains the difference between sections
4. **Consistent Data**: Battery and Motor status still reflect the selected record (as expected for historical data)

### 10.5 Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚡ Current Device Status        Last Update: 5 min ago         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Device Status│  │ Communication│  │ Last Event Date      │  │
│  │ ● Active     │  │ Connected    │  │ 📅 5 min ago         │  │
│  │              │  │ GSM: 5/6     │  │                      │  │
│  │              │  │ As of Jan 6, │  │ Most recent data...  │  │
│  │              │  │ 2026 2:30 PM │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ℹ️ This shows real-time status based on most recent data...    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Device Info      │ │ Machine Config   │ │ Communication    │
│ (Historic Record)│ │                  │ │ & GPS            │
└──────────────────┘ └──────────────────┘ └──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Device Health (Historic Record Data)                           │
│  ┌────────────────┐ ┌────────────────┐                         │
│  │ Battery Status │ │ Motor Status   │                         │
│  └────────────────┘ └────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Future Enhancements

1. **Real-time Updates** - WebSocket integration for live data
2. **Map View** - Display devices on interactive map using GPS coordinates
3. **Battery Alerts** - Dashboard cards showing low battery devices (Event_Type = 4)
4. **Event Timeline** - Visualize event history per device
5. **Custom Date Range** - Filter data by date range

---

## 12. References

- [P3_Decoder_Example.md](../Sick_Sensor/P3_Decoder_Example.md) - P3 protocol specification
- [P3_Implementation_Plan.md](../Sick_Sensor/P3_Logic_Docs/P3_Implementation_Plan.md) - Original implementation plan
- [05_create_iot_data_sick_p3.sql](../Sick_Sensor/FunctionApp/optionA_http/sql_migrations/05_create_iot_data_sick_p3.sql) - Table creation script
- [CLAUDE.md](../CLAUDE.md) - Project overview and patterns

---

*Document created: 2026-01-04*
*Last updated: 2026-01-06 (Added Current Device Status Card implementation - fixed historical data UX issue)*
