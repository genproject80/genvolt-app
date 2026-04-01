import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  getAllTopicConfigs,
  getClientTopicConfig,
  saveClientTopicConfig,
  resetTopicConfig,
} from '../controllers/topicConfigController.js';

const router = express.Router();

router.use(authenticate);
router.use(requirePermission('Manage Topic Config'));

router.get('/',             getAllTopicConfigs);
router.get('/:clientId',    getClientTopicConfig);
router.put('/:clientId',    saveClientTopicConfig);
router.delete('/:clientId', resetTopicConfig);

export default router;
