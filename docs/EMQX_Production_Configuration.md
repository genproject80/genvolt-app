# EMQX Production Configuration Guide

**Date:** 2026-04-02
**EMQX Version:** 5.8.3 (Opensource)
**Purpose:** Complete reference for configuring EMQX in production, based on audit of local broker with all identified security gaps and their fixes.

---

## Table of Contents

1. [Current Local Configuration Audit](#1-current-local-configuration-audit)
2. [Gap Analysis — Security & Operational Issues](#2-gap-analysis--security--operational-issues)
3. [Production Configuration Reference](#3-production-configuration-reference)
4. [Fix Commands — Apply All Fixes via API](#4-fix-commands--apply-all-fixes-via-api)
5. [Production Verification Checklist](#5-production-verification-checklist)

---

## 1. Current Local Configuration Audit

Full dump of the local EMQX broker configuration as of 2026-04-02.

### 1.1 Listeners

| Listener | Bind Address | Status | Connections | Max Connections |
|----------|-------------|--------|-------------|-----------------|
| TCP (plain) | `0.0.0.0:1883` | Running | 4 | infinity |
| SSL/TLS | `0.0.0.0:8883` | Running | 0 | infinity |
| WebSocket | `0.0.0.0:8083` | Running | 0 | infinity |
| WSS (WebSocket+TLS) | `0.0.0.0:8084` | Running | 0 | infinity |

- TCP listener uses default self-signed certs (`${EMQX_ETC_DIR}/certs/`)
- SSL `verify` is `verify_none` (no client certificate validation)
- All listeners have `access_rules: ["allow all"]`
- No connection rate limits (`max_conn_rate: infinity`)

### 1.2 Authentication Chain

| Order | Type | URL / Backend | Status |
|-------|------|---------------|--------|
| 1 | HTTP POST | `http://host.docker.internal:5001/api/mqtt/auth` | Enabled |
| 2 | Built-in Database | SHA256 hash | Enabled |

### 1.3 Authorization Chain

| Order | Type | URL / Backend | Status |
|-------|------|---------------|--------|
| 1 | HTTP POST | `http://host.docker.internal:5001/api/mqtt/acl` | Enabled |
| 2 | Built-in Database | Per-user rules | Enabled |
| 3 | File | Erlang term rules (ends with `{deny, all}.`) | Enabled |

- `no_match`: **deny** (fixed from `allow` during ACL bypass investigation)
- `deny_action`: `ignore` (silently drops, doesn't disconnect)
- Cache: enabled, 32 entries, 1 minute TTL

### 1.4 Built-in Auth Users

| Username | Is Superuser | Purpose | Status |
|----------|-------------|---------|--------|
| `backend_publisher` | No | Node.js backend MQTT publishing | OK |
| `adddevice` | No | **DEPRECATED** — old pre-activation account | **REMOVE** |
| `HY2030` | No | Test device (left from development) | **REMOVE** |
| `test` | No | Test user (left from development) | **REMOVE** |

### 1.5 Built-in ACL Rules

| Username | Rule | Topic | Status |
|----------|------|-------|--------|
| `adddevice` | Allow publish | `cloudsynk/pre-activation` | **STALE** — account should be removed |
| `adddevice` | Deny subscribe | `cloudsynk/1234567890/config` | **STALE** — hardcoded test IMEI |
| `HY2030` | Allow subscribe | `cloudsynk/1234567890/config` | **STALE** — hardcoded test IMEI |

### 1.6 Dashboard Users

| Username | Description |
|----------|-------------|
| `admin` | administrator |

### 1.7 MQTT Settings

| Setting | Value | Production Recommendation |
|---------|-------|--------------------------|
| `max_packet_size` | 1 MB | OK for IoT telemetry |
| `max_clientid_len` | 65535 | Reduce to 128 |
| `max_topic_levels` | 128 | OK |
| `max_qos_allowed` | 2 | OK |
| `max_mqueue_len` | 1000 | OK |
| `max_inflight` | 32 | OK |
| `max_subscriptions` | infinity | **Limit to 10** |
| `session_expiry_interval` | 2h | OK |
| `keepalive_multiplier` | 1.5 | OK |
| `wildcard_subscription` | true | **Disable** |
| `retain_available` | true | OK (needed for telemetryConfig) |
| `message_expiry_interval` | infinity | **Set to 24h** |
| `idle_timeout` | 15s | OK |

### 1.8 System / Operational

| Setting | Value | Notes |
|---------|-------|-------|
| API Keys | **None configured** | Management API unusable without credentials |
| Rate limiting | **None configured** | No protection against connection floods |
| Flapping detection | **Disabled** | Reconnect storms undetected |
| Log level | `warning` (console only) | File logging disabled |
| Topic metrics | None | No monitoring on key topics |
| Bridges/Connectors | None | — |
| Banned clients | None | — |

---

## 2. Gap Analysis — Security & Operational Issues

### CRITICAL — Must fix before production

| # | Gap | Risk | Current | Required |
|---|-----|------|---------|----------|
| C1 | TCP listener exposed externally | Any network client can connect without TLS on port 1883 | `0.0.0.0:1883` (Docker: exposed to all) | Docker: `-p 127.0.0.1:1883:1883` + NSG deny rule |
| C2 | WebSocket listener enabled | Unauthenticated WS endpoint on port 8083, no TLS | Enabled on `0.0.0.0:8083` | **Disable** (not used by devices or backend) |
| C3 | WSS listener enabled | Unnecessary attack surface on port 8084 | Enabled on `0.0.0.0:8084` | **Disable** (not used) |
| C4 | `adddevice` user still exists | Old shared account with known password `admin@123` | Present in built-in DB | **Delete** |
| C5 | Test users in built-in DB | `test`, `HY2030` — leftover dev accounts | Present | **Delete** |
| C6 | No EMQX Management API key | `EMQX_MGMT_API_KEY` is empty in `.env`; session kick feature cannot work | Empty | **Create API key** |
| C7 | Dashboard password is `admin@123` | Default/weak password, same as old `adddevice` password | `admin@123` | **Change to strong password** |
| C8 | Wildcard subscriptions enabled | Attacker with any valid credentials could subscribe to `+/config` patterns | `true` | **`false`** |
| C9 | `max_subscriptions` is infinity | Single client can subscribe to unlimited topics | `infinity` | **10** |
| C10 | Stale built-in ACL rules | Rules reference `adddevice` and hardcoded test IMEI `1234567890` | Present | **Delete all** |

### HIGH — Should fix for production hardening

| # | Gap | Risk | Current | Required |
|---|-----|------|---------|----------|
| H1 | No connection rate limit | Connection flood / DDoS on broker | `infinity` | **100/s** per listener |
| H2 | No max connections limit | Resource exhaustion | `infinity` | **1000** (TCP), **500** (SSL) |
| H3 | Flapping detection disabled | Rapid reconnect loops consume resources undetected | Disabled | **Enable**: 15 connects/1min → ban 5min |
| H4 | `message_expiry_interval` is infinity | Retained messages and queued messages never expire | `infinity` | **24h** (`86400s`) |
| H5 | `max_clientid_len` is 65535 | Oversized client IDs waste memory | 65535 | **128** |
| H6 | File logging disabled | No persistent logs for forensics or debugging | Disabled | **Enable** with rotation |
| H7 | No topic metrics configured | Cannot monitor message rates on critical topics | None | Add `cloudsynk/pre-activation`, `cloudsynk/+/telemetry`, `cloudsynk/+/config` |
| H8 | SSL listener uses default self-signed certs | Devices cannot verify broker identity; MitM possible | Default certs | **Let's Encrypt** certs (production) |
| H9 | `deny_action` is `ignore` | Unauthorized publish is silently dropped; device gets no feedback | `ignore` | Consider `disconnect` for unauthorized publishes (trade-off: may disrupt buggy firmware) |

### LOW — Recommended improvements

| # | Gap | Risk | Current | Required |
|---|-----|------|---------|----------|
| L1 | Authorization cache TTL is 1 minute | Stale ACL decisions for up to 60s after device state change | 1m | **30s** (matches app-side cache) |
| L2 | No CORS origin validation on WebSocket | If WS is ever enabled, no origin check | `check_origin_enable: false` | Enable if WS is used |
| L3 | `max_awaiting_rel` is 100 | QoS 2 resource consumption | 100 | OK, but monitor |

---

## 3. Production Configuration Reference

### 3.1 Listeners

**Production should have exactly two active listeners:**

| Listener | Bind | Purpose |
|----------|------|---------|
| TCP | `127.0.0.1:1883` | Local Python subscriber only |
| SSL/TLS | `0.0.0.0:8883` | External devices + backend (TLS required) |

WebSocket (8083) and WSS (8084) should be **disabled**.

**SSL listener must use Let's Encrypt certificates:**

| Field | Value |
|-------|-------|
| Cert | `/etc/letsencrypt/live/mqtt.cloudsynk.net/fullchain.pem` |
| Key | `/etc/letsencrypt/live/mqtt.cloudsynk.net/privkey.pem` |
| Verify Peer | Disabled (devices don't have client certs) |
| TLS Versions | TLSv1.2, TLSv1.3 |

### 3.2 Authentication Chain (order matters)

| Order | Type | Config |
|-------|------|--------|
| 1 | **HTTP** | POST `https://backend.cloudsynk.net/api/mqtt/auth` |
| 2 | **Built-in Database** | Service accounts only (`backend_publisher`, `local_subscriber`) |

### 3.3 Authorization Chain (order matters)

| Order | Type | Config |
|-------|------|--------|
| 1 | **HTTP** | POST `https://backend.cloudsynk.net/api/mqtt/acl` |
| 2 | **Built-in Database** | Service account topic rules (if needed) |
| 3 | **File** | Final fallback: `{deny, all}.` |

Global settings:
- `no_match`: **deny**
- `deny_action`: **ignore**
- Cache: enabled, 32 entries, **30s TTL**

### 3.4 Built-in Auth Users (production)

| Username | Password | Is Superuser | Purpose |
|----------|----------|-------------|---------|
| `backend_publisher` | Strong random password | No | Node.js backend for publishing config and subscribing to pre-activation/telemetry |
| `local_subscriber` | Strong random password | No | Python subscriber on VM |

**No other users should exist.** All device authentication is handled by the HTTP hook.

### 3.5 Built-in ACL Rules (production)

No built-in ACL rules are needed. All topic access control is handled by the HTTP hook. Service accounts are granted `allow` by the HTTP hook code (line 168-169 of `mqttAuthRoutes.js`).

If HTTP hook is unreachable, service accounts will be denied by the file fallback — this is the secure default. To allow service account fallback, add:

| Username | Permission | Action | Topic |
|----------|-----------|--------|-------|
| `backend_publisher` | Allow | All | `cloudsynk/#` |
| `local_subscriber` | Allow | Subscribe | `cloudsynk/#` |

### 3.6 MQTT Settings (production)

```
max_packet_size         = 1MB
max_clientid_len        = 128
max_topic_levels        = 128
max_qos_allowed         = 2
max_mqueue_len          = 1000
max_inflight            = 32
max_subscriptions       = 10
session_expiry_interval = 2h
message_expiry_interval = 86400s       # 24 hours
wildcard_subscription   = false
retain_available        = true
idle_timeout            = 15s
keepalive_multiplier    = 1.5
```

### 3.7 Rate Limiting & Protection

```
# Per-listener
max_conn_rate    = 100        # max 100 new connections/second
max_connections  = 1000       # TCP listener
max_connections  = 500        # SSL listener

# Flapping detection
flapping_detect.enable      = true
flapping_detect.max_count   = 15
flapping_detect.window_time = 1m
flapping_detect.ban_time    = 5m
```

### 3.8 Logging

```
# Console (Docker logs)
console.enable  = true
console.level   = warning

# File (persistent, for forensics)
file.default.enable        = true
file.default.level         = warning
file.default.path          = ${EMQX_LOG_DIR}/emqx.log
file.default.rotation_size = 50MB
file.default.rotation_count = 10
```

### 3.9 Dashboard

| Setting | Value |
|---------|-------|
| Username | `admin` |
| Password | Strong random (not `admin@123`) |
| Access | Restricted to admin IPs via NSG (port 18083) |

### 3.10 Management API Key

Create via Dashboard → System → API Keys. Store the key in:
- Server `.env`: `EMQX_MGMT_API_KEY=<key>`
- Used by `emqxMgmtService.js` for session kick on device activation

---

## 4. Fix Commands — Apply All Fixes via API

All commands below use the EMQX REST API. Replace `<token>` with a valid bearer token.

**Get a token:**
```bash
TOKEN=$(curl -s -X POST http://<emqx>:18083/api/v5/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password>"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
```

### Fix C1 — Restrict TCP listener to localhost only

> **Important Docker caveat:** Do NOT bind to `127.0.0.1` inside the EMQX container — this binds to the container's loopback, not the host's. Connections from the host via Docker port mapping arrive on the Docker bridge interface and will be rejected.
>
> Instead, keep the listener on `0.0.0.0:1883` inside the container, and restrict access using Docker's port binding:
> ```bash
> # In docker run: bind port 1883 to host's localhost only
> -p 127.0.0.1:1883:1883
> ```
> Combined with Azure NSG rule denying port 1883 from the internet (see Appendix A), this ensures only local processes on the VM can reach the plain MQTT port.

```bash
# Keep 0.0.0.0 inside container — restriction is at Docker/NSG level
curl -X PUT http://<emqx>:18083/api/v5/listeners/tcp:default \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"tcp:default","type":"tcp","bind":"0.0.0.0:1883","max_conn_rate":100,"max_connections":1000}'
```

### Fix C2 — Disable WebSocket listener

```bash
curl -X PUT http://<emqx>:18083/api/v5/listeners/ws:default \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"ws:default","type":"ws","enable":false}'
```

### Fix C3 — Disable WSS listener

```bash
curl -X PUT http://<emqx>:18083/api/v5/listeners/wss:default \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"wss:default","type":"wss","enable":false}'
```

### Fix C4 — Delete `adddevice` user

```bash
curl -X DELETE http://<emqx>:18083/api/v5/authentication/password_based%3Abuilt_in_database/users/adddevice \
  -H "Authorization: Bearer $TOKEN"
```

### Fix C5 — Delete test users

```bash
curl -X DELETE http://<emqx>:18083/api/v5/authentication/password_based%3Abuilt_in_database/users/test \
  -H "Authorization: Bearer $TOKEN"

curl -X DELETE http://<emqx>:18083/api/v5/authentication/password_based%3Abuilt_in_database/users/HY2030 \
  -H "Authorization: Bearer $TOKEN"
```

### Fix C8 — Disable wildcard subscriptions

```bash
curl -X PUT http://<emqx>:18083/api/v5/configs/global_zone \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mqtt":{"wildcard_subscription":false}}'
```

### Fix C9 — Limit max subscriptions per client

```bash
curl -X PUT http://<emqx>:18083/api/v5/configs/global_zone \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mqtt":{"max_subscriptions":10}}'
```

### Fix C10 — Delete stale built-in ACL rules

```bash
curl -X DELETE http://<emqx>:18083/api/v5/authorization/sources/built_in_database/rules/users/adddevice \
  -H "Authorization: Bearer $TOKEN"

curl -X DELETE http://<emqx>:18083/api/v5/authorization/sources/built_in_database/rules/users/HY2030 \
  -H "Authorization: Bearer $TOKEN"
```

### Fix H1+H2 — Connection rate and max limits

```bash
# SSL listener (primary external listener)
curl -X PUT http://<emqx>:18083/api/v5/listeners/ssl:default \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"ssl:default","type":"ssl","max_conn_rate":100,"max_connections":500}'
```

> TCP listener rate limits are set in Fix C1 above.

### Fix H3 — Enable flapping detection

```bash
curl -X PUT http://<emqx>:18083/api/v5/configs/global_zone \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"flapping_detect":{"enable":true,"max_count":15,"window_time":"1m","ban_time":"5m"}}'
```

### Fix H4+H5 — Message expiry and client ID length

```bash
curl -X PUT http://<emqx>:18083/api/v5/configs/global_zone \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mqtt":{"message_expiry_interval":"86400s","max_clientid_len":128}}'
```

### Fix H6 — Enable file logging

```bash
curl -X PUT http://<emqx>:18083/api/v5/configs/log \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file":{"default":{"enable":true,"level":"warning","path":"${EMQX_LOG_DIR}/emqx.log","rotation_size":"50MB","rotation_count":10}}}'
```

### Fix H7 — Add topic metrics

```bash
for topic in "cloudsynk/pre-activation"; do
  curl -X POST http://<emqx>:18083/api/v5/mqtt/topic_metrics \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"topic\":\"$topic\"}"
done
```

> Note: EMQX topic metrics do not support wildcards. For `cloudsynk/+/telemetry` and `cloudsynk/+/config`, monitor via `emqx ctl metrics` or Prometheus integration.

---

## 5. Production Verification Checklist

Run these checks after applying all fixes on the production EMQX broker.

### 5.1 Listener Checks

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | TCP listener is localhost only | `curl .../listeners/tcp:default` | `bind: "127.0.0.1:1883"` |
| 2 | SSL listener is running with real certs | `curl .../listeners/ssl:default` | `bind: "0.0.0.0:8883"`, cert paths point to Let's Encrypt |
| 3 | WS listener is disabled | `curl .../listeners/ws:default` | `enable: false` |
| 4 | WSS listener is disabled | `curl .../listeners/wss:default` | `enable: false` |
| 5 | External port 1883 is blocked | `nmap -p 1883 <public-ip>` from outside | Filtered/closed |
| 6 | External port 8883 is open | `nmap -p 8883 <public-ip>` from outside | Open |
| 7 | External port 18083 is restricted | `nmap -p 18083 <public-ip>` from non-admin IP | Filtered/closed |

### 5.2 Authentication Checks

| # | Check | Expected |
|---|-------|----------|
| 1 | Connect with `adddevice` / `admin@123` | **Rejected** (user deleted) |
| 2 | Connect with `test` / any password | **Rejected** (user deleted) |
| 3 | Connect with valid IMEI + correct `PRE_ACTIVATION_SECRET` | **Accepted** (if device not ACTIVE) |
| 4 | Connect with valid IMEI + wrong password | **Rejected** |
| 5 | Connect with `backend_publisher` + correct password | **Accepted** |

### 5.3 Authorization Checks

| # | Check | Expected |
|---|-------|----------|
| 1 | IMEI user subscribes to `cloudsynk/{own_IMEI}/config` | **Allowed** |
| 2 | IMEI user subscribes to `cloudsynk/{other_IMEI}/config` | **Denied** |
| 3 | IMEI user publishes to `cloudsynk/pre-activation` | **Allowed** |
| 4 | IMEI user publishes to `cloudsynk/{any_IMEI}/config` | **Denied** |
| 5 | IMEI user subscribes to `cloudsynk/#` | **Denied** |
| 6 | IMEI user subscribes to `cloudsynk/+/config` | **Denied** (wildcard disabled) |
| 7 | Active device publishes to own telemetry topic | **Allowed** |
| 8 | Active device publishes to other device's telemetry | **Denied** |
| 9 | Run `attack-test.js` | Exit code 0, 0 vulnerabilities |

### 5.4 Operational Checks

| # | Check | Expected |
|---|-------|----------|
| 1 | Device simulator completes full lifecycle | Pre-activation → config → telemetry works |
| 2 | `EMQX_MGMT_API_KEY` is set and works | `emqxMgmtService.js` can kick sessions |
| 3 | Flapping detection active | Rapid reconnect (>15/min) results in temporary ban |
| 4 | Log file is being written | `docker exec <container> ls -la /opt/emqx/log/` shows `emqx.log` |
| 5 | Dashboard password is not `admin@123` | Login with old password fails |

### 5.5 Quick Automated Verification

```bash
# Run attack test (should exit 0)
node server/simulator/attack-test.js \
  --attacker-imei 999999999999998 \
  --victim-imei <REAL_IMEI> \
  --host <BROKER> --port <PORT> \
  --pre-pass <PRE_ACTIVATION_SECRET>

# Run device simulator (should complete lifecycle)
node server/simulator/device-simulator.js \
  --imei <TEST_IMEI> --model-number GV-M1 \
  --host <BROKER> --port <PORT> \
  --pre-pass <PRE_ACTIVATION_SECRET> \
  --count 3
```

---

## Appendix A — NSG (Network Security Group) Rules for Azure VM

| Priority | Name | Port | Source | Action |
|----------|------|------|--------|--------|
| 100 | allow-ssh | 22 | Admin IP only | Allow |
| 200 | deny-mqtt-plain | 1883 | Internet | **Deny** |
| 300 | allow-mqtts | 8883 | Internet | Allow |
| 400 | allow-dashboard | 18083 | Admin IP only | Allow |
| 65000 | default-deny | * | * | Deny |

## Appendix B — Docker Run Command (Production)

```bash
sudo docker run -d --name cloudsynk-emqxmqtt-broker \
  --restart always \
  -p 127.0.0.1:1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  -v emqx-data:/opt/emqx/data \
  -v emqx-log:/opt/emqx/log \
  emqx/emqx:5.8.3
```

Note: Pin the EMQX version (`5.8.3`) instead of using `latest` to prevent unexpected breaking changes on container restart.

## Appendix C — Related Documents

| Document | Purpose |
|----------|---------|
| `MQTT_ACL_BYPASS_VULNERABILITY.md` | Security incident report (2026-04-02) |
| `MQTT_SECURITY_PRODUCTION_STEPS.md` | Application-side security deployment checklist |
| `Azure_Production_Setup.md` | Full Azure VM + EMQX setup guide |
| `MQTT_TLS_Setup.md` | TLS certificate configuration |