import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  getAllTableConfigs,
  getTableConfigById,
  createTableConfig,
  updateTableConfig,
  deleteTableConfig,
  toggleTableConfig,
  getAvailableColumns
} from '../controllers/tableConfigController.js';

const router = express.Router();

// All routes require authentication + "Manage Device Testing Tables" permission
router.use(authenticate);
router.use(requirePermission('Manage Device Testing Tables'));

// IMPORTANT: specific routes before parameterised ones
router.get('/introspect/:tableName', getAvailableColumns);

router.get('/', getAllTableConfigs);
router.get('/:configId', getTableConfigById);
router.post('/', createTableConfig);
router.put('/:configId', updateTableConfig);
router.delete('/:configId', deleteTableConfig);
router.patch('/:configId/toggle', toggleTableConfig);

export default router;
