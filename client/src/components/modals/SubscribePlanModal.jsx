import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getPlans, createOrder, verifyPayment } from '../../services/subscriptionService';
import { IconCircleCheck, IconX } from '@tabler/icons-react';

const fmt = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

// Load the Razorpay checkout script dynamically
const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default function SubscribePlanModal({ initialPlan = null, onClose, onSuccess }) {
  const { user } = useAuth();

  const [plans, setPlans]               = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState(initialPlan?.selectedBillingCycle || 'monthly');
  const [selectedPlan, setSelectedPlan] = useState(initialPlan);
  const [processing, setProcessing]     = useState(false);
  const [error, setError]               = useState('');
  const [success, setSuccess]           = useState(false);

  useEffect(() => {
    getPlans()
      .then((data) => {
        setPlans(data || []);
        if (!selectedPlan && data?.length) setSelectedPlan(data[0]);
      })
      .finally(() => setPlansLoading(false));
  }, []);

  const handlePay = async () => {
    if (!selectedPlan) return;
    setError('');
    setProcessing(true);

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      setError('Failed to load payment gateway. Please check your connection and try again.');
      setProcessing(false);
      return;
    }

    let orderData;
    try {
      orderData = await createOrder(selectedPlan.plan_id, billingCycle);
    } catch (err) {
      setError(err?.message || 'Failed to create payment order. Please try again.');
      setProcessing(false);
      return;
    }

    const price = billingCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly;

    const options = {
      key:         import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount:      Math.round(price * 100), // paise
      currency:    'INR',
      name:        'CloudSynk',
      description: `${selectedPlan.name} Plan — ${billingCycle}`,
      order_id:    orderData.razorpay_order_id,
      prefill: {
        name:    `${user?.first_name || ''} ${user?.last_name || ''}`.trim(),
        email:   user?.email || '',
        contact: user?.ph_no || '',
      },
      theme: { color: '#6366f1' },
      handler: async (response) => {
        try {
          await verifyPayment({
            subscription_id:      orderData.subscription_id,
            razorpay_order_id:    response.razorpay_order_id,
            razorpay_payment_id:  response.razorpay_payment_id,
            razorpay_signature:   response.razorpay_signature,
          });
          setSuccess(true);
          setTimeout(() => onSuccess?.(), 1800);
        } catch (verifyErr) {
          setError(verifyErr?.message || 'Payment verification failed. Please contact support.');
          setProcessing(false);
        }
      },
      modal: {
        ondismiss: () => {
          setProcessing(false);
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response) => {
      setError(`Payment failed: ${response.error.description}`);
      setProcessing(false);
    });
    rzp.open();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">
            {success ? 'Payment Successful!' : 'Subscribe to a Plan'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          /* Success state */
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <IconCircleCheck className="w-16 h-16 text-green-500 mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Subscription Activated!</h3>
            <p className="text-gray-500 text-sm">
              Your <strong>{selectedPlan?.name}</strong> plan is now active. You can start
              activating devices.
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Billing cycle toggle */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    billingCycle === 'monthly'
                      ? 'bg-white text-gray-900 shadow-sm font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                    billingCycle === 'yearly'
                      ? 'bg-white text-gray-900 shadow-sm font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Yearly
                  <span className="ml-1 text-xs text-green-600 font-semibold">Save ~17%</span>
                </button>
              </div>
            </div>

            {/* Plan cards */}
            {plansLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {plans.map((plan) => {
                  const price     = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
                  const isSelected = selectedPlan?.plan_id === plan.plan_id;

                  return (
                    <button
                      key={plan.plan_id}
                      onClick={() => setSelectedPlan(plan)}
                      className={`text-left rounded-xl border-2 p-4 transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                          : 'border-gray-200 hover:border-indigo-300 bg-white'
                      }`}
                    >
                      <div className="font-bold text-gray-900 mb-1">{plan.name}</div>
                      <div className="text-lg font-bold text-indigo-600">
                        {fmt(price)}
                        <span className="text-xs font-normal text-gray-400 ml-1">
                          /{billingCycle === 'yearly' ? 'yr' : 'mo'}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {(plan.features || []).slice(0, 3).map((f, i) => (
                          <div key={i} className="flex items-center gap-1 text-xs text-gray-500">
                            <IconCircleCheck className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                            {f}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Summary + error */}
            {selectedPlan && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex justify-between text-sm text-gray-700">
                  <span>{selectedPlan.name} ({billingCycle})</span>
                  <span className="font-semibold">
                    {fmt(billingCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>Grace period after expiry</span>
                  <span>{selectedPlan.grace_days} days</span>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handlePay}
              disabled={!selectedPlan || processing}
              className="w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {processing ? 'Opening Payment…' : `Pay ${selectedPlan ? fmt(billingCycle === 'yearly' ? selectedPlan.price_yearly : selectedPlan.price_monthly) : ''}`}
            </button>
            <p className="text-center text-xs text-gray-400">
              Powered by Razorpay · 100% secure payment
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
