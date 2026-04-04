import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { getAllFlags, updateFlag } from '../controllers/featureFlagController.js';

const router = express.Router();

// All authenticated users can read flags (needed for frontend context on load)
router.get('/', authenticate, getAllFlags);

// Only SUPER_ADMIN / SYSTEM_ADMIN may toggle flags
router.put('/:id', authenticate, (req, res, next) => {
  const role = req.user?.role_name || req.user?.role;
  if (!['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}, updateFlag);

export default router;
