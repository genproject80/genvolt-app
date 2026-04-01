import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { sanitizeInput, validatePagination } from '../middleware/validation.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  createDeviceValidation,
  updateDeviceValidation,
  transferDeviceValidation,
  validateDeviceId,
  validateDeviceStringId,
  validateDeviceFilters
} from '../middleware/deviceValidation.js';
import {
  getDevices,
  getDeviceById,
  createDevice,
  updateDevice,
  deleteDevice,
  transferDevice,
  getDeviceTransferHistory,
  getDeviceStats,
  getPendingDevices,
  activateDevice,
  deactivateDevice,
  reactivateDevice,
  pauseDeviceHandler,
  resumeDeviceHandler,
  pauseAllDevicesHandler,
  resumeAllDevicesHandler,
  pushDeviceConfig,
  rotateDeviceCredentials,
  getDeviceTelemetry,
  getLatestTelemetry,
} from '../controllers/deviceController.js';

const router = express.Router();

// Apply authentication to all device routes
router.use(authenticate);

/**
 * POST /api/devices/pause-all
 * Pause all active devices for a client
 */
router.post('/pause-all',
  requirePermission('Pause Resume Devices'),
  pauseAllDevicesHandler
);

/**
 * POST /api/devices/resume-all
 * Resume all paused devices for a client
 */
router.post('/resume-all',
  requirePermission('Pause Resume Devices'),
  resumeAllDevicesHandler
);

/**
 * GET /api/devices/stats
 * Get device statistics (requires View Device permission)
 */
router.get('/stats',
  requirePermission('View Device'),
  getDeviceStats
);

/**
 * GET /api/devices/pending
 * List PENDING devices waiting for admin activation
 */
router.get('/pending',
  requirePermission('Onboard Device'),
  getPendingDevices
);

/**
 * POST /api/devices/:deviceId/activate
 * Assign PENDING device to a client and activate it
 * Body: { client_id, initial_config? }
 */
router.post('/:deviceId/activate',
  requirePermission('Onboard Device'),
  validateDeviceStringId,
  activateDevice
);

/**
 * POST /api/devices/:deviceId/deactivate
 * Deactivate an ACTIVE device
 * Body: { reason? }
 */
router.post('/:deviceId/deactivate',
  requirePermission('Edit Device'),
  validateDeviceStringId,
  deactivateDevice
);

/**
 * POST /api/devices/:deviceId/reactivate
 * Re-activate an INACTIVE device
 */
router.post('/:deviceId/reactivate',
  requirePermission('Onboard Device'),
  validateDeviceStringId,
  reactivateDevice
);

/**
 * POST /api/devices/:deviceId/pause
 * Pause a single device (client-initiated)
 */
router.post('/:deviceId/pause',
  requirePermission('Pause Resume Devices'),
  validateDeviceStringId,
  pauseDeviceHandler
);

/**
 * POST /api/devices/:deviceId/resume
 * Resume a paused device
 */
router.post('/:deviceId/resume',
  requirePermission('Pause Resume Devices'),
  validateDeviceStringId,
  resumeDeviceHandler
);

/**
 * GET /api/devices
 * Get all devices (requires View Device permission)
 */
router.get('/',
  requirePermission('View Device'),
  validateDeviceFilters,
  sanitizeInput,
  getDevices
);

/**
 * GET /api/devices/:deviceId
 * Get device by ID (requires View Device permission)
 */
router.get('/:deviceId',
  requirePermission('View Device'),
  validateDeviceId,
  getDeviceById
);

/**
 * POST /api/devices
 * Create new device (requires Onboard Device permission)
 */
router.post('/',
  requirePermission('Onboard Device'),
  createDeviceValidation,
  sanitizeInput,
  createDevice
);

/**
 * PUT /api/devices/:deviceId
 * Update device (requires Edit Device permission)
 */
router.put('/:deviceId',
  requirePermission('Edit Device'),
  updateDeviceValidation,
  sanitizeInput,
  updateDevice
);

/**
 * POST /api/devices/:deviceId/transfer
 * Transfer device to another client (requires Transfer Device permission)
 */
router.post('/:deviceId/transfer',
  requirePermission('Transfer Device'),
  transferDeviceValidation,
  sanitizeInput,
  transferDevice
);

/**
 * GET /api/devices/:deviceId/telemetry/latest
 * Most recent decoded record per logicId
 */
router.get('/:deviceId/telemetry/latest',
  requirePermission('View Device'),
  validateDeviceStringId,
  getLatestTelemetry
);

/**
 * GET /api/devices/:deviceId/telemetry
 * Paginated telemetry records. Query: { page?, limit?, logicId? }
 */
router.get('/:deviceId/telemetry',
  requirePermission('View Device'),
  validateDeviceStringId,
  getDeviceTelemetry
);

/**
 * POST /api/devices/:deviceId/config-push
 * Push config_update to an ACTIVE device via MQTT
 */
router.post('/:deviceId/config-push',
  requirePermission('Edit Device'),
  validateDeviceStringId,
  pushDeviceConfig
);

/**
 * POST /api/devices/:deviceId/rotate-credentials
 * Rotate MQTT credentials and push new telemetryConfig to device
 */
router.post('/:deviceId/rotate-credentials',
  requirePermission('Edit Device'),
  validateDeviceStringId,
  rotateDeviceCredentials
);

/**
 * GET /api/devices/:deviceId/history
 * Get device transfer history (requires View Device permission)
 */
router.get('/:deviceId/history',
  requirePermission('View Device'),
  validateDeviceId,
  getDeviceTransferHistory
);

/**
 * DELETE /api/devices/:deviceId
 * Delete device (requires Remove Device permission)
 */
router.delete('/:deviceId',
  requirePermission('Remove Device'),
  validateDeviceId,
  deleteDevice
);

export default router;
