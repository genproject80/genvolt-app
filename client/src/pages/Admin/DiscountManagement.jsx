import React, { useState, useEffect, useCallback } from 'react';
import { TagIcon, TrashIcon } from '@heroicons/react/24/outline';
import {
  getDiscountHistory,
  getActiveDiscount,
  createDiscount,
  deleteDiscount,
} from '../../services/discountService';
import { clientService } from '../../services/clientService';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtValue = (discount) =>
  discount.discount_type === 'PERCENTAGE'
    ? `${discount.discount_value}%`
    : `₹${parseFloat(discount.discount_value).toLocaleString('en-IN')}`;

const EMPTY_FORM = { client_id: '', discount_type: 'PERCENTAGE', discount_value: '' };

export default function DiscountManagement() {
  const [clients, setClients]               = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [history, setHistory]               = useState([]);
  const [activeDiscount, setActiveDiscount] = useState(null);
  const [form, setForm]                     = useState(EMPTY_FORM);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');
  const [successMsg, setSuccessMsg]         = useState('');
  const [loading, setLoading]               = useState(false);

  useEffect(() => {
    clientService.getAllClients({ limit: 1000 })
      .then((res) => setClients(res?.clients || []))
      .catch(() => {});
  }, []);

  const loadClientData = useCallback(async (cid) => {
    if (!cid) { setHistory([]); setActiveDiscount(null); return; }
    setLoading(true);
    try {
      const [hist, active] = await Promise.all([
        getDiscountHistory(cid),
        getActiveDiscount(cid),
      ]);
      setHistory(hist || []);
      setActiveDiscount(active || null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClientChange = (cid) => {
    setSelectedClientId(cid);
    setForm(f => ({ ...f, client_id: cid }));
    loadClientData(cid);
    setError('');
    setSuccessMsg('');
  };

  const handleCreate = async () => {
    if (!form.client_id) { setError('Select a client first'); return; }
    if (!form.discount_value || parseFloat(form.discount_value) <= 0) {
      setError('Enter a valid discount value'); return;
    }
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      await createDiscount({
        client_id:      parseInt(form.client_id),
        discount_type:  form.discount_type,
        discount_value: parseFloat(form.discount_value),
      });
      setSuccessMsg('Discount created. It will be applied to the client\'s next payment.');
      setForm(EMPTY_FORM);
      loadClientData(selectedClientId);
    } catch (err) {
      setError(err?.message || 'Failed to create discount');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDiscount(id);
      loadClientData(selectedClientId);
    } catch (err) {
      setError(err?.message || 'Failed to delete discount');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Discount Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Apply one-time discounts to client accounts. Discounts are applied silently on the next payment.
        </p>
      </div>

      {/* Info */}
      <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
        Discounts are invisible to the client. They see only the final (reduced) amount on the checkout page.
        Only one active discount per client at a time.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <TagIcon className="w-5 h-5 text-indigo-500" />
            Set Discount
          </h2>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>
          )}
          {successMsg && (
            <div className="bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2 mb-3">{successMsg}</div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Client</label>
              <select
                value={form.client_id}
                onChange={e => handleClientChange(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select client…</option>
                {clients.map(c => (
                  <option key={c.client_id} value={c.client_id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Discount Type</label>
              <select
                value={form.discount_type}
                onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Value ({form.discount_type === 'PERCENTAGE' ? '%' : '₹'})
              </label>
              <input
                type="number"
                min="0"
                max={form.discount_type === 'PERCENTAGE' ? 100 : undefined}
                value={form.discount_value}
                onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create Discount'}
            </button>
          </div>
        </div>

        {/* Active discount for selected client */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Active Discount</h2>
          {!selectedClientId ? (
            <p className="text-sm text-gray-400">Select a client to view their active discount.</p>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          ) : activeDiscount ? (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex items-start justify-between">
              <div>
                <div className="text-2xl font-bold text-indigo-700">{fmtValue(activeDiscount)}</div>
                <div className="text-sm text-indigo-600 mt-1">
                  {activeDiscount.discount_type === 'PERCENTAGE' ? 'Percentage off' : 'Fixed amount off'}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Created by {activeDiscount.created_by_name} on {fmtDate(activeDiscount.created_at)}
                </div>
              </div>
              <button
                onClick={() => handleDelete(activeDiscount.discount_id)}
                className="text-red-400 hover:text-red-600 mt-1"
                title="Remove discount"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No active discount for this client.</p>
          )}
        </div>
      </div>

      {/* Discount history */}
      {selectedClientId && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Discount History</h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-10 text-sm text-gray-400">No discount history</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created By</th>
                    <th className="px-4 py-3">Created At</th>
                    <th className="px-4 py-3">Applied At</th>
                    <th className="px-4 py-3">Applied To Order</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((d) => (
                    <tr key={d.discount_id} className="text-sm text-gray-700 hover:bg-gray-50">
                      <td className="px-4 py-3 capitalize">{d.discount_type.toLowerCase()}</td>
                      <td className="px-4 py-3 font-medium">{fmtValue(d)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${d.is_used ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                          {d.is_used ? 'Used' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">{d.created_by_name}</td>
                      <td className="px-4 py-3 text-xs">{fmtDate(d.created_at)}</td>
                      <td className="px-4 py-3 text-xs">{fmtDate(d.applied_at)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{d.applied_to_order || '—'}</td>
                      <td className="px-4 py-3">
                        {!d.is_used && (
                          <button
                            onClick={() => handleDelete(d.discount_id)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <TrashIcon className="w-4 h-4" />
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
      )}
    </div>
  );
}
