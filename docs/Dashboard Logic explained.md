# HKMI & Sick Sensor Dashboard - Complete Logic Explanation

## Dashboard Overview

The HKMI dashboard displays real-time IoT sensor data for railway curve greasing machines. It combines data from two primary sources:

1. **IoT Sensor Data** - Real-time telemetry from Sick sensors (`iot_data_sick` table)
2. **HKMI Configuration Data** - Machine metadata and service information (`cloud_dashboard_hkmi` table)

**File Location**: `client/src/components/dashboard/HKMI.jsx`

## Dashboard Structure

The dashboard consists of three main sections:

1. **Metrics Cards** - Summary statistics and key performance indicators
2. **Management Hierarchy Filters** - Filtering by organizational structure (SDEN, DEN, AEN, SSE)
3. **IoT Data Table** - Main data grid displaying comprehensive device information

## Complete Column Reference

### 1. Device ID (Optional Column)

- **Source**: `iot_data_sick.Device_ID`
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:217`
- **Visibility**: Only shown when `showDeviceId={true}` prop is passed
- **Description**: Unique identifier for the IoT sensor device
- **Example**: "RTM001-UP-001"
- **Purpose**: Device tracking and identification

### 2. Machine ID

- **Source**: `cloud_dashboard_hkmi.machine_id` (primary) or `iot_data_sick.Device_ID` (fallback)
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:234-235`
- **Description**: Configured machine identifier from HKMI configuration table
- **Format**: Machine-specific naming convention
- **Style**: Bold font (font-medium)
- **Purpose**: Human-readable machine identification

### 3. Management Hierarchy (Composite Column)

**Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:39-47`

This column displays a hierarchical organizational structure with four levels:

#### Sub-fields:
- **SDEN** (Senior Divisional Engineer): Top-level management
- **DEN** (Divisional Engineer): Division-level management
- **AEN** (Assistant Engineer): Area-level management
- **SSE** (Senior Section Engineer): Section-level management

#### Source:
All fields from `cloud_dashboard_hkmi` table

#### Display Format:
```
SDEN Name (bold, primary text)
DEN → AEN → SSE (smaller gray text)
```

#### Purpose:
- Organizational hierarchy visualization
- Enables filtering by management level
- Provides responsibility chain visibility

### 4. Division/Railway (div_rly)

- **Source**: `cloud_dashboard_hkmi.div_rly`
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:236-237`
- **Description**: Railway division identifier
- **Examples**: "Northern Railway", "Central Railway Division", "Western Railway"
- **Purpose**: Geographic/administrative division tracking

### 5. Section

- **Source**: `cloud_dashboard_hkmi.section`
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:238-239`
- **Description**: Specific railway section where the machine is installed
- **Examples**: "Section A", "Mumbai-Pune", "Delhi-Agra"
- **Purpose**: Precise location identification within a division

### 6. Curve Number

- **Source**: `cloud_dashboard_hkmi.curve_number` (primary) or extracted from `machine_id` (fallback)
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:241-247`

#### Extraction Logic:
```javascript
// Priority 1: Use configured curve_number from HKMI table
if (row?.curve_number) {
  return row.curve_number;
}

// Priority 2: Extract from machine_id using regex
const machineId = row?.machine_id || row?.Device_ID || '';
const curveMatch = machineId.match(/RTM([^-]+)/);
return curveMatch ? curveMatch[1] : '-';
```

- **Description**: Identifier for the specific railway curve
- **Examples**: "001", "042B", "123A"
- **Purpose**: Curve-specific tracking and maintenance

### 7. Line

- **Source**: `cloud_dashboard_hkmi.line` (primary) or extracted from `machine_id` (fallback)
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:248-254`

#### Extraction Logic:
```javascript
// Priority 1: Use configured line from HKMI table
if (row?.line) {
  return row.line;
}

// Priority 2: Extract from machine_id using regex pattern /-([A-Z]{2})-/
const lineMatch = (row?.machine_id || '').match(/-([A-Z]{2})-/);
return lineMatch ? lineMatch[1] : '-';
```

- **Description**: Railway line identifier (typically 2-letter code)
- **Examples**: "UP" (Up line), "DN" (Down line), "ML" (Main line)
- **Purpose**: Track which railway line the machine services

### 8. GPS Location

- **Source**: `iot_data_sick.Latitude` and `iot_data_sick.Longitude`
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:255-261`

#### Display Logic:
```javascript
const lat = row?.Latitude;
const lng = row?.Longitude;

// Only display if both exist and are non-zero
if (lat && lng && lat !== 0 && lng !== 0) {
  return `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
}
return '-';
```

- **Format**: `LATITUDE,LONGITUDE` (4 decimal places each)
- **Style**: Green text, monospace font
- **Example**: "19.0760,72.8777"
- **Purpose**: Geolocation tracking for maintenance and monitoring

### 9. GSM Signal Strength

- **Source**: `iot_data_sick.GSM_Signal_Strength`
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:50-77`
- **Component**: Custom `GSMSignalBars` component

#### Visual Representation:
Displays as signal strength bars (1-6 bars) with color coding

#### Color Coding Logic:
```javascript
if (signalStrength <= 1) → Red bars (Very weak)
if (signalStrength <= 3) → Yellow bars (Moderate)
if (signalStrength <= 5) → Green bars (Good)
if (signalStrength === 6) → Dark green bars (Excellent)
```

#### Display Format:
- Visual signal bars (6 maximum)
- Text indicator: "X/6" (e.g., "4/6")
- Bar heights increase progressively

#### Special Features:
- **Filter Support**: Users can filter devices with below-average GSM strength
- **Purpose**: Monitor connectivity health and identify devices with poor signal

### 10. Grease Left (kg)

- **Source**: `cloud_dashboard_hkmi.grease_left`
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:25-37, 263-264`
- **Component**: Custom `GreaseLevel` component

#### Display Format:
- Decimal value with 1 decimal place
- Suffix: "kg"
- Example: "7.5 kg"

#### Color Coding Logic:
```javascript
if (greaseLeft >= 8) → Green text (Sufficient grease)
if (greaseLeft >= 5 && greaseLeft < 8) → Yellow text (Medium level)
if (greaseLeft < 5) → Red text (Low - needs service)
```

#### Data Management:
- **Updatable**: Can be updated via Excel/CSV file upload
- **Upload Location**: HKMI Table interface (`client/src/components/dashboard/HKMITable.jsx:206-234`)
- **Required Column**: `grease_left` (in upload file)

#### Purpose:
- Critical maintenance indicator
- Alerts when grease needs replenishment
- Prevents equipment failure

### 11. Status

- **Source**: Calculated from `iot_data_sick.Fault_Code` and `iot_data_sick.Motor_Current_mA`
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:7-23, 266-271`
- **Component**: Custom `HKMIStatusBadge` component

#### Status Calculation Logic:
```javascript
const hasFault = row?.Fault_Code && row?.Fault_Code !== '0';
const motorCurrent = row?.Motor_Current_mA || 0;

if (hasFault) return 'Offline';           // Priority 1: Fault detected
if (motorCurrent > 50) return 'Active';   // Priority 2: Motor running
return 'Maintenance';                     // Default: Needs attention
```

#### Status Types & Badge Styling:

1. **Active**
   - Condition: No faults AND motor current > 50 mA
   - Badge: Green background, green text
   - Meaning: Machine is operational and actively working

2. **Maintenance**
   - Condition: No faults AND motor current ≤ 50 mA
   - Badge: Orange background, orange text
   - Meaning: Machine is idle or requires routine maintenance

3. **Offline**
   - Condition: Fault code exists and is not '0'
   - Badge: Red background, red text
   - Meaning: Machine has encountered a fault and is not operational

#### Display Format:
- Uppercase text
- Rounded pill-shaped badge
- High contrast for visibility

### 12. Days Since Service

- **Source**: Calculated from `cloud_dashboard_hkmi.last_service_date`
- **Display Logic**: `client/src/components/dashboard/IoTDataTable.jsx:272-288`

#### Calculation Logic:
```javascript
if (row?.last_service_date) {
  // Parse date without timezone conversion (prevents date shifting)
  const dateStr = String(row.last_service_date).split('T')[0];
  const [year, month, day] = dateStr.split('-').map(num => parseInt(num, 10));
  const lastServiceDate = new Date(year, month - 1, day);

  // Get today's date at midnight
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calculate difference in days
  const diffTime = Math.abs(today - lastServiceDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}
return '-';
```

#### Data Management:
- **Updatable**: Can be updated via Excel/CSV file upload
- **Required Column**: `last_service_date` (in upload file)
- **Format**: Integer number of days
- **Example**: "45" (45 days since last service)

#### Purpose:
- Track maintenance intervals
- Schedule preventive maintenance
- Ensure compliance with service schedules
- Identify overdue maintenance

---

## Backend Data Logic

### Primary Controller: IoT Data Controller

**File**: `server/controllers/iotDataController.js`

### Data Retrieval Process

#### Step 1: Client Hierarchy Filtering
```javascript
// Get all client IDs (user's client + child clients only)
const descendantClients = await Client.getDescendantClients(user.client_id);
const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];
```

**Purpose**: Implement row-level security based on client hierarchy

#### Step 2: Device Filtering
```javascript
// Get all devices belonging to these clients
const deviceQuery = `
  SELECT device_id, client_id
  FROM device
  WHERE client_id IN (${allClientIds.join(',')})
`;
```

**Purpose**: Retrieve only devices the user has permission to view

#### Step 3: Latest IoT Data Join
```javascript
// Get only the most recent record per device
SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
FROM iot_data_sick
WHERE Device_ID IN (devicePlaceholders)
GROUP BY Device_ID
```

**Purpose**: Display real-time data (latest reading per device)

#### Step 4: HKMI Configuration Join
```javascript
// Left join HKMI configuration data
LEFT JOIN (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
  FROM cloud_dashboard_hkmi
) hkmi ON iot.Device_ID = hkmi.device_id AND hkmi.rn = 1
```

**Purpose**:
- Enrich IoT data with configuration metadata
- Use window function to get latest HKMI record per device
- Left join ensures devices without HKMI config still appear

### Filtering Capabilities

#### 1. Search Filter
```javascript
// Search across multiple fields
WHERE (
  iot.Device_ID LIKE @search OR
  iot.MessageType LIKE @search OR
  iot.FaultDescriptions LIKE @search
)
```

#### 2. Hierarchy Filters
```javascript
// Filter by management hierarchy
WHERE hkmi.sden = @sden
  AND hkmi.den = @den
  AND hkmi.aen = @aen
  AND hkmi.sse = @sse
```

#### 3. GSM Signal Strength Filter
```javascript
// Show devices with below-average GSM signal
if (gsm_filter === 'below_average' && avg_gsm) {
  WHERE iot.GSM_Signal_Strength < @avgGsm
}
```

### Pagination
- **Default Page Size**: 20 records
- **Maximum Page Size**: 100 records
- **Offset Calculation**: `(page - 1) * limit`

### Sorting
**Allowed Sort Fields**:
- Entry_ID, CreatedAt, Device_ID, MessageType, Timestamp
- GSM_Signal_Strength, Motor_ON_Time_sec, Motor_OFF_Time_sec
- Latitude, Longitude, Train_Passed

**Default Sort**: `Timestamp DESC` (newest first)

---

## Configuration Table Management

### HKMI Table Component

**File**: `client/src/components/dashboard/HKMITable.jsx`

### Purpose
Separate interface for managing HKMI configuration data that feeds into the main dashboard.

### Columns in Configuration Table
1. Machine ID
2. SDEN (Senior Divisional Engineer)
3. DEN (Divisional Engineer)
4. AEN (Assistant Engineer)
5. SSE (Senior Section Engineer)
6. Division/Railway
7. Section
8. Curve Number
9. Line
10. **Grease Left (kg)** - Updatable via file upload
11. **Last Service Date** - Updatable via file upload

### File Upload Feature

**Implementation**: `client/src/components/dashboard/HKMITable.jsx:206-234`

#### Supported File Formats
- CSV (.csv)
- Excel (.xlsx, .xls)

#### File Validation
- **Maximum File Size**: 10MB
- **MIME Type Validation**: Checks both file type and extension
- **Column Validation**: Ensures all required columns exist

#### Required Columns (Exact Names)
1. `device_id` - Device identifier
2. `machine_id` - Machine identifier
3. `grease_left` - Current grease level (numeric)
4. `last_service_date` - Date of last service (date format)

#### Upload Process

**Step 1: File Selection**
```javascript
// Validate file type and size
const allowedTypes = ['text/csv', 'application/vnd.ms-excel',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const allowedExtensions = ['.csv', '.xls', '.xlsx'];
const maxSize = 10 * 1024 * 1024; // 10MB
```

**Step 2: Backend Processing**
- Parse CSV/Excel file
- Validate each row
- Match `device_id` with existing devices
- Update `grease_left` and `last_service_date` fields

**Step 3: Results Display**
- **Upload Summary**:
  - Total rows processed
  - Successful updates count
  - Rejected rows count

- **Rejected Rows Table**:
  - Row number
  - Device ID
  - Machine ID
  - Grease Left
  - Last Service Date
  - Rejection reasons (detailed error messages)

#### Upload Response Format
```javascript
{
  total_rows: 100,
  successful_count: 95,
  rejected_count: 5,
  rejected_rows: [
    {
      row_number: 23,
      device_id: "RTM001-UP-001",
      machine_id: "MACHINE-001",
      grease_left: "abc", // Invalid - not numeric
      last_service_date: "2024-01-15",
      reasons: [
        "Invalid grease_left: must be numeric",
        "Device not found in database"
      ]
    }
  ]
}
```

#### Auto-Refresh
After successful upload with updates, the main dashboard automatically refreshes to display new values.

---

## Key Dashboard Features

### 1. Pagination
- **Records Per Page**: 20 (default, configurable up to 100)
- **Navigation**: Previous/Next buttons + page number buttons
- **Page Display**: Shows 5 page numbers at a time
- **Record Count**: "Showing X to Y of Z results"

### 2. Sorting
- **All Major Columns**: Click column header to sort
- **Toggle Behavior**: DESC → ASC → DESC
- **Visual Indicators**:
  - Up arrow (green) for ASC sort
  - Down arrow (green) for DESC sort
  - Gray arrows when not active

### 3. Search
- **Full-Text Search**: Searches across Device ID, Message Type, Fault Descriptions
- **Debounced**: Only searches on form submit (not on each keystroke)
- **Case Insensitive**: Searches using SQL LIKE with wildcards
- **Reset Pagination**: Search always starts from page 1

### 4. Export Functionality
**Export Formats**:
- **CSV**: Downloads as comma-separated values
- **JSON**: Downloads as formatted JSON

**Export Scope**:
- Respects current filters
- Exports all matching records (up to 10,000 limit)
- Includes all columns from both IoT and HKMI tables

**Implementation**: `server/controllers/iotDataController.js:351-605`

### 5. Row Click Navigation
- **Enabled by Default**: Rows are clickable
- **Target**: `/dashboard/device/{Entry_ID}`
- **Visual Feedback**:
  - Hover background change (gray-50)
  - Cursor changes to pointer
  - Tooltip: "Click to view details for device {Device_ID}"
- **Can Disable**: Use `disableRowClick={true}` prop

### 6. Real-Time Data Display
- **Latest Records Only**: Shows most recent reading per device
- **No Historical Data**: Historical data available in device detail view
- **Refresh Capability**: Manual refresh via filters or search

### 7. Row-Level Security
**Automatic Filtering**:
- Users only see devices from their client and child clients
- Parent client data is NOT visible to child clients
- Enforced at database query level
- No client-side filtering required

---

## Data Flow Diagram

```
User Login
    ↓
Client Hierarchy Determined (User's Client + Children)
    ↓
Get All Devices for These Clients
    ↓
Fetch Latest IoT Data (iot_data_sick)
    ↓
LEFT JOIN HKMI Configuration (cloud_dashboard_hkmi)
    ↓
Apply Filters (Search, Hierarchy, GSM)
    ↓
Calculate Derived Fields (Status, Days Since Service)
    ↓
Sort & Paginate
    ↓
Display in Dashboard
```

---

## Database Tables Reference

### Table 1: iot_data_sick
**Purpose**: Stores real-time telemetry from IoT sensors

**Key Fields**:
- `Entry_ID` - Unique record identifier
- `CreatedAt` - Record creation timestamp
- `Device_ID` - Device identifier
- `Timestamp` - Sensor reading timestamp
- `GSM_Signal_Strength` - Signal strength (0-6)
- `Motor_Current_mA` - Motor current in milliamps
- `Fault_Code` - Error code (0 = no fault)
- `Latitude` / `Longitude` - GPS coordinates
- `Motor_ON_Time_sec` / `Motor_OFF_Time_sec` - Motor operation times
- `Train_Passed` - Train detection flag
- `FaultDescriptions` - Human-readable fault messages

### Table 2: cloud_dashboard_hkmi
**Purpose**: Stores machine configuration and maintenance data

**Key Fields**:
- `id` - Unique record identifier
- `device_id` - Links to iot_data_sick.Device_ID
- `machine_id` - Human-readable machine identifier
- `sden`, `den`, `aen`, `sse` - Management hierarchy
- `div_rly` - Division/Railway
- `section` - Railway section
- `curve_number` - Curve identifier
- `line` - Railway line
- `grease_left` - Current grease level (kg)
- `last_service_date` - Last maintenance date
- `created_at` / `updated_at` - Record timestamps

### Table 3: device
**Purpose**: Device registry with client ownership

**Key Fields**:
- `device_id` - Unique device identifier
- `client_id` - Owner client ID (for access control)

### Table 4: client
**Purpose**: Client hierarchy for multi-tenant access control

**Key Fields**:
- `client_id` - Unique client identifier
- `parent_client_id` - Hierarchical relationship

---

## Security & Access Control

### Client Hierarchy Model
- **Tree Structure**: Clients can have child clients
- **Access Rules**:
  - Users see their own client's devices
  - Users see all descendant (child) client devices
  - Users do NOT see parent or sibling client devices

### Implementation
```javascript
// Get self + children only
const descendantClients = await Client.getDescendantClients(user.client_id);
const allClientIds = [user.client_id, ...descendantClients.map(c => c.client_id)];

// Filter devices by these clients
WHERE client_id IN (allClientIds)
```

### Audit Logging
All major operations are logged:
- `HKMI_TABLE_VIEW` - Viewing HKMI data
- `IOT_DATA_VIEW` - Viewing IoT data
- `IOT_DATA_EXPORT` - Exporting data
- `IOT_DATA_STATS` - Viewing statistics

**Log Details**:
- User ID
- Action type
- Timestamp
- Context (search terms, filters, record counts)

---

## Performance Optimizations

### 1. Database Query Optimization
- **Indexes**: Use indexes on Device_ID, CreatedAt, client_id
- **Latest Record Subquery**: Pre-filters to latest records before joining
- **Window Functions**: Efficient partitioning for HKMI data
- **Parameterized Queries**: Prevent SQL injection and enable query plan caching

### 2. Frontend Optimizations
- **useMemo**: Cache column definitions and calculated values
- **useCallback**: Prevent unnecessary function recreations
- **Pagination**: Load only 20-100 records at a time
- **Lazy Loading**: Components load data only when needed

### 3. Network Optimizations
- **Request Batching**: Single request for data + metadata
- **Compression**: Server compresses large responses
- **Timeout**: 60-second timeout for large exports

---

## Error Handling

### Frontend Error States
1. **Loading State**: Shows spinner with "Loading IoT data..."
2. **Error State**: Red alert banner with error message
3. **Empty State**: "No data found for the selected filters"
4. **No Devices**: "Please apply hierarchy filters to view IoT data"

### Upload Error Handling
1. **File Validation Errors**: Immediate feedback on file type/size
2. **Processing Errors**: Display error message from server
3. **Rejected Rows**: Detailed table showing what failed and why
4. **Partial Success**: Shows successful count even if some rows failed

### Backend Error Handling
- **Validation Errors**: 400 Bad Request with detailed messages
- **Authentication Errors**: 401 Unauthorized → redirect to login
- **Database Errors**: Logged and returned as 500 Internal Server Error
- **Not Found**: 404 for missing resources

---

## Future Enhancement Considerations

### Potential Improvements
1. **Real-time Updates**: WebSocket integration for live data
2. **Advanced Filtering**: Date ranges, multi-select filters
3. **Bulk Operations**: Bulk update grease levels without file upload
4. **Alerts**: Configurable alerts for low grease, offline devices
5. **Analytics**: Trend charts, predictive maintenance
6. **Mobile Optimization**: Responsive design improvements
7. **Offline Support**: PWA with offline capability
8. **Map View**: Visual map showing device locations

---

## Technical Stack Summary

### Frontend
- **Framework**: React 18+
- **Routing**: React Router
- **State Management**: Context API (AuthContext, DashboardContext)
- **HTTP Client**: Axios
- **Styling**: Tailwind CSS

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Microsoft SQL Server
- **ORM**: mssql (node-mssql)
- **Authentication**: JWT tokens
- **Validation**: express-validator

### Key Dependencies
- **File Upload**: FormData API, multer (backend)
- **Date Handling**: Native JavaScript Date (timezone-aware parsing)
- **Excel Parsing**: xlsx or similar library (backend)
- **CSV Parsing**: csv-parser or similar (backend)

---

## Conclusion

The HKMI & Sick Sensor Dashboard is a comprehensive IoT monitoring solution designed for railway curve greasing machine management. It combines real-time sensor telemetry with configuration metadata to provide operators with actionable insights for maintenance, status monitoring, and operational efficiency.

Key strengths:
- **Real-time Monitoring**: Latest device data always displayed
- **Hierarchical Access Control**: Multi-tenant security built-in
- **Maintenance Tracking**: Grease levels and service dates prominently featured
- **Status Visualization**: Color-coded indicators for quick assessment
- **Flexible Data Management**: Upload capability for bulk updates
- **Comprehensive Filtering**: Search, hierarchy, and signal strength filters

This documentation provides a complete reference for understanding, maintaining, and extending the dashboard functionality.
