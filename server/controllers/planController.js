import { SubscriptionPlan } from '../models/SubscriptionPlan.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// GET /api/subscription-plans
// Admin — all plans including inactive
// ---------------------------------------------------------------------------
export const getAllPlansAdmin = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.findAllAdmin();
  res.json({ success: true, data: plans.map(p => p.toJSON()) });
});

// ---------------------------------------------------------------------------
// POST /api/subscription-plans
// Create a new plan
// ---------------------------------------------------------------------------
export const createPlan = asyncHandler(async (req, res) => {
  const { name, description, max_devices, price_monthly, price_yearly,
          grace_days, features, razorpay_plan_id_monthly, razorpay_plan_id_yearly } = req.body;

  if (!name) throw new ValidationError('name is required');
  if (price_monthly === undefined) throw new ValidationError('price_monthly is required');
  if (price_yearly === undefined) throw new ValidationError('price_yearly is required');

  const plan = await SubscriptionPlan.create({
    name,
    description,
    max_devices: max_devices ?? -1,
    price_monthly,
    price_yearly,
    grace_days:  grace_days ?? 7,
    features:    features   ?? [],
    razorpay_plan_id_monthly,
    razorpay_plan_id_yearly,
  }, req.user.user_id);

  res.status(201).json({ success: true, data: plan.toJSON() });
});

// ---------------------------------------------------------------------------
// PUT /api/subscription-plans/:id
// Update plan fields
// ---------------------------------------------------------------------------
export const updatePlan = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.id);
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) throw new NotFoundError('Plan not found');

  const updated = await SubscriptionPlan.update(planId, req.body, req.user.user_id);
  res.json({ success: true, data: updated.toJSON() });
});

// ---------------------------------------------------------------------------
// DELETE /api/subscription-plans/:id
// Soft-delete (archive) a plan
// ---------------------------------------------------------------------------
export const deactivatePlan = asyncHandler(async (req, res) => {
  const planId = parseInt(req.params.id);
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) throw new NotFoundError('Plan not found');

  const hasActive = await SubscriptionPlan.hasActiveSubscriptions(planId);
  if (hasActive) {
    // Archive is fine but warn the caller
    const archived = await SubscriptionPlan.deactivate(planId, req.user.user_id);
    return res.json({
      success: true,
      data: archived.toJSON(),
      warning: 'Plan has active subscriptions. It has been archived — existing subscriptions continue normally.',
    });
  }

  const archived = await SubscriptionPlan.deactivate(planId, req.user.user_id);
  res.json({ success: true, data: archived.toJSON() });
});
