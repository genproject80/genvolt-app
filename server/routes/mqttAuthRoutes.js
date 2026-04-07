/**
 * MQTT Auth & ACL hooks — called by EMQX, NOT by the frontend.
 *
 * POST /api/mqtt/auth  → EMQX calls this on every device connection attempt
 * POST /api/mqtt/acl   → EMQX calls this before every publish/subscribe
 *
 * No JWT auth middleware here — these endpoints are internal, called by EMQX only.
 * In production, restrict via IP allowlist (NSG / firewall rule).
 *
 * Pre-activation devices connect with username=<IMEI> and password=PRE_ACTIVATION_SECRET.
 * Active devices connect with username=<device_id> and password=<mqtt_password>.
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
  (process.env.EMQX_VM_IP || '').split(',').map(s => s.trim()).filter(Boolean)
);

function requireEmqxIp(req, res, next) {
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp = forwarded ? forwarded.split(',')[0].trim() : req.ip;
  const clientIp = rawIp.replace(/:\d+$/, '');
  if (!EMQX_ALLOWED_IPS.has(clientIp)) {
    logger.warn(`MQTT auth endpoint blocked: unexpected source IP ${clientIp}`);
    return res.status(403).json({ result: 'deny', reason: 'Forbidden' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Service accounts are authenticated by EMQX built-in database — they should
// never reach this HTTP hook. If they do, return ignore so EMQX falls back to
// the built-in database check.
const SERVICE_ACCOUNTS = new Set(
  [
    process.env.MQTT_BACKEND_USER,
    ...(process.env.MQTT_SERVICE_ACCOUNTS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  ].filter(Boolean)
);

// IMEI format: exactly 15 decimal digits
const IMEI_RE = /^\d{15}$/;

// Shared firmware secret for pre-activation connections (username=IMEI).
const PRE_ACTIVATION_SECRET = process.env.PRE_ACTIVATION_SECRET || '';

// ---------------------------------------------------------------------------
// POST /api/mqtt/auth
// EMQX sends: { clientid, username, password }
// Returns:    { result: 'allow' } or { result: 'deny' }
// ---------------------------------------------------------------------------
router.post('/mqtt/auth', requireEmqxIp, async (req, res) => {
  const { username, password } = req.body;
  logger.info(`MQTT auth attempt: username=${username}, hasPassword=${!!password}`);

  if (!username) {
    return res.status(400).json({ result: 'deny', reason: 'Missing username' });
  }

  // Service accounts use EMQX built-in auth — pass through
  if (SERVICE_ACCOUNTS.has(username)) {
    return res.json({ result: 'ignore' });
  }

  try {
    const pool = await getPool();

    // Pre-activation: device connects with IMEI as username and shared firmware secret
    if (IMEI_RE.test(username)) {
      if (!PRE_ACTIVATION_SECRET || password !== PRE_ACTIVATION_SECRET) {
        return res.status(401).json({ result: 'deny', reason: 'Invalid pre-activation secret' });
      }

      // Allow only if device is not yet active (new, PENDING, or INACTIVE after deactivation)
      const imeiCheck = await pool.request()
        .input('imei', sql.NVarChar, username)
        .query(`SELECT activation_status FROM dbo.device WHERE imei = @imei`);

      if (imeiCheck.recordset.length > 0) {
        const status = imeiCheck.recordset[0].activation_status;
        if (status === 'ACTIVE') {
          return res.status(403).json({ result: 'deny', reason: 'Device already active — use device credentials' });
        }
        if (status === 'INACTIVE') {
          return res.status(403).json({ result: 'deny', reason: 'Device deactivated — contact administrator' });
        }
      }
      // Not found (brand new) or PENDING — allow pre-activation connection
      return res.json({ result: 'allow', is_superuser: false });
    }

    // Post-activation: device connects with device_id as username and bcrypt-hashed password
    const result = await pool.request()
      .input('deviceId', sql.NVarChar, username)
      .query(`
        SELECT activation_status, mqtt_password, mqtt_password_plain
        FROM dbo.device
        WHERE device_id = @deviceId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ result: 'deny', reason: 'Device not found' });
    }

    const device = result.recordset[0];

    if (device.activation_status !== 'ACTIVE') {
      return res.status(403).json({ result: 'deny', reason: 'Device not active' });
    }

    if (!device.mqtt_password || !password) {
      return res.status(401).json({ result: 'deny', reason: 'Missing credentials' });
    }

    const valid = await bcrypt.compare(password, device.mqtt_password);
    if (!valid) {
      // Diagnostic: check if stored plain password matches the hash (to detect DB sync issues)
      const plainMatchesHash = device.mqtt_password_plain
        ? await bcrypt.compare(device.mqtt_password_plain, device.mqtt_password)
        : null;
      logger.warn(`MQTT auth FAILED for ${username}: password mismatch | hashLen=${device.mqtt_password?.length} | plainInDB=${!!device.mqtt_password_plain} | plainMatchesHash=${plainMatchesHash} | deviceSentSameAsPlain=${password === device.mqtt_password_plain}`);
    }
    return valid
      ? res.json({ result: 'allow', is_superuser: false })
      : res.status(401).json({ result: 'deny', reason: 'Invalid password' });

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

// In-process device cache to avoid DB round-trip per message.
// Keyed by mqtt_username (device_id). Stores { imei, activation_status, data_enabled }.
const DEVICE_CACHE_TTL_MS = 30_000;
const deviceCache = new Map();

async function getCachedDevice(username) {
  const now = Date.now();
  const cached = deviceCache.get(username);
  if (cached && cached.expiresAt > now) return cached.device;

  const pool = await getPool();
  const result = await pool.request()
    .input('deviceId', sql.NVarChar, username)
    .query(`
      SELECT activation_status, imei, data_enabled
      FROM dbo.device
      WHERE device_id = @deviceId
    `);

  const device = result.recordset.length > 0 ? result.recordset[0] : null;
  deviceCache.set(username, { device, expiresAt: now + DEVICE_CACHE_TTL_MS });
  return device;
}

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

  // Pre-activation IMEI connection: restrict to own config subscribe + pre-activation publish
  if (IMEI_RE.test(username)) {
    if (action === 'subscribe' && topic === `cloudsynk/${username}/config`) {
      return res.json({ result: 'allow' });
    }
    if (action === 'publish' && topic === 'cloudsynk/pre-activation') {
      return res.json({ result: 'allow' });
    }
    return res.json({ result: 'deny', reason: 'Topic not allowed for pre-activation device' });
  }

  try {
    const device = await getCachedDevice(username);

    if (!device) {
      return res.json({ result: 'deny', reason: 'Device not found' });
    }

    // Only ACTIVE devices may publish/subscribe via device credentials
    if (device.activation_status !== 'ACTIVE') {
      return res.json({ result: 'deny', reason: 'Device not active' });
    }

    if (!device.imei) {
      return res.json({ result: 'deny', reason: 'Device has no IMEI' });
    }

    const telemetryTopic = `cloudsynk/${device.imei}/telemetry`;
    const configTopic    = `cloudsynk/${device.imei}/config`;

    // Config subscribe: always allowed so device can receive telemetryConfig and config_update
    if (action === 'subscribe' && topic === configTopic) {
      return res.json({ result: 'allow' });
    }

    // Telemetry publish: blocked when data_enabled = 0 (device paused)
    if (action === 'publish' && topic === telemetryTopic) {
      const dataEnabled = device.data_enabled !== false && device.data_enabled !== 0;
      return dataEnabled
        ? res.json({ result: 'allow' })
        : res.json({ result: 'deny', reason: 'Device data collection paused' });
    }

    return res.json({ result: 'deny', reason: 'Topic not allowed for this device' });

  } catch (err) {
    logger.error('MQTT ACL error:', err);
    res.status(500).json({ result: 'deny', reason: 'Internal error' });
  }
});

export default router;
