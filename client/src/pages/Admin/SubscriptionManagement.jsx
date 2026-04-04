import React, { useState, useEffect, useCallback } from 'react';
import {
  getAllSubscriptions, getPlans, cancelSubscription,
  createManualSubscription, changePlan, extendEndDate,
} from '../../services/subscriptionService';
import { clientService } from '../../services/clientService';
import { FunnelIcon, PlusIcon, PencilSquareIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';

const STATUS_STYLES = {
  ACTIVE:    'bg-green-100 text-green-800',
  GRACE:     'bg-yellow-100 text-yellow-800',
  EXPIRED:   'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  PENDING:   'bg-blue-100 text-blue-800',
};

const ASSIGN_TYPE_STYLES = {
  PAYMENT: 'bg-indigo-100 text-indigo-700',
  MANUAL:  'bg-purple-100 text-purple-700',
  TRIAL:   'bg-teal-100 text-teal-700',
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Default end date = 1 month from today
const defaultEndDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
};

export default function SubscriptionManagement() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [plans, setPlans]                 = useState([]);
  const [clients, setClients]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [meta, setMeta]                   = useState({ total: 0, page: 1, totalPages: 1 });

  const [filterStatus, setFilterStatus]   = useState('');
  const [filterPlan, setFilterPlan]       = useState('');
  const [page, setPage]                   = useState(1);

  // Cancel
  const [cancellingId, setCancellingId]   = useState(null);
  const [cancelReason, setCancelReason]   = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [targetSub, setTargetSub]         = useState(null);

  // Manual assign
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    client_id: '', plan_id: '', billing_cycle: 'monthly',
    end_date: defaultEndDate(), assignment_type: 'MANUAL', admin_notes: '',
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError]   = useState('');

  // Change plan
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [changePlanTarget, setChangePlanTarget]       = useState(null);
  const [newPlanId, setNewPlanId]                     = useState('');
  const [changingPlan, setChangingPlan]               = useState(false);

  // Extend end date
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendTarget, setExtendTarget]       = useState(null);
  const [newEndDate, setNewEndDate]           = useState('');
  const [extending, setExtending]             = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, planList] = await Promise.all([
        getAllSubscriptions({
          page,
          limit: 20,
          status:  filterStatus || undefined,
          plan_id: filterPlan   || undefined,
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

  useEffect(() => {
    clientService.getAllClients({ limit: 1000 })
      .then(res => setClients(res?.clients || []))
      .catch(() => {});
  }, []);

  // Cancel
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

  // Manual assign
  const handleManualSave = async () => {
    if (!manualForm.client_id) { setManualError('Select a client'); return; }
    if (!manualForm.plan_id)   { setManualError('Select a plan'); return; }
    if (!manualForm.end_date)  { setManualError('Set end date'); return; }
    setManualSaving(true);
    setManualError('');
    try {
      await createManualSubscription({
        client_id:      parseInt(manualForm.client_id),
        plan_id:        parseInt(manualForm.plan_id),
        billing_cycle:  manualForm.billing_cycle,
        end_date:       manualForm.end_date,
        assignment_type: manualForm.assignment_type,
        admin_notes:    manualForm.admin_notes,
      });
      setShowManualModal(false);
      setManualForm({ client_id: '', plan_id: '', billing_cycle: 'monthly', end_date: defaultEndDate(), assignment_type: 'MANUAL', admin_notes: '' });
      load();
    } catch (err) {
      setManualError(err?.message || 'Failed to create subscription');
    } finally {
      setManualSaving(false);
    }
  };

  // Change plan
  const handleChangePlan = async () => {
    if (!newPlanId) return;
    setChangingPlan(true);
    try {
      await changePlan(changePlanTarget.subscription_id, parseInt(newPlanId));
      setShowChangePlanModal(false);
      load();
    } finally {
      setChangingPlan(false);
    }
  };

  // Extend
  const handleExtend = async () => {
    if (!newEndDate) return;
    setExtending(true);
    try {
      await extendEndDate(extendTarget.subscription_id, newEndDate);
      setShowExtendModal(false);
      load();
    } finally {
      setExtending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage all client subscriptions. Total: {meta.total}
          </p>
        </div>
        <button
          onClick={() => {
            setManualForm({ client_id: '', plan_id: '', billing_cycle: 'monthly', end_date: defaultEndDate(), assignment_type: 'MANUAL', admin_notes: '' });
            setManualError('');
            setShowManualModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <PlusIcon className="w-4 h-4" />
          Assign Subscription
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <FunnelIcon className="w-4 h-4 text-gray-400" />
        <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="GRACE">Grace Period</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="PENDING">Pending</option>
        </select>
        <select value={filterPlan} onChange={(e) => { setFilterPlan(e.target.value); setPage(1); }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Plans</option>
          {plans.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.name}</option>)}
        </select>
        <button onClick={() => { setFilterStatus(''); setFilterPlan(''); setPage(1); }}
          className="text-sm text-gray-500 hover:text-gray-700 underline">
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
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Billing</th>
                  <th className="px-4 py-3">Start</th>
                  <th className="px-4 py-3">End</th>
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
                    <td className="px-4 py-3">
                      {sub.assignment_type && (
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${ASSIGN_TYPE_STYLES[sub.assignment_type] || 'bg-gray-100 text-gray-600'}`}>
                          {sub.assignment_type}
                        </span>
                      )}
                      {sub.admin_notes && (
                        <span
                          title={sub.admin_notes}
                          className="ml-1 text-xs text-gray-400 cursor-help hover:text-gray-600"
                        >
                          ⓘ
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-xs text-gray-500">{sub.billing_cycle}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(sub.start_date)}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(sub.end_date)}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(sub.grace_end_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!['CANCELLED', 'EXPIRED'].includes(sub.status) && (
                          <>
                            <button
                              onClick={() => { setChangePlanTarget(sub); setNewPlanId(''); setShowChangePlanModal(true); }}
                              className="text-indigo-500 hover:text-indigo-700"
                              title="Change Plan"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setExtendTarget(sub);
                                setNewEndDate(sub.end_date ? new Date(sub.end_date).toISOString().split('T')[0] : defaultEndDate());
                                setShowExtendModal(true);
                              }}
                              className="text-green-500 hover:text-green-700"
                              title="Extend End Date"
                            >
                              <CalendarDaysIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setTargetSub(sub); setShowCancelModal(true); }}
                              className="text-xs text-red-500 hover:text-red-700 hover:underline"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
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
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
              <button onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} disabled={page >= meta.totalPages}
                className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Manual assign modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Assign Subscription</h3>
            {manualError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{manualError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Client *</label>
                <select value={manualForm.client_id} onChange={e => setManualForm(f => ({ ...f, client_id: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Plan *</label>
                <select value={manualForm.plan_id} onChange={e => setManualForm(f => ({ ...f, plan_id: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select plan…</option>
                  {plans.map(p => <option key={p.plan_id} value={p.plan_id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Billing Cycle</label>
                  <select value={manualForm.billing_cycle} onChange={e => setManualForm(f => ({ ...f, billing_cycle: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Assignment Type</label>
                  <select value={manualForm.assignment_type} onChange={e => setManualForm(f => ({ ...f, assignment_type: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="MANUAL">Manual</option>
                    <option value="TRIAL">Trial</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Date *</label>
                <input type="date" value={manualForm.end_date} onChange={e => setManualForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Admin Notes</label>
                <textarea value={manualForm.admin_notes} onChange={e => setManualForm(f => ({ ...f, admin_notes: e.target.value }))}
                  rows={2} placeholder="Internal notes…"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowManualModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleManualSave} disabled={manualSaving}
                className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {manualSaving ? 'Saving…' : 'Assign Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change plan modal */}
      {showChangePlanModal && changePlanTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Change Plan</h3>
            <p className="text-sm text-gray-600 mb-1">
              Client: <strong>{changePlanTarget.client_name}</strong><br/>
              Current plan: <strong>{changePlanTarget.plan_name}</strong>
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2 mb-4">
              Price takes effect at next renewal. Current period is unaffected.
            </p>
            <select value={newPlanId} onChange={e => setNewPlanId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Select new plan…</option>
              {plans.filter(p => p.plan_id !== changePlanTarget.plan_id).map(p => (
                <option key={p.plan_id} value={p.plan_id}>{p.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowChangePlanModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleChangePlan} disabled={changingPlan || !newPlanId}
                className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {changingPlan ? 'Saving…' : 'Change Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend end date modal */}
      {showExtendModal && extendTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Extend End Date</h3>
            <p className="text-sm text-gray-600 mb-4">
              Extending subscription for <strong>{extendTarget.client_name}</strong>.
              Current end date: <strong>{fmtDate(extendTarget.end_date)}</strong>
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">New End Date</label>
            <input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowExtendModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleExtend} disabled={extending || !newEndDate}
                className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-60">
                {extending ? 'Extending…' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {showCancelModal && targetSub && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel Subscription</h3>
            <p className="text-sm text-gray-600 mb-4">
              Cancel the <strong>{targetSub.plan_name}</strong> subscription for{' '}
              <strong>{targetSub.client_name}</strong>? This cannot be undone.
            </p>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)" rows={3}
              className="w-full text-sm border border-gray-300 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-red-400" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Keep Active
              </button>
              <button onClick={handleCancelConfirm} disabled={!!cancellingId}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60">
                {cancellingId ? 'Cancelling…' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
