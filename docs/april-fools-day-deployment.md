# CloudSynk Platform — Deployment Guide

**Stack:** Node.js (Express) · React/Vite · Azure SQL Server · EMQX MQTT · Razorpay
**Azure Region:** Central India
**Last Updated:** 2026-04-01

**Related Docs:**
- `Azure_Production_Setup.md` — production secrets rotation & step-by-step CLI commands
- `VM_Setup_Guide.md` — EMQX VM first-time setup
- `docs/MQTT_SECURITY_PRODUCTION_STEPS.md` — MQTT security hardening checklist
- `scripts/april-fools-day.sql` — idempotent database migration

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables Reference](#2-environment-variables-reference)
3. [Azure Infrastructure](#3-azure-infrastructure)
4. [Database Setup](#4-database-setup)
5. [EMQX MQTT Broker Setup](#5-emqx-mqtt-broker-setup)
6. [Backend Deployment (Azure App Service)](#6-backend-deployment-azure-app-service)
7. [Frontend Deployment (Azure Static Web Apps)](#7-frontend-deployment-azure-static-web-apps)
8. [CI/CD Pipelines](#8-cicd-pipelines)
9. [Verification Checklist](#9-verification-checklist)
10. [Scaling Notes](#10-scaling-notes)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│   IoT Devices (up to ~600)                           │
│   PENDING  → cloudsynk/pre-activation                │
│   ACTIVE   → cloudsynk/{client_id}/{device_id}/...   │
└─────────────────────┬────────────────────────────────┘
                      │ MQTTS :8883 (TLS)
┌─────────────────────▼────────────────────────────────┐
│   Azure VM  vm-cloudsynk-emqx  (20.198.101.175)      │
│   ┌─────────────────────────────────────────────┐    │
│   │  EMQX Broker (Docker)                       │    │
│   │  :1883 — localhost only (Python subscriber) │    │
│   │  :8883 — TLS, internet (devices + backend)  │    │
│   │  :18083 — Dashboard (restricted)            │    │
│   │  Auth/ACL → HTTP hooks → Express backend    │    │
│   └─────────────────────────────────────────────┘    │
│   (Node subscriber is built into the backend —      │
│    mqttListenerService.js runs inside App Service)  │
└───────┬─────────────────────────────┬────────────────┘
        │ SQL INSERT                  │ MQTT publish (config)
┌───────▼──────────────┐  ┌──────────▼─────────────────┐
│  Azure SQL Server    │  │  Express Backend            │
│  cs_db_prod          │  │  Azure App Service          │
│  (Central India)     │  │  cloudsynk-backend-api-prod │
└──────────────────────┘  └──────────┬──────────────────┘
                                     │ REST API
                          ┌──────────▼──────────────────┐
                          │  React Frontend              │
                          │  Azure Static Web Apps       │
                          │  lively-sand-08d4b6900.3.   │
                          │  azurestaticapps.net (prod)  │
                          └─────────────────────────────┘
```

### Device Lifecycle

| State | MQTT Access | Credentials |
|-------|-------------|-------------|
| `PENDING` | `cloudsynk/pre-activation` + `cloudsynk/{IMEI}/config` (subscribe) | username=IMEI, password=`PRE_ACTIVATION_SECRET` |
| `ACTIVE` | `cloudsynk/{IMEI}/telemetry` + `cloudsynk/{IMEI}/config` | username=device_id, password=bcrypt hash stored in DB |
| `INACTIVE` | Rejected at auth hook | — |

### MQTT Topic Structure

| Topic | Direction | Who |
|-------|-----------|-----|
| `cloudsynk/pre-activation` | PUBLISH | PENDING device (first boot announcement) |
| `cloudsynk/{IMEI}/config` | PUBLISH (retained) | `backend_publisher` (telemetryConfig, pause/resume, config updates, deactivation) |
| `cloudsynk/{IMEI}/config` | SUBSCRIBE | Device (receives credentials on activation, config updates) |
| `cloudsynk/{IMEI}/telemetry` | PUBLISH | ACTIVE device (sensor data) |
| `cloudsynk/{IMEI}/telemetry` | SUBSCRIBE | `backend_publisher` / `local_subscriber` (process incoming telemetry) |

---

## 2. Environment Variables Reference

### 2.1 Backend (`server/.env`)

#### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_SERVER` | Yes | `localhost` | SQL Server hostname or Azure SQL FQDN |
| `DB_PORT` | No | `1433` | SQL Server port |
| `DB_DATABASE` | Yes | `cs_db_dev` | Database name (`cs_db_dev` / `cs_db_prod`) |
| `DB_USER` | Yes | — | SQL login username |
| `DB_PASSWORD` | Yes | — | SQL login password (store in Key Vault in prod) |
| `DB_ENCRYPT` | No | `false` | **Set `true` for Azure SQL (prod)** |
| `DB_TRUST_SERVER_CERTIFICATE` | No | `false` | Set `true` only for local dev with self-signed certs |
| `DB_INSTANCE_NAME` | No | — | Named instance (e.g., `SQLEXPRESS`) — leave blank for Azure SQL |
| `DB_CONNECTION_TIMEOUT` | No | `30000` | Connection timeout in ms |
| `DB_REQUEST_TIMEOUT` | No | `30000` | Query timeout in ms |

#### Auth / JWT

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | HS256 signing secret — generate with `openssl rand -hex 64` |
| `JWT_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_SECRET` | No | same as `JWT_SECRET` | Separate secret for refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token lifetime |

#### Server

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5001` | HTTP listen port (Azure App Service sets this automatically) |
| `NODE_ENV` | Yes | `development` | `development` or `production` |
| `CORS_ORIGIN` | No | `http://localhost:3008` | Primary allowed CORS origin (frontend URL) |
| `CORS_EXTRA_ORIGINS` | No | — | Comma-separated extra origins. **Do not set in production.** |
| `LOG_LEVEL` | No | `info` | Winston log level (`error` / `warn` / `info` / `debug`) |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window in ms (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Max requests per window per IP |

#### MQTT Broker

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MQTT_BROKER_HOST` | Yes | `localhost` | EMQX broker hostname or IP |
| `MQTT_BROKER_PORT` | No | `1883` | Broker port (`8883` for TLS in prod) |
| `MQTT_BROKER_TLS` | No | `false` | **Set `true` in production** — also controls `rejectUnauthorized` on the TLS socket |
| `MQTT_BACKEND_USER` | Yes | — | Service account username (`backend_publisher`) |
| `MQTT_BACKEND_PASSWORD` | Yes | — | Service account password — generate with `openssl rand -hex 32` |
| `PRE_ACTIVATION_SECRET` | Yes | — | Shared firmware secret for PENDING device auth. Change if ever compromised. |

#### EMQX Management API

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMQX_MGMT_API_URL` | Yes | `http://localhost:18083/api/v5` | EMQX REST API base URL |
| `EMQX_MGMT_API_KEY` | Yes | — | API key from EMQX Dashboard → Management → API Keys |
| `EMQX_VM_IP` | Yes | — | Comma-separated IP allowlist for `/api/mqtt/auth` and `/api/mqtt/acl`. Include EMQX VM IP + localhost variants. |

Example for production:
```env
EMQX_VM_IP=20.198.101.175,::ffff:20.198.101.175
```

Example for local dev:
```env
EMQX_VM_IP=20.198.101.175,::ffff:127.0.0.1,127.0.0.1,::1
```

#### Razorpay

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RAZORPAY_KEY_ID` | Yes* | — | Razorpay key ID (`rzp_test_...` or `rzp_live_...`) |
| `RAZORPAY_KEY_SECRET` | Yes* | — | Razorpay key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Yes* | — | Webhook HMAC secret (set in Razorpay Dashboard) |

*Required only when the `payments_enabled` feature flag is on.

---

### 2.2 Frontend (`client/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `""` (Vite proxy) | Backend API base URL. Leave empty for local dev (Vite proxies to `localhost:5001`). Set full URL in production. |
| `VITE_APP_NAME` | No | `GenVolt Dashboard` | App display name |
| `VITE_RAZORPAY_KEY_ID` | No | — | Public Razorpay key (safe to expose). Use test key for dev, live key for prod. |

**Dev (`client/.env`):**
```env
VITE_API_URL=
VITE_APP_NAME=CloudSynk Dev
VITE_RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
```

**Prod (`client/.env.production`):**
```env
VITE_API_URL=https://backend.cloudsynk.net
VITE_APP_NAME=CloudSynk
VITE_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxxxxx
```

---

### 2.3 Dev `.env` Example

```env
# Database
DB_SERVER=localhost
DB_PORT=1433
DB_DATABASE=cs_db_dev
DB_USER=sa
DB_PASSWORD=YourDevPassword123!
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

# Auth
JWT_SECRET=<output of: openssl rand -hex 64>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Server
PORT=5001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3008
LOG_LEVEL=debug

# MQTT
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_BROKER_TLS=false
MQTT_BACKEND_USER=backend_publisher
MQTT_BACKEND_PASSWORD=<generate: openssl rand -hex 32>
PRE_ACTIVATION_SECRET=<generate: openssl rand -hex 32>

# EMQX Management API
EMQX_MGMT_API_URL=http://localhost:18083/api/v5
EMQX_MGMT_API_KEY=<key from EMQX dashboard>
EMQX_VM_IP=::ffff:127.0.0.1,127.0.0.1,::1

# Razorpay (optional — leave blank if payments_enabled flag is off)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

### 2.5 Complete Prod Environment Variables

Set these in **Azure Portal → App Service → Configuration → Application settings**:

```
NODE_ENV=production
PORT=8080
CORS_ORIGIN=https://lively-sand-08d4b6900.3.azurestaticapps.net
LOG_LEVEL=warn
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=200

DB_SERVER=<your-server>.database.windows.net
DB_DATABASE=cs_db_prod
DB_USER=<db-admin>
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false

JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

MQTT_BROKER_HOST=20.198.101.175
MQTT_BROKER_PORT=8883
MQTT_BROKER_TLS=true
MQTT_BACKEND_USER=backend_publisher

EMQX_MGMT_API_URL=http://20.198.101.175:18083/api/v5
EMQX_VM_IP=20.198.101.175,::ffff:20.198.101.175
```

Secrets (reference Key Vault — never hardcode):

| Setting Name | Key Vault Reference |
|---|---|
| `JWT_SECRET` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/JWT-SECRET/)` |
| `DB_PASSWORD` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/DB-PASSWORD/)` |
| `MQTT_BACKEND_PASSWORD` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/MQTT-BACKEND-PASSWORD/)` |
| `PRE_ACTIVATION_SECRET` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/PRE-ACTIVATION-SECRET/)` |
| `EMQX_MGMT_API_KEY` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/EMQX-MGMT-API-KEY/)` |
| `RAZORPAY_KEY_SECRET` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/RAZORPAY-KEY-SECRET/)` |
| `RAZORPAY_WEBHOOK_SECRET` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/RAZORPAY-WEBHOOK-SECRET/)` |

---

## 3. Azure Infrastructure

### 3.1 Resource Inventory

| Resource | Name | Environment |
|----------|------|-------------|
| Resource Group | `CloudSynk_Prod` | Both |
| App Service (backend) | `cloudsynk-backend-api-prod` | Prod |
| App Service (backend) | `genvolt-backend-api` | Dev |
| Static Web App (frontend) | `lively-sand-08d4b6900.3.azurestaticapps.net` | Prod |
| Static Web App (frontend) | `thankful-bay-0638b7700.3.azurestaticapps.net` | Dev |
| SQL Server | `sqlserver-cs-db-prod.database.windows.net` | Both |
| SQL Database | `cs_db_prod` / `cs_db_dev` | Both |
| VM (EMQX) | `vm-cloudsynk-emqx` (`20.198.101.175`) | Both |
| Key Vault | `kv-cloudsynk-prod` | Prod |

### 3.2 Networking & Ports

| Port | Protocol | Access | Purpose |
|------|----------|--------|---------|
| `443` | HTTPS | Internet | App Service (backend API) |
| `443` | HTTPS | Internet | Static Web Apps (frontend) |
| `8883` | MQTTS | Internet | EMQX — TLS MQTT for devices and backend |
| `1883` | MQTT | `127.0.0.1` only | EMQX — plain MQTT for local subscriber |
| `18083` | HTTP | Restricted IPs | EMQX Dashboard |
| `1433` | TCP | App Service only | Azure SQL |

### 3.3 NSG Rules (EMQX VM)

```bash
# Block plain MQTT from internet (1883 is localhost-only)
az network nsg rule create \
  --nsg-name vm-cloudsynk-emqx-nsg \
  --resource-group CloudSynk_Prod \
  --name deny-mqtt-plain-internet \
  --priority 200 \
  --protocol Tcp \
  --destination-port-ranges 1883 \
  --source-address-prefixes Internet \
  --access Deny

# Restrict dashboard to your admin IP
az network nsg rule create \
  --nsg-name vm-cloudsynk-emqx-nsg \
  --resource-group CloudSynk_Prod \
  --name allow-emqx-dashboard-admin \
  --priority 300 \
  --protocol Tcp \
  --destination-port-ranges 18083 \
  --source-address-prefixes <YOUR_ADMIN_IP>/32 \
  --access Allow
```

---

## 4. Database Setup

### 4.1 Azure SQL Setup (First Time)

```bash
# Create server (if not exists)
az sql server create \
  --name sqlserver-cs-db-prod \
  --resource-group CloudSynk_Prod \
  --location centralindia \
  --admin-user csadmin \
  --admin-password "<strong-password>"

# Create database
az sql db create \
  --resource-group CloudSynk_Prod \
  --server sqlserver-cs-db-prod \
  --name cs_db_prod \
  --service-objective S2

# Allow Azure services (App Service) to connect
az sql server firewall-rule create \
  --resource-group CloudSynk_Prod \
  --server sqlserver-cs-db-prod \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

### 4.2 Run Migration

Connect via Azure Data Studio or sqlcmd and run:

```bash
sqlcmd -S sqlserver-cs-db-prod.database.windows.net \
       -d cs_db_prod \
       -U csadmin \
       -P "<password>" \
       -i scripts/april-fools-day.sql
```

The migration script is **idempotent** — safe to re-run. It creates all tables, sequences, indexes, seeds subscription plans, inventory models, and feature flags, and back-fills existing device records.

### 4.3 Connection String (for reference)

```
Server=sqlserver-cs-db-prod.database.windows.net,1433;
Database=cs_db_prod;
User Id=csadmin;
Password=<password>;
Encrypt=True;
TrustServerCertificate=False;
Connection Timeout=30;
```

---

## 5. EMQX MQTT Broker Setup

### 5.1 Initial Install (Docker)

SSH into the VM:

```bash
ssh -i ~/Downloads/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175
```

Install Docker (if not present):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker mqttvm
```

Start EMQX (development / first run without TLS):

```bash
sudo docker run -d --name cloudsynk-emqxmqtt-broker \
  --restart always \
  -p 1883:1883 \
  -p 8083:8083 \
  -p 8883:8883 \
  -p 18083:18083 \
  emqx/emqx:latest
```

Access dashboard at `http://20.198.101.175:18083`
Default credentials: `admin` / `public` — **change immediately**.

### 5.2 TLS Setup (Production)

#### Step 1 — DNS Setup

A subdomain `mqtt.cloudsynk.net` is configured with an A record pointing to the VM's public IP `20.198.101.175`.

#### Step 2 — Get Let's Encrypt Certificate

```bash
# Stop EMQX to free port 80 for certbot HTTP challenge
sudo docker stop cloudsynk-emqxmqtt-broker

# Install certbot
sudo snap install --classic certbot

# Issue certificate
sudo certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email admin@cloudsynk.net \
  -d mqtt.cloudsynk.net
```

Certificates are placed at:
- `/etc/letsencrypt/live/mqtt.cloudsynk.net/fullchain.pem`
- `/etc/letsencrypt/live/mqtt.cloudsynk.net/privkey.pem`

#### Step 3 — Relaunch EMQX with TLS and Localhost-Only Port 1883

```bash
sudo docker rm cloudsynk-emqxmqtt-broker

sudo docker run -d --name cloudsynk-emqxmqtt-broker \
  --restart always \
  -p 127.0.0.1:1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  -v /etc/letsencrypt:/etc/letsencrypt:ro \
  emqx/emqx:latest
```

Port 1883 is now bound to `127.0.0.1` — the local subscriber connects via localhost; devices and the backend connect via TLS on 8883.

#### Step 4 — Configure TLS Listener in Dashboard

Dashboard → **Management → Listeners → ssl:8883 → Edit**

| Field | Value |
|-------|-------|
| SSL Cert | `/etc/letsencrypt/live/mqtt.cloudsynk.net/fullchain.pem` |
| SSL Key | `/etc/letsencrypt/live/mqtt.cloudsynk.net/privkey.pem` |
| Verify Peer | Disabled |

Save and restart the listener.

#### Step 5 — Auto-Renewal Hook

```bash
sudo tee /etc/letsencrypt/renewal-hooks/post/reload-emqx.sh > /dev/null <<'EOF'
#!/bin/bash
docker exec cloudsynk-emqxmqtt-broker emqx_ctl tls reload
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/post/reload-emqx.sh

# Test dry-run
sudo certbot renew --dry-run
```

---

### 5.3 EMQX Authentication — HTTP Hook

Dashboard → **Access Control → Authentication → Create**

| Field | Value |
|-------|-------|
| Mechanism | Password-Based |
| Backend | HTTP |
| Method | POST |
| URL | `https://backend.cloudsynk.net/api/mqtt/auth` |
| Body | `{ "username": "${username}", "password": "${password}", "clientid": "${clientid}" }` |
| Request Timeout | 5s |
| Pool Size | 8 |

**How it works:**
- PENDING devices authenticate with `username=<IMEI>`, `password=<PRE_ACTIVATION_SECRET>`
- ACTIVE devices authenticate with `username=<device_id>`, `password=<mqtt_password>`
- Service accounts (`backend_publisher`, `local_subscriber`) fall through to the built-in DB authenticator (set as a second authenticator in the chain)
- The auth endpoint is IP-restricted to the EMQX VM IP via `EMQX_VM_IP` env var
- Device credentials are cached for 30 seconds to reduce DB load

**Success response:**

```json
HTTP 200
{ "result": "allow" }
```

**Deny response:**

```json
HTTP 200
{ "result": "deny" }
```

---

### 5.4 EMQX Authorization — ACL Hook

Dashboard → **Access Control → Authorization → Create**

| Field | Value |
|-------|-------|
| Type | HTTP |
| Method | POST |
| URL | `https://backend.cloudsynk.net/api/mqtt/acl` |
| Body | `{ "username": "${username}", "topic": "${topic}", "action": "${action}", "clientid": "${clientid}" }` |
| No Match | Deny |
| Request Timeout | 5s |

**ACL logic per device state:**

| State | Allowed PUBLISH | Allowed SUBSCRIBE |
|-------|-----------------|-------------------|
| PENDING | `cloudsynk/pre-activation` | `cloudsynk/{IMEI}/config` |
| ACTIVE | `cloudsynk/{IMEI}/telemetry` (if data_enabled=1) | `cloudsynk/{IMEI}/config` |
| INACTIVE | None | None |

---

### 5.5 Service Account Setup

Dashboard → **Access Control → Authentication → Built-in Database → Users → Add**

Add this account and set as a **second authenticator** (after the HTTP hook, so device auth hits HTTP first):

| Username | Password | Notes |
|----------|----------|-------|
| `backend_publisher` | `<MQTT_BACKEND_PASSWORD>` | Used by Express backend (both publisher and subscriber run inside the backend service) |

#### ACL Rules for Service Account

Dashboard → **Access Control → Authorization → Built-in Database → Rules → Add**

**`backend_publisher`:**

| Action | Topic Pattern |
|--------|---------------|
| Allow PUBLISH | `cloudsynk/+/config` |
| Allow SUBSCRIBE | `cloudsynk/+/telemetry` |
| Allow SUBSCRIBE | `cloudsynk/pre-activation` |

---

### 5.6 EMQX Management API Key

Dashboard → **System → API Keys → Create**

Copy the generated key — this is `EMQX_MGMT_API_KEY`.

The backend uses this to:
- Kick an active pre-activation MQTT session before delivering activation credentials (`DELETE /api/v5/clients/{clientid}`)

Store in Key Vault:
```bash
az keyvault secret set \
  --vault-name kv-cloudsynk-prod \
  --name EMQX-MGMT-API-KEY \
  --value "<api-key>"
```

---

### 5.7 EMQX Security Hardening Checklist

- [ ] Default `admin` dashboard password changed
- [ ] `adddevice` built-in account removed (replaced by HTTP hook per-IMEI auth)
- [ ] Port 1883 bound to `127.0.0.1` only (blocked from internet via NSG)
- [ ] Port 18083 restricted to admin IP in NSG
- [ ] TLS certificate installed on port 8883
- [ ] `MQTT_BROKER_TLS=true` set on backend (also enables `rejectUnauthorized` on the TLS socket)
- [ ] Auth hook pointed to production backend URL (not localhost)
- [ ] ACL hook pointed to production backend URL
- [ ] `backend_publisher` and `local_subscriber` passwords rotated from defaults
- [ ] Auto-renewal hook for Let's Encrypt configured

---

## 6. Backend Deployment (Azure App Service)

### 6.1 First-Time Setup

```bash
# Create App Service Plan (B2 or higher for production)
az appservice plan create \
  --name asp-cloudsynk-prod \
  --resource-group CloudSynk_Prod \
  --location centralindia \
  --sku B2 \
  --is-linux

# Create Web App (Node 22)
az webapp create \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod \
  --plan asp-cloudsynk-prod \
  --runtime "NODE:22-lts"
```

### 6.2 Enable Managed Identity & Key Vault Access

```bash
# Enable system-assigned managed identity
az webapp identity assign \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod

# Note the principalId from the output, then grant Key Vault access
az keyvault set-policy \
  --name kv-cloudsynk-prod \
  --object-id <principal-id> \
  --secret-permissions get list
```

### 6.3 Set Environment Variables

```bash
az webapp config appsettings set \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod \
  --settings \
    NODE_ENV=production \
    DB_SERVER=sqlserver-cs-db-prod.database.windows.net \
    DB_DATABASE=cs_db_prod \
    DB_USER=csadmin \
    DB_ENCRYPT=true \
    DB_TRUST_SERVER_CERTIFICATE=false \
    JWT_EXPIRES_IN=15m \
    JWT_REFRESH_EXPIRES_IN=7d \
    MQTT_BROKER_HOST=20.198.101.175 \
    MQTT_BROKER_PORT=8883 \
    MQTT_BROKER_TLS=true \
    MQTT_BACKEND_USER=backend_publisher \
    EMQX_MGMT_API_URL=http://20.198.101.175:18083/api/v5 \
    EMQX_VM_IP="20.198.101.175,::ffff:20.198.101.175" \
    CORS_ORIGIN=https://lively-sand-08d4b6900.3.azurestaticapps.net \
    LOG_LEVEL=warn \
    RATE_LIMIT_WINDOW_MS=900000 \
    RATE_LIMIT_MAX_REQUESTS=200
```

Add Key Vault references for secrets via Portal → Configuration → Application settings.

### 6.4 Enable HTTPS Only

```bash
az webapp update \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod \
  --https-only true
```

### 6.5 Startup Command

The `server/web.config` (IIS) handles routing. No custom startup command needed for Windows App Service. For Linux App Service, set:

```bash
az webapp config set \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod \
  --startup-file "node server.js"
```

### 6.6 Health Check

```bash
az webapp config set \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod \
  --generic-configurations '{"healthCheckPath": "/health"}'
```

---

## 7. Frontend Deployment (Azure Static Web Apps)

### 7.1 Build for Production

```bash
cd client
cp .env.production .env.production.local  # if customizing locally
npm run build
# Output: client/dist/
```

### 7.2 Deploy via CLI

```bash
npm install -g @azure/static-web-apps-cli

swa deploy client/dist \
  --app-name <static-web-app-name> \
  --resource-group CloudSynk_Prod \
  --env production
```

Or let the GitHub Actions workflow handle it automatically on push to `main`.

### 7.3 CORS — Allow Frontend Origin on Backend

The frontend URL must match `CORS_ORIGIN` set on the backend App Service. If you add a custom domain, update this setting.

---

## 8. CI/CD Pipelines

Four GitHub Actions workflows automate deployment:

| Workflow | Branch | Target |
|----------|--------|--------|
| `azure-backend-deploy.yml` | `dev` | `genvolt-backend-api` (dev App Service) |
| `azure-backend-deploy_prod.yml` | `main` | `cloudsynk-backend-api-prod` (prod App Service) |
| `azure-frontend-deploy.yml` | `dev` | Dev Static Web App |
| `azure-frontend-deploy_prod.yml` | `main` | Prod Static Web App |

### Required GitHub Secrets

Set in **GitHub → Repository → Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `AZURE_WEBAPP_PUBLISH_PROFILE` | Download from Azure Portal → App Service → Get publish profile |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | From Azure Portal → Static Web App → Manage deployment token |
| `VITE_API_URL` | Production backend URL (`https://backend.cloudsynk.net`) |
| `VITE_RAZORPAY_KEY_ID` | Public Razorpay key (safe to store as secret for cleanliness) |

---

## 9. Verification Checklist

### Database

```bash
# Check tables exist
sqlcmd -S ... -Q "SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo') ORDER BY name"

# Check subscription plans seeded
sqlcmd -S ... -Q "SELECT name, max_devices, price_monthly FROM dbo.SubscriptionPlans"

# Check inventory seeded
sqlcmd -S ... -Q "SELECT model_number, display_name FROM dbo.inventory ORDER BY model_number"

# Check feature flags
sqlcmd -S ... -Q "SELECT flag_name, is_enabled FROM dbo.FeatureFlags"
```

### Backend Health

```bash
curl https://backend.cloudsynk.net/health
# Expected: 200 OK with {"status":"healthy",...}
```

### MQTT Auth Endpoint IP Restriction

```bash
# From your local machine (not EMQX VM) — should return 403
curl -X POST https://backend.cloudsynk.net/api/mqtt/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
# Expected: 403 Forbidden
```

### TLS Connection

```bash
mosquitto_pub \
  -h mqtt.cloudsynk.net \
  -p 8883 \
  --capath /etc/ssl/certs \
  -u backend_publisher \
  -P "<MQTT_BACKEND_PASSWORD>" \
  -t "test/ping" -m "hello" -d
# Expected: Connection Accepted
```

### Pre-Activation Flow

```bash
# Simulate a PENDING device first boot
mosquitto_pub \
  -h mqtt.cloudsynk.net \
  -p 8883 --capath /etc/ssl/certs \
  -u "<DEVICE_IMEI>" \
  -P "<PRE_ACTIVATION_SECRET>" \
  -t "cloudsynk/pre-activation" \
  -m '{"imei":"<DEVICE_IMEI>","device_type":"GV-M1","firmware_version":"2.1.0","mac_address":"AA:BB:CC:DD:EE:FF"}'
# Expected: device appears in Admin UI → Pending Devices
```

### Subscriber Running

The MQTT subscriber is built into the backend (`mqttListenerService.js`) and starts with the App Service. Check the backend logs:

```bash
# Azure Portal → App Service → Log stream
# Or via CLI:
az webapp log tail \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod
# Expected: "MQTT listener connected" in startup logs
```

---

## 10. Scaling Notes

| Trigger | Action | Estimated Cost |
|---------|--------|---------------|
| > 300 devices or first prod incident | Add second EMQX VM + Azure Load Balancer | +~$24/month |
| > 200 concurrent devices in debug mode | Azure Cache for Redis for auth/ACL (60s TTL) | +~$13/month |
| Payments go live | Azure Service Bus for Razorpay webhook reliability | +~$1/month |
| High API traffic | Scale App Service plan from B2 → P1v3 | ~$40/month |

### Current Auth/ACL Caching

The backend caches MQTT device credentials in-process with a 30-second TTL. This reduces DB queries during steady-state telemetry. At scale (> 200 devices), replace with Redis for shared cache across multiple App Service instances.
