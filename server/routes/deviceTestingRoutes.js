import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  getAvailableTables,
  getHourlyDashboard,
  getTableStats,
  exportTableData,
  getTableData
} from '../controllers/deviceTestingController.js';

const router = express.Router();

// All routes require authentication + "View Device Testing" permission
router.use(authenticate);
router.use(requirePermission('View Device Testing'));

// IMPORTANT: specific routes before parameterised ones
router.get('/tables', getAvailableTables);
router.get('/dashboard/hourly', getHourlyDashboard);

router.get('/:tableKey/stats', getTableStats);
router.get('/:tableKey/export', exportTableData);
router.get('/:tableKey', getTableData);

export default router;
