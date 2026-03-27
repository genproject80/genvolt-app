import { SubscriptionPlan }    from '../models/SubscriptionPlan.js';
import { ClientSubscription }  from '../models/ClientSubscription.js';
import { PaymentTransaction }  from '../models/PaymentTransaction.js';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError } from '../middleware/errorHandler.js';
import { createOrder, createCustomer, cancelSubscription as rzpCancelSub } from '../services/razorpayService.js';
import { activateSubscription, checkDeviceActivationEligibility } from '../services/subscriptionService.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// GET /api/subscriptions/plans
// Public — returns all active plans (no auth required)
// ---------------------------------------------------------------------------
export const getPlans = asyncHandler(async (req, res) => {
  const plans = await SubscriptionPlan.findAll();
  res.json({ success: true, data: plans.map(p => p.toJSON()) });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/my
// Returns the calling user's client active subscription
// ---------------------------------------------------------------------------
export const getMySubscription = asyncHandler(async (req, res) => {
  const clientId = req.user.client_id;
  if (!clientId) throw new ValidationError('User has no associated client');

  const subscription = await ClientSubscription.findByClientId(clientId);
  const activeCount  = subscription
    ? await ClientSubscription.getActiveDeviceCount(clientId)
    : 0;

  res.json({
    success: true,
    data: {
      subscription: subscription ? subscription.toJSON() : null,
      active_device_count: activeCount,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions
// Admin — all subscriptions with filters
// ---------------------------------------------------------------------------
export const getAllSubscriptions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, plan_id } = req.query;

  const result = await ClientSubscription.getAllWithClientInfo({
    page: parseInt(page),
    limit: parseInt(limit),
    status,
    plan_id: plan_id ? parseInt(plan_id) : undefined,
  });

  res.json({
    success: true,
    data: result.data.map(s => s.toJSON()),
    meta: {
      total:      result.total,
      page:       result.page,
      limit:      result.limit,
      totalPages: result.totalPages,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/create-order
// Creates a Razorpay order and a PENDING subscription + transaction row.
// Body: { plan_id, billing_cycle: 'monthly' | 'yearly' }
// ---------------------------------------------------------------------------
export const createOrderForSubscription = asyncHandler(async (req, res) => {
  const { plan_id, billing_cycle = 'monthly' } = req.body;
  const currentUser = req.user;

  if (!plan_id) throw new ValidationError('plan_id is required');
  if (!['monthly', 'yearly'].includes(billing_cycle)) {
    throw new ValidationError("billing_cycle must be 'monthly' or 'yearly'");
  }

  const clientId = currentUser.client_id;
  if (!clientId) throw new ValidationError('User has no associated client');

  const plan = await SubscriptionPlan.findById(parseInt(plan_id));
  if (!plan || !plan.is_active) throw new NotFoundError('Subscription plan not found or inactive');

  const amount = billing_cycle === 'yearly' ? plan.price_yearly : plan.price_monthly;

  // Create or retrieve Razorpay customer
  let rzpCustomer;
  try {
    rzpCustomer = await createCustomer({
      name:    currentUser.first_name + ' ' + (currentUser.last_name || ''),
      email:   currentUser.email,
      contact: currentUser.ph_no || '',
    });
  } catch (err) {
    logger.warn('Razorpay customer creation failed — proceeding without customer ID:', err.message);
  }

  // Create Razorpay order
  const receipt = `sub_${clientId}_${Date.now()}`;
  const order = await createOrder({
    amountInRupees: parseFloat(amount),
    currency:       'INR',
    receipt,
    notes: {
      client_id:     String(clientId),
      plan_id:       String(plan_id),
      billing_cycle,
      plan_name:     plan.name,
    },
  });

  // Create PENDING subscription row
  const subscription = await ClientSubscription.create({
    client_id:            clientId,
    plan_id:              plan.plan_id,
    billing_cycle,
    razorpay_customer_id: rzpCustomer?.id || null,
    created_by_user_id:   currentUser.user_id,
  });

  // Create PENDING transaction row
  await PaymentTransaction.create({
    subscription_id:   subscription.subscription_id,
    client_id:         clientId,
    razorpay_order_id: order.id,
    amount:            parseFloat(amount),
    currency:          'INR',
  });

  res.json({
    success: true,
    data: {
      subscription_id:   subscription.subscription_id,
      razorpay_order_id: order.id,
      amount:            parseFloat(amount),
      currency:          'INR',
      plan:              plan.toJSON(),
      billing_cycle,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/verify-payment
// Called by frontend after Razorpay checkout success.
// Body: { subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }
// ---------------------------------------------------------------------------
export const verifyPaymentAndActivate = asyncHandler(async (req, res) => {
  const { subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const clientId = req.user.client_id;

  if (!subscription_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new ValidationError('subscription_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are all required');
  }

  const sub = await ClientSubscription.findById(parseInt(subscription_id));
  if (!sub) throw new NotFoundError('Subscription not found');
  if (sub.client_id !== clientId) throw new AuthorizationError('Access denied');

  const activated = await activateSubscription(parseInt(subscription_id), {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  res.json({
    success: true,
    message: 'Payment verified and subscription activated',
    data:    activated.toJSON(),
  });
});

// ---------------------------------------------------------------------------
// POST /api/subscriptions/:id/cancel
// Admin or the client themselves can cancel.
// ---------------------------------------------------------------------------
export const cancelSubscription = asyncHandler(async (req, res) => {
  const subscriptionId = parseInt(req.params.id);
  const { reason = '' } = req.body;
  const currentUser = req.user;

  const sub = await ClientSubscription.findById(subscriptionId);
  if (!sub) throw new NotFoundError('Subscription not found');

  // Only admin or the owning client can cancel
  const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name);
  if (!isAdmin && sub.client_id !== currentUser.client_id) {
    throw new AuthorizationError('Access denied');
  }

  // Cancel in Razorpay if recurring subscription
  if (sub.razorpay_subscription_id) {
    try {
      await rzpCancelSub(sub.razorpay_subscription_id);
    } catch (err) {
      logger.warn('Razorpay subscription cancel failed:', err.message);
    }
  }

  await ClientSubscription.cancel(subscriptionId, reason);

  res.json({ success: true, message: 'Subscription cancelled' });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/:clientId/transactions
// ---------------------------------------------------------------------------
export const getTransactions = asyncHandler(async (req, res) => {
  const targetClientId = parseInt(req.params.clientId);
  const { page = 1, limit = 20 } = req.query;
  const currentUser = req.user;

  const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name);
  if (!isAdmin && currentUser.client_id !== targetClientId) {
    throw new AuthorizationError('Access denied');
  }

  const result = await PaymentTransaction.getByClientId(targetClientId, {
    page:  parseInt(page),
    limit: parseInt(limit),
  });

  res.json({
    success: true,
    data:    result.data.map(t => t.toJSON()),
    meta: {
      total:      result.total,
      page:       result.page,
      limit:      result.limit,
      totalPages: result.totalPages,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/subscriptions/eligibility/:clientId
// Convenience endpoint for UI to check activation eligibility
// ---------------------------------------------------------------------------
export const getEligibility = asyncHandler(async (req, res) => {
  const targetClientId = parseInt(req.params.clientId);
  const currentUser = req.user;

  const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name);
  if (!isAdmin && currentUser.client_id !== targetClientId) {
    throw new AuthorizationError('Access denied');
  }

  const result = await checkDeviceActivationEligibility(targetClientId);
  res.json({ success: true, data: result });
});
