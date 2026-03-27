import { ClientSubscription } from '../models/ClientSubscription.js';
import { PaymentTransaction }  from '../models/PaymentTransaction.js';
import { SubscriptionPlan }    from '../models/SubscriptionPlan.js';
import { verifyPaymentSignature, fetchPayment } from './razorpayService.js';
import { getPool } from '../config/database.js';
import mqttService from './mqttService.js';
import sql from 'mssql';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// checkDeviceActivationEligibility
// Returns { eligible, reason, subscription, plan }
// Reasons: null | 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_EXPIRED' |
//          'GRACE_PERIOD' | 'PLAN_LIMIT'
// ---------------------------------------------------------------------------
export const checkDeviceActivationEligibility = async (clientId) => {
  const subscription = await ClientSubscription.findByClientId(clientId);

  if (!subscription) {
    return {
      eligible: false,
      reason: 'NO_SUBSCRIPTION',
      subscription: null,
      plan: null,
    };
  }

  if (subscription.status === 'EXPIRED') {
    return {
      eligible: false,
      reason: 'SUBSCRIPTION_EXPIRED',
      subscription: subscription.toJSON(),
      plan: null,
    };
  }

  if (subscription.status === 'GRACE') {
    return {
      eligible: false,
      reason: 'GRACE_PERIOD',
      subscription: subscription.toJSON(),
      plan: null,
    };
  }

  if (subscription.status !== 'ACTIVE') {
    return {
      eligible: false,
      reason: 'NO_SUBSCRIPTION',
      subscription: subscription.toJSON(),
      plan: null,
    };
  }

  // Check device limit (max_devices = -1 means unlimited)
  if (subscription.max_devices !== -1) {
    const activeCount = await ClientSubscription.getActiveDeviceCount(clientId);
    if (activeCount >= subscription.max_devices) {
      return {
        eligible: false,
        reason: 'PLAN_LIMIT',
        subscription: subscription.toJSON(),
        plan: { max_devices: subscription.max_devices, active_count: activeCount },
      };
    }
  }

  return {
    eligible: true,
    reason: null,
    subscription: subscription.toJSON(),
    plan: { max_devices: subscription.max_devices },
  };
};

// ---------------------------------------------------------------------------
// activateSubscription
// Verifies Razorpay signature, marks transaction COMPLETED, activates sub.
// ---------------------------------------------------------------------------
export const activateSubscription = async (subscriptionId, { razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  // 1. Verify signature
  const isValid = verifyPaymentSignature({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  if (!isValid) {
    throw new Error('Payment signature verification failed');
  }

  // 2. Fetch payment mode from Razorpay
  let paymentMode = null;
  try {
    const payment = await fetchPayment(razorpay_payment_id);
    paymentMode = payment.method;
  } catch (_) {
    // non-critical
  }

  // 3. Mark transaction COMPLETED
  await PaymentTransaction.markCompleted(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    paymentMode
  );

  // 4. Activate subscription
  const sub = await ClientSubscription.findById(subscriptionId);
  const plan = await SubscriptionPlan.findById(sub.plan_id);

  const activatedSub = await ClientSubscription.activate(subscriptionId, {
    razorpay_subscription_id: null,
    billing_cycle: sub.billing_cycle,
    plan: plan?.toJSON(),
  });

  logger.info('Subscription activated:', {
    subscriptionId,
    clientId: sub.client_id,
    plan: plan?.name,
  });

  return activatedSub;
};

// ---------------------------------------------------------------------------
// handleSubscriptionExpiry — run by hourly cron job
// Phase 1: ACTIVE → GRACE when end_date passed
// Phase 2: GRACE  → EXPIRED when grace_end_date passed + deactivate devices
// ---------------------------------------------------------------------------
export const handleSubscriptionExpiry = async () => {
  logger.info('Running subscription expiry check...');

  // Phase 1: Move ACTIVE → GRACE
  const activeExpired = await ClientSubscription.findExpiredActive();
  for (const sub of activeExpired) {
    await ClientSubscription.setGrace(sub.subscription_id);
    logger.info('Subscription moved to GRACE:', {
      subscription_id: sub.subscription_id,
      client_id: sub.client_id,
    });
  }

  // Phase 2: Move GRACE → EXPIRED, deactivate devices
  const graceExpired = await ClientSubscription.findExpiredGrace();
  for (const sub of graceExpired) {
    await ClientSubscription.expire(sub.subscription_id);
    await deactivateClientDevices(sub.client_id, 'subscription_expired');
    logger.info('Subscription EXPIRED — devices deactivated:', {
      subscription_id: sub.subscription_id,
      client_id: sub.client_id,
    });
  }

  logger.info(`Expiry check done. Active→Grace: ${activeExpired.length}, Grace→Expired: ${graceExpired.length}`);
};

// ---------------------------------------------------------------------------
// deactivateClientDevices — bulk INACTIVE + MQTT disconnect
// ---------------------------------------------------------------------------
export const deactivateClientDevices = async (clientId, reason = 'subscription_expired') => {
  try {
    const pool = await getPool();

    // Fetch active devices so we can send MQTT disconnect per device
    const result = await pool.request()
      .input('clientId', sql.Int, clientId)
      .query(`
        SELECT device_id FROM device
        WHERE client_id = @clientId AND activation_status = 'ACTIVE'
      `);

    const deviceIds = result.recordset.map(r => r.device_id);

    // Bulk deactivate in DB
    if (deviceIds.length > 0) {
      await pool.request()
        .input('clientId', sql.Int, clientId)
        .query(`
          UPDATE device
          SET activation_status          = 'INACTIVE',
              deactivated_at             = GETUTCDATE(),
              mqtt_password              = NULL,
              activation_blocked_reason  = 'SUBSCRIPTION_EXPIRED'
          WHERE client_id = @clientId AND activation_status = 'ACTIVE'
        `);

      // Send MQTT disconnect for each device (non-blocking)
      for (const deviceId of deviceIds) {
        try {
          await mqttService.publishDeactivationNotice(clientId, deviceId, reason);
        } catch (mqttErr) {
          logger.warn(`MQTT disconnect failed for device ${deviceId}:`, mqttErr.message);
        }
      }
    }

    logger.info(`Deactivated ${deviceIds.length} devices for client ${clientId}`);
    return deviceIds.length;
  } catch (error) {
    logger.error('deactivateClientDevices error:', error);
    throw error;
  }
};
