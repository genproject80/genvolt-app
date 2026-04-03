# Azure Production Setup Guide

**Reference:** VM_Setup_Guide.md, MQTT_Implementation_Functional_Document.md
**Date:** 2026-03-25
**Status:** In Progress

---

## Prerequisites

- Azure CLI installed and logged in (`az login`)
- SSH key for EMQX VM at `~/Downloads/vm-cloudsynk-emqx_key.pem`
- Access to Azure Portal for CloudSynk_Prod subscription
- EMQX Dashboard access at `http://20.198.101.175:18083`

---

## Step 1 — Rotate Secrets (Before Anything Else)

Generate strong secrets locally:

```bash
# JWT secret
openssl rand -hex 64

# MQTT backend password
openssl rand -hex 32

# Copy the outputs — you'll need them in Steps 2 and 6
```

Store these in **Azure Key Vault** (create one if it doesn't exist):

```bash
# Create Key Vault (one-time)
az keyvault create \
  --name kv-cloudsynk-prod \
  --resource-group CloudSynk_Prod \
  --location centralindia

# Store secrets
az keyvault secret set --vault-name kv-cloudsynk-prod --name JWT-SECRET       --value "<output from openssl>"
az keyvault secret set --vault-name kv-cloudsynk-prod --name MQTT-BACKEND-PASSWORD --value "<output from openssl>"
az keyvault secret set --vault-name kv-cloudsynk-prod --name DB-PASSWORD       --value "<your db password>"
```

Grant the App Service access to Key Vault:

```bash
# Enable managed identity on App Service
az webapp identity assign \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod

# Grant Key Vault read access to the App Service identity
az keyvault set-policy \
  --name kv-cloudsynk-prod \
  --object-id <principal-id-from-above> \
  --secret-permissions get list
```

---

## Step 2 — App Service: Set Environment Variables

```bash
az webapp config appsettings set \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod \
  --settings \
    NODE_ENV=production \
    MQTT_BROKER_HOST=mqtt.cloudsynk.net \
    MQTT_BROKER_PORT=8883 \
    MQTT_BROKER_TLS=true \
    MQTT_REJECT_UNAUTHORIZED=true \
    MQTT_BACKEND_USER=backend_publisher \
    DB_ENCRYPT=true \
    DB_TRUST_SERVER_CERTIFICATE=false \
    EMQX_VM_IP=20.198.101.175 \
    RATE_LIMIT_WINDOW_MS=900000 \
    RATE_LIMIT_MAX_REQUESTS=200
```

For secrets, reference Key Vault instead of hardcoding values. In **Azure Portal → App Service → Configuration → Application settings**, add:

| Name | Value |
|------|-------|
| `JWT_SECRET` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/JWT-SECRET/)` |
| `MQTT_BACKEND_PASSWORD` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/MQTT-BACKEND-PASSWORD/)` |
| `DB_PASSWORD` | `@Microsoft.KeyVault(SecretUri=https://kv-cloudsynk-prod.vault.azure.net/secrets/DB-PASSWORD/)` |

> **Note:** Do NOT set `CORS_EXTRA_ORIGINS` in production.

---

## Step 3 — App Service: Enable HTTPS-Only

```bash
az webapp update \
  --name cloudsynk-backend-api-prod \
  --resource-group CloudSynk_Prod \
  --https-only true
```

Verify in Portal: App Service → Settings → TLS/SSL settings → HTTPS Only = **On**

---

## Step 4 — EMQX VM: TLS Certificate Setup

SSH into the VM:

```bash
ssh -i ~/Downloads/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175
```

### Step 4a — DNS Setup

A subdomain `mqtt.cloudsynk.net` is configured with an A record pointing to the VM's public IP `20.198.101.175`.

Verify:
```bash
nslookup mqtt.cloudsynk.net
# Should resolve to 20.198.101.175
```

### Step 4b — Get a Let's Encrypt TLS certificate

On the VM (stop EMQX temporarily to free port 80 for certbot challenge):

```bash
sudo docker stop cloudsynk-emqxmqtt-broker

sudo snap install --classic certbot

sudo certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email admin@cloudsynk.net \
  -d mqtt.cloudsynk.net
```

Certs are placed at:
- `/etc/letsencrypt/live/mqtt.cloudsynk.net/fullchain.pem`
- `/etc/letsencrypt/live/mqtt.cloudsynk.net/privkey.pem`

### Step 4c — Relaunch EMQX Docker with TLS cert mounted

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

> Port 1883 is now bound to `127.0.0.1` only — plain MQTT is local-only for the Python subscriber.

### Step 4d — Configure TLS Listener in EMQX Dashboard

Open `http://20.198.101.175:18083` → **Management → Listeners → ssl:8883 → Edit**

| Field | Value |
|-------|-------|
| SSL Cert | `/etc/letsencrypt/live/mqtt.cloudsynk.net/fullchain.pem` |
| SSL Key | `/etc/letsencrypt/live/mqtt.cloudsynk.net/privkey.pem` |
| Verify Peer | Disabled |

Save and restart the listener.

### Step 4e — Auto-renewal hook for cert expiry

```bash
sudo tee /etc/letsencrypt/renewal-hooks/post/reload-emqx.sh > /dev/null <<'EOF'
#!/bin/bash
docker exec cloudsynk-emqxmqtt-broker emqx_ctl tls reload
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/post/reload-emqx.sh
```

Test renewal (dry-run):

```bash
sudo certbot renew --dry-run
```

---

## Step 5 — NSG: Block Plain MQTT from Internet

```bash
az network nsg rule create \
  --nsg-name vm-cloudsynk-emqx-nsg \
  --resource-group CloudSynk_Prod \
  --name deny-mqtt-plain-internet \
  --priority 200 \
  --protocol Tcp \
  --destination-port-ranges 1883 \
  --source-address-prefixes Internet \
  --access Deny
```

After this:
- Port `1883` — accessible from localhost on VM only (Python subscriber)
- Port `8883` — TLS, accessible from internet (devices + backend)
- Port `18083` — EMQX dashboard, restricted to your IP (already set)

---

## Step 6 — EMQX Dashboard: Configure HTTP Auth & ACL Plugin

Open `http://20.198.101.175:18083`

### Authentication (HTTP)

**Management → Authentication → Create**

| Field | Value |
|-------|-------|
| Mechanism | Password-Based |
| Backend | HTTP |
| Method | POST |
| URL | `https://backend.cloudsynk.net/api/mqtt/auth` |
| Body | `{ "username": "${username}", "password": "${password}", "clientid": "${clientid}" }` |
| Request Timeout | 5s |
| Pool Size | 8 |

Success condition: HTTP 200 with `"result": "allow"`

### Authorization (HTTP)

**Management → Authorization → Create**

| Field | Value |
|-------|-------|
| Type | HTTP |
| Method | POST |
| URL | `https://backend.cloudsynk.net/api/mqtt/acl` |
| Body | `{ "username": "${username}", "topic": "${topic}", "action": "${action}", "clientid": "${clientid}" }` |
| No Match | Deny |
| Request Timeout | 5s |

---

## Step 7 — EMQX Dashboard: Create Service Accounts

**Management → Authentication → Built-in Database → Users → Add**

| Username | Password | Superuser |
|----------|----------|-----------|
| `backend_publisher` | `<MQTT_BACKEND_PASSWORD from Step 1>` | No |
| `local_subscriber` | `<new strong password>` | No |

> Save the `local_subscriber` password — you'll need it in the VM `.env` (Step 9).

### ACL Rules for Service Accounts

**Management → Authorization → Built-in Database → Rules → Add**

For `backend_publisher`:

| Action | Topic |
|--------|-------|
| Allow publish | `cloudsynk/+/config` |
| Allow subscribe | `cloudsynk/+/telemetry` |
| Allow subscribe | `cloudsynk/pre-activation` |

For `local_subscriber`:

| Action | Topic |
|--------|-------|
| Allow subscribe | `cloudsynk/+/telemetry` |
| Allow subscribe | `cloudsynk/pre-activation` |
| Deny publish | `#` |

---

## Step 8 — Update VM .env with New Passwords

On the VM:

```bash
sudo nano /opt/cloudsynk-subscriber/.env
```

Update:

```env
MQTT_BROKER=localhost
MQTT_PORT=1883
MQTT_USER=local_subscriber
MQTT_PASSWORD=<password from Step 7>

DB_SERVER=<your-sql-server>.database.windows.net
DB_NAME=cs_db_prod
DB_USER=<db user>
DB_PASSWORD=<db password>
```

Set correct permissions:

```bash
sudo chmod 600 /opt/cloudsynk-subscriber/.env
```

---

## Step 9 — VM: Deploy Python Subscriber

### Copy decoders from local machine

```bash
scp -i ~/Downloads/vm-cloudsynk-emqx_key.pem -r \
  /path/to/decoders \
  mqttvm@20.198.101.175:/opt/cloudsynk-subscriber/
```

### Create local_subscriber.py

See **VM_Setup_Guide.md → Step 6** for the full script.

```bash
sudo nano /opt/cloudsynk-subscriber/local_subscriber.py
# Paste script from VM_Setup_Guide.md Step 6
```

### Create systemd service

```bash
sudo tee /etc/systemd/system/cloudsynk-subscriber.service > /dev/null <<'EOF'
[Unit]
Description=CloudSynk MQTT Subscriber
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=mqttvm
WorkingDirectory=/opt/cloudsynk-subscriber
ExecStart=/opt/cloudsynk-subscriber/venv/bin/python local_subscriber.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=/opt/cloudsynk-subscriber/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable cloudsynk-subscriber
sudo systemctl start cloudsynk-subscriber
```

Verify:

```bash
sudo systemctl status cloudsynk-subscriber
sudo journalctl -u cloudsynk-subscriber -f
# Expected: "Connected to EMQX" and subscribed to both topics
```

---

## Step 10 — End-to-End Verification

### Test 1 — IP allowlist is enforced on MQTT auth endpoint

From your local machine (should be blocked):

```bash
curl -X POST https://backend.cloudsynk.net/api/mqtt/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
# Expected: 403 Forbidden
```

### Test 2 — TLS connection works

From VM or local (requires mosquitto-clients):

```bash
mosquitto_pub \
  -h mqtt.cloudsynk.net \
  -p 8883 \
  --capath /etc/ssl/certs \
  -u backend_publisher \
  -P "<MQTT_BACKEND_PASSWORD>" \
  -t "test/ping" \
  -m "hello" \
  -d
# Expected: Connection Accepted
```

### Test 3 — Pre-activation flow

```bash
# Simulate new device first boot
mosquitto_pub \
  -h mqtt.cloudsynk.net \
  -p 8883 --capath /etc/ssl/certs \
  -u "TEST001" \
  -t "cloudsynk/pre-activation" \
  -m '{"device_id":"TEST001","device_type":"P3","firmware_version":"2.1.0","mac_address":"AA:BB:CC:DD:EE:FF"}'
```

- Verify TEST001 appears in Admin UI → Pending Devices
- Activate via UI, assign to a client

### Test 4 — Config topic seeded after activation

```bash
node server/scripts/test_mqtt_activation.js <client_id> TEST001
# Expected: PASS with retained config message
```

### Test 5 — Python subscriber receiving telemetry

```bash
sudo journalctl -u cloudsynk-subscriber -f
# Then publish a test telemetry message and verify it's decoded + inserted to SQL
```

---

## Scaling Reminders (When Needed)

| Trigger | Action | Cost |
|---------|--------|------|
| > 300 devices or first prod incident | Add second EMQX VM + Azure Load Balancer | +~$24/month |
| > 200 devices in debug mode | Azure Cache for Redis (auth/ACL caching, 60s TTL) | +~$13/month |
| Before payment gateway goes live | Azure Service Bus for webhook reliability | +~$1/month |



Azure Steps (manual — do in this order)
Before deploying code:

Azure App Service → Configuration → set all env vars (especially DB_ENCRYPT=true, DB_TRUST_SERVER_CERTIFICATE=false, EMQX_VM_IP=20.198.101.175, RATE_LIMIT_MAX_REQUESTS=200)
App Service → TLS/SSL → HTTPS Only = On
Rotate secrets: generate new JWT_SECRET and MQTT_BACKEND_PASSWORD with openssl rand -hex 32, store in Azure Key Vault
EMQX VM TLS (same deployment window as setting MQTT_BROKER_TLS=true):
4. SSH to VM → assign DNS label to public IP in Azure Portal → run certbot → relaunch Docker with /etc/letsencrypt mounted → configure TLS listener in EMQX Dashboard (port 8883, fullchain.pem + privkey.pem) → add certbot renewal hook
5. NSG: change port 1883 to bind 127.0.0.1 only (block plain MQTT from internet)

EMQX Dashboard (one-time):
6. Authentication → HTTP plugin → point to https://backend.cloudsynk.net/api/mqtt/auth
7. Authorization → HTTP source → point to https://backend.cloudsynk.net/api/mqtt/acl
8. Built-in Database → add backend_publisher + local_subscriber accounts + their ACL rules

VM subscriber (remaining from VM_Setup_Guide steps 6, 7, 10):
9. Copy decoders + local_subscriber.py → create + enable systemd service