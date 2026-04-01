# Local Development Setup

## Prerequisites

- Node.js 18+
- SQL Server (local instance or Docker)
- EMQX broker running locally (Docker recommended)
- Git

---

## 1. Clone & Install

```bash
git clone <repo-url>
cd genvolt-app

# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

---

## 2. Database

Run the consolidated migration (idempotent — safe to re-run):

```bash
sqlcmd -S localhost -U sa -P <your-password> -i scripts/migrate_consolidated.sql
```

---

## 3. EMQX Broker (Docker)

```bash
docker run -d --name emqx-local \
  --restart always \
  -p 1883:1883 \
  -p 18083:18083 \
  emqx/emqx:latest
```

Dashboard: `http://localhost:18083` — default login `admin` / `public`

Add a built-in database user: `backend_publisher` with password `mqtt@cloudsynk`.

---

## 4. Server Environment Variables

Create `server/.env` with the following:

```env
# Database
DB_SERVER=localhost
DB_PORT=1433
DB_DATABASE=cs_main
DB_USER=sa
DB_PASSWORD=ghost@123
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true

# Auth / JWT
JWT_SECRET=abcdefghigh
JWT_REFRESH_SECRET=0987654321

# MQTT Broker
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
MQTT_BROKER_TLS=false
MQTT_BACKEND_USER=backend_publisher
MQTT_BACKEND_PASSWORD=mqtt@cloudsynk

# Pre-activation firmware secret
PRE_ACTIVATION_SECRET=dev-secret-123

# EMQX Management API
EMQX_MGMT_API_URL=http://localhost:18083/api/v5
EMQX_MGMT_API_KEY=

# EMQX IP allowlist (localhost variants for local dev)
EMQX_VM_IP=::ffff:127.0.0.1,127.0.0.1,::1

# Razorpay (payments feature flag is off by default — placeholder values are fine)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=rzp_test_xxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=rzp_test_xxxxxxxxxxxxxxxx
```

> **Note:** `JWT_SECRET` and `JWT_REFRESH_SECRET` above are dev-only placeholders. Never use short or guessable secrets in production — generate with `openssl rand -hex 64`.

---

## 5. Client Environment Variables

`client/.env` is already configured for local dev (Vite proxy to `localhost:5001`). No changes needed.

---

## 6. Start the Server

```bash
cd server
npm run dev
# API available at http://localhost:5001
```

---

## 7. Start the Frontend

```bash
cd client
npm run dev
# App available at http://localhost:3008
```

---

## 8. Device Simulator

The simulator lives at `server/simulator/device-simulator.js`. It reads `PRE_ACTIVATION_SECRET` from the environment (or via `--pre-pass` flag).

### Environment

```env
PRE_ACTIVATION_SECRET=dev-secret-123
```

### Usage

```bash
cd server

# Basic — simulates a GV-M1 device with a test IMEI
node simulator/device-simulator.js \
  --imei 123456789012345 \
  --model-number GV-M1

# With options
node simulator/device-simulator.js \
  --imei 123456789012345 \
  --model-number GV-M1 \
  --host 127.0.0.1 \
  --port 1883 \
  --interval 5000 \
  --count 10
```

### All Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--imei` | — | **Required.** 15-digit device IMEI |
| `--model-number` | — | **Required.** e.g. `GV-M1`, `GV-ENV1`, `EV-M1` |
| `--host` | `127.0.0.1` | MQTT broker host |
| `--port` | `1883` | MQTT broker port |
| `--tls` | `false` | Use MQTTS |
| `--no-verify` | `false` | Skip TLS cert check (dev only) |
| `--pre-pass` | `PRE_ACTIVATION_SECRET` env | Pre-activation password |
| `--interval` | `10000` | Telemetry publish interval (ms) |
| `--count` | `0` (unlimited) | Number of telemetry rounds |
| `--device-id` | — | Override device_id in payload |

### Available Model Numbers

| Model | Decoder | Description |
|-------|---------|-------------|
| `GV-M1` | logicId 1 | Energy meter v1 |
| `GV-M2` | logicId 4 | Energy meter v2 |
| `GV-ENV1` | logicId 2 | Temperature / humidity sensor |
| `GV-GPS1` | logicId 3 | GPS tracker |
| `GV-PRO1` | logicId 5 | Energy + environment |
| `GV-FLT1` | logicId 6 | Energy + GPS (fleet) |
| `EV-M1` | logicId 7 | EV charger meter |
| `GV-ULTRA1` | logicId 8 | All sensors combined |

### Simulator Flow

1. Connects to EMQX with `username=<IMEI>`, `password=<PRE_ACTIVATION_SECRET>`
2. Publishes `{"IMEI":"...","model_number":"..."}` to `cloudsynk/pre-activation`
3. Waits for a `telemetryConfig` message on `cloudsynk/<IMEI>/config`
4. Reconnects with `mqtt_username` / `mqtt_password` from the config payload
5. Publishes telemetry to `cloudsynk/<IMEI>/telemetry` at the specified interval

Activate the device via **Admin UI → Pending Devices** after step 2 to unblock step 3.
