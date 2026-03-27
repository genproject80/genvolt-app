import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/subscriptions`;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  withCredentials: true,
});

// Attach Bearer token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const handleError = (error) => {
  if (error.response?.data) throw error.response.data;
  throw error;
};

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export const getPlans = async () => {
  try {
    const res = await api.get('/plans');
    return res.data.data;
  } catch (err) { handleError(err); }
};

// ---------------------------------------------------------------------------
// My subscription (current user's client)
// ---------------------------------------------------------------------------
export const getMySubscription = async () => {
  try {
    const res = await api.get('/my');
    return res.data.data; // { subscription, active_device_count }
  } catch (err) { handleError(err); }
};

// ---------------------------------------------------------------------------
// Create Razorpay order (initiates payment flow)
// Returns { subscription_id, razorpay_order_id, amount, currency, plan, billing_cycle }
// ---------------------------------------------------------------------------
export const createOrder = async (planId, billingCycle = 'monthly') => {
  try {
    const res = await api.post('/create-order', {
      plan_id:       planId,
      billing_cycle: billingCycle,
    });
    return res.data.data;
  } catch (err) { handleError(err); }
};

// ---------------------------------------------------------------------------
// Verify payment after Razorpay checkout
// ---------------------------------------------------------------------------
export const verifyPayment = async ({ subscription_id, razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  try {
    const res = await api.post('/verify-payment', {
      subscription_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    return res.data.data;
  } catch (err) { handleError(err); }
};

// ---------------------------------------------------------------------------
// Cancel subscription
// ---------------------------------------------------------------------------
export const cancelSubscription = async (subscriptionId, reason = '') => {
  try {
    const res = await api.post(`/${subscriptionId}/cancel`, { reason });
    return res.data;
  } catch (err) { handleError(err); }
};

// ---------------------------------------------------------------------------
// Payment history for a client
// ---------------------------------------------------------------------------
export const getTransactions = async (clientId, { page = 1, limit = 20 } = {}) => {
  try {
    const res = await api.get(`/${clientId}/transactions`, {
      params: { page, limit },
    });
    return res.data;
  } catch (err) { handleError(err); }
};

// ---------------------------------------------------------------------------
// All subscriptions (admin)
// ---------------------------------------------------------------------------
export const getAllSubscriptions = async ({ page = 1, limit = 20, status, plan_id } = {}) => {
  try {
    const res = await api.get('/', { params: { page, limit, status, plan_id } });
    return res.data;
  } catch (err) { handleError(err); }
};

// ---------------------------------------------------------------------------
// Check activation eligibility for a client
// ---------------------------------------------------------------------------
export const getEligibility = async (clientId) => {
  try {
    const res = await api.get(`/eligibility/${clientId}`);
    return res.data.data;
  } catch (err) { handleError(err); }
};
