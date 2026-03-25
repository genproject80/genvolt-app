"""
CloudSynk MQTT Local Subscriber (FIXED - Production Ready)
"""

import json
import logging
import os
import sys
import time
import threading
from queue import Queue

import paho.mqtt.client as mqtt
import pymssql
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("cloudsynk-subscriber")

# ─────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────
MQTT_BROKER   = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT     = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER     = os.getenv("MQTT_USER", "local_subscriber")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_CLIENT_ID = "cloudsynk-subscriber-prod"

DB_SERVER   = os.getenv("DB_SERVER")
DB_NAME     = os.getenv("DB_NAME")
DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

PREACTIVATION_TOPIC = "cloudsynk/pre-activation"
TELEMETRY_TOPIC     = "cloudsynk/+/+/telemetry"

# ─────────────────────────────────────────────
# Queue (decouples MQTT from DB)
# ─────────────────────────────────────────────
db_queue = Queue(maxsize=2000)

# ─────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────
def get_db_connection():
    return pymssql.connect(
        server=DB_SERVER,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )

# ─────────────────────────────────────────────
# Decoder (stub)
# ─────────────────────────────────────────────
def decode_payload(device_id: str, raw_data: str) -> dict:
    return {"raw": raw_data, "decoded": False}

# ─────────────────────────────────────────────
# DB Worker (IMPORTANT)
# ─────────────────────────────────────────────
def db_worker():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("USE cs_db_dev")

    log.info("DB worker started")

    while True:
        task = db_queue.get()
        try:
            if task["type"] == "pre":
                cursor.execute("""
                    IF EXISTS (SELECT 1 FROM dbo.device WHERE device_id = %s)
                        UPDATE dbo.device
                        SET last_seen = GETUTCDATE()
                        WHERE device_id = %s
                    ELSE
                        INSERT INTO dbo.device (
                            id, device_id, device_type, firmware_version, mac_address,
                            activation_status, first_seen, last_seen
                        )
                        VALUES (
                            NEXT VALUE FOR dbo.device_id_seq,
                            %s, %s, %s, %s,
                            'PENDING',
                            GETUTCDATE(),
                            GETUTCDATE()
                        )
                """, task["params"])

            elif task["type"] == "telemetry":
                cursor.execute("""
                    INSERT INTO IoT_Raw_Messages (device_id, client_id, raw_payload, timestamp)
                    VALUES (%s, %s, %s, GETUTCDATE())
                """, task["raw"])

                if task["decoded"].get("decoded"):
                    cursor.execute("""
                        INSERT INTO IoT_Data_Sick (device_id, client_id, timestamp, raw_payload)
                        VALUES (%s, %s, GETUTCDATE(), %s)
                    """, task["decoded_row"])

            conn.commit()

        except Exception as e:
            log.error(f"DB worker error: {e}")

        finally:
            db_queue.task_done()

# ─────────────────────────────────────────────
# Handlers (NON-BLOCKING)
# ─────────────────────────────────────────────
def handle_pre_activation(payload_str: str):
    try:
        payload = json.loads(payload_str)
    except:
        return

    device_id = payload.get("device_id")
    if not device_id:
        return

    db_queue.put({
        "type": "pre",
        "params": (
            device_id,
            device_id,
            device_id,
            payload.get("device_type"),
            payload.get("firmware_version"),
            payload.get("mac_address"),
        )
    })


def handle_telemetry(client_id: str, device_id: str, payload_str: str):
    try:
        payload = json.loads(payload_str)
    except:
        return

    raw_data = payload.get("data", "")
    decoded  = decode_payload(device_id, raw_data)

    db_queue.put({
        "type": "telemetry",
        "raw": (device_id, client_id, payload_str),
        "decoded": decoded,
        "decoded_row": (device_id, client_id, json.dumps(decoded))
    })

# ─────────────────────────────────────────────
# MQTT callbacks
# ─────────────────────────────────────────────
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        log.info(f"Connected to EMQX at {MQTT_BROKER}:{MQTT_PORT}")
        client.subscribe(PREACTIVATION_TOPIC, qos=1)
        client.subscribe(TELEMETRY_TOPIC, qos=1)
    else:
        log.error(f"MQTT connect failed: {rc}")


def on_disconnect(client, userdata, rc):
    if rc != 0:
        log.warning(f"Unexpected MQTT disconnect (rc={rc})")


def on_message(client, userdata, message):
    topic   = message.topic
    payload = message.payload.decode("utf-8", errors="replace")

    if topic == PREACTIVATION_TOPIC:
        handle_pre_activation(payload)
        return

    parts = topic.split("/")
    if len(parts) == 4 and parts[3] == "telemetry":
        handle_telemetry(parts[1], parts[2], payload)

# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────
def main():
    log.info("Starting CloudSynk MQTT subscriber...")

    # Start DB worker thread
    threading.Thread(target=db_worker, daemon=True).start()

    client = mqtt.Client(client_id=MQTT_CLIENT_ID, clean_session=False)
    client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

    client.on_connect    = on_connect
    client.on_disconnect = on_disconnect
    client.on_message    = on_message

    client.reconnect_delay_set(min_delay=1, max_delay=30)

    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()

    while True:
        time.sleep(1)


if __name__ == "__main__":
    main()