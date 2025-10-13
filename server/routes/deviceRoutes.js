import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { sanitizeInput, validatePagination } from '../middleware/validation.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  createDeviceValidation,
  updateDeviceValidation,
  transferDeviceValidation,
  validateDeviceId,
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
  getDeviceStats
} from '../controllers/deviceController.js';

const router = express.Router();

// Apply authentication to all device routes
router.use(authenticate);

/**
 * GET /api/devices/stats
 * Get device statistics (requires View Device permission)
 */
router.get('/stats',
  requirePermission('View Device'),
  getDeviceStats
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
