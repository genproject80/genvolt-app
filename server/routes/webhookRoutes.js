import express from 'express';
import { handleWebhook } from '../controllers/razorpayWebhookController.js';

const router = express.Router();

/**
 * POST /api/razorpay/webhook
 *
 * IMPORTANT: This route is registered with express.raw({ type: 'application/json' })
 * in server.js so that the raw buffer is available for signature verification.
 * Do NOT add express.json() or body-parser here.
 */
router.post('/webhook', handleWebhook);

export default router;
