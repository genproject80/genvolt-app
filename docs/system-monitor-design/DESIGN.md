# System Monitor Page - Design Document

## Overview

A centralized monitoring dashboard for GenVolt IoT platform administrators to observe system health, device performance, database metrics, MQTT broker status, and recent activity — all in real time.

**Access**: SUPER_ADMIN and SYSTEM_ADMIN only
**Route**: `/admin/system-monitor`
**Auto-refresh**: Every 30 seconds (toggleable)

---

## Visual Preview

![System Monitor Mockup](./screenshot.png)

*Screenshot of the System Monitor page mockup. Open `mockup.html` for an interactive version with live-updating uptime counter and auto-refresh simulation.*

---

## Section-by-Section Breakdown

### 1. Page Header (Top Bar)

**What it monitors:** Nothing directly — this is the control bar for the page itself.

**Components:**
- **Title & subtitle** — "System Monitor" with description
- **Last refreshed timestamp** — Shows when data was last pulled from the backend, so admins know how fresh the numbers are
- **Auto-refresh toggle** — A switch that enables/disables automatic polling every 30 seconds. Uses Headless UI `Switch` component
- **Refresh button** — Manual trigger to fetch all data immediately

**How it works:** A `setInterval` in the React page component calls all 5 API endpoints in parallel every 30 seconds when auto-refresh is on. `Promise.allSettled` ensures that if one endpoint fails (e.g., EMQX is down), the other panels still update.

---

### 2. Server Status Card

**What it monitors:** The **Azure Web App** running the Express.js backend (`backend.cloudsynk.net`).

**Metrics displayed:**
| Metric | Source | Description |
|--------|--------|-------------|
| Online/Offline status | Server responding to API call | If this card loads, the server is online |
| Uptime | `process.uptime()` (Node.js) | How long since the server process last restarted. A sudden reset to 0 indicates a crash or redeployment |
| Node.js version | `process.version` | The runtime version on the Azure Web App (v20.x in production) |
| Environment | `process.env.NODE_ENV` | Shows `production` or `development` to confirm which config is active |

**How it monitors:** The frontend calls `GET /api/system/health`. The controller uses Node.js built-in `process` object — no external dependencies. If the server is down, the entire page will show an error state (since no API calls succeed).

**Azure resource:** Azure Web App (`cloudsynk-backend-api-prod`)

---

### 3. Memory Usage Card

**What it monitors:** The **Node.js process memory** on the Azure Web App.

**Metrics displayed:**
| Metric | Source | Description |
|--------|--------|-------------|
| Heap Used / Heap Total | `process.memoryUsage().heapUsed` / `heapTotal` | V8 JavaScript heap. High usage (>85%) may indicate memory leaks |
| RSS (Resident Set Size) | `process.memoryUsage().rss` | Total memory allocated to the process by the OS, including heap + stack + C++ objects |
| Usage % | Calculated: `heapUsed / heapTotal * 100` | Quick visual indicator via progress bar. Blue bar fills proportionally |

**How it monitors:** Same `GET /api/system/health` endpoint. The controller calls `process.memoryUsage()` which returns bytes, then converts to MB for display. The progress bar turns yellow at >75% and red at >90%.

**Why it matters:** Azure Web App plans have memory limits. If RSS grows continuously without plateauing, it signals a memory leak that could cause the app to crash or get OOM-killed.

---

### 4. CPU Load Card

**What it monitors:** The **CPU load** on the Azure Web App's underlying VM/container.

**Metrics displayed:**
| Metric | Source | Description |
|--------|--------|-------------|
| 1 min average | `os.loadavg()[0]` | Short-term CPU pressure. Spikes during burst traffic |
| 5 min average | `os.loadavg()[1]` | Medium-term trend. Sustained high values suggest need for scaling |
| 15 min average | `os.loadavg()[2]` | Long-term baseline. Should stay well below CPU core count |
| CPU Cores | `os.cpus().length` | Number of vCPUs on the Azure plan. Load avg should stay below this number |

**How it monitors:** Same `GET /api/system/health` endpoint. Uses Node.js `os` module. Progress bars show load relative to max (CPU core count * 2).

**Note:** `os.loadavg()` returns `[0, 0, 0]` on Windows. This is fine — the Azure production deployment runs Linux. The component shows "N/A" when all values are zero (local dev on Windows).

---

### 5. Database Health Card

**What it monitors:** The **Azure SQL Server** database connection (`GenVolt` database).

**Metrics displayed:**
| Metric | Source | Description |
|--------|--------|-------------|
| Healthy/Unhealthy status | `SELECT 1` test query | Green badge if the query succeeds, red if it fails or times out |
| Response Time (ms) | `Date.now()` before/after health query | Measures round-trip time for a simple query. <20ms is good, >100ms indicates problems |
| Database name | `DB_NAME()` SQL function | Confirms which database is connected (GenVolt) |
| Server type | Static label | SQL Server — confirms the backend is connected to the expected DBMS |

**How it monitors:** The controller calls `checkDatabaseHealth()` from `server/config/database.js`, which executes `SELECT 1 as health_check, GETUTCDATE() as timestamp`. It wraps this in timing logic to measure response latency.

**Azure resource:** Azure SQL Database (the SQL Server instance hosting `GenVolt`)

---

### 6. Device Performance Panel

**What it monitors:** All **IoT devices** registered in the `dbo.device` table — their activation states, connectivity freshness, and telemetry throughput.

**Sub-sections:**

#### 6a. Status Summary (4 stat blocks)
| Metric | SQL Query | Description |
|--------|-----------|-------------|
| Total | `COUNT(*) FROM dbo.device` | All registered devices |
| Active | `WHERE activation_status = 'active'` | Devices currently activated and communicating |
| Inactive | `WHERE activation_status = 'inactive'` | Devices that have been deactivated |
| Pending | `WHERE activation_status = 'pending'` | Devices that connected via pre-activation but haven't been assigned to a client yet |

#### 6b. Last Seen Distribution (Donut/Pie Chart)
Shows how recently devices have communicated, using the `last_seen` column from `dbo.device`:

| Segment | SQL Condition | What it means |
|---------|--------------|---------------|
| Last 5 min (green) | `last_seen >= DATEADD(minute, -5, GETUTCDATE())` | Actively reporting right now |
| Last 1 hr (blue) | Between 5 min and 1 hr ago | Recently active, likely on a longer reporting interval |
| Last 24 hr (amber) | Between 1 hr and 24 hr ago | May be offline or in a low-power mode |
| Over 24 hr (red) | More than 24 hrs ago | Likely offline — needs investigation |
| Never seen (gray) | `last_seen IS NULL` | Registered but has never sent telemetry |

**Why it matters:** A growing "Over 24 hr" or "Never seen" segment signals connectivity issues, firmware problems, or devices that were registered but never deployed in the field.

#### 6c. Telemetry Rate (Bar Chart)
Shows the number of telemetry messages received in the last hour, grouped into 10-minute buckets:

```sql
SELECT DATEADD(MINUTE, (DATEDIFF(MINUTE, 0, created_at) / 10) * 10, 0) as bucket,
       COUNT(*) as count
FROM dbo.DeviceTelemetry
WHERE created_at >= DATEADD(hour, -1, GETUTCDATE())
GROUP BY DATEADD(MINUTE, (DATEDIFF(MINUTE, 0, created_at) / 10) * 10, 0)
```

Each bar represents a 10-minute window. A sudden drop in bar height indicates devices stopped reporting (network issue, broker outage, or firmware crash).

**API endpoint:** `GET /api/system/devices/stats`

---

### 7. MQTT Broker Panel (EMQX)

**What it monitors:** The **EMQX MQTT broker** running at `mqtt.cloudsynk.net` — the message bus that all IoT devices connect to for publishing telemetry and receiving configuration commands.

**Sub-sections:**

#### 7a. Connection Status Banner
| State | Meaning |
|-------|---------|
| Green "Connected to EMQX Broker" | The backend can reach the EMQX Management API |
| Red "Disconnected" | EMQX Management API is unreachable (broker may be down) |
| Gray "Not Configured" | `EMQX_MGMT_API_URL` or `EMQX_MGMT_API_KEY` env vars are not set |

#### 7b. Stats Grid (4 metric blocks)
| Metric | EMQX API Source | Description |
|--------|----------------|-------------|
| Connected Clients | `GET /stats` → `connections.count` | Number of devices currently maintaining a TCP/TLS connection to the broker |
| Active Topics | `GET /stats` → `topics.count` | Number of MQTT topics with at least one subscriber |
| Subscriptions | `GET /stats` → `subscriptions.count` | Total active topic subscriptions across all clients |
| Retained Messages | `GET /stats` → `retained.count` | Messages stored by the broker for immediate delivery to new subscribers |

#### 7c. Message Throughput (3 progress bars)
| Metric | EMQX API Source | Description |
|--------|----------------|-------------|
| Received | `messages.received` | Total messages the broker has received from all device publishers |
| Sent | `messages.sent` | Total messages the broker has delivered to subscribers |
| Dropped | `messages.dropped` | Messages that couldn't be delivered (subscriber offline, queue full). High numbers indicate problems |

**How it monitors:** The controller uses `fetch()` with `Authorization: Bearer ${EMQX_MGMT_API_KEY}` to call the EMQX Management REST API (same auth pattern as `server/services/emqxMgmtService.js`). The API runs on port 18083.

**API endpoint:** `GET /api/system/mqtt/stats`
**Azure resource:** The VM/container running EMQX (mqtt.cloudsynk.net)

---

### 8. Database Metrics Panel

**What it monitors:** The **Azure SQL Server database** — storage consumption, connection pooling, and table growth.

**Sub-sections:**

#### 8a. Database Info (3 stat blocks)
| Metric | Source | Description |
|--------|--------|-------------|
| Database name | `DB_NAME()` | Confirms which database is connected |
| Size (MB) | `SELECT SUM(size * 8 / 1024) FROM sys.database_files` | Total allocated storage. Monitor growth to stay within Azure SQL tier limits |
| Response time | Timed `SELECT 1` query | Same as the health card — repeated here for context |

#### 8b. Connection Pool (Stacked Bar)
Shows how the `mssql` connection pool (max 10) is being utilized:

| Segment | Source | Description |
|---------|--------|-------------|
| Borrowed (purple) | Pool internal state | Connections currently executing queries |
| Available (green) | Pool internal state | Idle connections ready for use |

**Why it matters:** If borrowed consistently equals the max (10), queries are being queued and latency increases. This signals the need to increase the pool size or optimize slow queries.

The pool object is accessed via `getPool()` from `server/config/database.js`. The `mssql` library exposes pool statistics through its internal state.

#### 8c. Table Record Counts (Horizontal Bars)
Shows approximate row counts for the main tables:

| Table | What it stores | Why monitor |
|-------|---------------|-------------|
| `DeviceTelemetry` | Every raw telemetry payload from every device | Largest table — grows fastest. Monitor for unexpected spikes or flat-lines |
| `audit_log` | All user/system activity records | Steady growth expected. Sudden spikes may indicate automated actions |
| `device` | Registered device records | Should grow slowly as new devices are deployed |
| `user` | Platform user accounts | Small, stable table |
| `client` | Client organizations | Very small, rarely changes |

**How it queries:** Uses `sys.dm_db_partition_stats` instead of `COUNT(*)` for performance:
```sql
SELECT t.name as table_name, SUM(p.rows) as row_count
FROM sys.tables t
JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
WHERE t.name IN ('device', 'DeviceTelemetry', 'audit_log', 'client', 'user')
GROUP BY t.name
```
This returns instantly even on million-row tables because SQL Server maintains these counts internally.

**API endpoint:** `GET /api/system/database/stats`

---

### 9. Recent Activity Feed

**What it monitors:** The **audit trail** from the `dbo.audit_log` table — a chronological feed of all significant actions performed on the platform.

**Displayed fields per entry:**
| Field | Source Column | Description |
|-------|-------------|-------------|
| Action name | `audit_log.action` | The specific action (e.g., USER_LOGIN, DEVICE_ACTIVATED) |
| User | JOIN `dbo.[user]` on `user_id` | Who performed the action |
| Target | `audit_log.target_type` + `target_id` | What was affected (e.g., "Device HK-0042") |
| Time | `audit_log.created_at` | Displayed as relative time ("2 min ago", "1 hr ago") |
| Activity type badge | `audit_log.activity_type` | Color-coded category badge |

**Color coding by activity type:**
| Color | Activity Type | Examples |
|-------|--------------|---------|
| Green | AUTHENTICATION | USER_LOGIN, USER_LOGOUT, TOKEN_REFRESHED |
| Orange | DEVICE_MANAGEMENT | DEVICE_ACTIVATED, DEVICE_PAUSE, CREDENTIAL_ROTATION |
| Blue | DATA_ACCESS | DATA_EXPORT, telemetry queries |
| Purple | USER_MANAGEMENT / CLIENT_MANAGEMENT | USER_CREATED, CLIENT_UPDATED |
| Gray | CONFIGURATION | FEATURE_FLAG_UPDATED, table config changes |
| Red | SECURITY | LOGIN_FAILED, unauthorized access attempts |

**How it queries:**
```sql
SELECT TOP 20
  a.audit_id, a.activity_type, a.action, a.target_type, a.target_id,
  a.details, a.ip_address, a.created_at,
  u.email as user_email, u.first_name, u.last_name
FROM dbo.audit_log a
LEFT JOIN dbo.[user] u ON a.user_id = u.user_id
ORDER BY a.created_at DESC
```

**Why it matters:** Provides instant visibility into who is doing what on the platform. Useful for:
- Spotting failed login attempts (security)
- Tracking device activation/deactivation activity
- Auditing configuration changes
- Identifying unusual patterns (e.g., mass device pauses)

**API endpoint:** `GET /api/system/activity`

---

## API Endpoints Summary

All endpoints require admin JWT authentication (`Authorization: Bearer <token>`).

| Method | Path | Description | Backend Source |
|--------|------|-------------|---------------|
| GET | `/api/system/health` | Server uptime, memory, CPU, DB health | Node.js `process` + `os` modules |
| GET | `/api/system/devices/stats` | Device counts, last-seen, telemetry rates | SQL queries on `dbo.device` + `dbo.DeviceTelemetry` |
| GET | `/api/system/database/stats` | DB size, table counts, connection pool | `sys.database_files` + `sys.dm_db_partition_stats` + pool object |
| GET | `/api/system/mqtt/stats` | EMQX broker metrics | EMQX Management REST API (port 18083) |
| GET | `/api/system/activity` | Recent audit log entries | SQL query on `dbo.audit_log` JOIN `dbo.[user]` |

---

## Files to Create

### Backend (2 new files)
- `server/controllers/systemMonitorController.js` — 5 endpoint handlers
- `server/routes/systemMonitorRoutes.js` — Route definitions with admin middleware

### Frontend (7 new files)
- `client/src/services/systemMonitorService.js` — API service layer (Axios)
- `client/src/pages/SystemMonitor/SystemMonitor.jsx` — Main page with auto-refresh
- `client/src/components/systemMonitor/SystemHealthCards.jsx` — Health metric cards
- `client/src/components/systemMonitor/DevicePerformancePanel.jsx` — Device stats + charts
- `client/src/components/systemMonitor/MqttBrokerPanel.jsx` — EMQX broker panel
- `client/src/components/systemMonitor/DatabaseMetricsPanel.jsx` — DB metrics panel
- `client/src/components/systemMonitor/ActivityFeed.jsx` — Audit log feed

### Modified Files (3 existing files)
- `server/server.js` — Register `/api/system` route
- `client/src/App.jsx` — Add `AdminOnlyRoute` for `/admin/system-monitor`
- `client/src/components/layout/Sidebar.jsx` — Add nav link with `ServerStackIcon`

---

## Key Design Decisions

1. **`sys.dm_db_partition_stats` over `COUNT(*)`** — Instant approximate row counts vs. full table scans on million-row telemetry tables
2. **`Promise.allSettled` for data fetching** — Each panel independently succeeds or fails; partial data is better than no data on a monitoring page
3. **No new Context provider** — Simple `useState` + `useEffect` in the page component; monitoring data doesn't need to be shared across routes
4. **EMQX graceful degradation** — If management API is not configured, show a friendly "not configured" message instead of errors
5. **Inline admin middleware** — Follows the `featureFlagRoutes.js` pattern rather than creating a new middleware
6. **30-second polling** — Balanced between freshness and API load. Each refresh makes 5 lightweight API calls

---

## Monitoring Coverage Map

| Resource | Where it runs | What we monitor | Panel |
|----------|--------------|-----------------|-------|
| Express.js Backend | Azure Web App (`cloudsynk-backend-api-prod`) | Uptime, memory, CPU | Server Status + Memory + CPU cards |
| SQL Server Database | Azure SQL | Health, size, pool, table growth | Database Health card + Database Metrics panel |
| EMQX MQTT Broker | VM at `mqtt.cloudsynk.net` | Connections, topics, messages | MQTT Broker panel |
| IoT Devices | Field-deployed hardware | Status, last-seen, telemetry rate | Device Performance panel |
| Platform Activity | `dbo.audit_log` table | User actions, security events | Activity Feed panel |