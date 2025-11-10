# Device Management Module - Technical Plan Document

**Document Version:** 1.0
**Last Updated:** November 8, 2025
**Project:** GenVolt Application

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Module Overview](#module-overview)
3. [Database Architecture](#database-architecture)
4. [Client Hierarchy System](#client-hierarchy-system)
5. [Device Onboarding Process](#device-onboarding-process)
6. [Device Transfer Logic](#device-transfer-logic)
7. [Transfer Rules and Scenarios](#transfer-rules-and-scenarios)
8. [Examples with Client Hierarchy](#examples-with-client-hierarchy)
9. [API Endpoints](#api-endpoints)
10. [Validation Rules](#validation-rules)
11. [Security and Authorization](#security-and-authorization)
12. [File Structure](#file-structure)

---

## 1. Executive Summary

The Device Management Module is a sophisticated system that enables hierarchical device ownership and controlled transfer of devices between clients. The module implements a parent-child client hierarchy model where devices can be transferred down the hierarchy chain with specific rules and restrictions to maintain data integrity and business logic compliance.

**Key Features:**
- Multi-level client hierarchy support
- Controlled device onboarding with auto-assignment
- Rule-based device transfer with hierarchy validation
- Complete transfer history tracking
- Role-based access control
- Comprehensive audit logging

---

## 2. Module Overview

### 2.1 Purpose

The Device Management Module manages IoT devices throughout their lifecycle, from onboarding to transfer between clients within an organizational hierarchy.

### 2.2 Core Components

1. **Device Registry** - Central repository of all devices
2. **Client Hierarchy** - Multi-level organizational structure
3. **Transfer Engine** - Handles device ownership changes
4. **History Tracker** - Maintains complete transfer audit trail
5. **Access Control** - Permission-based operations

### 2.3 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                          │
│  (React Components, Context, Services)                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Express)                        │
│  Routes → Validation → Permission Check → Controller        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Business Logic Layer                       │
│  Device Model | Client Model | Transfer Logic               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Database Layer (SQL Server)                │
│  device | client | client_device | audit_logs               │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Database Architecture

### 3.1 Device Table Schema

**Table:** `device`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT | PRIMARY KEY, IDENTITY | Auto-incrementing ID |
| device_id | NVARCHAR(100) | UNIQUE, NOT NULL | Unique device identifier |
| channel_id | NVARCHAR(100) | NULL | Optional channel ID |
| api_key | NVARCHAR(255) | NULL | API authentication key |
| Model | NVARCHAR(100) | NULL | Device model/type |
| machin_id | NVARCHAR(100) | NULL | Machine identifier |
| client_id | INT | FOREIGN KEY → client(client_id) | Current owner |
| onboarding_date | DATE | NULL | Date device was registered |
| conversionLogic_ld | NVARCHAR(MAX) | NULL | Conversion logic data |
| TransactionTableID | INT | NULL | Transaction table reference |
| TransactionTableName | NVARCHAR(255) | NULL | Transaction table name |
| field_id | INT | NULL | Field reference |

**Key Indexes:**
- Primary Key on `id`
- Unique Index on `device_id`
- Foreign Key Index on `client_id`

### 3.2 Client Table Schema

**Table:** `client`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| client_id | INT | PRIMARY KEY, IDENTITY | Auto-incrementing ID |
| parent_id | INT | FOREIGN KEY → client(client_id), NULL | Parent client (for hierarchy) |
| name | NVARCHAR(255) | NOT NULL | Client name |
| email | NVARCHAR(255) | UNIQUE, NOT NULL | Contact email |
| phone | NVARCHAR(20) | NULL | Contact phone |
| Address | NVARCHAR(500) | NULL | Physical address |
| contact_person | NVARCHAR(255) | NULL | Contact person name |
| city | NVARCHAR(100) | NULL | City |
| state | NVARCHAR(100) | NULL | State/Province |
| is_active | BIT | DEFAULT 1 | Soft delete flag |
| created_by_user_id | INT | NULL | Audit: creator |
| updated_by_user_id | INT | NULL | Audit: last updater |
| created_at | DATETIME | DEFAULT GETDATE() | Creation timestamp |
| updated_at | DATETIME | DEFAULT GETDATE() | Last update timestamp |

**Key Indexes:**
- Primary Key on `client_id`
- Unique Index on `email`
- Foreign Key Index on `parent_id` (self-reference)

### 3.3 Transfer History Table Schema

**Table:** `client_device`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT | PRIMARY KEY, IDENTITY | Auto-incrementing ID |
| seller_id | INT | FOREIGN KEY → client(client_id) | Source client |
| buyer_id | INT | FOREIGN KEY → client(client_id) | Target client |
| device_id | INT | FOREIGN KEY → device(id) | Transferred device |
| transfer_date | DATETIME | DEFAULT GETDATE() | Transfer timestamp |

**Key Indexes:**
- Primary Key on `id`
- Foreign Key Index on `seller_id`
- Foreign Key Index on `buyer_id`
- Foreign Key Index on `device_id`
- Composite Index on `(device_id, transfer_date DESC)` for history queries

### 3.4 Entity Relationship Diagram

```
┌──────────────────┐
│     client       │
│                  │
│ client_id (PK)   │◄────┐
│ parent_id (FK)   │─────┘ (self-reference for hierarchy)
│ name             │
│ email (UNIQUE)   │
│ ...              │
└────────┬─────────┘
         │
         │ 1:N
         │
         ▼
┌──────────────────┐
│     device       │
│                  │
│ id (PK)          │
│ device_id (UK)   │
│ client_id (FK)   │──────┐
│ Model            │      │
│ machin_id        │      │
│ ...              │      │
└────────┬─────────┘      │
         │                │
         │ 1:N            │
         │                │
         ▼                │
┌──────────────────┐      │
│  client_device   │      │
│                  │      │
│ id (PK)          │      │
│ seller_id (FK)   │──────┤
│ buyer_id (FK)    │──────┘
│ device_id (FK)   │
│ transfer_date    │
└──────────────────┘
```

---

## 4. Client Hierarchy System

### 4.1 Hierarchy Structure

The client hierarchy is implemented using the **Adjacency List Model** where each client has a `parent_id` field pointing to its parent client.

**Characteristics:**
- Root clients have `parent_id = NULL`
- Unlimited depth support
- Multiple root clients allowed
- Siblings share the same parent

### 4.2 Hierarchy Traversal Methods

#### 4.2.1 Get Descendant Clients

**Method:** `Client.getDescendantClients(clientId)`
**File:** `server/models/Client.js` (Lines 325-378)

**SQL Implementation:**
```sql
WITH RECURSIVE ClientHierarchy AS (
  -- Base case: Start with the given client
  SELECT
    client_id,
    parent_id,
    name,
    email,
    0 AS level
  FROM client
  WHERE client_id = @clientId AND is_active = 1

  UNION ALL

  -- Recursive case: Get children
  SELECT
    c.client_id,
    c.parent_id,
    c.name,
    c.email,
    ch.level + 1 AS level
  FROM client c
  INNER JOIN ClientHierarchy ch ON c.parent_id = ch.client_id
  WHERE c.is_active = 1
)
SELECT * FROM ClientHierarchy
WHERE level > 0  -- Exclude the starting client
ORDER BY level, name;
```

**Returns:**
- Array of all descendant clients
- Includes `level` property (0 = self, 1 = children, 2 = grandchildren, etc.)
- Ordered by hierarchy level and name

#### 4.2.2 Check Descendant Relationship

**Method:** `Client.isDescendant(ancestorId, descendantId)`
**File:** `server/models/Client.js` (Lines 386-406)

**Logic:**
1. Get all descendants of `ancestorId`
2. Check if `descendantId` exists in the result set
3. Return `true` if found, `false` otherwise

**Use Cases:**
- Transfer validation
- Access control checks
- Hierarchy relationship verification

#### 4.2.3 Get Hierarchy Path

**Method:** `Client.getHierarchyPath(fromClientId, toClientId)`
**File:** `server/models/Client.js` (Lines 414-487)

**SQL Implementation:**
```sql
WITH RECURSIVE PathFinder AS (
  -- Start from the target (descendant)
  SELECT
    client_id,
    parent_id,
    CAST(client_id AS NVARCHAR(MAX)) AS path,
    0 AS depth
  FROM client
  WHERE client_id = @toClientId

  UNION ALL

  -- Walk up to ancestors
  SELECT
    c.client_id,
    c.parent_id,
    CAST(c.client_id AS NVARCHAR(MAX)) + ',' + pf.path AS path,
    pf.depth + 1 AS depth
  FROM client c
  INNER JOIN PathFinder pf ON c.client_id = pf.parent_id
  WHERE pf.parent_id IS NOT NULL
)
SELECT path
FROM PathFinder
WHERE client_id = @fromClientId;
```

**Returns:**
- Array of client IDs from ancestor to descendant
- Example: `[1, 2, 5, 8]` means path from client 1 → 2 → 5 → 8
- Returns `null` if no path exists (not in same hierarchy branch)

**Use Cases:**
- Creating complete transfer chain
- Validating hierarchy relationships
- Building breadcrumb navigation

### 4.3 Hierarchy Example

```
GenVolt Corporation (client_id: 1, parent_id: null)
├── North Region (client_id: 2, parent_id: 1)
│   ├── Site A (client_id: 5, parent_id: 2)
│   │   └── Building A1 (client_id: 10, parent_id: 5)
│   └── Site B (client_id: 6, parent_id: 2)
│
├── South Region (client_id: 3, parent_id: 1)
│   ├── Site C (client_id: 7, parent_id: 3)
│   └── Site D (client_id: 8, parent_id: 3)
│       └── Building D1 (client_id: 11, parent_id: 8)
│
└── East Region (client_id: 4, parent_id: 1)
    └── Site E (client_id: 9, parent_id: 4)
```

**Relationships:**
- Descendants of client 1: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
- Descendants of client 2: [5, 6, 10]
- Path from 2 to 10: [2, 5, 10]
- Siblings of client 2: [3, 4]
- Level of client 10 from root: 3

---

## 5. Device Onboarding Process

### 5.1 Onboarding Flow

**API Endpoint:** `POST /api/devices`
**Controller:** `deviceController.createDevice` (Lines 178-274)
**File:** `server/controllers/deviceController.js`

#### Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User submits device creation request                    │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Validation Middleware (deviceValidation.js)             │
│    - Check device_id format (alphanumeric, -, _)           │
│    - Verify device_id uniqueness                           │
│    - Validate client_id exists (if provided)               │
│    - Check onboarding_date not in future                   │
│    - Validate all field constraints                        │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Permission Check Middleware                              │
│    - Verify user has 'Onboard Device' permission           │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Auto-Assignment Logic (if client_id not provided)       │
│    deviceData.client_id = currentUser.client_id            │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Create Device Record                                     │
│    INSERT INTO device (...) OUTPUT INSERTED.*               │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Transfer History Logic                                   │
│    If assigned_client != user_client:                       │
│      - Check if target is descendant                        │
│      - Create transfer chain if yes                         │
│      - Create single transfer record if no                  │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Audit Logging                                            │
│    Log: DEVICE_CREATED, user_id, device_id, timestamp       │
└────────────────────┬────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Return Success Response                                  │
│    { success: true, device: {...}, message: ... }           │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Auto-Assignment Logic

**Code Reference:** `deviceController.js` Lines 189-195

```javascript
// If no client_id provided, auto-assign to current user's client
if (!deviceData.client_id && currentUser.client_id) {
  deviceData.client_id = currentUser.client_id;
}
```

**Scenarios:**
1. **User provides client_id:** Device assigned to specified client (requires descendant relationship)
2. **User omits client_id:** Device auto-assigned to user's own client
3. **System admin:** Can assign to any client

### 5.3 Initial Transfer History Creation

**Code Reference:** `deviceController.js` Lines 215-238

When a device is created and assigned to a client different from the user's client:

**If target is descendant:**
```javascript
const path = await Client.getHierarchyPath(currentUser.client_id, deviceData.client_id);
if (path) {
  await Device.createMissingTransferChain(
    currentUser.client_id,
    deviceData.client_id,
    newDevice.id
  );
}
```

**If target is not descendant (sibling or other):**
```javascript
await db.query(
  `INSERT INTO client_device (seller_id, buyer_id, device_id)
   VALUES (@sellerId, @buyerId, @deviceId)`,
  { sellerId: currentUser.client_id, buyerId: deviceData.client_id, deviceId: newDevice.id }
);
```

### 5.4 Validation Rules

**Field Validations:**

| Field | Required | Format | Constraints |
|-------|----------|--------|-------------|
| device_id | Yes | Alphanumeric, -, _ | 3-100 chars, unique |
| client_id | No | Integer | Must exist in client table |
| channel_id | No | String | Max 100 chars |
| api_key | No | String | Max 255 chars |
| Model | No | String | 2-100 chars |
| machin_id | No | String | Max 100 chars |
| onboarding_date | No | ISO8601 Date | Cannot be in future |
| TransactionTableID | No | Integer | Must be positive |

**Business Rules:**
- Device ID must be globally unique across all devices
- Client ID must reference an active client
- Onboarding date defaults to current date if not provided
- API key generated automatically if not provided
- User can only assign devices to own client or descendants (unless admin)

---

## 6. Device Transfer Logic

### 6.1 Transfer Core Logic

**API Endpoint:** `POST /api/devices/:deviceId/transfer`
**Controller:** `deviceController.transferDevice` (Lines 443-553)
**Model Method:** `Device.transferDevice` (Lines 643-893)
**File:** `server/models/Device.js`

### 6.2 Transfer State Machine

The transfer logic implements a sophisticated state machine based on the device's transfer history:

```
┌─────────────────────────────────────────────────────────────┐
│                    STATE 1: FRESH DEVICE                     │
│  - No transfer history exists                               │
│  - Can transfer to: Descendants OR Siblings                 │
└────────────────────┬────────────────────────────────────────┘
                     │ First Transfer
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              STATE 2: INITIALLY TRANSFERRED                  │
│  - One transfer record exists                               │
│  - Current owner is the 'buyer' in that record              │
│  - Can transfer to: Descendants OR Siblings                 │
└────────────────────┬────────────────────────────────────────┘
                     │ Transfer to Descendant
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              STATE 3: DOWN-TRANSFERRED                       │
│  - Multiple transfer records exist                          │
│  - Current owner is neither seller nor buyer in latest      │
│  - Can transfer to: Descendants ONLY (no siblings, no up)   │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Transfer Decision Tree

**Code Reference:** `Device.js` Lines 643-893

```
START: transferDevice(deviceId, currentClientId, targetClientId, machineId)
│
├─ GET latest transfer record for device
│
├─ CASE 1: sellerId is NULL
│   └─> Just update device.client_id (no history needed)
│       RETURN success
│
├─ CASE 2: Target is descendant of current
│   ├─> Get hierarchy path
│   └─> Create/validate complete transfer chain
│       RETURN success
│
├─ CASE 3: Transfer record exists
│   │
│   ├─ SUB-CASE 3A: Current owner is buyer (device not re-transferred)
│   │   ├─> Check if target is descendant
│   │   │   └─> YES: Create transfer chain, RETURN success
│   │   └─> Check if target is sibling (same parent)
│   │       └─> YES: Create single transfer record, RETURN success
│   │       └─> NO: THROW INVALID_HIERARCHY_TRANSFER
│   │
│   ├─ SUB-CASE 3B: Current owner is seller
│   │   └─> THROW DEVICE_ALREADY_TRANSFERRED
│   │
│   └─ SUB-CASE 3C: Current owner is neither (device transferred down)
│       ├─> Check if target is descendant
│       │   └─> YES: Create transfer chain, RETURN success
│       └─> NO: THROW INVALID_HIERARCHY_TRANSFER
│
└─ CASE 4: No transfer record exists
    ├─> Check if target is descendant
    │   └─> YES: Create transfer chain, RETURN success
    └─> NO: Create single transfer record, RETURN success
```

### 6.4 Transfer Chain Creation

**Method:** `Device.createMissingTransferChain(fromClientId, toClientId, deviceId)`
**File:** `Device.js` Lines 569-631

**Purpose:** Create intermediate transfer records for all clients in the hierarchy path

**Logic:**
```javascript
1. Get hierarchy path: [client1, client2, client3, client4]
2. For each consecutive pair (seller, buyer):
   - Check if record exists in client_device
   - If not, create: INSERT INTO client_device (seller_id, buyer_id, device_id)
   - Add 10ms delay between inserts (for ordering)
3. Return array of created records
```

**Example:**
```
Path: [1, 2, 5, 10]
Creates records:
  - seller_id=1, buyer_id=2, device_id=X
  - seller_id=2, buyer_id=5, device_id=X
  - seller_id=5, buyer_id=10, device_id=X
```

### 6.5 Sibling Detection

**Logic:** Two clients are siblings if they share the same `parent_id`

**Implementation:**
```javascript
const areSiblings = async (client1Id, client2Id) => {
  const client1 = await Client.findByPk(client1Id);
  const client2 = await Client.findByPk(client2Id);

  return client1.parent_id === client2.parent_id && client1.parent_id !== null;
};
```

**Use Case:** Allows lateral transfer between same-level clients (e.g., Site A to Site B under same region)

---

## 7. Transfer Rules and Scenarios

### 7.1 Transfer Rules Summary

| Scenario | Current State | Target Relation | Allowed? | Action |
|----------|--------------|-----------------|----------|--------|
| Fresh device | No history | Descendant | ✅ Yes | Create chain |
| Fresh device | No history | Sibling | ✅ Yes | Create single record |
| Fresh device | No history | Parent | ❌ No | Error |
| Fresh device | No history | Unrelated | ✅ Yes* | Create single record |
| Initial transfer | Owner is buyer | Descendant | ✅ Yes | Create chain |
| Initial transfer | Owner is buyer | Sibling | ✅ Yes | Create single record |
| Initial transfer | Owner is buyer | Parent | ❌ No | Error |
| Down-transferred | Owner is neither | Descendant | ✅ Yes | Create chain |
| Down-transferred | Owner is neither | Sibling | ❌ No | Error |
| Down-transferred | Owner is neither | Parent | ❌ No | Error |
| Already transferred | Owner is seller | Any | ❌ No | Error: ALREADY_TRANSFERRED |

*Unrelated transfers allowed only for admins

### 7.2 Validation Errors

**Error Codes:**

1. **INVALID_HIERARCHY_TRANSFER**
   - Code: `INVALID_HIERARCHY_TRANSFER`
   - Message: "Devices that have been transferred down the hierarchy can only be transferred to descendants"
   - Occurs: When trying to transfer up or sideways after device moved down hierarchy

2. **DEVICE_ALREADY_TRANSFERRED**
   - Code: `DEVICE_ALREADY_TRANSFERRED`
   - Message: "This device has already been transferred from your client"
   - Occurs: When current owner is the seller in latest transfer record

3. **DEVICE_NOT_FOUND**
   - Code: `NOT_FOUND`
   - Message: "Device not found"
   - Occurs: Invalid device ID

4. **TARGET_CLIENT_SAME**
   - Code: `VALIDATION_ERROR`
   - Message: "Target client must be different from current client"
   - Occurs: Validation middleware catches same-client transfer

5. **UNAUTHORIZED_TRANSFER**
   - Code: `AUTHORIZATION_ERROR`
   - Message: "You don't have access to this device"
   - Occurs: User trying to transfer device outside their access scope

---

## 8. Examples with Client Hierarchy

### 8.1 Example Hierarchy Setup

```
GenVolt Corporation (ID: 1, parent: null)
├── Manufacturing Division (ID: 2, parent: 1)
│   ├── Factory North (ID: 5, parent: 2)
│   │   ├── Production Line A (ID: 10, parent: 5)
│   │   └── Production Line B (ID: 11, parent: 5)
│   └── Factory South (ID: 6, parent: 2)
│       └── Production Line C (ID: 12, parent: 6)
├── Distribution Division (ID: 3, parent: 1)
│   ├── Warehouse East (ID: 7, parent: 3)
│   └── Warehouse West (ID: 8, parent: 3)
└── R&D Division (ID: 4, parent: 1)
    └── Lab A (ID: 9, parent: 4)
```

### 8.2 Scenario 1: Fresh Device Onboarding and Descendant Transfer

**Initial State:**
- User from Manufacturing Division (client_id: 2)
- Onboards new device: DEV-001

**Step 1: Device Creation**
```json
POST /api/devices
{
  "device_id": "DEV-001",
  "Model": "Smart Meter v2",
  "machin_id": "SM-12345",
  "client_id": 2
}
```

**Result:**
```
device table:
  id: 100
  device_id: DEV-001
  client_id: 2

client_device table:
  (no records - device created for user's own client)
```

**Step 2: Transfer to Descendant (Factory North)**
```json
POST /api/devices/100/transfer
{
  "target_client_id": 5,
  "machin_id": "SM-12345-FN"
}
```

**Result:**
```
device table:
  id: 100
  device_id: DEV-001
  client_id: 5  (updated)
  machin_id: SM-12345-FN  (updated)

client_device table:
  id: 1
  seller_id: 2
  buyer_id: 5
  device_id: 100
  transfer_date: 2025-11-08 10:30:00
```

**Step 3: Transfer Further Down (Production Line A)**
```json
POST /api/devices/100/transfer
{
  "target_client_id": 10,
  "machin_id": "SM-12345-PLA"
}
```

**Result:**
```
device table:
  id: 100
  device_id: DEV-001
  client_id: 10  (updated)
  machin_id: SM-12345-PLA  (updated)

client_device table:
  id: 1 (existing)
  seller_id: 2
  buyer_id: 5
  device_id: 100

  id: 2 (new)
  seller_id: 5
  buyer_id: 10
  device_id: 100
  transfer_date: 2025-11-08 11:00:00
```

**Step 4: INVALID Transfer Attempt (Production Line B - Sibling)**
```json
POST /api/devices/100/transfer
{
  "target_client_id": 11,  // Production Line B (sibling of 10)
  "machin_id": "SM-12345-PLB"
}
```

**Result:**
```
ERROR 400: {
  "error": "INVALID_HIERARCHY_TRANSFER",
  "message": "Devices that have been transferred down the hierarchy can only be transferred to descendants"
}
```

**Reason:** Device is in STATE 3 (down-transferred). Current owner (10) is neither seller (5) nor buyer (10) in latest record. Can ONLY go to descendants of 10, but 11 is a sibling.

### 8.3 Scenario 2: Sibling Transfer (Allowed)

**Initial State:**
- User from Manufacturing Division (client_id: 2)
- Device DEV-002 at Factory North (client_id: 5)
- Transfer history: 2 → 5

**Transfer to Sibling Factory**
```json
POST /api/devices/101/transfer
{
  "target_client_id": 6,  // Factory South (sibling of Factory North)
  "machin_id": "DEV-002-FS"
}
```

**Result:**
```
device table:
  id: 101
  device_id: DEV-002
  client_id: 6  (updated from 5)

client_device table:
  id: 3 (existing)
  seller_id: 2
  buyer_id: 5
  device_id: 101

  id: 4 (new)
  seller_id: 2
  buyer_id: 6
  device_id: 101
  transfer_date: 2025-11-08 12:00:00
```

**Why Allowed:**
- Current owner (5) is the buyer in latest record (STATE 2)
- Target (6) is a sibling of current owner (both have parent_id = 2)
- Creates new record with original seller (2) as seller

### 8.4 Scenario 3: Multi-Level Transfer Chain

**Initial State:**
- User from GenVolt Corporation (client_id: 1)
- New device DEV-003

**Direct Transfer to Production Line A (4 levels down)**
```json
POST /api/devices
{
  "device_id": "DEV-003",
  "client_id": 10,  // Production Line A (path: 1 → 2 → 5 → 10)
  "Model": "Controller X"
}
```

**Result:**
```
device table:
  id: 102
  device_id: DEV-003
  client_id: 10

client_device table (chain created):
  id: 5
  seller_id: 1
  buyer_id: 2
  device_id: 102
  transfer_date: 2025-11-08 13:00:00.000

  id: 6
  seller_id: 2
  buyer_id: 5
  device_id: 102
  transfer_date: 2025-11-08 13:00:00.010  (10ms delay)

  id: 7
  seller_id: 5
  buyer_id: 10
  device_id: 102
  transfer_date: 2025-11-08 13:00:00.020  (20ms delay)
```

**Transfer History Chain:**
```
GenVolt Corp (1)
  → Manufacturing Division (2)
    → Factory North (5)
      → Production Line A (10) [CURRENT]
```

### 8.5 Scenario 4: Cross-Division Transfer (Not Allowed)

**Initial State:**
- Device DEV-004 at Factory North (client_id: 5)
- Path from root: 1 → 2 → 5
- Transfer history: 1 → 2 → 5

**Attempt Transfer to Warehouse East (Different Division)**
```json
POST /api/devices/103/transfer
{
  "target_client_id": 7,  // Warehouse East (under Distribution)
  "machin_id": "DEV-004-WE"
}
```

**Result:**
```
ERROR 400: {
  "error": "INVALID_HIERARCHY_TRANSFER",
  "message": "Devices that have been transferred down the hierarchy can only be transferred to descendants"
}
```

**Why Not Allowed:**
- Device is in STATE 3 (down-transferred)
- Warehouse East (7) is not a descendant of Factory North (5)
- Path 5 → 7 doesn't exist (different branches)

### 8.6 Scenario 5: Admin Override

**Initial State:**
- System Admin user (role: SYSTEM_ADMIN)
- Device DEV-005 at Production Line A (client_id: 10)

**Admin Can Transfer Anywhere**
```json
POST /api/devices/104/transfer
{
  "target_client_id": 9,  // Lab A (completely different division)
  "machin_id": "DEV-005-LAB"
}
```

**Result:**
```
device table:
  id: 104
  device_id: DEV-005
  client_id: 9  (updated)

client_device table:
  (new record created, admin override)
  seller_id: 10
  buyer_id: 9
  device_id: 104
  transfer_date: 2025-11-08 14:00:00
```

**Why Allowed:**
- System admins bypass hierarchy restrictions
- Creates direct transfer record without chain validation

### 8.7 Summary Table: Transfer Scenarios

| From Client | To Client | Relationship | Current State | Allowed? | Reason |
|-------------|-----------|--------------|---------------|----------|--------|
| 2 | 5 | Parent → Child | Fresh | ✅ Yes | Descendant transfer allowed |
| 5 | 10 | Parent → Grandchild | Transferred once | ✅ Yes | Descendant transfer allowed |
| 10 | 11 | Sibling | Down-transferred | ❌ No | Can only go down after down-transfer |
| 5 | 6 | Sibling | Initial transfer | ✅ Yes | Sibling transfer in STATE 2 |
| 1 | 10 | Root → Deep child | Fresh | ✅ Yes | Creates complete chain |
| 5 | 7 | Cross-division | Down-transferred | ❌ No | Not a descendant |
| 10 | 5 | Child → Parent | Any | ❌ No | Upward transfer never allowed |
| 5 | 2 | Child → Parent | Any | ❌ No | Upward transfer never allowed |
| Any | Any | Admin override | Any | ✅ Yes | Admin bypass |

---

## 9. API Endpoints

### 9.1 Device Endpoints

**Base URL:** `http://localhost:5001/api`

#### 9.1.1 Get All Devices

```
GET /api/devices
```

**Query Parameters:**
- `client_id` (integer): Filter by client
- `Model` (string): Filter by device model
- `search` (string): Search across device_id, Model, machin_id, client name
- `startDate` (ISO8601): Filter by onboarding date (from)
- `endDate` (ISO8601): Filter by onboarding date (to)
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 10, max: 100): Items per page
- `sortBy` (string, default: 'id'): Sort field (id, device_id, Model, machin_id, onboarding_date, client_name)
- `sortOrder` (string, default: 'desc'): Sort direction (asc, desc)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 100,
      "device_id": "DEV-001",
      "channel_id": "CH-001",
      "api_key": "key123...",
      "Model": "Smart Meter v2",
      "machin_id": "SM-12345",
      "client_id": 5,
      "onboarding_date": "2025-11-01",
      "client_name": "Factory North"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "totalPages": 15,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Permissions Required:** `View Device`

#### 9.1.2 Get Device by ID

```
GET /api/devices/:deviceId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 100,
    "device_id": "DEV-001",
    "Model": "Smart Meter v2",
    "machin_id": "SM-12345",
    "client_id": 5,
    "client_name": "Factory North",
    "onboarding_date": "2025-11-01",
    "conversionLogic_ld": "{...}",
    "TransactionTableID": 1,
    "TransactionTableName": "meter_readings"
  }
}
```

**Permissions Required:** `View Device`

#### 9.1.3 Create Device

```
POST /api/devices
```

**Request Body:**
```json
{
  "device_id": "DEV-001",
  "channel_id": "CH-001",
  "Model": "Smart Meter v2",
  "machin_id": "SM-12345",
  "client_id": 5,  // Optional, defaults to current user's client
  "onboarding_date": "2025-11-01",  // Optional, defaults to today
  "api_key": "custom-key",  // Optional, auto-generated if omitted
  "conversionLogic_ld": "{...}",
  "TransactionTableID": 1,
  "TransactionTableName": "meter_readings"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device created successfully",
  "device": {
    "id": 100,
    "device_id": "DEV-001",
    "client_id": 5,
    ...
  }
}
```

**Permissions Required:** `Onboard Device`

#### 9.1.4 Update Device

```
PUT /api/devices/:deviceId
```

**Request Body:** (All fields optional)
```json
{
  "device_id": "DEV-001-UPDATED",
  "Model": "Smart Meter v3",
  "machin_id": "SM-12345-NEW",
  "channel_id": "CH-002"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device updated successfully",
  "device": { ... }
}
```

**Permissions Required:** `Edit Device`

**Note:** Cannot update `client_id` via this endpoint. Use transfer endpoint instead.

#### 9.1.5 Transfer Device

```
POST /api/devices/:deviceId/transfer
```

**Request Body:**
```json
{
  "target_client_id": 10,
  "machin_id": "SM-12345-NEW"  // Required on transfer
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device transferred successfully",
  "device": {
    "id": 100,
    "device_id": "DEV-001",
    "client_id": 10,  // Updated
    "machin_id": "SM-12345-NEW",
    "client_name": "Production Line A"
  }
}
```

**Error Responses:**
```json
// Invalid hierarchy transfer
{
  "error": "INVALID_HIERARCHY_TRANSFER",
  "message": "Devices that have been transferred down the hierarchy can only be transferred to descendants"
}

// Already transferred
{
  "error": "DEVICE_ALREADY_TRANSFERRED",
  "message": "This device has already been transferred from your client"
}
```

**Permissions Required:** `Transfer Device`

#### 9.1.6 Get Device Transfer History

```
GET /api/devices/:deviceId/history
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "seller_id": 2,
      "seller_name": "Manufacturing Division",
      "buyer_id": 5,
      "buyer_name": "Factory North",
      "transfer_date": "2025-11-08T10:30:00.000Z"
    },
    {
      "id": 2,
      "seller_id": 5,
      "seller_name": "Factory North",
      "buyer_id": 10,
      "buyer_name": "Production Line A",
      "transfer_date": "2025-11-08T11:00:00.000Z"
    }
  ]
}
```

**Permissions Required:** `View Device`

#### 9.1.7 Delete Device

```
DELETE /api/devices/:deviceId
```

**Response:**
```json
{
  "success": true,
  "message": "Device deleted successfully"
}
```

**Permissions Required:** `Remove Device`

**Note:** This is a hard delete. All related transfer history is also deleted (CASCADE).

#### 9.1.8 Get Device Statistics

```
GET /api/devices/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_devices": 150,
    "active_clients": 25,
    "unique_models": 12,
    "recent_onboardings": 8,  // Last 30 days
    "model_breakdown": [
      { "Model": "Smart Meter v2", "count": 50 },
      { "Model": "Controller X", "count": 30 }
    ],
    "client_breakdown": [
      { "client_name": "Factory North", "device_count": 25 },
      { "client_name": "Warehouse East", "device_count": 20 }
    ]
  }
}
```

**Permissions Required:** `View Device`

### 9.2 Client Endpoints

**Base URL:** `http://localhost:5001/api`

#### 9.2.1 Get All Clients

```
GET /api/clients
```

**Query Parameters:**
- `search` (string): Search by name, email, city
- `is_active` (boolean): Filter by active status
- `page` (integer): Page number
- `limit` (integer): Items per page

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "client_id": 1,
      "parent_id": null,
      "name": "GenVolt Corporation",
      "email": "info@genvolt.com",
      "phone": "+1-555-0100",
      "city": "New York",
      "state": "NY",
      "is_active": true,
      "device_count": 50
    }
  ],
  "pagination": { ... }
}
```

#### 9.2.2 Get Client Hierarchy (for dropdowns)

```
GET /api/clients/hierarchy
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "client_id": 1,
      "parent_id": null,
      "name": "GenVolt Corporation",
      "level": 0
    },
    {
      "client_id": 2,
      "parent_id": 1,
      "name": "Manufacturing Division",
      "level": 1
    }
  ]
}
```

#### 9.2.3 Get Descendant Clients

```
GET /api/clients/descendants
```

**Description:** Returns all descendant clients for the current user's client

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "client_id": 5,
      "parent_id": 2,
      "name": "Factory North",
      "email": "factory.north@genvolt.com",
      "level": 1
    },
    {
      "client_id": 10,
      "parent_id": 5,
      "name": "Production Line A",
      "email": "pla@genvolt.com",
      "level": 2
    }
  ]
}
```

**Use Case:** Populating transfer target dropdown

---

## 10. Validation Rules

### 10.1 Device Field Validation

**Validation Middleware:** `server/middleware/deviceValidation.js`

#### Create/Update Device Validation

| Field | Create | Update | Rules |
|-------|--------|--------|-------|
| device_id | Required | Optional | 3-100 chars, pattern: `^[a-zA-Z0-9_-]+$`, unique |
| client_id | Optional | N/A | Must exist in client table, must be descendant |
| channel_id | Optional | Optional | Max 100 chars |
| api_key | Optional | Optional | Max 255 chars |
| Model | Optional | Optional | 2-100 chars if provided |
| machin_id | Optional | Optional | Max 100 chars |
| onboarding_date | Optional | Optional | ISO8601, cannot be future |
| TransactionTableID | Optional | Optional | Positive integer |
| TransactionTableName | Optional | Optional | Max 255 chars |
| field_id | Optional | Optional | Positive integer |

#### Transfer Device Validation

| Field | Required | Rules |
|-------|----------|-------|
| target_client_id | Yes | Must exist, must be different from current client |
| machin_id | Yes | 1-100 chars |

### 10.2 Custom Validators

#### Device ID Uniqueness

```javascript
custom(async (value, { req }) => {
  const existingDevice = await Device.findByDeviceId(value);
  if (existingDevice && existingDevice.id !== parseInt(req.params.deviceId)) {
    throw new Error('Device ID already exists');
  }
  return true;
})
```

#### Client Existence

```javascript
custom(async (value) => {
  const client = await Client.findByPk(value);
  if (!client || !client.is_active) {
    throw new Error('Client not found or inactive');
  }
  return true;
})
```

#### Same Client Prevention

```javascript
custom(async (value, { req }) => {
  const device = await Device.findByPk(req.params.deviceId);
  if (device.client_id === parseInt(value)) {
    throw new Error('Target client must be different from current client');
  }
  return true;
})
```

### 10.3 Date Validation

#### Onboarding Date Cannot Be Future

```javascript
custom((value) => {
  const inputDate = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (inputDate > today) {
    throw new Error('Onboarding date cannot be in the future');
  }
  return true;
})
```

#### Date Range Validation

```javascript
// endDate must be after startDate
custom((value, { req }) => {
  if (req.query.startDate && new Date(value) < new Date(req.query.startDate)) {
    throw new Error('End date must be after start date');
  }
  return true;
})
```

### 10.4 Pagination Validation

```javascript
{
  page: [
    optional(),
    isInt({ min: 1 }).withMessage('Page must be a positive integer')
  ],
  limit: [
    optional(),
    isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  sortBy: [
    optional(),
    isIn(['id', 'device_id', 'Model', 'machin_id', 'onboarding_date', 'client_name'])
      .withMessage('Invalid sort field')
  ],
  sortOrder: [
    optional(),
    isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
  ]
}
```

---

## 11. Security and Authorization

### 11.1 Role-Based Access Control (RBAC)

**Roles Hierarchy:**
```
SYSTEM_ADMIN (full access)
  └── SUPER_ADMIN (full access)
      └── CLIENT_ADMIN (client + descendants)
          └── CLIENT_USER (client + descendants, limited operations)
```

### 11.2 Permission Requirements

| Operation | Permission | Additional Checks |
|-----------|-----------|-------------------|
| View devices | `View Device` | Can view own client + descendants |
| Create device | `Onboard Device` | Can assign to own client or descendants |
| Update device | `Edit Device` | Can edit devices in own client or descendants |
| Transfer device | `Transfer Device` | Can transfer from own client or descendants |
| Delete device | `Remove Device` | Can delete devices in own client or descendants |

### 11.3 Hierarchical Access Control

**Function:** `canAccessDevice(currentUser, device)`
**File:** `deviceController.js` Lines 14-28

```javascript
const canAccessDevice = async (currentUser, device) => {
  // System and Super Admins can access all devices
  if (['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name)) {
    return true;
  }

  // User can access device if:
  // 1. Device belongs to user's own client
  if (currentUser.client_id === device.client_id) {
    return true;
  }

  // 2. Device belongs to a descendant client
  return await Client.isDescendant(currentUser.client_id, device.client_id);
};
```

### 11.4 Transfer Authorization Rules

**Who Can Transfer:**
1. **System/Super Admin:** Can transfer any device to any client
2. **Client Admin/User:** Can transfer devices from own client or descendants, but only to descendants

**Transfer Restrictions:**
- Cannot transfer device user doesn't have access to
- Cannot transfer to same client
- Cannot transfer to parent or unrelated client (unless admin)
- Cannot transfer device that's already been transferred from user's client

### 11.5 Audit Logging

**All operations are logged with:**
- `user_id` - Who performed the action
- `action` - What action was performed
- `timestamp` - When it occurred
- `ip_address` - Request origin
- `user_agent` - Client information
- `resource_type` - What was affected (e.g., 'device')
- `resource_id` - ID of affected resource

**Logged Actions:**
- `DATA_ACCESSED` - Device viewed
- `DEVICE_CREATED` - New device onboarded
- `DEVICE_UPDATED` - Device details modified
- `DEVICE_TRANSFERRED` - Device ownership changed
- `DEVICE_DELETED` - Device removed

**Implementation:**
```javascript
await createAuditLog({
  user_id: currentUser.user_id,
  action: 'DEVICE_TRANSFERRED',
  resource_type: 'device',
  resource_id: deviceId,
  details: { from_client: oldClientId, to_client: newClientId },
  ip_address: req.ip,
  user_agent: req.get('user-agent')
});
```

### 11.6 Authentication

**Method:** JWT Bearer Token

**Headers:**
```
Authorization: Bearer <token>
```

**Token contains:**
- `user_id`
- `client_id`
- `role_name`
- `permissions[]`

**Middleware:** `authenticateToken` (applied to all routes)

---

## 12. File Structure

### 12.1 Backend Files

```
server/
├── config/
│   └── database.js                 # SQL Server connection config
│
├── models/
│   ├── Device.js                   # Device model (Lines 1-950)
│   │   ├── Device.create()         # Create device record
│   │   ├── Device.findByPk()       # Find by primary key
│   │   ├── Device.findByDeviceId() # Find by device_id
│   │   ├── Device.findAll()        # Get all with filters
│   │   ├── Device.update()         # Update device
│   │   ├── Device.delete()         # Delete device
│   │   ├── Device.transferDevice() # Transfer logic (643-893)
│   │   ├── Device.createMissingTransferChain() # Chain creation (569-631)
│   │   ├── Device.getTransferHistory() # Get transfer records
│   │   └── Device.getStats()       # Statistics aggregation
│   │
│   └── Client.js                   # Client model (Lines 1-593)
│       ├── Client.create()         # Create client
│       ├── Client.findByPk()       # Find by primary key
│       ├── Client.findAll()        # Get all clients
│       ├── Client.getHierarchy()   # Get for dropdown (294-318)
│       ├── Client.getDescendantClients() # Recursive CTE (325-378)
│       ├── Client.isDescendant()   # Check relationship (386-406)
│       ├── Client.getHierarchyPath() # Get path array (414-487)
│       └── Client.getStats()       # Statistics
│
├── controllers/
│   ├── deviceController.js         # Device request handlers
│   │   ├── canAccessDevice()       # Access check (14-28)
│   │   ├── getAllDevices()         # GET /devices (34-103)
│   │   ├── getDeviceById()         # GET /devices/:id (110-151)
│   │   ├── createDevice()          # POST /devices (178-274)
│   │   ├── updateDevice()          # PUT /devices/:id (281-371)
│   │   ├── transferDevice()        # POST /devices/:id/transfer (443-553)
│   │   ├── getDeviceTransferHistory() # GET /devices/:id/history (382-435)
│   │   ├── deleteDevice()          # DELETE /devices/:id (560-608)
│   │   └── getDeviceStats()        # GET /devices/stats (615-636)
│   │
│   └── clientController.js         # Client request handlers
│       ├── getAllClients()         # GET /clients
│       ├── getClientById()         # GET /clients/:id
│       ├── getClientHierarchy()    # GET /clients/hierarchy
│       ├── getDescendantClients()  # GET /clients/descendants
│       ├── createClient()          # POST /clients
│       ├── updateClient()          # PUT /clients/:id
│       └── deleteClient()          # DELETE /clients/:id
│
├── middleware/
│   ├── deviceValidation.js        # Device validation rules
│   │   ├── createDeviceValidation  # POST validation (19-95)
│   │   ├── updateDeviceValidation  # PUT validation (98-180)
│   │   ├── transferDeviceValidation # Transfer validation (183-213)
│   │   └── deviceFilterValidation  # Query validation (216-277)
│   │
│   ├── permissionCheck.js          # Permission verification
│   │   └── requirePermission()     # Check user permissions
│   │
│   └── authMiddleware.js           # JWT authentication
│       └── authenticateToken()     # Verify JWT token
│
├── routes/
│   ├── deviceRoutes.js             # Device API routes
│   │   ├── GET /devices/stats
│   │   ├── GET /devices
│   │   ├── GET /devices/:deviceId
│   │   ├── POST /devices
│   │   ├── PUT /devices/:deviceId
│   │   ├── POST /devices/:deviceId/transfer
│   │   ├── GET /devices/:deviceId/history
│   │   └── DELETE /devices/:deviceId
│   │
│   └── clientRoutes.js             # Client API routes
│       ├── GET /clients
│       ├── GET /clients/:id
│       ├── GET /clients/hierarchy
│       ├── GET /clients/descendants
│       ├── POST /clients
│       ├── PUT /clients/:id
│       ├── DELETE /clients/:id
│       └── GET /clients/stats
│
└── utils/
    ├── asyncHandler.js             # Async error wrapper
    ├── errors.js                   # Custom error classes
    └── auditLogger.js              # Audit log creation
```

### 12.2 Frontend Files

```
client/src/
├── services/
│   ├── deviceService.js            # Device API client
│   │   ├── getAllDevices()
│   │   ├── getDeviceById()
│   │   ├── createDevice()
│   │   ├── updateDevice()
│   │   ├── deleteDevice()
│   │   ├── transferDevice()
│   │   ├── getDeviceStats()
│   │   └── getDeviceTransferHistory()
│   │
│   └── clientService.js            # Client API client
│       ├── getAllClients()
│       ├── getClientById()
│       ├── getClientHierarchy()
│       ├── getDescendantClients()
│       ├── createClient()
│       └── updateClient()
│
├── context/
│   └── DeviceContext.jsx           # React context for devices
│       ├── DeviceProvider          # Context provider component
│       ├── useState: devices       # Device list state
│       ├── useState: loading       # Loading state
│       ├── useState: error         # Error state
│       └── Methods: getAllDevices, createDevice, etc.
│
├── pages/
│   └── Admin/
│       └── DeviceManagement.jsx    # Main device management page
│           ├── Device list table
│           ├── Search/filter controls
│           ├── Pagination
│           └── Modal management
│
├── components/
│   └── modals/
│       ├── AddDeviceModal.jsx      # Device creation form
│       ├── EditDeviceModal.jsx     # Device update form
│       ├── TransferDeviceModal.jsx # Device transfer form
│       ├── DeviceDetailsModal.jsx  # Device view
│       └── DeleteDeviceModal.jsx   # Deletion confirmation
│
└── hooks/
    └── useDevicePermissions.js     # Permission checking hook
        ├── canViewDevices()
        ├── canOnboardDevice()
        ├── canEditDevice()
        ├── canTransferDevice()
        └── canRemoveDevice()
```

---

## Appendix A: Transfer Logic Flowchart

```
START: User initiates transfer
│
├─> Validate permissions (Transfer Device)
│   └─> FAIL: Return 403 Unauthorized
│
├─> Validate device exists
│   └─> FAIL: Return 404 Not Found
│
├─> Check user has access to device
│   └─> FAIL: Return 403 Unauthorized
│
├─> Validate target client different from current
│   └─> FAIL: Return 400 Validation Error
│
├─> Get latest transfer record for device
│
├─> DECISION: Does transfer record exist?
│   │
│   NO ──> Is target a descendant?
│   │      │
│   │      YES ──> Create transfer chain
│   │      │      └─> SUCCESS
│   │      │
│   │      NO ──> Create single transfer record
│   │             └─> SUCCESS
│   │
│   YES ──> DECISION: Is current owner the buyer?
│           │
│           YES ──> Is target a descendant?
│           │      │
│           │      YES ──> Create transfer chain
│           │      │      └─> SUCCESS
│           │      │
│           │      NO ──> Is target a sibling?
│           │             │
│           │             YES ──> Create single transfer
│           │             │      └─> SUCCESS
│           │             │
│           │             NO ──> FAIL: INVALID_HIERARCHY_TRANSFER
│           │
│           NO ──> DECISION: Is current owner the seller?
│                  │
│                  YES ──> FAIL: DEVICE_ALREADY_TRANSFERRED
│                  │
│                  NO ──> Current owner is neither (down-transferred)
│                         │
│                         └─> Is target a descendant?
│                             │
│                             YES ──> Create transfer chain
│                             │      └─> SUCCESS
│                             │
│                             NO ──> FAIL: INVALID_HIERARCHY_TRANSFER
```

---

## Appendix B: Database Queries

### B.1 Get Descendants (Recursive CTE)

```sql
WITH RECURSIVE ClientHierarchy AS (
  -- Anchor: Starting client
  SELECT
    client_id,
    parent_id,
    name,
    email,
    0 AS level,
    CAST(client_id AS NVARCHAR(MAX)) AS path
  FROM client
  WHERE client_id = @clientId AND is_active = 1

  UNION ALL

  -- Recursive: Children
  SELECT
    c.client_id,
    c.parent_id,
    c.name,
    c.email,
    ch.level + 1 AS level,
    ch.path + '/' + CAST(c.client_id AS NVARCHAR(MAX)) AS path
  FROM client c
  INNER JOIN ClientHierarchy ch ON c.parent_id = ch.client_id
  WHERE c.is_active = 1
)
SELECT * FROM ClientHierarchy
WHERE level > 0
ORDER BY level, name;
```

### B.2 Get Hierarchy Path

```sql
WITH RECURSIVE PathFinder AS (
  -- Start from descendant
  SELECT
    client_id,
    parent_id,
    1 AS level
  FROM client
  WHERE client_id = @descendantId

  UNION ALL

  -- Walk up to ancestors
  SELECT
    c.client_id,
    c.parent_id,
    pf.level + 1 AS level
  FROM client c
  INNER JOIN PathFinder pf ON c.client_id = pf.parent_id
)
SELECT client_id
FROM PathFinder
ORDER BY level DESC;  -- Returns [ancestor, ..., descendant]
```

### B.3 Get Devices with Pagination

```sql
SELECT
  d.id,
  d.device_id,
  d.channel_id,
  d.Model,
  d.machin_id,
  d.client_id,
  d.onboarding_date,
  c.name AS client_name,
  COUNT(*) OVER() AS total_count
FROM device d
LEFT JOIN client c ON d.client_id = c.client_id
WHERE
  (@clientId IS NULL OR d.client_id = @clientId)
  AND (@model IS NULL OR d.Model LIKE '%' + @model + '%')
  AND (@search IS NULL OR (
    d.device_id LIKE '%' + @search + '%'
    OR d.Model LIKE '%' + @search + '%'
    OR d.machin_id LIKE '%' + @search + '%'
    OR c.name LIKE '%' + @search + '%'
  ))
  AND (@startDate IS NULL OR d.onboarding_date >= @startDate)
  AND (@endDate IS NULL OR d.onboarding_date <= @endDate)
ORDER BY
  CASE WHEN @sortOrder = 'asc' THEN
    CASE @sortBy
      WHEN 'device_id' THEN d.device_id
      WHEN 'Model' THEN d.Model
      WHEN 'client_name' THEN c.name
    END
  END ASC,
  CASE WHEN @sortOrder = 'desc' THEN
    CASE @sortBy
      WHEN 'device_id' THEN d.device_id
      WHEN 'Model' THEN d.Model
      WHEN 'client_name' THEN c.name
    END
  END DESC
OFFSET @offset ROWS
FETCH NEXT @limit ROWS ONLY;
```

### B.4 Get Transfer History

```sql
SELECT
  cd.id,
  cd.seller_id,
  cs.name AS seller_name,
  cd.buyer_id,
  cb.name AS buyer_name,
  cd.transfer_date
FROM client_device cd
LEFT JOIN client cs ON cd.seller_id = cs.client_id
LEFT JOIN client cb ON cd.buyer_id = cb.client_id
WHERE cd.device_id = @deviceId
ORDER BY cd.transfer_date ASC;
```

---

## Appendix C: Key Business Rules Summary

### Device Onboarding Rules

1. Device ID must be globally unique
2. Device auto-assigned to user's client if no client_id provided
3. Device can be assigned to descendant clients on creation
4. Onboarding date cannot be in the future
5. Complete transfer chain created if assigned to descendant
6. Requires "Onboard Device" permission

### Device Transfer Rules

1. **Fresh Device (No History):**
   - Can transfer to descendants (creates chain)
   - Can transfer to siblings (creates single record)
   - Cannot transfer to parents or ancestors

2. **Initially Transferred (Owner is Buyer):**
   - Can transfer to descendants (creates chain)
   - Can transfer to siblings (creates record with original seller)
   - Cannot transfer to parents or ancestors

3. **Down-Transferred (Owner is Neither Seller nor Buyer):**
   - Can ONLY transfer to descendants
   - Cannot transfer to siblings
   - Cannot transfer to parents or ancestors

4. **Already Transferred (Owner is Seller):**
   - Cannot transfer (device already gone)
   - Error: DEVICE_ALREADY_TRANSFERRED

5. **Admin Override:**
   - System/Super admins can transfer anywhere
   - Bypasses hierarchy restrictions

6. **General Restrictions:**
   - Cannot transfer to same client
   - Cannot transfer device user doesn't have access to
   - Requires "Transfer Device" permission
   - Machine ID update required on transfer

### Access Control Rules

1. **System/Super Admin:**
   - Full access to all devices and clients
   - No hierarchy restrictions

2. **Client Admin/User:**
   - Access to own client's devices
   - Access to descendant clients' devices
   - No access to parent or sibling clients
   - Cannot transfer devices up or to unrelated clients

3. **Permission Requirements:**
   - View Device: View device list and details
   - Onboard Device: Create new devices
   - Edit Device: Update device information
   - Transfer Device: Change device ownership
   - Remove Device: Delete devices

---

## Document Control

**Prepared By:** Development Team
**Reviewed By:** Technical Lead
**Approved By:** Project Manager

**Revision History:**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-08 | Development Team | Initial document creation |

---

**End of Document**
