import { verifyWebhookSignature } from '../services/razorpayService.js';
import { ClientSubscription }    from '../models/ClientSubscription.js';
import { PaymentTransaction }    from '../models/PaymentTransaction.js';
import { deactivateClientDevices } from '../services/subscriptionService.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/razorpay/webhook
 *
 * Razorpay sends events with X-Razorpay-Signature header.
 * This route uses express.raw() so we can verify the raw body.
 * Must be registered BEFORE express.json() in server.js.
 */
export const handleWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody   = req.body; // Buffer because of express.raw()

  // 1. Verify signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Razorpay webhook: invalid signature — rejected');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const eventType = event.event;
  logger.info('Razorpay webhook received:', { event: eventType });

  try {
    switch (eventType) {

      // ------------------------------------------------------------------
      // payment.captured — one-time order payment succeeded
      // ------------------------------------------------------------------
      case 'payment.captured': {
        const payment = event.payload.payment.entity;
        const orderId = payment.order_id;

        if (!orderId) break;

        const txn = await PaymentTransaction.findByOrderId(orderId);
        if (!txn || txn.status === 'COMPLETED') break;

        await PaymentTransaction.markCompleted(
          orderId,
          payment.id,
          null, // signature already verified above
          payment.method
        );

        const sub = await ClientSubscription.findById(txn.subscription_id);
        if (sub && sub.status === 'PENDING') {
          const { SubscriptionPlan } = await import('../models/SubscriptionPlan.js');
          const plan = await SubscriptionPlan.findById(sub.plan_id);
          await ClientSubscription.activate(sub.subscription_id, {
            billing_cycle: sub.billing_cycle,
            plan:          plan?.toJSON(),
          });
          logger.info('Webhook: subscription activated via payment.captured:', {
            subscription_id: sub.subscription_id,
          });
        }
        break;
      }

      // ------------------------------------------------------------------
      // payment.failed — payment failed
      // ------------------------------------------------------------------
      case 'payment.failed': {
        const payment = event.payload.payment.entity;
        const orderId = payment.order_id;
        if (!orderId) break;

        const failureReason = payment.error_description || 'Payment failed';
        await PaymentTransaction.markFailed(orderId, failureReason);
        logger.info('Webhook: payment marked as failed:', { order_id: orderId });
        break;
      }

      // ------------------------------------------------------------------
      // subscription.charged — recurring charge succeeded (auto-renewal)
      // ------------------------------------------------------------------
      case 'subscription.charged': {
        const subEntity = event.payload.subscription.entity;
        const rzpSubId  = subEntity.id;

        const sub = await ClientSubscription.findByRazorpaySubscriptionId(rzpSubId);
        if (!sub) break;

        await ClientSubscription.renew(
          sub.subscription_id,
          sub.billing_cycle,
          sub.grace_days
        );
        logger.info('Webhook: subscription renewed:', {
          subscription_id: sub.subscription_id,
        });
        break;
      }

      // ------------------------------------------------------------------
      // subscription.cancelled — cancelled via Razorpay dashboard / API
      // ------------------------------------------------------------------
      case 'subscription.cancelled': {
        const subEntity = event.payload.subscription.entity;
        const rzpSubId  = subEntity.id;

        const sub = await ClientSubscription.findByRazorpaySubscriptionId(rzpSubId);
        if (!sub) break;

        await ClientSubscription.cancel(sub.subscription_id, 'Cancelled via Razorpay');
        logger.info('Webhook: subscription cancelled:', {
          subscription_id: sub.subscription_id,
        });
        break;
      }

      // ------------------------------------------------------------------
      // subscription.completed — subscription term ended (no more charges)
      // ------------------------------------------------------------------
      case 'subscription.completed': {
        const subEntity = event.payload.subscription.entity;
        const rzpSubId  = subEntity.id;

        const sub = await ClientSubscription.findByRazorpaySubscriptionId(rzpSubId);
        if (!sub) break;

        // Let the cron handle the grace → expired transition
        // Just log it here
        logger.info('Webhook: subscription completed (term ended):', {
          subscription_id: sub.subscription_id,
        });
        break;
      }

      default:
        logger.info('Razorpay webhook: unhandled event type:', eventType);
    }
  } catch (error) {
    logger.error('Razorpay webhook processing error:', error);
    // Still return 200 to prevent Razorpay from retrying
  }

  // Always return 200 to Razorpay
  res.json({ received: true });
};
