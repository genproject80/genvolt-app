/**
 * MQTT Auth & ACL hooks — called by EMQX, NOT by the frontend.
 *
 * POST /api/mqtt/auth  → EMQX calls this on every device connection attempt
 * POST /api/mqtt/acl   → EMQX calls this before every publish/subscribe
 *
 * No JWT auth middleware here — these endpoints are internal, called by EMQX only.
 * In production, restrict via IP allowlist (NSG / firewall rule).
 */

import express from 'express';
import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// IP allowlist — only the EMQX VM is allowed to call these endpoints.
// Set EMQX_VM_IP in env (comma-separated for multiple IPs).
// Azure App Service puts the real client IP in x-forwarded-for.
const EMQX_ALLOWED_IPS = new Set(
  (process.env.EMQX_VM_IP || '20.198.101.175').split(',').map(s => s.trim())
);

function requireEmqxIp(req, res, next) {
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.ip;
  if (!EMQX_ALLOWED_IPS.has(clientIp)) {
    logger.warn(`MQTT auth endpoint blocked: unexpected source IP ${clientIp}`);
    return res.status(403).json({ result: 'deny', reason: 'Forbidden' });
  }
  next();
}

// ---------------------------------------------------------------------------
// POST /api/mqtt/auth
// EMQX sends: { clientid, username, password }
// Returns:    { result: 'allow' } or { result: 'deny' }
// ---------------------------------------------------------------------------
// Service accounts (backend_publisher, local_subscriber) are authenticated by
// EMQX built-in database — they should never reach this HTTP hook.
// If they do (misconfigured EMQX auth chain order), return deny so they fall
// back to the built-in database check.
const SERVICE_ACCOUNTS = new Set(['backend_publisher', 'local_subscriber']);

router.post('/mqtt/auth', requireEmqxIp, async (req, res) => {
  const { username, password } = req.body;

  if (!username) {
    return res.status(400).json({ result: 'deny', reason: 'Missing username' });
  }

  // Service accounts are not in the device table.
  // Returning "ignore" with 200 tells EMQX to pass to the next authenticator
  // (built-in database), where backend_publisher / local_subscriber live.
  if (SERVICE_ACCOUNTS.has(username)) {
    return res.json({ result: 'ignore' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, username)
      .query(`
        SELECT activation_status, mqtt_password, client_id
        FROM device
        WHERE device_id = @deviceId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ result: 'deny', reason: 'Device not found' });
    }

    const device = result.recordset[0];

    // INACTIVE — always deny
    if (device.activation_status === 'INACTIVE') {
      return res.status(403).json({ result: 'deny', reason: 'Device deactivated' });
    }

    // PENDING — allow connect, ACL will restrict topics
    if (device.activation_status === 'PENDING') {
      return res.json({ result: 'allow', is_superuser: false });
    }

    // ACTIVE — verify bcrypt password
    if (device.activation_status === 'ACTIVE') {
      if (!device.mqtt_password || !password) {
        return res.status(401).json({ result: 'deny', reason: 'Missing credentials' });
      }
      const valid = await bcrypt.compare(password, device.mqtt_password);
      return valid
        ? res.json({ result: 'allow', is_superuser: false })
        : res.status(401).json({ result: 'deny', reason: 'Invalid password' });
    }

    res.status(403).json({ result: 'deny', reason: 'Unknown device state' });

  } catch (err) {
    logger.error('MQTT auth error:', err);
    res.status(500).json({ result: 'deny', reason: 'Internal error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/mqtt/acl
// EMQX sends: { clientid, username, topic, action }   action = publish|subscribe
// Returns:    { result: 'allow' } or { result: 'deny' }
// ---------------------------------------------------------------------------
router.post('/mqtt/acl', requireEmqxIp, async (req, res) => {
  const { username, topic, action } = req.body;

  if (!username) {
    return res.json({ result: 'deny', reason: 'Missing username' });
  }

  // Service accounts get full access — they are trusted internal services
  if (SERVICE_ACCOUNTS.has(username)) {
    return res.json({ result: 'allow' });
  }

  if (!topic || !action) {
    return res.json({ result: 'deny', reason: 'Missing fields' });
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, username)
      .query(`
        SELECT activation_status, client_id
        FROM device
        WHERE device_id = @deviceId
      `);

    if (result.recordset.length === 0) {
      return res.json({ result: 'deny', reason: 'Device not found' });
    }

    const device = result.recordset[0];

    // INACTIVE — deny everything
    if (device.activation_status === 'INACTIVE') {
      return res.json({ result: 'deny', reason: 'Device deactivated' });
    }

    // PENDING — only pre-activation topic allowed
    if (device.activation_status === 'PENDING') {
      if (action === 'publish' && topic === 'cloudsynk/pre-activation') {
        return res.json({ result: 'allow' });
      }
      if (action === 'subscribe' && topic === `cloudsynk/pre-activation/response/${username}`) {
        return res.json({ result: 'allow' });
      }
      return res.json({ result: 'deny', reason: 'Pending device: pre-activation topics only' });
    }

    // ACTIVE — own client/device topics only
    if (device.activation_status === 'ACTIVE') {
      const cid = device.client_id;
      if (action === 'publish' && topic === `cloudsynk/${cid}/${username}/telemetry`) {
        return res.json({ result: 'allow' });
      }
      if (action === 'subscribe' && topic === `cloudsynk/${cid}/${username}/config`) {
        return res.json({ result: 'allow' });
      }
      return res.json({ result: 'deny', reason: 'Topic not allowed for this device' });
    }

    res.json({ result: 'deny', reason: 'Unknown device state' });

  } catch (err) {
    logger.error('MQTT ACL error:', err);
    res.status(500).json({ result: 'deny', reason: 'Internal error' });
  }
});

export default router;
