/**
 * EMQX Management API client.
 *
 * Used to kick active MQTT sessions by username before publishing sensitive
 * payloads (e.g. activation credentials) to prevent a pre-connected attacker
 * from intercepting the message.
 *
 * Requires env vars:
 *   EMQX_MGMT_API_URL  — e.g. http://localhost:18083/api/v5
 *   EMQX_MGMT_API_KEY  — API key from EMQX Dashboard → Management → API Keys
 */

import { logger } from '../utils/logger.js';

const MGMT_URL = (process.env.EMQX_MGMT_API_URL || '').replace(/\/$/, '');
const MGMT_KEY = process.env.EMQX_MGMT_API_KEY || '';

/**
 * Kick all MQTT clients connected with the given username.
 * Fails silently — a logging warning is emitted but the caller is not blocked.
 *
 * @param {string} username  MQTT username to kick (e.g. device IMEI)
 */
export async function kickMqttClientsByUsername(username) {
  if (!MGMT_URL || !MGMT_KEY) {
    logger.warn(`emqxMgmt: EMQX_MGMT_API_URL or EMQX_MGMT_API_KEY not set — skipping session kick for username=${username}`);
    return;
  }

  try {
    // List all connected clients with this username
    const listUrl = `${MGMT_URL}/clients?username=${encodeURIComponent(username)}&limit=100`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${MGMT_KEY}` },
    });

    if (!listRes.ok) {
      logger.warn(`emqxMgmt: failed to list clients for username=${username} — HTTP ${listRes.status}`);
      return;
    }

    const body = await listRes.json();
    const clients = body?.data ?? [];

    if (clients.length === 0) {
      logger.debug(`emqxMgmt: no active session found for username=${username}`);
      return;
    }

    // Kick each client
    await Promise.all(clients.map(async (client) => {
      const kickUrl = `${MGMT_URL}/clients/${encodeURIComponent(client.clientid)}`;
      const kickRes = await fetch(kickUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${MGMT_KEY}` },
      });
      if (kickRes.ok || kickRes.status === 404) {
        logger.info(`emqxMgmt: kicked client clientid=${client.clientid} username=${username}`);
      } else {
        logger.warn(`emqxMgmt: failed to kick clientid=${client.clientid} — HTTP ${kickRes.status}`);
      }
    }));

  } catch (err) {
    logger.warn(`emqxMgmt: error kicking sessions for username=${username} — ${err.message}`);
  }
}
