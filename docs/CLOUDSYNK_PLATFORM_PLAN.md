# CloudSynk Platform — Comprehensive Implementation Plan v3.0

> **⚠️ SUPERSEDED by v4.0**
> The active plan is now at [`docs/DEVICE_ACTIVATION_UI_PLAN.md`](./DEVICE_ACTIVATION_UI_PLAN.md).
> This file is kept for historical reference (v3.0 — subscription, billing, pause/resume features).

**Supersedes:** `PAYMENT_SERVICES_PLAN.md`, `MQTT_Implementation_Functional_Document.md`, `VM_Setup_Guide.md`
**Date:** 2026-03-28
**Status:** Superseded by v4.0

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Implementation Status — What Exists Today](#2-implementation-status--what-exists-today)
3. [Database Schema — All Changes](#3-database-schema--all-changes)
4. [Backend Implementation](#4-backend-implementation)
5. [MQTT & Device Layer](#5-mqtt--device-layer)
6. [VM / Python Subscriber](#6-vm--python-subscriber)
7. [Frontend Implementation](#7-frontend-implementation)
8. [Feature Specifications](#8-feature-specifications)
   - [F1: Enhanced Admin Subscription Management](#f1-enhanced-admin-subscription-management)
   - [F2: Plan CRUD](#f2-plan-crud)
   - [F3: Admin-Managed Discounts](#f3-admin-managed-discounts)
   - [F4/F5: Pause / Resume + Device Flags](#f4f5-pause--resume--device-flags)
   - [F6: Topic Pattern Configuration](#f6-topic-pattern-configuration)
   - [F7: Device Dashboard Visibility for CLIENT_ADMIN](#f7-device-dashboard-visibility-for-client_admin)
9. [Permissions](#9-permissions)
10. [Migration SQL](#10-migration-sql)
11. [Critical Files — New & Modified](#11-critical-files--new--modified)
12. [Testing & Verification](#12-testing--verification)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     DEVICE LAYER (500-600 devices)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  PENDING (first boot):                                                  │
│    → MQTT PUBLISH:     cloudsynk/pre-activation                         │
│    ← MQTT SUBSCRIBE:   cloudsynk/pre-activation/response/{device_id}   │
│                                                                         │
│  ACTIVE (post activation):                                              │
│    → HTTP GET /api/v1/device-config  (Device Config Function App)       │
│    → MQTT PUBLISH:  {prefix}/{client_id}/{device_id}/{telem_suffix}     │  ← custom topic
│    ← MQTT SUBSCRIBE:{prefix}/{client_id}/{device_id}/{config_suffix}    │  ← custom topic
│                                                                         │
│  PAUSED (data_enabled=0, device-initiated by config flag):              │
│    → device stops publishing voluntarily (config message received)      │
│    → if device still tries → EMQX ACL hook denies publish to telemetry │
│                                                                         │
│  INACTIVE (connection rejected at auth hook):                           │
│    → all MQTT connections denied                                        │
└─────────────────────────────────────────────────────────────────────────┘
                        ↕ MQTT TLS Port 8883
┌─────────────────────────────────────────────────────────────────────────┐
│          Azure VM: vm-cloudsynk-emqx (Standard B2als_v2, Central India) │
├─────────────────────────────────────────────────────────────────────────┤
│  EMQX Broker (Docker)                                                   │
│    ├─ Port 1883 (internal, Python subscriber)                           │
│    ├─ Port 8883 (TLS external, devices + Express backend)               │
│    ├─ Port 18083 (EMQX Dashboard)                                       │
│    └─ Auth hook → /api/mqtt/auth  |  ACL hook → /api/mqtt/acl           │
│                                                                         │
│  Python Subscriber (systemd, persistent session)                        │
│    ├─ Loads topic patterns from DB at startup                           │
│    ├─ Subscribes to: cloudsynk/pre-activation                           │
│    ├─ Subscribes to: {all active client topic patterns}  ← dynamic      │
│    ├─ Subscribes to: cloudsynk/internal/subscriber/reload  ← control   │
│    ├─ On reload signal: re-queries DB, re-subscribes new patterns       │
│    └─ Decodes hex payload → inserts to Azure SQL                        │
└─────────────────────────────────────────────────────────────────────────┘
         ↕ SQL queries / inserts           ↕ MQTT publish (config + control)
┌─────────────────────────────────────────────────────────────────────────┐
│          Azure SQL Server (sqlserver-cs-db-prod / cs_db_dev)            │
├─────────────────────────────────────────────────────────────────────────┤
│  device, client, user, role, permissions                                │
│  SubscriptionPlans, ClientSubscriptions, PaymentTransactions            │
│  ClientDiscounts  ← NEW                                                 │
│  ClientTopicConfig  ← NEW                                               │
│  IoT_Raw_Messages, IoT_Data_Sick, IoT_Data_HKMI, IoT_Data_Gas          │
└─────────────────────────────────────────────────────────────────────────┘
         ↕ REST API                        ↕ config push via mqttService
┌─────────────────────────────────────────────────────────────────────────┐
│           Express Backend (genvolt-app/server)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  /api/subscriptions/*        — billing & plan management                │
│  /api/subscription-plans/*   — plan CRUD (admin)  ← NEW                │
│  /api/discounts/*            — discount management (admin)  ← NEW      │
│  /api/topic-config/*         — topic pattern management  ← NEW         │
│  /api/devices/*              — device lifecycle + pause/resume  ← UPD  │
│  /api/mqtt/auth|acl          — EMQX hooks (updated for pause flag)  ← UPD│
│  /api/razorpay/webhook       — payment events                           │
└─────────────────────────────────────────────────────────────────────────┘
                               ↕ React
┌─────────────────────────────────────────────────────────────────────────┐
│              React Frontend (genvolt-app/client)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  /billing                    — client billing + pause all devices        │
│  /admin/subscriptions        — enhanced admin subscription management    │
│  /admin/plans                — plan CRUD  ← NEW                         │
│  /admin/discounts            — discount management  ← NEW               │
│  /admin/topic-config         — topic pattern config  ← NEW              │
│  /devices                    — device list with pause per device  ← UPD │
└─────────────────────────────────────────────────────────────────────────┘
```

**VM Resources (unchanged):**

| Setting | Value |
|---------|-------|
| VM Name | vm-cloudsynk-emqx |
| Region | Central India |
| Size | Standard B2als_v2 (2 vCPU, 4 GB RAM) |
| Public IP | 20.198.101.175 |
| NSG Ports | 22 (SSH), 1883 (MQTT internal), 8883 (MQTT-TLS), 18083 (Dashboard) |

---

## 2. Implementation Status — What Exists Today

### Already Implemented ✅

**Database:**
- `SubscriptionPlans` table with 3 seeded plans (Basic/Pro/Enterprise)
- `ClientSubscriptions` table with full status lifecycle
- `PaymentTransactions` table with invoice generation
- `device.activation_blocked_reason` column
- Billing permissions seeded (View Billing, Manage Subscriptions, Override Subscription)

**Backend:**
- `SubscriptionPlan.js` model (findAll, findById, update)
- `ClientSubscription.js` model (full lifecycle methods)
- `PaymentTransaction.js` model (create, markCompleted, markFailed, getByClientId)
- `razorpayService.js` (createOrder, createCustomer, verifyPaymentSignature, verifyWebhookSignature, fetchPayment, cancelSubscription)
- `subscriptionService.js` (checkDeviceActivationEligibility, activateSubscription, handleSubscriptionExpiry, deactivateClientDevices)
- `subscriptionCron.js` (hourly expiry check)
- `subscriptionController.js` (getPlans, getMySubscription, getAllSubscriptions, createOrderForSubscription, verifyPaymentAndActivate, cancelSubscription, getTransactions, getEligibility)
- `razorpayWebhookController.js` (payment.captured, payment.failed, subscription.charged, subscription.cancelled, subscription.completed)
- `subscriptionRoutes.js`, `webhookRoutes.js`
- `deviceController.js` — subscription eligibility check before activation
- MQTT auth/ACL hooks (`/api/mqtt/auth`, `/api/mqtt/acl`)
- Device lifecycle (PENDING → ACTIVE → INACTIVE)

**Frontend:**
- `BillingPage.jsx` — plan selection, current plan, payment history
- `SubscribePlanModal.jsx` — Razorpay checkout flow
- `SubscriptionContext.jsx` — subscription state provider
- `SubscriptionManagement.jsx` (`/admin/subscriptions`) — read-only admin table
- `GracePeriodBanner.jsx` — GRACE/EXPIRED banner
- `ClientManagement.jsx` — subscription column added
- `Sidebar.jsx` — Billing + Subscriptions nav items
- Rate limiter skip for authenticated requests
- `isExpired` bug fixed (no false banner for new users)

### Not Yet Implemented — New Work 🔴

All features described in Section 8.

---

## 3. Database Schema — All Changes

### 3.1 Modify `ClientSubscriptions` — Admin Management Fields

```sql
ALTER TABLE ClientSubscriptions ADD
  assignment_type       NVARCHAR(20)   NOT NULL DEFAULT 'PAYMENT',
  -- 'PAYMENT' = via Razorpay | 'MANUAL' = admin-assigned | 'TRIAL' = admin trial
  assigned_by_admin_id  INT            NULL REFERENCES [user](user_id),
  admin_notes           NVARCHAR(500)  NULL;
```

### 3.2 New Table: `ClientDiscounts`

One-time discount override per client. Consumed on the next payment and cleared after use.

```sql
CREATE TABLE ClientDiscounts (
  discount_id       INT            IDENTITY(1,1) PRIMARY KEY,
  client_id         INT            NOT NULL REFERENCES client(client_id),
  discount_type     NVARCHAR(20)   NOT NULL,          -- 'PERCENTAGE' | 'FIXED'
  discount_value    DECIMAL(10,2)  NOT NULL,           -- e.g. 20 (%) or 500.00 (₹)
  is_used           BIT            NOT NULL DEFAULT 0,
  created_by        INT            NOT NULL REFERENCES [user](user_id),
  created_at        DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  applied_at        DATETIME2      NULL,               -- set when consumed at payment
  applied_to_order  NVARCHAR(100)  NULL                -- Razorpay order ID that used this
);

CREATE INDEX IX_ClientDiscounts_client ON ClientDiscounts(client_id);
CREATE INDEX IX_ClientDiscounts_unused  ON ClientDiscounts(client_id) WHERE is_used = 0;
```

### 3.3 Modify `device` Table — Pause / Data Flag

```sql
ALTER TABLE device ADD
  data_enabled    BIT            NOT NULL DEFAULT 1,
  -- 1 = device may publish telemetry | 0 = blocked (PAUSED or INACTIVE)
  paused_by       NVARCHAR(20)   NULL,
  -- 'CLIENT' = client paused this device | 'ADMIN' = admin set INACTIVE
  paused_at       DATETIME2      NULL,
  paused_reason   NVARCHAR(500)  NULL;
```

**INACTIVE supersedes PAUSE rules (enforced at service layer):**
- `paused_by = 'ADMIN'` → client cannot resume, only admin can
- `paused_by = 'CLIENT'` → client or admin can resume
- When admin sets INACTIVE on a device that is CLIENT-paused: `paused_by` is overwritten with `'ADMIN'`

**EMQX hook logic after this change:**
- Auth hook: `activation_status = 'INACTIVE'` → DENY connection (existing)
- ACL hook: `data_enabled = 0` AND `topic = telemetry topic` → DENY publish

### 3.4 New Table: `ClientTopicConfig`

One row per client. Defines the topic pattern used for that client's devices.

```sql
CREATE TABLE ClientTopicConfig (
  config_id              INT            IDENTITY(1,1) PRIMARY KEY,
  client_id              INT            NOT NULL UNIQUE REFERENCES client(client_id),
  topic_prefix           NVARCHAR(200)  NOT NULL DEFAULT 'cloudsynk',
  -- Full telemetry pattern: {topic_prefix}/{client_id}/{device_id}/{telemetry_suffix}
  telemetry_suffix       NVARCHAR(200)  NOT NULL DEFAULT 'telemetry',
  config_suffix          NVARCHAR(200)  NOT NULL DEFAULT 'config',
  -- Per-device-type suffix overrides stored as JSON object:
  -- { "P1": { "telemetry": "p1/data", "config": "p1/config" },
  --   "GAS": { "telemetry": "gas/data", "config": "gas/cfg" } }
  device_type_overrides  NVARCHAR(MAX)  NULL,
  created_by             INT            NOT NULL REFERENCES [user](user_id),
  created_at             DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  updated_at             DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  updated_by             INT            NULL REFERENCES [user](user_id)
);
```

**Topic construction logic (shared by backend, EMQX hooks, subscriber):**
```
function buildTopics(client_id, device_id, device_type, config):
  overrides = JSON.parse(config.device_type_overrides ?? '{}')
  typeOverride = overrides[device_type] ?? {}
  prefix    = config.topic_prefix
  tSuffix   = typeOverride.telemetry ?? config.telemetry_suffix
  cSuffix   = typeOverride.config    ?? config.config_suffix
  telemetry = "{prefix}/{client_id}/{device_id}/{tSuffix}"
  config    = "{prefix}/{client_id}/{device_id}/{cSuffix}"
  return { telemetry, config }
```

**Default (no row in ClientTopicConfig):** falls back to `cloudsynk/{client_id}/{device_id}/telemetry` and `cloudsynk/{client_id}/{device_id}/config`.

### 3.5 Modify `SubscriptionPlans` — CRUD Support

```sql
ALTER TABLE SubscriptionPlans ADD
  updated_by INT NULL REFERENCES [user](user_id);
```

### 3.6 New Permissions Seed

```sql
-- New permissions for new features
INSERT INTO permissions (permission_name) VALUES
  ('Manage Plans'),          -- plan CRUD
  ('Manage Discounts'),      -- discount management
  ('Pause Resume Devices'),  -- client-initiated pause per device
  ('Manage Topic Config');   -- topic pattern configuration (SYSTEM_ADMIN only)
```

---

## 4. Backend Implementation

### 4.1 New / Modified Models

#### `SubscriptionPlan.js` — Add CRUD methods
New methods beyond existing:
- `create(data)` — INSERT new plan row
- `deactivate(planId)` — soft delete (is_active = 0), returns updated plan
- `update(planId, data)` — update all editable fields (name, description, max_devices, price_monthly, price_yearly, grace_days, features); price changes do NOT affect existing subscriptions

#### `ClientSubscription.js` — Add admin management methods
New methods:
- `createManual({ client_id, plan_id, billing_cycle, end_date, assigned_by_admin_id, assignment_type, admin_notes })` — admin creates subscription without Razorpay; sets status=ACTIVE, start_date=NOW, end_date=supplied, grace_end_date=end_date+grace_days
- `changePlan(subscriptionId, newPlanId, adminUserId)` — updates plan_id + logs admin user; price change takes effect at next renewal only (existing end_date preserved)
- `extendEndDate(subscriptionId, newEndDate, adminUserId)` — update end_date + recalculate grace_end_date

#### `ClientDiscount.js` — NEW model

**File:** `server/models/ClientDiscount.js`

```js
class ClientDiscount {
  static async getUnused(clientId)   // find active one-time discount for client
  static async create({ client_id, discount_type, discount_value, created_by })
  static async markUsed(discountId, razorpay_order_id)  // set is_used=1, applied_at=NOW
  static async getByClientId(clientId)  // full history
  static async delete(discountId)       // admin can remove an unused discount
}
```

Discount application logic (in `subscriptionService.js`):
```js
export const computeOrderAmount = async (clientId, basePriceInRupees) => {
  const discount = await ClientDiscount.getUnused(clientId);
  if (!discount) return { finalAmount: basePriceInRupees, discount: null };

  let finalAmount;
  if (discount.discount_type === 'PERCENTAGE') {
    finalAmount = basePriceInRupees * (1 - discount.discount_value / 100);
  } else { // FIXED
    finalAmount = Math.max(0, basePriceInRupees - discount.discount_value);
  }
  return { finalAmount: Math.round(finalAmount * 100) / 100, discount };
};
```

The discount is **consumed** (marked used) only after `verifyPaymentAndActivate` succeeds.

#### `DevicePauseService.js` — NEW service

**File:** `server/services/devicePauseService.js`

```js
// Pause a single device (client or admin initiated)
export const pauseDevice = async (deviceId, pausedBy, reason) => {
  // 1. Check if device.paused_by = 'ADMIN' → only admin can override → throw if non-admin tries
  // 2. UPDATE device SET data_enabled=0, paused_by=@pausedBy, paused_at=NOW, paused_reason=@reason
  // 3. Push MQTT config message: { data_enabled: false }
  // 4. Log audit
}

// Resume a single device
export const resumeDevice = async (deviceId, resumedBy, actorRole) => {
  // 1. If device.paused_by = 'ADMIN' and actorRole is not ADMIN → throw AuthorizationError
  // 2. UPDATE device SET data_enabled=1, paused_by=NULL, paused_at=NULL, paused_reason=NULL
  // 3. Push MQTT config message: { data_enabled: true }
  // 4. Log audit
}

// Pause ALL devices for a client (admin INACTIVE or client service-pause)
export const pauseAllDevicesForClient = async (clientId, pausedBy, reason) => {
  // 1. Fetch all ACTIVE + CLIENT-paused device IDs for client
  // 2. Bulk UPDATE device SET data_enabled=0, paused_by=@pausedBy, ...
  // 3. For each device: push MQTT config message { data_enabled: false }
}

// Resume all CLIENT-paused devices for a client
export const resumeAllDevicesForClient = async (clientId, actorRole) => {
  // Only resumes devices where paused_by = 'CLIENT' (ADMIN-paused are untouched)
  // If actorRole = 'ADMIN': resumes ALL (including ADMIN-paused)
}
```

#### `TopicConfigService.js` — NEW service

**File:** `server/services/topicConfigService.js`

```js
export const getTopicConfig = async (clientId) => {
  // Returns ClientTopicConfig row or default fallback object
}

export const buildTopicPaths = (clientId, deviceId, deviceType, config) => {
  // Returns { telemetry, config } topic strings
}

export const saveTopicConfig = async (clientId, configData, adminUserId) => {
  // UPSERT ClientTopicConfig
  // After save: publish reload signal to MQTT for Python subscriber
  // Also push updated config to all ACTIVE devices for this client
}

export const notifySubscriberReload = async () => {
  // Publish to cloudsynk/internal/subscriber/reload
  // Payload: { action: 'reload_topics', timestamp: ISO_string }
}
```

### 4.2 New / Modified Controllers

#### `subscriptionController.js` — Add admin management endpoints

New endpoint handlers:
- `createManualSubscription` — POST `/api/subscriptions/admin/manual`
- `changePlan` — PATCH `/api/subscriptions/:id/plan`
- `extendEndDate` — PATCH `/api/subscriptions/:id/extend`

#### `planController.js` — NEW (Plan CRUD)

**File:** `server/controllers/planController.js`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/subscription-plans` | List all plans (incl. inactive) | Admin |
| POST | `/api/subscription-plans` | Create new plan | Admin |
| PUT | `/api/subscription-plans/:id` | Update plan | Admin |
| DELETE | `/api/subscription-plans/:id` | Deactivate (soft delete) | Admin |

#### `discountController.js` — NEW

**File:** `server/controllers/discountController.js`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/discounts/:clientId` | Get discount history for client | Admin |
| GET | `/api/discounts/:clientId/active` | Get unused discount for client | Admin |
| POST | `/api/discounts` | Create discount for client | Admin |
| DELETE | `/api/discounts/:id` | Remove unused discount | Admin |

#### `deviceController.js` — Add pause/resume endpoints

New endpoint handlers:
- `pauseDevice` — POST `/api/devices/:id/pause`
- `resumeDevice` — POST `/api/devices/:id/resume`
- `pauseAllDevices` — POST `/api/devices/pause-all` (body: `{ client_id }`)
- `resumeAllDevices` — POST `/api/devices/resume-all` (body: `{ client_id }`)

#### `topicConfigController.js` — NEW

**File:** `server/controllers/topicConfigController.js`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/topic-config` | List all client topic configs | SYSTEM_ADMIN |
| GET | `/api/topic-config/:clientId` | Get config for client | SYSTEM_ADMIN |
| PUT | `/api/topic-config/:clientId` | Create or update config | SYSTEM_ADMIN |
| DELETE | `/api/topic-config/:clientId` | Reset to defaults | SYSTEM_ADMIN |

#### `mqttAuthController.js` — Update ACL Hook

Current ACL logic:
```
ACTIVE device → allow all scoped topics
INACTIVE device → deny all
PENDING device → allow pre-activation topic only
```

Updated ACL logic:
```
INACTIVE device         → deny all
PENDING device          → allow pre-activation topic only
ACTIVE + data_enabled=1 → allow telemetry publish + config subscribe (scoped topics)
ACTIVE + data_enabled=0 → allow config subscribe (so device can receive resume), DENY telemetry publish
```

The device must still receive the config topic even when paused so it can receive the `{ data_enabled: true }` resume message.

Auth hook: no change (INACTIVE = deny connection, others = allow based on credentials).

### 4.3 New Route Files

**`server/routes/planRoutes.js`**
```js
router.use(authenticate);
router.use(requirePermission('Manage Plans'));
router.get('/',     getPlans_All);      // incl. inactive
router.post('/',    createPlan);
router.put('/:id',  updatePlan);
router.delete('/:id', deactivatePlan);
```

**`server/routes/discountRoutes.js`**
```js
router.use(authenticate);
router.use(requirePermission('Manage Discounts'));
router.get('/:clientId',        getDiscountHistory);
router.get('/:clientId/active', getActiveDiscount);
router.post('/',                createDiscount);
router.delete('/:id',           deleteDiscount);
```

**`server/routes/topicConfigRoutes.js`**
```js
router.use(authenticate);
router.use(requirePermission('Manage Topic Config'));
router.get('/',             getAllTopicConfigs);
router.get('/:clientId',    getClientTopicConfig);
router.put('/:clientId',    saveClientTopicConfig);
router.delete('/:clientId', resetTopicConfig);
```

### 4.4 Modify `server.js`

Register new routes:
```js
import planRoutes        from './routes/planRoutes.js';
import discountRoutes    from './routes/discountRoutes.js';
import topicConfigRoutes from './routes/topicConfigRoutes.js';

app.use('/api/subscription-plans', planRoutes);
app.use('/api/discounts',          discountRoutes);
app.use('/api/topic-config',       topicConfigRoutes);
```

### 4.5 Updated `subscriptionController.js` — `createOrderForSubscription`

Before creating the Razorpay order, apply any unused discount:

```js
// In createOrderForSubscription:
const { finalAmount, discount } = await computeOrderAmount(clientId, parseFloat(amount));
// Use finalAmount for Razorpay order amount
// After verifyPaymentAndActivate succeeds, call ClientDiscount.markUsed(discount.discount_id, order.id)
```

---

## 5. MQTT & Device Layer

### 5.1 Device State Machine

```
                  ┌──────────────────────────────────────────────────┐
                  │                    DEVICE STATES                  │
                  ├──────────────────────────────────────────────────┤
                  │  activation_status  │  data_enabled  │ paused_by │
                  │─────────────────────┼────────────────┼───────────│
                  │  PENDING            │    1           │  NULL     │
                  │  ACTIVE             │    1           │  NULL     │  ← normal
                  │  ACTIVE             │    0           │ 'CLIENT'  │  ← client paused
                  │  ACTIVE             │    0           │ 'ADMIN'   │  ← admin inactive
                  │  INACTIVE           │    0           │ 'ADMIN'   │  ← fully deactivated
                  └──────────────────────────────────────────────────┘

  EMQX Auth hook:   activation_status = 'INACTIVE'  → DENY connection
  EMQX ACL hook:    data_enabled = 0               → DENY publish to telemetry topic
                    (allows subscribe to config topic so device receives resume signal)
```

**UI Status Mapping:**

| DB State | UI Label | Actor | Billing |
|----------|----------|-------|---------|
| ACTIVE, data_enabled=1 | Active | — | continues |
| ACTIVE, data_enabled=0, paused_by='CLIENT' | Paused | Client | continues |
| ACTIVE, data_enabled=0, paused_by='ADMIN' | Inactive | Admin | stopped |
| INACTIVE, data_enabled=0 | Deactivated | Admin | stopped |

### 5.2 Pause Config Message Payload

When backend pauses/resumes a device, it publishes to `{prefix}/{client_id}/{device_id}/{config_suffix}`:

```json
{
  "action": "config_update",
  "data_enabled": false,
  "timestamp": "2026-03-28T10:00:00Z"
}
```

Resume:
```json
{
  "action": "config_update",
  "data_enabled": true,
  "timestamp": "2026-03-28T10:05:00Z"
}
```

Device firmware must respect the `data_enabled` field and stop publishing telemetry when `false`.

### 5.3 Topic Pattern Config Message Payload

When topic pattern changes for a client, the backend pushes to each active device's current config topic:

```json
{
  "action": "topic_update",
  "telemetry_topic": "acmecorp/42/dev-001/data",
  "config_topic": "acmecorp/42/dev-001/settings",
  "effective_at": "2026-03-28T10:10:00Z"
}
```

Device firmware must reconnect to EMQX and re-subscribe to the new config topic after receiving this.

### 5.4 MQTT Auth / ACL Hook Changes

**`/api/mqtt/auth`** — No change to signature or behavior.
INACTIVE = deny. PENDING + ACTIVE = allow (credential check).

**`/api/mqtt/acl`** — Updated lookup:

```js
// Pseudocode — existing ACL logic extended:
const device = await Device.findByDeviceId(clientId, deviceId);

if (device.activation_status === 'INACTIVE') return deny;

if (device.activation_status === 'PENDING') {
  // only allow pre-activation topic
  return topic === 'cloudsynk/pre-activation' ? allow : deny;
}

// ACTIVE — load topic config for this client
const topicConfig = await getTopicConfig(device.client_id);
const topics = buildTopicPaths(device.client_id, device.device_id, device.device_type, topicConfig);

if (action === 'publish' && topic === topics.telemetry) {
  return device.data_enabled ? allow : deny;  // ← PAUSE check
}
if (action === 'subscribe' && topic === topics.config) {
  return allow;  // always allow config subscribe so device gets resume signal
}

return deny;
```

**Performance note:** ACL hook is called on every message publish. Cache `ClientTopicConfig` in memory with a 30-second TTL or use `node-cache` to avoid DB round-trip per message.

---

## 6. VM / Python Subscriber

### 6.1 Dynamic Topic Pattern Re-subscription

The Python subscriber (`local_subscriber.py`) must be updated:

**Startup sequence:**
```python
def on_connect(client, userdata, flags, rc):
    # 1. Subscribe to control channel
    client.subscribe("cloudsynk/internal/subscriber/reload")
    # 2. Subscribe to pre-activation
    client.subscribe("cloudsynk/pre-activation")
    # 3. Load all active ClientTopicConfig from DB
    patterns = load_topic_patterns_from_db()
    for p in patterns:
        client.subscribe(p.telemetry_pattern_wildcard)
    # e.g. "cloudsynk/+/+/telemetry" OR "acmecorp/+/+/data"
```

**On reload signal:**
```python
def on_message(client, userdata, msg):
    if msg.topic == "cloudsynk/internal/subscriber/reload":
        handle_reload(client)
        return
    # ... existing message handling

def handle_reload(client):
    # 1. Query DB for current ClientTopicConfig rows
    new_patterns = load_topic_patterns_from_db()
    # 2. Build set of unique wildcard patterns (prefix/+/+/suffix)
    # 3. Unsubscribe from patterns no longer needed
    # 4. Subscribe to new patterns
    update_subscriptions(client, new_patterns)
```

**Wildcard pattern construction:**
```python
def build_wildcard(prefix, telemetry_suffix):
    return f"{prefix}/+/+/{telemetry_suffix}"
# e.g. "cloudsynk/+/+/telemetry" or "acmecorp/+/+/data"
```

**DB query for topic patterns:**
```sql
SELECT c.client_id, tc.topic_prefix, tc.telemetry_suffix, tc.device_type_overrides
FROM client c
LEFT JOIN ClientTopicConfig tc ON c.client_id = tc.client_id
WHERE c.is_active = 1
```

For clients with no ClientTopicConfig row: use defaults (`cloudsynk`, `telemetry`).

**Device type override handling (subscriber):**
When a telemetry message arrives at a custom topic, the subscriber must determine:
1. Which `client_id` and `device_id` it belongs to (from topic segments)
2. Which decoder to use (from `device.device_type` in DB)

The subscriber already queries the DB by device_id, so decoder selection doesn't change.

### 6.2 Control Topic ACL

Add EMQX ACL rules for the control topic so only the backend publisher account can write to it:
- `backend_publisher` → publish to `cloudsynk/internal/subscriber/reload`
- `local_subscriber` → subscribe to `cloudsynk/internal/subscriber/reload`

---

## 7. Frontend Implementation

### 7.1 New Services

**`client/src/services/planService.js`** — NEW
```js
export const getAllPlans()          // GET /api/subscription-plans (admin, incl. inactive)
export const createPlan(data)       // POST /api/subscription-plans
export const updatePlan(id, data)   // PUT  /api/subscription-plans/:id
export const deactivatePlan(id)     // DELETE /api/subscription-plans/:id
```

**`client/src/services/discountService.js`** — NEW
```js
export const getDiscountHistory(clientId)  // GET /api/discounts/:clientId
export const getActiveDiscount(clientId)   // GET /api/discounts/:clientId/active
export const createDiscount(data)          // POST /api/discounts
export const deleteDiscount(id)            // DELETE /api/discounts/:id
```

**`client/src/services/topicConfigService.js`** — NEW
```js
export const getAllTopicConfigs()           // GET /api/topic-config
export const getClientTopicConfig(cid)     // GET /api/topic-config/:clientId
export const saveClientTopicConfig(cid, d) // PUT /api/topic-config/:clientId
export const resetTopicConfig(cid)         // DELETE /api/topic-config/:clientId
```

### 7.2 New Pages

#### `PlanManagement.jsx` — NEW
**File:** `client/src/pages/Admin/PlanManagement.jsx`
**Route:** `/admin/plans`
**Access:** SYSTEM_ADMIN, SUPER_ADMIN

UI sections:
1. **Plan list table** — columns: Name, Price (monthly/yearly), Max Devices, Grace Days, Status (active/archived), Actions (Edit, Archive)
2. **Create / Edit Plan modal** — fields: Name, Description, Max Devices (-1 = unlimited), Price Monthly (₹), Price Yearly (₹), Grace Days, Features (tag input), Razorpay Plan ID Monthly, Razorpay Plan ID Yearly
3. **Archive confirmation** — warn that existing subscriptions are unaffected, only new sign-ups cannot choose this plan

Notes:
- Price edits apply to **new subscriptions only** — show a persistent info banner to that effect
- Archived plans remain visible in the table (greyed out) with an "Unarchive" option

#### `DiscountManagement.jsx` — NEW
**File:** `client/src/pages/Admin/DiscountManagement.jsx`
**Route:** `/admin/discounts`
**Access:** SYSTEM_ADMIN, SUPER_ADMIN

UI sections:
1. **Client selector dropdown** — filter by client
2. **Active discount card** — shows current unused discount for selected client (type, value, created by, created at) with "Remove" button
3. **Set discount form** — fields: Client (searchable select), Discount Type (Percentage / Fixed Amount), Value (₹ or %). Submit creates a new one-time discount. Warning shown if client already has an unused discount (must remove it first).
4. **Discount history table** — columns: Client, Type, Value, Created By, Created At, Applied At, Applied To Invoice

Notes:
- Discount is invisible to the client — they see only the final (reduced) amount on the Razorpay checkout
- Only one active unused discount per client at any time

#### `TopicPatternConfig.jsx` — NEW
**File:** `client/src/pages/Admin/TopicPatternConfig.jsx`
**Route:** `/admin/topic-config`
**Access:** SYSTEM_ADMIN only

UI sections:
1. **Client list** — table showing all clients with their current topic pattern (or "Default" if not configured). Edit action per row.
2. **Config editor panel / modal** — fields:
   - Topic Prefix (text, e.g. `cloudsynk`)
   - Telemetry Suffix (text, e.g. `telemetry`)
   - Config Suffix (text, e.g. `config`)
   - **Device Type Overrides** — expandable section; for each device type (P1, P2, P3, HKMI, GAS) provide optional Telemetry Suffix and Config Suffix overrides
   - **Live Preview** — shows resolved topic path example: `{prefix}/{client_id}/{device_id}/{suffix}`
3. **Warning banner** — "Saving this config will immediately push updated topics to all active devices for this client and signal the Python subscriber to re-subscribe. Devices must reconnect to complete the transition."
4. **Reset to Default** button — removes custom config, devices revert to `cloudsynk/...` pattern on next config push

#### `AdminSubscriptionManagement.jsx` — ENHANCED
**File:** `client/src/pages/Admin/SubscriptionManagement.jsx` (already exists — extend it)

Current state: read-only table with Cancel/View.

New capabilities:
1. **Assign Manual Subscription** button (top right) — opens modal:
   - Client selector (searchable)
   - Plan selector
   - Billing Cycle (monthly/yearly)
   - Assignment Type: Trial / Manual Invoice
   - End Date (date picker)
   - Admin Notes (textarea)
   - Submit → POST `/api/subscriptions/admin/manual`

2. **Change Plan** action per row:
   - Shows plan selector modal
   - Warning: "Price takes effect at next renewal. Current period is unaffected."
   - Submit → PATCH `/api/subscriptions/:id/plan`

3. **Extend End Date** action per row:
   - Date picker modal
   - Submit → PATCH `/api/subscriptions/:id/extend`

4. **Assignment Type badge** — shows PAYMENT / MANUAL / TRIAL tag in the table

5. **Admin Notes** column (tooltip on hover)

### 7.3 Modified Pages

#### `BillingPage.jsx` — Add Pause All Devices

Add a new section "Service Controls" below the Current Plan card:

```
┌──────────────────────────────────────────────┐
│  Service Controls                             │
│                                               │
│  All Devices: [Pause All]  or  [Resume All]  │
│  (only shown if subscription is ACTIVE)       │
│                                               │
│  Note: Pausing stops data collection from    │
│  all your devices. Your subscription billing  │
│  continues normally.                          │
└──────────────────────────────────────────────┘
```

- "Pause All" → POST `/api/devices/pause-all` with `{ client_id }`; requires confirmation modal
- "Resume All" → POST `/api/devices/resume-all` with `{ client_id }`
- Button state auto-derived from `subscription.all_devices_paused` (computed by backend: true if all data_enabled=0 and paused_by='CLIENT')

#### `DeviceManagement.jsx` — Per-device Pause / Resume

Add per-device actions in the device list:
- ACTIVE device (`data_enabled=1`): show **"Pause"** button (client-visible)
- Paused by CLIENT (`data_enabled=0, paused_by='CLIENT'`): show **"Resume"** button
- Paused by ADMIN (`data_enabled=0, paused_by='ADMIN'`): show **"Inactive (Admin)"** badge, no resume button for client; admin sees Resume
- Show a **"Paused"** status badge (amber) on the device row when paused

Pause confirmation modal:
- Title: "Pause Device Data Collection"
- Body: "This device will stop sending data. You can resume at any time. Billing continues normally."
- Confirm button: "Pause Device"

Admin-only: "Set Inactive" and "Set Active" controls remain as before.

#### `DeviceManagement.jsx` — CLIENT_ADMIN sees ACTIVE devices for their client

The existing device list query is already scoped by `client_id` for CLIENT_ADMIN. This feature requires:
- Verifying the `GET /api/devices` query correctly filters by `req.user.client_id` when the user is CLIENT_ADMIN
- After admin activates a new device for client X, it appears on next page load for CLIENT_ADMIN of client X

No real-time update needed — standard page refresh or existing polling is sufficient.

### 7.4 Sidebar Updates

Add to admin nav section in `Sidebar.jsx`:

```jsx
{hasPermission('Manage Plans') && (
  <NavLink to="/admin/plans">
    <RectangleGroupIcon /> Plans
  </NavLink>
)}
{hasPermission('Manage Discounts') && (
  <NavLink to="/admin/discounts">
    <TagIcon /> Discounts
  </NavLink>
)}
{hasPermission('Manage Topic Config') && (
  <NavLink to="/admin/topic-config">
    <AdjustmentsHorizontalIcon /> Topic Config
  </NavLink>
)}
```

### 7.5 App.jsx Routes

Add:
```jsx
<Route path="/admin/plans"         element={<ProtectedRoute><Layout><PlanManagement /></Layout></ProtectedRoute>} />
<Route path="/admin/discounts"     element={<ProtectedRoute><Layout><DiscountManagement /></Layout></ProtectedRoute>} />
<Route path="/admin/topic-config"  element={<ProtectedRoute><Layout><TopicPatternConfig /></Layout></ProtectedRoute>} />
```

---

## 8. Feature Specifications

### F1: Enhanced Admin Subscription Management

**Goal:** Admin can assign, modify, and extend client subscriptions without requiring Razorpay payment.

**Database changes:** `ClientSubscriptions.assignment_type`, `assigned_by_admin_id`, `admin_notes` (Section 3.1)

**Backend:**
- `POST /api/subscriptions/admin/manual` — creates ACTIVE subscription directly; generates no Razorpay order; `assignment_type='MANUAL'` or `'TRIAL'`
- `PATCH /api/subscriptions/:id/plan` — updates `plan_id`; logs admin user_id in `updated_by`; does NOT change `end_date` or billing amount
- `PATCH /api/subscriptions/:id/extend` — updates `end_date` + recalculates `grace_end_date`

**Permissions:** All three endpoints require `Manage Subscriptions` permission.

**UI:** Enhanced `SubscriptionManagement.jsx` as described in Section 7.3.

**Business rules:**
- When admin assigns a manual subscription and the client already has an ACTIVE/GRACE subscription, the existing one is CANCELLED automatically before the new one is created
- Plan change during grace period: allowed; new plan applies immediately
- Trial type: behaves identically to MANUAL but shows "Trial" badge in UI

---

### F2: Plan CRUD

**Goal:** Admins can create, edit, and archive subscription plans via UI without touching the database directly.

**Database changes:** `SubscriptionPlans.updated_by` (Section 3.5)

**Backend:** `planController.js` + `planRoutes.js` (Section 4.2, 4.3)

**Model updates:** `SubscriptionPlan.create()`, `SubscriptionPlan.update()` (full field update), `SubscriptionPlan.deactivate()` (Section 4.1)

**UI:** `PlanManagement.jsx` (Section 7.2)

**Business rules:**
- Price changes only affect new subscriptions — existing active subscriptions are billed at the price recorded in `PaymentTransactions` (the original order amount)
- Max devices change: if admin lowers max_devices, existing clients over the new limit are NOT auto-deactivated; they remain over-provisioned until their next renewal
- Archived plans: `is_active=0`; no new subscriptions can be created on them; existing subscriptions on that plan continue normally
- A plan with active subscriptions cannot be hard-deleted — only archived

---

### F3: Admin-Managed Discounts

**Goal:** Admin applies a one-time discount to a specific client. On the client's next payment, the Razorpay order is created with the discounted amount. Client only sees the final price — no discount label is shown.

**Database changes:** New `ClientDiscounts` table (Section 3.2)

**New model:** `ClientDiscount.js` (Section 4.1)

**Flow:**
```
1. Admin creates discount:
   POST /api/discounts → { client_id, discount_type: 'PERCENTAGE'|'FIXED', discount_value }

2. Client goes to /billing, clicks "Subscribe" or "Renew":
   POST /api/subscriptions/create-order →
     Backend calls computeOrderAmount(clientId, basePlanPrice)
     → finds unused discount → calculates finalAmount
     → creates Razorpay order with finalAmount (NOT the plan price)
     → returns order; client sees final amount in Razorpay checkout

3. Payment succeeds:
   POST /api/subscriptions/verify-payment →
     After activating subscription:
     → calls ClientDiscount.markUsed(discountId, razorpay_order_id)
     → discount is consumed; client's next payment uses full plan price

4. Admin can view usage:
   GET /api/discounts/:clientId → full history (used + unused)
```

**Constraints:**
- Only one active (unused) discount per client at a time
- If admin creates a new discount while one is pending, the system rejects with error: "Client already has an active discount. Remove it first."
- Discount does NOT automatically reduce the amount shown in `SubscriptionPlans` — it only affects the Razorpay order amount
- The discount amount is recorded in `PaymentTransactions.amount` (the reduced amount)

**UI:** `DiscountManagement.jsx` (Section 7.2)

---

### F4/F5: Pause / Resume + Device Flags

**Goal:** Clients can pause individual devices or all devices. Admins can set devices or entire client services as INACTIVE. In both cases, the device stops publishing telemetry.

**Database changes:** `device.data_enabled`, `device.paused_by`, `device.paused_at`, `device.paused_reason` (Section 3.3)

**New service:** `devicePauseService.js` (Section 4.1)

**Backend endpoints:** Pause/resume device actions in `deviceController.js` (Section 4.2)

**EMQX ACL update:** data_enabled=0 → deny telemetry publish (Section 5.1, 5.4)

**Two-layer enforcement (belt and suspenders):**
1. **Device-layer (soft):** Backend pushes MQTT config message `{ data_enabled: false }` → device stops publishing voluntarily (immediate effect, sub-second)
2. **Broker-layer (hard):** EMQX ACL hook blocks any telemetry publish attempt when `data_enabled=0` in DB → even if device ignores the config, data is rejected at the broker

**Pause / Resume API:**

| Endpoint | Body | Auth | Description |
|----------|------|------|-------------|
| POST `/api/devices/:id/pause` | `{ reason? }` | CLIENT_ADMIN, SYSTEM_ADMIN | Pause single device |
| POST `/api/devices/:id/resume` | — | CLIENT_ADMIN, SYSTEM_ADMIN | Resume (only if paused_by='CLIENT' for CLIENT_ADMIN) |
| POST `/api/devices/pause-all` | `{ client_id }` | CLIENT_ADMIN (own client), ADMIN | Pause all devices for client |
| POST `/api/devices/resume-all` | `{ client_id }` | CLIENT_ADMIN (own client), ADMIN | Resume all CLIENT-paused devices |

**Permission rules enforced at service layer:**
- CLIENT_ADMIN can only pause/resume devices belonging to their own `client_id`
- CLIENT_ADMIN cannot resume a device where `paused_by = 'ADMIN'`
- SYSTEM_ADMIN/SUPER_ADMIN can pause or resume any device in any state
- Deactivation (`activation_status = 'INACTIVE'`) remains admin-only — separate flow from pause

**Subscription expiry deactivation (existing cron):** When subscription expires and grace period ends, `deactivateClientDevices()` sets `activation_status = 'INACTIVE'`, `data_enabled = 0`, `paused_by = 'ADMIN'`. This is the billing-driven path.

**UI changes:** `BillingPage.jsx` (pause all), `DeviceManagement.jsx` (per-device pause/resume) — Section 7.3

---

### F6: Topic Pattern Configuration

**Goal:** SYSTEM_ADMIN can configure a custom MQTT topic pattern per client (with per-device-type overrides). Changes take effect immediately via MQTT push to live devices and a reload signal to the Python subscriber.

**Database changes:** New `ClientTopicConfig` table (Section 3.4)

**New service:** `topicConfigService.js` (Section 4.1)

**New controller + routes:** `topicConfigController.js`, `topicConfigRoutes.js` (Section 4.2, 4.3)

**End-to-end flow when admin saves a pattern:**
```
1. Admin submits PUT /api/topic-config/:clientId
2. Backend UPSERT ClientTopicConfig row
3. Backend loads all ACTIVE devices for this client
4. For each device: push MQTT config message { action: 'topic_update', telemetry_topic, config_topic }
5. Backend publishes to cloudsynk/internal/subscriber/reload
6. Python subscriber receives reload → re-queries DB → re-subscribes to new topic patterns
7. Devices reconnect with new topics after receiving config push
```

**EMQX ACL hook update:**
The ACL hook must now construct expected topic from `ClientTopicConfig` per client (with caching):
```js
const config = await getCachedTopicConfig(clientId);
const { telemetry, config: configTopic } = buildTopicPaths(clientId, deviceId, deviceType, config);
// compare incoming topic against computed telemetry/configTopic
```

**Default behaviour (no ClientTopicConfig row):** falls back to `cloudsynk/{client_id}/{device_id}/telemetry` and `cloudsynk/{client_id}/{device_id}/config`.

**Python subscriber changes:** Section 6.1

**UI:** `TopicPatternConfig.jsx` (Section 7.2)

**Constraints:**
- Topic prefix must not contain wildcards (`+`, `#`) or spaces
- Suffix must not start with `/`
- System validates that no two clients share the same effective pattern (to prevent cross-client data leakage)

---

### F7: Device Dashboard Visibility for CLIENT_ADMIN

**Goal:** After a SYSTEM_ADMIN activates a device and assigns it to client X, it appears on client X's device management page on next load.

**Current gap:** The `GET /api/devices` query may not correctly filter by `client_id` for CLIENT_ADMIN users.

**Fix:** In `deviceController.js`, the list query must include:
```js
const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(req.user.role_name);
const clientFilter = isAdmin ? (req.query.client_id || null) : req.user.client_id;
// Use clientFilter in the WHERE clause
```

CLIENT_ADMIN devices query returns only `activation_status IN ('ACTIVE', 'INACTIVE')` for that client — PENDING devices are not assigned yet so they are excluded.

No real-time mechanism needed — standard page load is sufficient.

---

## 9. Permissions

### New Permissions to Seed

| Permission | Category | Who Gets It |
|------------|----------|-------------|
| `Manage Plans` | Billing | SYSTEM_ADMIN, SUPER_ADMIN |
| `Manage Discounts` | Billing | SYSTEM_ADMIN, SUPER_ADMIN |
| `Pause Resume Devices` | Devices | CLIENT_ADMIN, SYSTEM_ADMIN, SUPER_ADMIN |
| `Manage Topic Config` | MQTT | SYSTEM_ADMIN only |

### Full Billing/Admin Permission Matrix

| Permission | SYSTEM_ADMIN | SUPER_ADMIN | CLIENT_ADMIN | CLIENT_USER |
|------------|:---:|:---:|:---:|:---:|
| View Billing | ✅ | ✅ | ✅ | — |
| Manage Subscriptions | ✅ | ✅ | — | — |
| Override Subscription | ✅ | ✅ | — | — |
| Manage Plans | ✅ | ✅ | — | — |
| Manage Discounts | ✅ | ✅ | — | — |
| Pause Resume Devices | ✅ | ✅ | ✅ | — |
| Manage Topic Config | ✅ | — | — | — |

---

## 10. Migration SQL

Run this script **once** against your target database. All statements are idempotent.

```sql
USE [cs_db_dev]; -- change to target DB

-- ─────────────────────────────────────────────────────────────
-- 1. Extend ClientSubscriptions with admin management fields
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('ClientSubscriptions') AND name = 'assignment_type')
BEGIN
  ALTER TABLE ClientSubscriptions ADD
    assignment_type      NVARCHAR(20)  NOT NULL DEFAULT 'PAYMENT',
    assigned_by_admin_id INT           NULL REFERENCES [user](user_id),
    admin_notes          NVARCHAR(500) NULL;
  PRINT 'Extended ClientSubscriptions with admin management fields';
END

-- ─────────────────────────────────────────────────────────────
-- 2. ClientDiscounts — one-time admin discount per client
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ClientDiscounts')
BEGIN
  CREATE TABLE ClientDiscounts (
    discount_id       INT            IDENTITY(1,1) PRIMARY KEY,
    client_id         INT            NOT NULL REFERENCES client(client_id),
    discount_type     NVARCHAR(20)   NOT NULL,         -- 'PERCENTAGE' | 'FIXED'
    discount_value    DECIMAL(10,2)  NOT NULL,
    is_used           BIT            NOT NULL DEFAULT 0,
    created_by        INT            NOT NULL REFERENCES [user](user_id),
    created_at        DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    applied_at        DATETIME2      NULL,
    applied_to_order  NVARCHAR(100)  NULL
  );
  CREATE INDEX IX_ClientDiscounts_client
    ON ClientDiscounts(client_id);
  CREATE INDEX IX_ClientDiscounts_unused
    ON ClientDiscounts(client_id) WHERE is_used = 0;
  PRINT 'Created table: ClientDiscounts';
END

-- ─────────────────────────────────────────────────────────────
-- 3. device — pause / data flag columns
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('device') AND name = 'data_enabled')
BEGIN
  ALTER TABLE device ADD
    data_enabled  BIT           NOT NULL DEFAULT 1,
    paused_by     NVARCHAR(20)  NULL,   -- 'CLIENT' | 'ADMIN'
    paused_at     DATETIME2     NULL,
    paused_reason NVARCHAR(500) NULL;
  PRINT 'Added pause/data_enabled columns to device';
END

-- ─────────────────────────────────────────────────────────────
-- 4. ClientTopicConfig — per-client MQTT topic patterns
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ClientTopicConfig')
BEGIN
  CREATE TABLE ClientTopicConfig (
    config_id             INT            IDENTITY(1,1) PRIMARY KEY,
    client_id             INT            NOT NULL UNIQUE REFERENCES client(client_id),
    topic_prefix          NVARCHAR(200)  NOT NULL DEFAULT 'cloudsynk',
    telemetry_suffix      NVARCHAR(200)  NOT NULL DEFAULT 'telemetry',
    config_suffix         NVARCHAR(200)  NOT NULL DEFAULT 'config',
    device_type_overrides NVARCHAR(MAX)  NULL,
    created_by            INT            NOT NULL REFERENCES [user](user_id),
    created_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_by            INT            NULL REFERENCES [user](user_id)
  );
  PRINT 'Created table: ClientTopicConfig';
END

-- ─────────────────────────────────────────────────────────────
-- 5. SubscriptionPlans — add updated_by
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('SubscriptionPlans') AND name = 'updated_by')
BEGIN
  ALTER TABLE SubscriptionPlans ADD
    updated_by INT NULL REFERENCES [user](user_id);
  PRINT 'Added updated_by to SubscriptionPlans';
END

-- ─────────────────────────────────────────────────────────────
-- 6. Seed new permissions
-- ─────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM permissions WHERE permission_name = 'Manage Plans')
BEGIN
  INSERT INTO permissions (permission_name) VALUES
    ('Manage Plans'),
    ('Manage Discounts'),
    ('Pause Resume Devices'),
    ('Manage Topic Config');
  PRINT 'Seeded 4 new permissions';
END

-- ─────────────────────────────────────────────────────────────
-- 7. Assign new permissions to roles
-- ─────────────────────────────────────────────────────────────
DECLARE @managePlansId     INT;
DECLARE @manageDiscId      INT;
DECLARE @pauseResumeId     INT;
DECLARE @topicConfigId     INT;
DECLARE @sysAdminId        INT;
DECLARE @superAdminId      INT;
DECLARE @clientAdminId     INT;

SELECT @managePlansId  = permission_id FROM permissions WHERE permission_name = 'Manage Plans';
SELECT @manageDiscId   = permission_id FROM permissions WHERE permission_name = 'Manage Discounts';
SELECT @pauseResumeId  = permission_id FROM permissions WHERE permission_name = 'Pause Resume Devices';
SELECT @topicConfigId  = permission_id FROM permissions WHERE permission_name = 'Manage Topic Config';
SELECT @sysAdminId     = role_id       FROM role WHERE role_name = 'SYSTEM_ADMIN';
SELECT @superAdminId   = role_id       FROM role WHERE role_name = 'SUPER_ADMIN';
SELECT @clientAdminId  = role_id       FROM role WHERE role_name = 'CLIENT_ADMIN';

-- SYSTEM_ADMIN: all 4 new permissions
IF @sysAdminId IS NOT NULL BEGIN
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id=@sysAdminId AND permission_id=@managePlansId)
    INSERT INTO role_permission VALUES (@sysAdminId, @managePlansId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id=@sysAdminId AND permission_id=@manageDiscId)
    INSERT INTO role_permission VALUES (@sysAdminId, @manageDiscId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id=@sysAdminId AND permission_id=@pauseResumeId)
    INSERT INTO role_permission VALUES (@sysAdminId, @pauseResumeId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id=@sysAdminId AND permission_id=@topicConfigId)
    INSERT INTO role_permission VALUES (@sysAdminId, @topicConfigId);
END

-- SUPER_ADMIN: Manage Plans, Manage Discounts, Pause Resume (not Topic Config)
IF @superAdminId IS NOT NULL BEGIN
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id=@superAdminId AND permission_id=@managePlansId)
    INSERT INTO role_permission VALUES (@superAdminId, @managePlansId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id=@superAdminId AND permission_id=@manageDiscId)
    INSERT INTO role_permission VALUES (@superAdminId, @manageDiscId);
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id=@superAdminId AND permission_id=@pauseResumeId)
    INSERT INTO role_permission VALUES (@superAdminId, @pauseResumeId);
END

-- CLIENT_ADMIN: Pause Resume only
IF @clientAdminId IS NOT NULL BEGIN
  IF NOT EXISTS (SELECT 1 FROM role_permission WHERE role_id=@clientAdminId AND permission_id=@pauseResumeId)
    INSERT INTO role_permission VALUES (@clientAdminId, @pauseResumeId);
END

PRINT 'Assigned new permissions to roles';
PRINT '=== v3.0 migration complete ===';
```

---

## 11. Critical Files — New & Modified

### New Files

| File | Feature |
|------|---------|
| `server/models/ClientDiscount.js` | F3 |
| `server/services/devicePauseService.js` | F4/F5 |
| `server/services/topicConfigService.js` | F6 |
| `server/controllers/planController.js` | F2 |
| `server/controllers/discountController.js` | F3 |
| `server/controllers/topicConfigController.js` | F6 |
| `server/routes/planRoutes.js` | F2 |
| `server/routes/discountRoutes.js` | F3 |
| `server/routes/topicConfigRoutes.js` | F6 |
| `client/src/services/planService.js` | F2 |
| `client/src/services/discountService.js` | F3 |
| `client/src/services/topicConfigService.js` | F6 |
| `client/src/pages/Admin/PlanManagement.jsx` | F2 |
| `client/src/pages/Admin/DiscountManagement.jsx` | F3 |
| `client/src/pages/Admin/TopicPatternConfig.jsx` | F6 |
| `vm/local_subscriber.py` (new version) | F6 |

### Modified Files

| File | Change | Feature |
|------|--------|---------|
| `server/models/SubscriptionPlan.js` | Add `create()`, full `update()`, `deactivate()` | F2 |
| `server/models/ClientSubscription.js` | Add `createManual()`, `changePlan()`, `extendEndDate()` | F1 |
| `server/controllers/subscriptionController.js` | Add manual, changePlan, extend endpoints; integrate discount in createOrder | F1, F3 |
| `server/controllers/deviceController.js` | Add pause/resume endpoints; fix CLIENT_ADMIN filter | F4/F5, F7 |
| `server/controllers/mqttAuthController.js` | ACL hook: check `data_enabled` + load `ClientTopicConfig` | F4/F5, F6 |
| `server/routes/subscriptionRoutes.js` | Add admin management routes | F1 |
| `server/routes/deviceRoutes.js` | Add pause/resume routes | F4/F5 |
| `server/server.js` | Register 3 new route files | F2, F3, F6 |
| `client/src/pages/Admin/SubscriptionManagement.jsx` | Manual assign, change plan, extend date | F1 |
| `client/src/pages/Admin/DeviceManagement.jsx` | Per-device pause/resume UI; CLIENT_ADMIN ACTIVE device list | F4/F5, F7 |
| `client/src/pages/Billing/BillingPage.jsx` | Pause All / Resume All section | F4/F5 |
| `client/src/components/layout/Sidebar.jsx` | Add Plans, Discounts, Topic Config nav items | F2, F3, F6 |
| `client/src/App.jsx` | Add 3 new routes | F2, F3, F6 |
| `scripts/migrate_payment_schema.sql` | — superseded by v3.0 migration SQL above | All |

---

## 12. Testing & Verification

### F1 — Admin Subscription Management

- [ ] Login as SYSTEM_ADMIN → `/admin/subscriptions` → "Assign Manual Subscription" → select client, plan, Trial type, end date 30 days from now → confirm client shows ACTIVE subscription with "Trial" badge
- [ ] Change Plan mid-cycle: change from Basic to Pro → verify plan_id updated, end_date unchanged, price change does not retroactively alter PaymentTransactions
- [ ] Extend End Date: set end_date 60 days out → verify grace_end_date = end_date + plan.grace_days
- [ ] CLIENT_ADMIN cannot access `/admin/subscriptions` (permission denied)

### F2 — Plan CRUD

- [ ] Create a new "Starter" plan (2 devices, ₹499/mo) → appears in `/billing` plan cards for clients
- [ ] Edit Pro plan price → existing ACTIVE Pro subscribers unaffected; new subscribers pay new price
- [ ] Archive "Starter" plan → not selectable in BillingPage, greyed out in admin plan list
- [ ] Archived plan with active subscribers: subscription continues to function normally

### F3 — Discounts

- [ ] Create 20% discount for client X → client X goes to `/billing` → clicks Subscribe Pro (₹2999/mo) → Razorpay checkout shows ₹2399.20
- [ ] Payment completes → `ClientDiscounts.is_used = 1`, `applied_at` set; next payment shows full ₹2999
- [ ] Create ₹500 fixed discount → same flow, Pro price shows ₹2499
- [ ] Try creating second discount while one is active → API returns 400 error
- [ ] Admin deletes unused discount → payment reverts to full price

### F4/F5 — Pause / Resume

- [ ] CLIENT_ADMIN pauses device A → `data_enabled=0, paused_by='CLIENT'` in DB → MQTT config `{ data_enabled: false }` published to device → device stops sending telemetry
- [ ] If device sends anyway (simulate) → EMQX ACL hook denies publish → data not inserted to DB
- [ ] CLIENT_ADMIN resumes device A → `data_enabled=1` → device resumes telemetry
- [ ] SYSTEM_ADMIN sets device B as INACTIVE → CLIENT_ADMIN cannot resume device B (resume button hidden)
- [ ] SYSTEM_ADMIN resumes INACTIVE device → device resumes
- [ ] CLIENT_ADMIN "Pause All" on BillingPage → all client devices get `data_enabled=0, paused_by='CLIENT'`
- [ ] "Resume All" resumes only CLIENT-paused devices; ADMIN-paused remain paused
- [ ] Subscription expiry cron: verify deactivation sets `data_enabled=0, paused_by='ADMIN'` for expired clients

### F6 — Topic Pattern Configuration

- [ ] SYSTEM_ADMIN → `/admin/topic-config` → select client → set prefix `acmecorp`, telemetry suffix `sensors/data`
- [ ] Save → MQTT config push to all active devices: `{ action: 'topic_update', telemetry_topic: 'acmecorp/42/dev-001/sensors/data', ... }`
- [ ] Python subscriber receives reload signal → re-subscribes to `acmecorp/+/+/sensors/data`
- [ ] Device reconnects and publishes to new topic → Python subscriber ingests, data appears in dashboard
- [ ] EMQX ACL hook: device publishing to old topic (`cloudsynk/42/dev-001/telemetry`) is now denied
- [ ] Device type override: set P1 telemetry suffix `p1/measurements` → P1 devices use `acmecorp/42/dev-001/p1/measurements`, P3 devices use `acmecorp/42/dev-001/sensors/data` (default)
- [ ] Reset to default → fallback to `cloudsynk/...` pattern → reload signal sent to subscriber

### F7 — Device Dashboard Visibility

- [ ] SYSTEM_ADMIN activates device and assigns to client X
- [ ] LOGIN as CLIENT_ADMIN of client X → `/devices` → newly activated device appears in list with "Active" badge
- [ ] CLIENT_ADMIN of client Y cannot see client X's devices
- [ ] SYSTEM_ADMIN can see all devices across all clients
