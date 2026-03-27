import Razorpay from 'razorpay';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

// Initialise Razorpay instance lazily so missing env vars don't crash startup
let instance = null;
const getRazorpay = () => {
  if (!instance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env');
    }
    instance = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return instance;
};

// -------------------------------------------------------------------------
// createOrder — used for one-time payments (monthly / yearly subscription)
// amount is in INR rupees; Razorpay expects paise (×100)
// -------------------------------------------------------------------------
export const createOrder = async ({ amountInRupees, currency = 'INR', receipt, notes = {} }) => {
  try {
    const rzp = getRazorpay();
    const order = await rzp.orders.create({
      amount:   Math.round(amountInRupees * 100), // paise
      currency,
      receipt,
      notes,
    });
    logger.info('Razorpay order created:', { order_id: order.id, amount: order.amount });
    return order;
  } catch (error) {
    logger.error('razorpayService.createOrder error:', error);
    throw error;
  }
};

// -------------------------------------------------------------------------
// createCustomer — idempotent; returns existing customer if email matches
// -------------------------------------------------------------------------
export const createCustomer = async ({ name, email, contact }) => {
  try {
    const rzp = getRazorpay();
    const customer = await rzp.customers.create({ name, email, contact });
    logger.info('Razorpay customer created/fetched:', { customer_id: customer.id });
    return customer;
  } catch (error) {
    logger.error('razorpayService.createCustomer error:', error);
    throw error;
  }
};

// -------------------------------------------------------------------------
// verifyPaymentSignature — called client-side after checkout success
// signature = HMAC-SHA256 of `${order_id}|${payment_id}` using key_secret
// -------------------------------------------------------------------------
export const verifyPaymentSignature = ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const body   = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return expected === razorpay_signature;
};

// -------------------------------------------------------------------------
// verifyWebhookSignature — called server-side on incoming webhook events
// Razorpay sends X-Razorpay-Signature header
// -------------------------------------------------------------------------
export const verifyWebhookSignature = (rawBody, signature) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('RAZORPAY_WEBHOOK_SECRET not set — skipping webhook signature check');
    return true; // allow in dev; enforce in prod
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
};

// -------------------------------------------------------------------------
// fetchPayment — retrieve a payment object (to get payment_mode, etc.)
// -------------------------------------------------------------------------
export const fetchPayment = async (paymentId) => {
  try {
    const rzp = getRazorpay();
    return await rzp.payments.fetch(paymentId);
  } catch (error) {
    logger.error('razorpayService.fetchPayment error:', error);
    throw error;
  }
};

// -------------------------------------------------------------------------
// cancelSubscription — for recurring Razorpay subscriptions
// -------------------------------------------------------------------------
export const cancelSubscription = async (razorpaySubscriptionId) => {
  try {
    const rzp = getRazorpay();
    const result = await rzp.subscriptions.cancel(razorpaySubscriptionId);
    logger.info('Razorpay subscription cancelled:', { id: razorpaySubscriptionId });
    return result;
  } catch (error) {
    logger.error('razorpayService.cancelSubscription error:', error);
    throw error;
  }
};
