# MQTT Security Hardening — Production Deployment Steps

**Date:** 2026-04-01
**Status:** Ready to deploy

---

## Overview of Changes

This document covers the production steps required to deploy the MQTT security hardening:

1. IMEI-based pre-activation authentication (replaces shared `adddevice` account)
2. Per-device ACL enforcement via HTTP hook
3. Session kick before activation credential delivery
4. Retained config message cleared after device reconnects
5. TLS enforcement on broker connections

---

## 1. EMQX Broker — Remove `adddevice` Built-in Account

The `adddevice` account was previously used by all pre-activation devices. It must be removed now that pre-activation auth is handled by the HTTP hook using per-device IMEI credentials.

**Steps:**
1. Log in to the EMQX Dashboard: `http://<emqx-vm-ip>:18083`
2. Navigate to **Access Control → Authentication**
3. Find the built-in database authenticator
4. Delete the entry with username `adddevice`

> **Note:** Do not remove `backend_publisher` or `local_subscriber` — these are still used by the Node.js backend and local subscriber services.

---

## 2. EMQX Broker — Verify HTTP Hook Auth Chain Order

The HTTP hook must be evaluated before EMQX's built-in database for device connections.

**Steps:**
1. In EMQX Dashboard, go to **Access Control → Authentication**
2. Confirm the HTTP authenticator (pointing to `/api/mqtt/auth`) is listed **before** the built-in database authenticator in the chain
3. For service accounts (`backend_publisher`, `local_subscriber`): the HTTP hook returns `ignore`, so EMQX falls through to the built-in database — this is correct

---

## 3. EMQX Broker — Confirm TLS on Port 8883

All external device connections must use TLS. Port 1883 must remain restricted to localhost only.

**Steps:**
1. In EMQX Dashboard, go to **Management → Listeners**
2. Confirm port `8883` is active with a valid TLS certificate
3. Confirm port `1883` listener has its bind address set to `127.0.0.1` (not `0.0.0.0`)
4. On the Azure VM, verify NSG/firewall rules:
   - Port `8883` open to devices (external)
   - Port `1883` blocked externally — local only
   - Port `18083` (dashboard) restricted to admin IPs only

---

## 4. EMQX Broker — Create Management API Key

The session kick feature calls the EMQX management REST API. An API key is required.

**Steps:**
1. In EMQX Dashboard, go to **System → API Keys**
2. Click **Create API Key**
3. Set a descriptive name (e.g., `cloudsynk-backend-kick`)
4. Copy the generated API key — it is shown only once
5. Add it to the production environment (see Step 5 below)

---

## 5. Update Production Environment Variables

Add or update the following in the production App Service / server environment:

```env
# Pre-activation MQTT auth (device firmware secret)
PRE_ACTIVATION_SECRET=<strong-random-secret-min-32-chars>

# EMQX Management API (for session kick on activation)
EMQX_MGMT_API_URL=http://<emqx-vm-ip>:18083/api/v5
EMQX_MGMT_API_KEY=<api-key-from-step-4>

# TLS enforcement for Node.js → EMQX connections
MQTT_BROKER_TLS=true
MQTT_BROKER_PORT=8883
MQTT_REJECT_UNAUTHORIZED=true
```

> **Generate PRE_ACTIVATION_SECRET:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## 6. Update Device Firmware

The device firmware must be updated to use the new pre-activation credentials:

| Field | Old value | New value |
|-------|-----------|-----------|
| Pre-activation username | `adddevice` | `<device IMEI>` (15 digits) |
| Pre-activation password | `admin@123` | `<PRE_ACTIVATION_SECRET>` (shared) |

> The firmware must use the device's own IMEI as the MQTT username during pre-activation. The password is the same shared `PRE_ACTIVATION_SECRET` across all devices.

After the device receives its `telemetryConfig` and reconnects, it uses:
- Username: `mqtt_username` from the config payload (the assigned `device_id`)
- Password: `mqtt_password` from the config payload

This part of the firmware does not change.

---

## 7. Verify EMQX VM IP Allowlist

The auth/ACL hook endpoints are restricted to requests from the EMQX VM only.

**Check production `EMQX_VM_IP` env var** includes the correct IP(s):

```env
EMQX_VM_IP=20.198.101.175
```

If the EMQX VM IP has changed, update this value before deploying.

---

## 8. Deploy Application

1. Deploy the updated Node.js server to Azure App Service
2. Confirm all env vars from Step 5 are set
3. Restart the App Service

---

## 9. Verification Checklist

Run through these checks after deployment:

| Test | Expected result |
|------|----------------|
| Connect with old `adddevice`/`admin@123` credentials | **Denied** — account removed from EMQX |
| Connect with `username=<IMEI>`, wrong password | **Denied** |
| Connect with `username=<IMEI>`, correct `PRE_ACTIVATION_SECRET` | **Allowed** (if device is PENDING or new) |
| IMEI device subscribes to `cloudsynk/<its-IMEI>/config` | **Allowed** |
| IMEI device subscribes to `cloudsynk/<other-IMEI>/config` | **Denied** |
| IMEI device publishes to `cloudsynk/pre-activation` | **Allowed** |
| IMEI device publishes to `cloudsynk/<IMEI>/telemetry` | **Denied** |
| Connect with IMEI of an ACTIVE device + correct secret | **Denied** — must use device credentials |
| Activate device → check EMQX sessions for that IMEI | **Kicked** before telemetryConfig is published |
| Device sends first telemetry → check retained `cloudsynk/<IMEI>/config` | **Empty** — credential payload cleared |
| Node.js backend connects to EMQX port 8883 via TLS | **Succeeds** with valid cert |

---

## 10. Rollback Plan

If a rollback is needed before firmware is updated:

1. Re-add `adddevice` / `admin@123` to EMQX built-in auth database
2. In EMQX Dashboard, add an ACL rule allowing `adddevice` to publish to `cloudsynk/pre-activation` and subscribe to `cloudsynk/+/config`
3. Revert the Node.js deployment to the previous version

> **Important:** Once firmware is updated on devices in the field, the `adddevice` rollback path is no longer viable. Coordinate firmware and backend deployment timing accordingly.
