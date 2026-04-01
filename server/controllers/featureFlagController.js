import { FeatureFlag } from '../models/FeatureFlag.js';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// GET /api/feature-flags
// All authenticated users — returns all flags (used by frontend context)
// ---------------------------------------------------------------------------
export const getAllFlags = asyncHandler(async (req, res) => {
  const flags = await FeatureFlag.findAll();
  res.json({ success: true, data: flags.map(f => f.toJSON()) });
});

// ---------------------------------------------------------------------------
// PUT /api/feature-flags/:id
// Admin only — toggle a flag on or off
// ---------------------------------------------------------------------------
export const updateFlag = asyncHandler(async (req, res) => {
  const flagId = parseInt(req.params.id);
  if (isNaN(flagId)) throw new ValidationError('Invalid flag id');

  const flag = await FeatureFlag.findById(flagId);
  if (!flag) throw new NotFoundError('Feature flag not found');

  const { is_enabled } = req.body;
  if (is_enabled === undefined) throw new ValidationError('is_enabled is required');

  const updated = await FeatureFlag.update(flagId, is_enabled, req.user.user_id);
  res.json({ success: true, data: updated.toJSON() });
});
