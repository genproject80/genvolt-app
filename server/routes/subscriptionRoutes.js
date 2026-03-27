import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissionCheck.js';
import {
  getPlans,
  getMySubscription,
  getAllSubscriptions,
  createOrderForSubscription,
  verifyPaymentAndActivate,
  cancelSubscription,
  getTransactions,
  getEligibility,
} from '../controllers/subscriptionController.js';

const router = express.Router();

// ---- Public ----------------------------------------------------------------
// List active plans — no auth needed (used on marketing / billing pages)
router.get('/plans', getPlans);

// ---- Authenticated ---------------------------------------------------------
router.use(authenticate);

// Current user's subscription
router.get('/my', getMySubscription);

// Initiate payment — create Razorpay order + PENDING subscription row
router.post('/create-order', createOrderForSubscription);

// Verify payment after Razorpay checkout succeeds
router.post('/verify-payment', verifyPaymentAndActivate);

// Check eligibility for device activation
router.get('/eligibility/:clientId', getEligibility);

// Payment history for a client
router.get('/:clientId/transactions', getTransactions);

// Cancel a subscription
router.post('/:id/cancel', cancelSubscription);

// Admin — all subscriptions
router.get(
  '/',
  requirePermission('Manage Subscriptions'),
  getAllSubscriptions
);

export default router;
