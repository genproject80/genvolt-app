import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getAllInventory,
  getActiveInventory,
  getInventoryByModelNumber,
  getNextDeviceId,
  createInventory,
  updateInventory,
  deactivateInventory,
} from '../controllers/inventoryController.js';
import { asyncHandler, AuthorizationError } from '../middleware/errorHandler.js';

const router = express.Router();

router.use(authenticate);

// Middleware: restrict write operations to SUPER_ADMIN and SYSTEM_ADMIN only
const requireAdmin = asyncHandler(async (req, res, next) => {
  const role = req.user?.role_name || req.user?.role;
  if (!['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
    throw new AuthorizationError('Inventory management requires admin privileges');
  }
  next();
});

// GET /api/inventory/active  — active entries (for device form dropdowns, any authenticated user)
router.get('/active', getActiveInventory);

// GET /api/inventory/:modelNumber/next-device-id — preview next device ID (any authenticated user)
router.get('/:modelNumber/next-device-id', getNextDeviceId);

// All remaining routes are admin-only
router.get('/',                    requireAdmin, getAllInventory);
router.get('/:modelNumber',        requireAdmin, getInventoryByModelNumber);
router.post('/',                   requireAdmin, createInventory);
router.put('/:modelNumber',        requireAdmin, updateInventory);
router.delete('/:modelNumber',     requireAdmin, deactivateInventory);

export default router;
