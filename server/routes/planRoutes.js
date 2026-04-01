import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import { getAllPlansAdmin, createPlan, updatePlan, deactivatePlan } from '../controllers/planController.js';

const router = express.Router();

router.use(authenticate);
router.use(requirePermission('Manage Plans'));

router.get('/',     getAllPlansAdmin);
router.post('/',    createPlan);
router.put('/:id',  updatePlan);
router.delete('/:id', deactivatePlan);

export default router;
