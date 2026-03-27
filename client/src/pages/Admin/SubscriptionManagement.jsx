import React, { useState, useEffect, useCallback } from 'react';
import { getAllSubscriptions, getPlans, cancelSubscription } from '../../services/subscriptionService';
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';

const STATUS_STYLES = {
  ACTIVE:    'bg-green-100 text-green-800',
  GRACE:     'bg-yellow-100 text-yellow-800',
  EXPIRED:   'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  PENDING:   'bg-blue-100 text-blue-800',
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function SubscriptionManagement() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [meta, setMeta]                   = useState({ total: 0, page: 1, totalPages: 1 });

  const [filterStatus, setFilterStatus]   = useState('');
  const [filterPlan, setFilterPlan]       = useState('');
  const [page, setPage]                   = useState(1);

  const [cancellingId, setCancellingId]   = useState(null);
  const [cancelReason, setCancelReason]   = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [targetSub, setTargetSub]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, planList] = await Promise.all([
        getAllSubscriptions({
          page,
          limit: 20,
          status:  filterStatus || undefined,
          plan_id: filterPlan  || undefined,
        }),
        plans.length === 0 ? getPlans() : Promise.resolve(plans),
      ]);
      setSubscriptions(subRes.data || []);
      setMeta(subRes.meta || {});
      if (plans.length === 0) setPlans(planList || []);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterPlan]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const handleCancelConfirm = async () => {
    if (!targetSub) return;
    setCancellingId(targetSub.subscription_id);
    try {
      await cancelSubscription(targetSub.subscription_id, cancelReason);
      setShowCancelModal(false);
      setCancelReason('');
      load();
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Subscription Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          View and manage all client subscriptions. Total: {meta.total}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <FunnelIcon className="w-4 h-4 text-gray-400" />

        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="GRACE">Grace Period</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="PENDING">Pending</option>
        </select>

        <select
          value={filterPlan}
          onChange={(e) => { setFilterPlan(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Plans</option>
          {plans.map((p) => (
            <option key={p.plan_id} value={p.plan_id}>{p.name}</option>
          ))}
        </select>

        <button
          onClick={() => { setFilterStatus(''); setFilterPlan(''); setPage(1); }}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Clear filters
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No subscriptions found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">End Date</th>
                  <th className="px-4 py-3">Grace End</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((sub) => (
                  <tr key={sub.subscription_id} className="text-sm text-gray-700 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{sub.client_name}</div>
                      <div className="text-xs text-gray-400">{sub.client_email}</div>
                    </td>
                    <td className="px-4 py-3 font-medium">{sub.plan_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_STYLES[sub.status] || 'bg-gray-100'}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-xs text-gray-500">{sub.billing_cycle}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(sub.start_date)}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(sub.end_date)}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(sub.grace_end_date)}</td>
                    <td className="px-4 py-3">
                      {!['CANCELLED', 'EXPIRED'].includes(sub.status) && (
                        <button
                          onClick={() => { setTargetSub(sub); setShowCancelModal(true); }}
                          className="text-xs text-red-500 hover:text-red-700 hover:underline"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
            <span>Page {meta.page} of {meta.totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel confirm modal */}
      {showCancelModal && targetSub && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel Subscription</h3>
            <p className="text-sm text-gray-600 mb-4">
              Cancel the <strong>{targetSub.plan_name}</strong> subscription for{' '}
              <strong>{targetSub.client_name}</strong>? This cannot be undone.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              rows={3}
              className="w-full text-sm border border-gray-300 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Keep Active
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={!!cancellingId}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {cancellingId ? 'Cancelling…' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
