# MQTT TLS/SSL Setup Guide

Covers enabling TLS encryption on the EMQX broker for both local development and production (Azure VM).

---

## Overview

| Environment | Port | Certificate | `MQTT_BROKER_TLS` | `MQTT_REJECT_UNAUTHORIZED` |
|-------------|------|-------------|--------------------|----------------------------|
| Local (no TLS) | 1883 | None | `false` | N/A |
| Local (TLS) | 8883 | Self-signed | `true` | `false` |
| Production | 8883 | Let's Encrypt / purchased | `true` | `true` |

**Why TLS?** Plain MQTT (port 1883) transmits credentials in cleartext — including `PRE_ACTIVATION_SECRET` and device MQTT passwords. TLS on port 8883 encrypts the entire connection handshake and payload.

---

## Part 1: Local Development (Self-Signed Certificate)

### 1.1 Generate Certificates

Run from the project root. This creates a local CA and a server certificate signed by it.

```bash
mkdir -p certs

# 1. Generate CA private key
openssl genrsa -out certs/ca.key 2048

# 2. Generate CA certificate (valid 365 days)
openssl req -x509 -new -nodes -key certs/ca.key \
  -sha256 -days 365 -out certs/ca.crt \
  -subj "/CN=CloudSynk Dev CA"

# 3. Generate server private key
openssl genrsa -out certs/server.key 2048

# 4. Generate server certificate signing request
openssl req -new -key certs/server.key \
  -out certs/server.csr \
  -subj "/CN=localhost"

# 5. Sign server certificate with CA
openssl x509 -req -in certs/server.csr \
  -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial \
  -out certs/server.crt -days 365 -sha256
```

You should now have:

```
certs/
  ca.key          # CA private key (do not distribute)
  ca.crt          # CA certificate (import into clients for trust)
  server.key      # EMQX server private key
  server.crt      # EMQX server certificate
  server.csr      # Signing request (can delete)
```

### 1.2 Start EMQX with TLS

Stop and remove the existing container, then start with TLS enabled:

```bash
docker rm -f emqx-local

docker run -d --name emqx-local \
  --restart always \
  -p 1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  -v /path/to/certs:/opt/emqx/etc/certs/custom \
  -e EMQX_LISTENERS__SSL__DEFAULT__BIND=8883 \
  -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CERTFILE=/opt/emqx/etc/certs/custom/server.crt \
  -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__KEYFILE=/opt/emqx/etc/certs/custom/server.key \
  -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CACERTFILE=/opt/emqx/etc/certs/custom/ca.crt \
  emqx/emqx:latest
```

> **Windows path example:** `-v e:/CloudSynk_MQTT_Setup_Testing/MQTTV2/certs:/opt/emqx/etc/certs/custom`

EMQX now listens on:
- **1883** — plain MQTT (keep for quick debugging)
- **8883** — MQTT over TLS

### 1.3 Verify TLS Listener

Open the EMQX Dashboard at `http://localhost:18083` (login: `admin` / `public`) and navigate to **Management > Listeners**. You should see `ssl:default` bound to port 8883 and status **Running**.

Alternatively, verify from the command line:

```bash
# Should complete a TLS handshake (self-signed, so -k to skip verification)
openssl s_client -connect localhost:8883 -brief
```

### 1.4 Update Server Environment

Edit `server/.env`:

```env
MQTT_BROKER_PORT=8883
MQTT_BROKER_TLS=true
# Do NOT set MQTT_REJECT_UNAUTHORIZED — defaults to false for self-signed certs
```

Restart the server (`npm run dev`). Logs should show the MQTT service and listener connecting without errors.

### 1.5 Test with the Device Simulator

```bash
cd server
node simulator/device-simulator.js \
  --imei 111222333444555 \
  --model-number EV-M1 \
  --pre-pass dev-secret-123 \
  --port 8883 \
  --tls \
  --no-verify
```

- `--tls` switches the protocol from `mqtt://` to `mqtts://`
- `--no-verify` skips certificate validation (required for self-signed certs)

### 1.6 Test with MQTTX

1. Open MQTTX and edit your connection
2. **Port:** `8883`
3. **SSL/TLS:** toggle **ON**
4. **SSL Secure:** toggle **OFF** (self-signed cert)
5. Optionally import `certs/ca.crt` as the **CA File** for proper chain validation
6. Connect and test the pre-activation flow as normal

### 1.7 Keeping Both Ports Available

During local development you may want to keep port 1883 open for convenience:
- **TLS testing:** connect to port 8883 with `--tls`
- **Quick debugging:** connect to port 1883 without TLS

Both ports share the same authentication chain (HTTP auth webhook + built-in database).

---

## Part 2: Production (Azure VM)

### 2.1 Prerequisites

- Azure VM `vm-cloudsynk-emqx` running with EMQX (see [VM_Setup_Guide.md](VM_Setup_Guide.md))
- VM public IP: `20.198.101.175`
- SSH access: `ssh -i ~/Downloads/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175`
- EMQX Docker container name: `cloudsynk-emqxmqtt-broker`

### 2.2 Choose a Certificate Strategy

There are three options. Pick one based on your setup:

| Option | Cost | Domain Required? | Auto-Renew? | Best For |
|--------|------|------------------|-------------|----------|
| **A. Let's Encrypt** | Free | Yes | Yes (90-day cycle) | Production with a domain |
| **B. Azure-Managed Certificate** | Free (with App Gateway) | Yes | Yes (automatic) | If already using Azure App Gateway |
| **C. IP-only (self-signed CA)** | Free | No | Manual | When no domain is available |

---

### 2.3 Option A: Let's Encrypt (Recommended)

This is the recommended approach — free, auto-renewing, and trusted by all devices/browsers.

#### Step 1: Point a domain to your VM

You need a domain or subdomain pointing to `20.198.101.175`. Examples:
- `mqtt.cloudsynk.net` (production subdomain)

**If using Azure DNS:**
1. Azure Portal → **DNS zones** → your domain
2. Add an **A record**: Name = `mqtt`, Value = `20.198.101.175`, TTL = 300

**If using an external registrar (GoDaddy, Namecheap, Cloudflare, etc.):**
1. Go to DNS management for your domain
2. Add an **A record**: Host = `mqtt`, Points to = `20.198.101.175`

Verify DNS propagation:
```bash
nslookup mqtt.cloudsynk.net
# Should resolve to 20.198.101.175
```

#### Step 2: Open port 80 temporarily for cert validation

Let's Encrypt needs port 80 to verify domain ownership. Add a **temporary** NSG rule:

```
Azure Portal → vm-cloudsynk-emqx-nsg → Inbound rules → Add:
  Priority: 900
  Name: TMP-HTTP-CertBot
  Port: 80
  Protocol: TCP
  Source: Any
  Action: Allow
```

#### Step 3: SSH into the VM and install certbot

```bash
ssh -i ~/Downloads/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175

sudo apt update && sudo apt install -y certbot
```

#### Step 4: Obtain the certificate

```bash
# Stop EMQX temporarily so certbot can use port 80
sudo docker stop cloudsynk-emqxmqtt-broker

# Request the certificate
sudo certbot certonly --standalone \
  -d mqtt.cloudsynk.net \
  --agree-tos \
  --email your-email@example.com \
  --non-interactive

# Restart EMQX
sudo docker start cloudsynk-emqxmqtt-broker
```

On success, certbot saves files to:
```
/etc/letsencrypt/live/mqtt.cloudsynk.net/
  fullchain.pem   # Server cert + intermediate CA chain
  privkey.pem     # Private key
  cert.pem        # Server cert only
  chain.pem       # Intermediate CA only
```

#### Step 5: Make certs readable by Docker

Let's Encrypt sets restrictive permissions. Copy certs to a Docker-friendly location:

```bash
sudo mkdir -p /opt/emqx-certs
sudo cp /etc/letsencrypt/live/mqtt.cloudsynk.net/fullchain.pem /opt/emqx-certs/
sudo cp /etc/letsencrypt/live/mqtt.cloudsynk.net/privkey.pem /opt/emqx-certs/
sudo chmod 644 /opt/emqx-certs/*.pem
```

#### Step 6: Recreate EMQX Docker with TLS

```bash
# Stop and remove existing container
sudo docker stop cloudsynk-emqxmqtt-broker
sudo docker rm cloudsynk-emqxmqtt-broker

# Start with TLS configuration
sudo docker run -d --name cloudsynk-emqxmqtt-broker \
  --restart always \
  -p 1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  -v /opt/emqx-certs:/opt/emqx/etc/certs/custom:ro \
  -e EMQX_LISTENERS__SSL__DEFAULT__BIND=8883 \
  -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CERTFILE=/opt/emqx/etc/certs/custom/fullchain.pem \
  -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__KEYFILE=/opt/emqx/etc/certs/custom/privkey.pem \
  emqx/emqx:latest
```

#### Step 7: Verify TLS is working

```bash
# From your local machine (replace domain)
openssl s_client -connect mqtt.cloudsynk.net:8883 -brief

# Expected output includes:
#   Verification: OK
#   subject: CN = mqtt.cloudsynk.net
```

#### Step 8: Remove temporary port 80 NSG rule

```
Azure Portal → vm-cloudsynk-emqx-nsg → Delete rule: TMP-HTTP-CertBot
```

#### Step 9: Set up auto-renewal

Let's Encrypt certs expire after 90 days. Create a renewal script:

```bash
sudo nano /opt/emqx-certs/renew.sh
```

Paste the following:

```bash
#!/bin/bash
# Renew Let's Encrypt cert and update EMQX

# Stop EMQX so certbot can use port 80 (standalone mode)
docker stop cloudsynk-emqxmqtt-broker

# Attempt renewal
certbot renew --quiet

# Copy renewed certs to Docker-accessible location
cp /etc/letsencrypt/live/mqtt.cloudsynk.net/fullchain.pem /opt/emqx-certs/
cp /etc/letsencrypt/live/mqtt.cloudsynk.net/privkey.pem /opt/emqx-certs/
chmod 644 /opt/emqx-certs/*.pem

# Restart EMQX with new certs
docker start cloudsynk-emqxmqtt-broker
```

Make it executable and add to cron:

```bash
sudo chmod +x /opt/emqx-certs/renew.sh

# Run twice daily (certbot only renews when <30 days remain)
sudo crontab -e
# Add this line:
0 3,15 * * * /opt/emqx-certs/renew.sh >> /var/log/emqx-cert-renew.log 2>&1
```

> **Note:** The brief EMQX downtime during renewal (typically <30 seconds) is acceptable.
> Devices with `reconnectPeriod` set will auto-reconnect. For zero-downtime renewal,
> use the DNS challenge method instead (requires Cloudflare or Azure DNS plugin for certbot).

---

### 2.4 Option B: Azure-Managed Certificate

Only relevant if you're fronting EMQX with **Azure Application Gateway** or **Azure Front Door**. The certificate is managed entirely by Azure.

1. Azure Portal → **Application Gateway** → **Listeners** → add MQTT listener on port 8883
2. Under **SSL certificates** → **Create new** → choose **App Service Managed Certificate**
3. The gateway terminates TLS and forwards plain MQTT to the EMQX VM on port 1883

This approach offloads TLS from EMQX entirely. However, Application Gateway adds ~$18/month and is typically overkill unless you're already using it for HTTP traffic or load balancing multiple EMQX nodes.

---

### 2.5 Option C: IP-Only (Self-Signed CA)

Use this when you **don't have a domain** and devices connect directly to the VM IP `20.198.101.175`. This gives encryption but clients must either trust your CA or skip verification.

#### Generate on the VM:

```bash
ssh -i ~/Downloads/vm-cloudsynk-emqx_key.pem mqttvm@20.198.101.175

sudo mkdir -p /opt/emqx-certs && cd /opt/emqx-certs

# 1. Create CA
sudo openssl genrsa -out ca.key 2048
sudo openssl req -x509 -new -nodes -key ca.key \
  -sha256 -days 730 -out ca.crt \
  -subj "/CN=CloudSynk MQTT CA"

# 2. Create server key
sudo openssl genrsa -out server.key 2048

# 3. Create a config file with the IP as a SAN (Subject Alternative Name)
sudo bash -c 'cat > server-ext.cnf << EOF
[req]
distinguished_name = req_dn
req_extensions = v3_req
prompt = no

[req_dn]
CN = 20.198.101.175

[v3_req]
subjectAltName = IP:20.198.101.175

[v3_ca]
subjectAltName = IP:20.198.101.175
EOF'

# 4. Generate CSR and sign with CA
sudo openssl req -new -key server.key -out server.csr -config server-ext.cnf
sudo openssl x509 -req -in server.csr \
  -CA ca.crt -CAkey ca.key -CAcreateserial \
  -out server.crt -days 730 -sha256 \
  -extfile server-ext.cnf -extensions v3_ca

sudo chmod 644 *.pem *.crt *.key
```

> **Important:** The `subjectAltName = IP:20.198.101.175` is critical. Without it, TLS clients will reject the cert even if the CN matches — modern TLS validation requires SANs.

#### Configure EMQX:

```bash
sudo docker stop cloudsynk-emqxmqtt-broker
sudo docker rm cloudsynk-emqxmqtt-broker

sudo docker run -d --name cloudsynk-emqxmqtt-broker \
  --restart always \
  -p 1883:1883 \
  -p 8883:8883 \
  -p 18083:18083 \
  -v /opt/emqx-certs:/opt/emqx/etc/certs/custom:ro \
  -e EMQX_LISTENERS__SSL__DEFAULT__BIND=8883 \
  -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CERTFILE=/opt/emqx/etc/certs/custom/server.crt \
  -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__KEYFILE=/opt/emqx/etc/certs/custom/server.key \
  -e EMQX_LISTENERS__SSL__DEFAULT__SSL_OPTIONS__CACERTFILE=/opt/emqx/etc/certs/custom/ca.crt \
  emqx/emqx:latest
```

#### Device / client configuration:

Devices must either:
- **Import `ca.crt`** as a trusted CA (preferred — download from VM and distribute to clients)
- **Skip verification** (`rejectUnauthorized: false` / `--no-verify`) — encrypts traffic but doesn't prevent MITM

To download the CA cert for distribution:
```bash
scp -i ~/Downloads/vm-cloudsynk-emqx_key.pem \
  mqttvm@20.198.101.175:/opt/emqx-certs/ca.crt \
  ./cloudsynk-ca.crt
```

> **When to move away from this:** As soon as you have a domain, switch to Option A (Let's Encrypt). Self-signed CAs require manual trust distribution to every client, which doesn't scale.

---

### 2.6 Lock Down Plain MQTT (Port 1883)

Regardless of which certificate option you chose, port 1883 must **not** be accessible externally in production.

Update Azure NSG rules (`vm-cloudsynk-emqx-nsg`):

| Priority | Name | Port | Source | Action |
|----------|------|------|--------|--------|
| 1010 | MQTT-Plain-Local | 1883 | 127.0.0.1 | **Allow** |
| 1011 | MQTT-Plain-Deny | 1883 | Any | **Deny** |
| 1020 | MQTT-TLS | 8883 | Any | **Allow** |
| 1030 | EMQX-Dashboard | 18083 | Your IP only | **Allow** |

> **Note:** The current NSG has priority 1010 allowing port 1883 from Any. Change this to 127.0.0.1 only, and add a deny rule to block external access.

### 2.7 Production Server Environment

Update the backend `server/.env` on your production deployment:

```env
MQTT_BROKER_HOST=mqtt.cloudsynk.net
MQTT_BROKER_PORT=8883
MQTT_BROKER_TLS=true
MQTT_REJECT_UNAUTHORIZED=true
```

- `MQTT_REJECT_UNAUTHORIZED=true` ensures the Node.js MQTT client validates the certificate chain. This is critical — without it, a man-in-the-middle could present a fake cert.
- For **Option C (self-signed)**, set `MQTT_REJECT_UNAUTHORIZED=false` or configure the Node.js app to trust your custom CA.

### 2.8 Device Firmware Requirements

Production devices must:
- Connect to `mqtt.cloudsynk.net:8883` (Option A/B) or `20.198.101.175:8883` (Option C) using TLS
- **Not** set `rejectUnauthorized: false` when using a real certificate (Option A/B)
- Handle TLS handshake failures gracefully (retry with backoff)
- For Option C: bundle `ca.crt` in firmware or skip verification

### 2.9 Quick Reference — Which Option Should I Use?

```
Do you have a domain name?
  ├─ YES → Use Option A (Let's Encrypt) ✓ recommended
  └─ NO
      ├─ Using Azure App Gateway / Front Door?
      │   └─ YES → Use Option B (Azure-Managed)
      └─ NO → Use Option C (Self-Signed CA) for now
               → Get a domain and switch to Option A later
```

---

## Verification Checklist

### Local

- [ ] `openssl s_client -connect localhost:8883 -brief` completes handshake
- [ ] Server logs show MQTT service connected (no errors) with `MQTT_BROKER_TLS=true`
- [ ] Simulator connects with `--tls --no-verify` and completes Phase 1 + Phase 2
- [ ] MQTTX connects on port 8883 with SSL/TLS enabled

### Production

- [ ] `openssl s_client -connect mqtt.cloudsynk.net:8883 -brief` shows valid cert chain
- [ ] Port 1883 is **not** reachable from external network (`nmap -p 1883 20.198.101.175`)
- [ ] Port 8883 is reachable and completes TLS handshake
- [ ] Server connects to EMQX via TLS with `MQTT_REJECT_UNAUTHORIZED=true`
- [ ] Device simulator connects with `--tls` (no `--no-verify`) to production broker
- [ ] Let's Encrypt auto-renewal cron is active (`sudo certbot renew --dry-run`)

---

## How the Code Handles TLS

No code changes are needed — TLS support is already built in:

| Component | TLS Logic | File |
|-----------|-----------|------|
| MQTT Publisher | `protocol: useTls ? 'mqtts' : 'mqtt'` | `server/services/mqttService.js` |
| MQTT Listener | `protocol: MQTT_BROKER_TLS === 'true' ? 'mqtts' : 'mqtt'` | `server/services/mqttListenerService.js` |
| Device Simulator | `--tls` flag switches protocol; `--no-verify` skips cert check | `server/simulator/device-simulator.js` |
| Test Script | Reads `MQTT_BROKER_TLS` and `MQTT_REJECT_UNAUTHORIZED` from env | `server/test_mqtt_activation.js` |

The switch is entirely driven by environment variables — flip `MQTT_BROKER_TLS=true` and set the port to `8883`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ECONNREFUSED` on 8883 | TLS listener not started | Check EMQX dashboard > Listeners for `ssl:default` |
| `DEPTH_ZERO_SELF_SIGNED_CERT` | Self-signed cert with verification on | Use `--no-verify` (local) or get a real cert (prod) |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | Missing CA in chain | Mount `ca.crt` and set `cacertfile` in EMQX config |
| Simulator connects but server doesn't | Server still on port 1883 | Update `server/.env` to port 8883 + TLS=true |
| Let's Encrypt renewal fails | Port 80 blocked or EMQX using it | Use DNS challenge or stop EMQX briefly for HTTP challenge |
