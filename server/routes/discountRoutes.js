import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  getDiscountHistory,
  getActiveDiscount,
  createDiscount,
  deleteDiscount,
} from '../controllers/discountController.js';

const router = express.Router();

router.use(authenticate);
router.use(requirePermission('Manage Discounts'));

// IMPORTANT: /active must come before /:clientId to avoid "active" being parsed as clientId
router.get('/:clientId/active', getActiveDiscount);
router.get('/:clientId',        getDiscountHistory);
router.post('/',                createDiscount);
router.delete('/:id',           deleteDiscount);

export default router;
