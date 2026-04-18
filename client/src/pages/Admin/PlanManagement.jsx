import React, { useState, useEffect, useCallback } from 'react';
import { IconPlus, IconPencil, IconArchive } from '@tabler/icons-react';
import { getAllPlans, createPlan, updatePlan, deactivatePlan } from '../../services/planService';

const fmtPrice = (p) => `₹${parseFloat(p).toLocaleString('en-IN')}`;

const EMPTY_FORM = {
  name: '', description: '', max_devices: -1,
  price_monthly: '', price_yearly: '', grace_days: 7,
  features: '', razorpay_plan_id_monthly: '', razorpay_plan_id_yearly: '',
};

export default function PlanManagement() {
  const [plans, setPlans]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editPlan, setEditPlan]     = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllPlans();
      setPlans(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditPlan(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (plan) => {
    setEditPlan(plan);
    setForm({
      name:                     plan.name,
      description:              plan.description || '',
      max_devices:              plan.max_devices,
      price_monthly:            plan.price_monthly,
      price_yearly:             plan.price_yearly,
      grace_days:               plan.grace_days,
      features:                 (plan.features || []).join(', '),
      razorpay_plan_id_monthly: plan.razorpay_plan_id_monthly || '',
      razorpay_plan_id_yearly:  plan.razorpay_plan_id_yearly  || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.price_monthly) { setError('Monthly price is required'); return; }
    if (!form.price_yearly)  { setError('Yearly price is required'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        max_devices:   parseInt(form.max_devices),
        price_monthly: parseFloat(form.price_monthly),
        price_yearly:  parseFloat(form.price_yearly),
        grace_days:    parseInt(form.grace_days),
        features:      form.features ? form.features.split(',').map(f => f.trim()).filter(Boolean) : [],
        razorpay_plan_id_monthly: form.razorpay_plan_id_monthly || null,
        razorpay_plan_id_yearly:  form.razorpay_plan_id_yearly  || null,
      };

      if (editPlan) {
        await updatePlan(editPlan.plan_id, payload);
      } else {
        await createPlan(payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await deactivatePlan(archiveTarget.plan_id);
      setArchiveTarget(null);
      load();
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async (plan) => {
    try {
      await updatePlan(plan.plan_id, { is_active: true });
      load();
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan Management</h1>
          <p className="mt-1 text-sm text-gray-500">Create, edit, and archive subscription plans.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <IconPlus className="w-4 h-4" />
          New Plan
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-3">
        Price changes apply to <strong>new subscriptions only</strong>. Existing active subscriptions are billed at their original locked-in amount.
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Monthly</th>
                  <th className="px-4 py-3">Yearly</th>
                  <th className="px-4 py-3">Max Devices</th>
                  <th className="px-4 py-3">Grace Days</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plans.map((plan) => (
                  <tr key={plan.plan_id} className={`text-sm text-gray-700 hover:bg-gray-50 ${!plan.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-xs text-gray-400">{plan.description}</div>
                    </td>
                    <td className="px-4 py-3">{fmtPrice(plan.price_monthly)}</td>
                    <td className="px-4 py-3">{fmtPrice(plan.price_yearly)}</td>
                    <td className="px-4 py-3">{plan.max_devices === -1 ? 'Unlimited' : plan.max_devices}</td>
                    <td className="px-4 py-3">{plan.grace_days}d</td>
                    <td className="px-4 py-3">
                      {plan.is_active ? (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800">Active</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500">Archived</span>
                      )}
                    </td>
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        onClick={() => openEdit(plan)}
                        className="text-indigo-500 hover:text-indigo-700"
                        title="Edit"
                      >
                        <IconPencil className="w-4 h-4" />
                      </button>
                      {plan.is_active ? (
                        <button
                          onClick={() => setArchiveTarget(plan)}
                          className="text-red-400 hover:text-red-600"
                          title="Archive"
                        >
                          <IconArchive className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnarchive(plan)}
                          className="text-xs text-green-600 hover:underline"
                        >
                          Unarchive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editPlan ? `Edit Plan: ${editPlan.name}` : 'Create New Plan'}
            </h3>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Plan Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Price (₹) *</label>
                <input type="number" min="0" value={form.price_monthly} onChange={e => setForm(f => ({ ...f, price_monthly: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Yearly Price (₹) *</label>
                <input type="number" min="0" value={form.price_yearly} onChange={e => setForm(f => ({ ...f, price_yearly: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Devices (-1 = unlimited)</label>
                <input type="number" value={form.max_devices} onChange={e => setForm(f => ({ ...f, max_devices: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Grace Days</label>
                <input type="number" min="0" value={form.grace_days} onChange={e => setForm(f => ({ ...f, grace_days: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Features (comma-separated)</label>
                <input type="text" value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))}
                  placeholder="e.g. 10 devices, Real-time monitoring, Email alerts"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Razorpay Plan ID (Monthly)</label>
                <input type="text" value={form.razorpay_plan_id_monthly} onChange={e => setForm(f => ({ ...f, razorpay_plan_id_monthly: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Razorpay Plan ID (Yearly)</label>
                <input type="text" value={form.razorpay_plan_id_yearly} onChange={e => setForm(f => ({ ...f, razorpay_plan_id_yearly: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : (editPlan ? 'Save Changes' : 'Create Plan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirm modal */}
      {archiveTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Archive Plan</h3>
            <p className="text-sm text-gray-600 mb-2">
              Archive <strong>{archiveTarget.name}</strong>? Existing subscriptions are unaffected — only new sign-ups will be unable to choose this plan.
            </p>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleArchive} disabled={archiving}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60">
                {archiving ? 'Archiving…' : 'Archive Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
