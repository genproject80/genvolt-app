import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, AuthorizationError } from '../middleware/errorHandler.js';
import { getAuditLogs, getAuditLogStats, ACTIVITY_TYPES } from '../utils/auditLogger.js';

const router = express.Router();

router.use(authenticate);

const requireAdmin = asyncHandler(async (req, res, next) => {
  const role = req.user?.role_name || req.user?.role;
  if (!['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(role)) {
    throw new AuthorizationError('Audit log access requires admin privileges');
  }
  next();
});

// GET /api/audit-logs — paginated audit logs with optional filters
router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    sortBy = 'created_at',
    sortOrder = 'desc',
    user_id,
    activity_type,
    action,
    target_type,
    start_date,
    end_date,
  } = req.query;

  const filters = {};
  if (user_id) filters.user_id = parseInt(user_id, 10);
  if (activity_type) filters.activity_type = activity_type;
  if (action) filters.action = action;
  if (target_type) filters.target_type = target_type;
  if (start_date) filters.start_date = new Date(start_date);
  if (end_date) filters.end_date = new Date(end_date);

  const result = await getAuditLogs(
    filters,
    parseInt(page, 10),
    Math.min(parseInt(limit, 10), 200),
    sortBy,
    sortOrder
  );

  res.json({ success: true, ...result });
}));

// GET /api/audit-logs/stats — summary stats
router.get('/stats', requireAdmin, asyncHandler(async (req, res) => {
  const { activity_type, start_date, end_date } = req.query;
  const filters = {};
  if (activity_type) filters.activity_type = activity_type;
  if (start_date) filters.start_date = new Date(start_date);
  if (end_date) filters.end_date = new Date(end_date);

  const stats = await getAuditLogStats(filters);
  res.json({ success: true, data: stats });
}));

// GET /api/audit-logs/activity-types — enum values for filter dropdowns
router.get('/activity-types', requireAdmin, asyncHandler(async (_req, res) => {
  res.json({ success: true, data: Object.values(ACTIVITY_TYPES) });
}));

export default router;
