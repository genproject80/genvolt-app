# Payment Services Plan — Razorpay Subscription & Device Activation

## Context

The platform currently has no payment infrastructure. Device activation is manual and not gated by any subscription. The goal is to introduce a **Razorpay-powered subscription system** where:
- Clients are on a plan that defines how many devices they can activate
- Devices can only be activated if the client has an active subscription within their device limit
- A configurable **grace period** keeps devices active after subscription expiry, allowing time to renew before forced deactivation
- Admins can manage plans and view all billing; clients can self-serve their own billing

Tech stack: **SQL Server (MSSQL)**, **Node.js/Express** (ESM modules), **React 18 + Tailwind CSS**, **Razorpay**.

---

## Phase 1 — Database Schema Changes

### 1.1 New Table: `SubscriptionPlans`

Defines the available tiers offered to clients.

```sql
CREATE TABLE SubscriptionPlans (
  plan_id        INT IDENTITY(1,1) PRIMARY KEY,
  name           NVARCHAR(100)  NOT NULL,          -- "Basic", "Pro", "Enterprise"
  description    NVARCHAR(500),
  max_devices    INT            NOT NULL,           -- -1 = unlimited
  price_monthly  DECIMAL(10,2)  NOT NULL,           -- INR
  price_yearly   DECIMAL(10,2)  NOT NULL,
  grace_days     INT            NOT NULL DEFAULT 7, -- grace period in days
  features       NVARCHAR(MAX),                     -- JSON array of feature strings
  razorpay_plan_id_monthly  NVARCHAR(100),          -- Razorpay plan ID for recurring
  razorpay_plan_id_yearly   NVARCHAR(100),
  is_active      BIT            NOT NULL DEFAULT 1,
  created_at     DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  updated_at     DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);
```

**Seed data:** Insert Basic (5 devices, ₹999/mo), Pro (25 devices, ₹2999/mo), Enterprise (unlimited, ₹7999/mo).

---

### 1.2 New Table: `ClientSubscriptions`

One active subscription per client at any time; history via status column.

```sql
CREATE TABLE ClientSubscriptions (
  subscription_id        INT IDENTITY(1,1) PRIMARY KEY,
  client_id              INT            NOT NULL REFERENCES Clients(client_id),
  plan_id                INT            NOT NULL REFERENCES SubscriptionPlans(plan_id),
  status                 NVARCHAR(20)   NOT NULL DEFAULT 'PENDING',
                         -- PENDING | ACTIVE | GRACE | EXPIRED | CANCELLED
  billing_cycle          NVARCHAR(10)   NOT NULL DEFAULT 'monthly', -- monthly | yearly
  start_date             DATETIME2,
  end_date               DATETIME2,
  grace_end_date         DATETIME2,     -- end_date + grace_days, computed on activation
  razorpay_subscription_id NVARCHAR(100),
  razorpay_customer_id   NVARCHAR(100),
  auto_renew             BIT            NOT NULL DEFAULT 1,
  cancelled_at           DATETIME2,
  cancellation_reason    NVARCHAR(500),
  created_at             DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  updated_at             DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  created_by_user_id     INT            REFERENCES Users(user_id)
);

CREATE INDEX IX_ClientSubscriptions_client ON ClientSubscriptions(client_id);
CREATE INDEX IX_ClientSubscriptions_status  ON ClientSubscriptions(status);
```

---

### 1.3 New Table: `PaymentTransactions`

Immutable record of every payment attempt and outcome.

```sql
CREATE TABLE PaymentTransactions (
  transaction_id        INT IDENTITY(1,1) PRIMARY KEY,
  subscription_id       INT            NOT NULL REFERENCES ClientSubscriptions(subscription_id),
  client_id             INT            NOT NULL REFERENCES Clients(client_id),
  razorpay_order_id     NVARCHAR(100),
  razorpay_payment_id   NVARCHAR(100),
  razorpay_signature    NVARCHAR(500),
  amount                DECIMAL(10,2)  NOT NULL,  -- INR, in rupees
  currency              NVARCHAR(5)    NOT NULL DEFAULT 'INR',
  status                NVARCHAR(20)   NOT NULL DEFAULT 'PENDING',
                        -- PENDING | COMPLETED | FAILED | REFUNDED
  payment_mode          NVARCHAR(50),  -- upi, card, netbanking, etc.
  failure_reason        NVARCHAR(500),
  invoice_number        NVARCHAR(50),  -- e.g. INV-2026-0001
  created_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
  updated_at            DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX IX_PaymentTransactions_client ON PaymentTransactions(client_id);
```

---

### 1.4 Modify `Devices` Table

Add an `activation_blocked_reason` column to record why a device cannot be activated.

```sql
ALTER TABLE Devices
  ADD activation_blocked_reason NVARCHAR(200) NULL;
-- Stores: NULL (ok), 'NO_SUBSCRIPTION', 'PLAN_LIMIT', 'GRACE_PERIOD', 'SUBSCRIPTION_EXPIRED'
```

---

## Phase 2 — Backend Changes

### 2.1 Install Razorpay SDK

```bash
cd server && npm install razorpay
```

Add to `.env`:
```
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxx
```

---

### 2.2 New Model: `SubscriptionPlan.js`

**File:** `server/models/SubscriptionPlan.js`

Methods:
- `findAll()` — list all active plans
- `findById(planId)` — fetch single plan with Razorpay IDs
- `create(data)` — create plan (also creates in Razorpay)
- `update(planId, data)` — update plan details
- `deactivate(planId)` — soft-disable plan

---

### 2.3 New Model: `ClientSubscription.js`

**File:** `server/models/ClientSubscription.js`

Methods:
- `findByClientId(clientId)` — get current active/grace subscription
- `findById(subscriptionId)`
- `create(data)` — insert new subscription row
- `activate(subscriptionId, razorpayData)` — set status=ACTIVE, set start_date, end_date, grace_end_date
- `setGrace(subscriptionId)` — set status=GRACE
- `expire(subscriptionId)` — set status=EXPIRED
- `cancel(subscriptionId, reason)` — set status=CANCELLED
- `getSubscriptionWithPlan(clientId)` — JOIN with SubscriptionPlans
- `getActiveDeviceCount(clientId)` — COUNT active devices for this client
- `getAllWithClientInfo(options)` — admin view, JOIN with Clients

---

### 2.4 New Model: `PaymentTransaction.js`

**File:** `server/models/PaymentTransaction.js`

Methods:
- `create(data)` — insert transaction record
- `findByOrderId(orderId)` — lookup by Razorpay order ID
- `markCompleted(orderId, paymentId, signature)` — update to COMPLETED
- `markFailed(orderId, reason)` — update to FAILED
- `getByClientId(clientId, options)` — paginated history

---

### 2.5 New Service: `razorpayService.js`

**File:** `server/services/razorpayService.js`

```js
// Wraps Razorpay SDK
const Razorpay = require('razorpay'); // ESM: import Razorpay from 'razorpay'

export const createOrder = async ({ amount, currency, receipt, notes }) => { ... }
// Returns { id, amount, currency, receipt }

export const createSubscription = async ({ planId, customerId, totalCount, notes }) => { ... }
// planId = Razorpay plan ID (stored in SubscriptionPlans table)

export const createCustomer = async ({ name, email, contact }) => { ... }

export const verifyWebhookSignature = (body, signature, secret) => { ... }
// Uses crypto.createHmac('sha256', secret)

export const verifyPaymentSignature = ({ orderId, paymentId, signature }) => { ... }
// HMAC-SHA256 of `${orderId}|${paymentId}`

export const cancelSubscription = async (razorpaySubscriptionId) => { ... }
```

---

### 2.6 New Service: `subscriptionService.js`

**File:** `server/services/subscriptionService.js`

Core business logic:

```js
export const checkDeviceActivationEligibility = async (clientId) => {
  // Returns { eligible: bool, reason: string | null, subscription, plan }
  // Checks: subscription exists → status is ACTIVE → device count < max_devices
}

export const handleSubscriptionExpiry = async () => {
  // Called by cron job daily
  // 1. Find ACTIVE subs where end_date < NOW → set to GRACE
  // 2. Find GRACE subs where grace_end_date < NOW → set to EXPIRED, deactivate devices
}

export const deactivateClientDevices = async (clientId) => {
  // UPDATE Devices SET status='INACTIVE' WHERE client_id = clientId AND status='ACTIVE'
  // Also send MQTT disconnect command for each device
}

export const activateSubscription = async (subscriptionId, razorpayPaymentData) => {
  // 1. Verify payment signature
  // 2. Mark transaction as COMPLETED
  // 3. Set subscription ACTIVE with correct dates
}
```

---

### 2.7 New Controller: `subscriptionController.js`

**File:** `server/controllers/subscriptionController.js`

Endpoints:
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/subscriptions/plans` | List all active plans | Any |
| GET | `/api/subscriptions/my` | Current client's subscription | Client |
| GET | `/api/subscriptions` | All subscriptions (admin) | Admin |
| POST | `/api/subscriptions/create-order` | Create Razorpay order | Client |
| POST | `/api/subscriptions/verify-payment` | Verify & activate after payment | Client |
| POST | `/api/subscriptions/:id/cancel` | Cancel subscription | Admin/Client |
| GET | `/api/subscriptions/:clientId/transactions` | Payment history | Admin/Client |

---

### 2.8 New Controller: `razorpayWebhookController.js`

**File:** `server/controllers/razorpayWebhookController.js`

- Handles `POST /api/razorpay/webhook` (unauthenticated, signature-verified)
- Events handled:
  - `payment.captured` → activate subscription
  - `payment.failed` → mark transaction failed, notify
  - `subscription.charged` → extend subscription end_date
  - `subscription.cancelled` → cancel subscription
  - `subscription.completed` → mark expired

---

### 2.9 New Route Files

**`server/routes/subscriptionRoutes.js`** — mounts subscription controller with JWT + permission middleware

**`server/routes/webhookRoutes.js`** — mounts webhook controller with **raw body** parser (required for Razorpay signature verification, must bypass `express.json()`)

---

### 2.10 Modify `deviceController.js`

In the `activateDevice` handler:
1. Call `checkDeviceActivationEligibility(clientId)` from `subscriptionService`
2. If not eligible → return `403` with structured error: `{ eligible: false, reason, subscriptionStatus }`
3. If eligible → proceed with existing MQTT activation flow

---

### 2.11 Modify `server.js`

Register new routes:
```js
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/razorpay', express.raw({ type: 'application/json' }), webhookRoutes);
```

Note: webhook route must use `express.raw()`, not `express.json()`.

---

### 2.12 Cron Job: `subscriptionCron.js`

**File:** `server/services/subscriptionCron.js`

```js
// Runs every hour using node-cron (install: npm install node-cron)
import cron from 'node-cron';
import { handleSubscriptionExpiry } from './subscriptionService.js';

cron.schedule('0 * * * *', async () => {
  await handleSubscriptionExpiry();
});
```

Start this in `server.js` after database connection is established.

---

## Phase 3 — Frontend Changes

### 3.1 New Service: `subscriptionService.js`

**File:** `client/src/services/subscriptionService.js`

Methods:
- `getPlans()` — GET `/api/subscriptions/plans`
- `getMySubscription()` — GET `/api/subscriptions/my`
- `createOrder(planId, billingCycle)` — POST `/api/subscriptions/create-order`
- `verifyPayment(data)` — POST `/api/subscriptions/verify-payment`
- `cancelSubscription(subscriptionId)` — POST `/api/subscriptions/:id/cancel`
- `getTransactions(clientId)` — GET `/api/subscriptions/:clientId/transactions`
- `getAllSubscriptions()` — GET `/api/subscriptions` (admin)

---

### 3.2 New Context: `SubscriptionContext.jsx`

**File:** `client/src/context/SubscriptionContext.jsx`

State:
- `subscription` — current client's subscription object (includes plan details)
- `isActive` — bool: status === 'ACTIVE'
- `isGrace` — bool: status === 'GRACE'
- `isExpired` — bool: status === 'EXPIRED' or null
- `daysUntilExpiry` — computed from end_date
- `daysRemainingInGrace` — computed from grace_end_date
- `loading`, `error`

Methods: `refreshSubscription()`, `getMySubscription()`

Add `SubscriptionProvider` to the provider stack in `App.jsx` (after `AuthProvider`, before `DeviceProvider`).

---

### 3.3 New Page: `BillingPage.jsx`

**File:** `client/src/pages/Billing/BillingPage.jsx`
**Route:** `/billing`

Sections:
1. **Current Plan Card** — plan name, status badge, next billing date, device usage (e.g. "3/5 devices"), Upgrade/Cancel buttons
2. **Plan Selection** — three plan cards side-by-side with monthly/yearly toggle; CTA triggers payment
3. **Payment History Table** — date, invoice number, amount, status, download receipt link

---

### 3.4 New Page: `SubscriptionManagement.jsx` (Admin)

**File:** `client/src/pages/Admin/SubscriptionManagement.jsx`
**Route:** `/admin/subscriptions`

Table columns: Client, Plan, Status, Billing Cycle, Start Date, End Date, Grace End, Actions (View, Cancel, Override)

Filter by: status, plan

---

### 3.5 New Modal: `SubscribePlanModal.jsx`

**File:** `client/src/components/modals/SubscribePlanModal.jsx`

Flow:
1. Show plan cards with monthly/yearly toggle + pricing
2. User selects plan → click "Proceed to Pay"
3. Call `subscriptionService.createOrder()` → get Razorpay order
4. Load Razorpay checkout script and open `window.Razorpay({ ... })`
5. On `payment.success` callback → call `subscriptionService.verifyPayment()` → refresh subscription context → show success toast
6. On `payment.dismiss` → show cancelled message

**Razorpay checkout config:**
```js
const options = {
  key: import.meta.env.VITE_RAZORPAY_KEY_ID,
  amount: order.amount,
  currency: 'INR',
  name: 'CloudSynk',
  description: `${plan.name} Plan - ${billingCycle}`,
  order_id: order.razorpay_order_id,
  handler: async (response) => { /* verify payment */ },
  prefill: { name: client.name, email: client.email, contact: client.phone },
  theme: { color: '#6366f1' }
};
```

Add `VITE_RAZORPAY_KEY_ID=rzp_live_xxx` to `client/.env`.

---

### 3.6 New Component: `GracePeriodBanner.jsx`

**File:** `client/src/components/GracePeriodBanner.jsx`

- Shown at the top of the main `Layout` when `isGrace === true`
- Displays: "Your subscription expires in X days. Devices will be deactivated. Renew now →"
- Yellow/amber warning color
- Uses `useSubscription()` context

Similarly add a `SubscriptionExpiredBanner` (red) when `isExpired`.

---

### 3.7 Modify `DeviceManagement.jsx`

In the Activate button click handler:
1. Before opening `ActivateDeviceModal`, call `subscriptionService.getMySubscription()`
2. If `!isActive && !isGrace` → show an inline error or open `SubscribePlanModal` instead
3. If at device limit → show "Plan limit reached. Upgrade to activate more devices."
4. During grace period → allow admin override with a warning

---

### 3.8 Modify `ClientManagement.jsx`

- Add **Subscription** column to the clients table: shows plan name + status badge
- Load subscription data in the ClientManagement component via `subscriptionService.getAllSubscriptions()`

---

### 3.9 Modify `Sidebar.jsx`

Add **Billing** menu item (shown to all authenticated users):
```jsx
<NavLink to="/billing">
  <CreditCardIcon /> Billing
</NavLink>
```

In the Admin section, add **Subscriptions**:
```jsx
<NavLink to="/admin/subscriptions">Subscriptions</NavLink>
```

---

### 3.10 Modify `App.jsx`

1. Import and add `SubscriptionProvider` to provider stack
2. Add new routes:
   - `/billing` → `BillingPage` (protected)
   - `/admin/subscriptions` → `SubscriptionManagement` (protected, admin-only)

---

### 3.11 Frontend Dependency

```bash
# Razorpay checkout is loaded via CDN script tag in the modal, no npm package needed
# No new npm package required for frontend
```

---

## Phase 4 — Grace Period & Expiry Logic (Detail)

| Event | Trigger | Action |
|-------|---------|--------|
| Subscription purchased | Payment verified | status=ACTIVE, start_date=NOW, end_date=NOW+cycle, grace_end_date=end_date+grace_days |
| End date passes | Hourly cron | status=GRACE; no device changes yet |
| Grace end date passes | Hourly cron | status=EXPIRED; deactivate all client devices (INACTIVE); send MQTT disconnect; send email notification |
| Payment renewed during grace | User pays | status=ACTIVE; new end_date; grace_end_date updated; devices remain active (no disruption) |
| Payment renewed after expiry | User pays | status=ACTIVE; reactivate devices only if within plan limit |

Grace period default: **7 days** (stored per plan in `grace_days`, configurable per plan).

---

## Phase 5 — Permissions

Add new permissions to the seed data:
- `View Billing` (category: Billing)
- `Manage Subscriptions` (category: Billing)
- `Override Subscription` (category: Billing — admin only)

Assign:
- `SYSTEM_ADMIN`, `SUPER_ADMIN` → all billing permissions
- `CLIENT_ADMIN` → View Billing
- `CLIENT_USER` → none

---

## Critical Files to Create/Modify

### New Files:
- `server/models/SubscriptionPlan.js`
- `server/models/ClientSubscription.js`
- `server/models/PaymentTransaction.js`
- `server/services/razorpayService.js`
- `server/services/subscriptionService.js`
- `server/services/subscriptionCron.js`
- `server/controllers/subscriptionController.js`
- `server/controllers/razorpayWebhookController.js`
- `server/routes/subscriptionRoutes.js`
- `server/routes/webhookRoutes.js`
- `client/src/services/subscriptionService.js`
- `client/src/context/SubscriptionContext.jsx`
- `client/src/pages/Billing/BillingPage.jsx`
- `client/src/pages/Admin/SubscriptionManagement.jsx`
- `client/src/components/modals/SubscribePlanModal.jsx`
- `client/src/components/GracePeriodBanner.jsx`
- `client/src/components/SubscriptionExpiredBanner.jsx`

### Modified Files:
- `server/server.js` — register new routes, start cron
- `server/controllers/deviceController.js` — eligibility check before activation
- `client/src/App.jsx` — add SubscriptionProvider + new routes
- `client/src/components/layout/Sidebar.jsx` — add Billing nav item
- `client/src/pages/Admin/DeviceManagement.jsx` — subscription check before activation
- `client/src/pages/Admin/ClientManagement.jsx` — show subscription column
- `client/src/components/layout/Layout.jsx` — render GracePeriodBanner / ExpiredBanner

---

## Phase 6 — Verification & Testing

1. **DB migration:** Run the SQL scripts in order; verify tables and indexes created
2. **Seed plans:** Confirm 3 plans visible at `GET /api/subscriptions/plans`
3. **Razorpay test mode:** Use `rzp_test_*` keys; create a test order and simulate payment via Razorpay dashboard
4. **Webhook test:** Use Razorpay webhook simulator (or `ngrok` tunnel) to send `payment.captured` → verify subscription activates
5. **Device activation gate:** With no subscription → attempt to activate a device → expect 403 with reason `NO_SUBSCRIPTION`
6. **Grace period test:** Manually set `end_date = NOW - 1 minute`, trigger cron → verify status changes to GRACE; set `grace_end_date = NOW - 1 minute` → verify EXPIRED + devices deactivated
7. **UI flow:** Login as CLIENT_ADMIN → navigate to /billing → select plan → complete Razorpay test payment → verify subscription shows ACTIVE → go to Device Management → activate device → succeeds
8. **Admin view:** Login as SYSTEM_ADMIN → /admin/subscriptions → all clients with subscriptions visible
