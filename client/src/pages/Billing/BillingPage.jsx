import React, { useState, useEffect } from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import { useAuth } from '../../context/AuthContext';
import { getPlans, getTransactions } from '../../services/subscriptionService';
import SubscribePlanModal from '../../components/modals/SubscribePlanModal';
import deviceService from '../../services/deviceService';
import {
  CreditCardIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ArrowPathIcon,
  PauseCircleIcon,
  PlayCircleIcon,
} from '@heroicons/react/24/outline';

const STATUS_STYLES = {
  ACTIVE:    'bg-green-100 text-green-800',
  GRACE:     'bg-yellow-100 text-yellow-800',
  EXPIRED:   'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  PENDING:   'bg-blue-100 text-blue-800',
};

const TXN_STATUS_STYLES = {
  COMPLETED: 'bg-green-100 text-green-800',
  PENDING:   'bg-yellow-100 text-yellow-800',
  FAILED:    'bg-red-100 text-red-800',
  REFUNDED:  'bg-purple-100 text-purple-800',
};

const fmt = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function BillingPage() {
  const { subscription, activeDeviceCount, loading, refreshSubscription } = useSubscription();
  const { user } = useAuth();

  const [plans, setPlans]               = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [transactions, setTransactions] = useState([]);
  const [txnLoading, setTxnLoading]     = useState(true);
  const [txnMeta, setTxnMeta]           = useState({ total: 0, page: 1, totalPages: 1 });
  const [showModal, setShowModal]       = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);

  // Pause / Resume all devices
  const [pauseAllConfirm, setPauseAllConfirm] = useState(false);
  const [pausingAll, setPausingAll]           = useState(false);
  const [resumingAll, setResumingAll]         = useState(false);
  const [pauseMsg, setPauseMsg]               = useState('');

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .finally(() => setPlansLoading(false));
  }, []);

  useEffect(() => {
    if (!user?.client_id) return;
    setTxnLoading(true);
    getTransactions(user.client_id, { page: 1, limit: 10 })
      .then((res) => {
        setTransactions(res.data || []);
        setTxnMeta(res.meta || {});
      })
      .finally(() => setTxnLoading(false));
  }, [user?.client_id]);

  const handleSelectPlan = (plan) => {
    setSelectedPlan(plan);
    setShowModal(true);
  };

  const handlePauseAll = async () => {
    if (!user?.client_id) return;
    setPausingAll(true);
    setPauseMsg('');
    try {
      const res = await deviceService.pauseAllDevices(user.client_id, 'Client initiated pause');
      setPauseMsg(`${res.count || 0} device(s) paused.`);
      setPauseAllConfirm(false);
    } catch (err) {
      setPauseMsg(err?.response?.data?.message || 'Failed to pause devices');
    } finally {
      setPausingAll(false);
    }
  };

  const handleResumeAll = async () => {
    if (!user?.client_id) return;
    setResumingAll(true);
    setPauseMsg('');
    try {
      const res = await deviceService.resumeAllDevices(user.client_id);
      setPauseMsg(`${res.count || 0} device(s) resumed.`);
    } catch (err) {
      setPauseMsg(err?.response?.data?.message || 'Failed to resume devices');
    } finally {
      setResumingAll(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowModal(false);
    refreshSubscription();
    // Reload transactions
    if (user?.client_id) {
      getTransactions(user.client_id, { page: 1, limit: 10 }).then((res) => {
        setTransactions(res.data || []);
        setTxnMeta(res.meta || {});
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your plan, view payment history, and upgrade as you grow.
          </p>
        </div>
        <button
          onClick={refreshSubscription}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Current plan card */}
      {!loading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCardIcon className="w-5 h-5 text-indigo-500" />
            Current Plan
          </h2>

          {subscription ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-gray-900">{subscription.plan_name}</span>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[subscription.status] || 'bg-gray-100 text-gray-700'}`}>
                    {subscription.status}
                  </span>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>
                    Devices: <span className="font-medium">{activeDeviceCount}</span>
                    {subscription.max_devices !== -1 && (
                      <span className="text-gray-400"> / {subscription.max_devices}</span>
                    )}
                    {subscription.max_devices === -1 && (
                      <span className="text-gray-400"> (unlimited)</span>
                    )}
                  </p>
                  {subscription.end_date && (
                    <p>
                      {subscription.status === 'GRACE' ? 'Grace ends:' : 'Renews:'}
                      {' '}
                      <span className="font-medium">
                        {fmtDate(subscription.status === 'GRACE' ? subscription.grace_end_date : subscription.end_date)}
                      </span>
                    </p>
                  )}
                  <p className="capitalize text-xs text-gray-400">{subscription.billing_cycle} billing</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(true)}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  {subscription.status === 'GRACE' || subscription.status === 'EXPIRED'
                    ? 'Renew Now'
                    : 'Change Plan'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <XCircleIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No active subscription</p>
              <p className="text-gray-400 text-xs mt-1">Choose a plan below to get started</p>
            </div>
          )}
        </div>
      )}

      {/* Service Controls — pause / resume all devices */}
      {!loading && subscription?.status === 'ACTIVE' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Service Controls</h2>
          <p className="text-sm text-gray-500 mb-4">
            Pausing stops data collection from all your devices. Your subscription billing continues normally.
          </p>
          {pauseMsg && (
            <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2 mb-3">{pauseMsg}</div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setPauseAllConfirm(true)}
              disabled={pausingAll}
              className="flex items-center gap-2 px-4 py-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-60"
            >
              <PauseCircleIcon className="w-4 h-4" />
              {pausingAll ? 'Pausing…' : 'Pause All Devices'}
            </button>
            <button
              onClick={handleResumeAll}
              disabled={resumingAll}
              className="flex items-center gap-2 px-4 py-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-60"
            >
              <PlayCircleIcon className="w-4 h-4" />
              {resumingAll ? 'Resuming…' : 'Resume All Devices'}
            </button>
          </div>
        </div>
      )}

      {/* Plan selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Available Plans</h2>
          {/* Monthly / Yearly toggle */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                billingCycle === 'yearly'
                  ? 'bg-white text-gray-900 shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Yearly
              <span className="ml-1 text-xs text-green-600 font-medium">Save ~17%</span>
            </button>
          </div>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const price  = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
              const isCurrentPlan = subscription?.plan_id === plan.plan_id && subscription?.status === 'ACTIVE';

              return (
                <div
                  key={plan.plan_id}
                  className={`relative rounded-xl border-2 p-6 flex flex-col ${
                    isCurrentPlan
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 bg-white'
                  } transition-colors`}
                >
                  {isCurrentPlan && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Current Plan
                      </span>
                    </div>
                  )}

                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                  </div>

                  <div className="mb-6">
                    <span className="text-3xl font-bold text-gray-900">{fmt(price)}</span>
                    <span className="text-sm text-gray-500 ml-1">
                      / {billingCycle === 'yearly' ? 'year' : 'month'}
                    </span>
                    {billingCycle === 'yearly' && (
                      <p className="text-xs text-gray-400 mt-1">
                        ({fmt(plan.price_monthly)}/mo billed annually)
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2 flex-1 mb-6">
                    {(plan.features || []).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <CheckCircleIcon className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSelectPlan({ ...plan, selectedBillingCycle: billingCycle })}
                    disabled={isCurrentPlan}
                    className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                      isCurrentPlan
                        ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {isCurrentPlan ? 'Current Plan' : subscription ? 'Switch to this Plan' : 'Subscribe'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h2>

        {txnLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No payment records yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Invoice</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Amount</th>
                  <th className="pb-3 pr-4">Mode</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((txn) => (
                  <tr key={txn.transaction_id} className="text-sm text-gray-700">
                    <td className="py-3 pr-4 font-mono text-xs">{txn.invoice_number}</td>
                    <td className="py-3 pr-4">{fmtDate(txn.created_at)}</td>
                    <td className="py-3 pr-4 font-medium">{fmt(txn.amount)}</td>
                    <td className="py-3 pr-4 capitalize">{txn.payment_mode || '—'}</td>
                    <td className="py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${TXN_STATUS_STYLES[txn.status] || 'bg-gray-100 text-gray-600'}`}>
                        {txn.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {txnMeta.totalPages > 1 && (
              <p className="mt-4 text-xs text-gray-400 text-right">
                Showing page 1 of {txnMeta.totalPages}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Subscribe / Change plan modal */}
      {showModal && (
        <SubscribePlanModal
          initialPlan={selectedPlan}
          onClose={() => setShowModal(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Pause all confirm */}
      {pauseAllConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Pause All Devices</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will stop data collection from all your active devices. You can resume at any time.
              <strong className="block mt-1">Billing continues normally.</strong>
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPauseAllConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handlePauseAll} disabled={pausingAll}
                className="px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60">
                {pausingAll ? 'Pausing…' : 'Pause All Devices'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
