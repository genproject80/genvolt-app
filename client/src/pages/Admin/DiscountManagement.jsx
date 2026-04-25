import React, { useState, useEffect, useCallback } from 'react';
import { IconTag, IconTrash } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Loader, Text, Badge, ActionIcon, Tooltip,
} from '@mantine/core';
import { getDiscountHistory, getActiveDiscount, createDiscount, deleteDiscount } from '../../services/discountService';
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
      const [hist, active] = await Promise.all([getDiscountHistory(cid), getActiveDiscount(cid)]);
      setHistory(hist || []);
      setActiveDiscount(active || null);
    } finally { setLoading(false); }
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
    if (!form.discount_value || parseFloat(form.discount_value) <= 0) { setError('Enter a valid discount value'); return; }
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      await createDiscount({ client_id: parseInt(form.client_id), discount_type: form.discount_type, discount_value: parseFloat(form.discount_value) });
      setSuccessMsg("Discount created. It will be applied to the client's next payment.");
      setForm(EMPTY_FORM);
      loadClientData(selectedClientId);
    } catch (err) { setError(err?.message || 'Failed to create discount'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await deleteDiscount(id); loadClientData(selectedClientId); }
    catch (err) { setError(err?.message || 'Failed to delete discount'); }
  };

  const historyRows = history.map((d) => (
    <Table.Tr key={d.discount_id}>
      <Table.Td><Text size="sm" tt="capitalize">{d.discount_type.toLowerCase()}</Text></Table.Td>
      <Table.Td><Text size="sm" fw={500}>{fmtValue(d)}</Text></Table.Td>
      <Table.Td>
        <Badge color={d.is_used ? 'gray' : 'green'} variant="light" size="sm">
          {d.is_used ? 'Used' : 'Active'}
        </Badge>
      </Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{d.created_by_name}</Text></Table.Td>
      <Table.Td><Text size="xs">{fmtDate(d.created_at)}</Text></Table.Td>
      <Table.Td><Text size="xs">{fmtDate(d.applied_at)}</Text></Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{d.applied_to_order || '—'}</Text></Table.Td>
      <Table.Td>
        {!d.is_used && (
          <Tooltip label="Delete" withArrow>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleDelete(d.discount_id)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Discount Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Apply one-time discounts to client accounts. Discounts are applied silently on the next payment.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
        Discounts are invisible to the client. They see only the final (reduced) amount on the checkout page.
        Only one active discount per client at a time.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <IconTag className="w-5 h-5 text-indigo-500" />
            Set Discount
          </h2>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{error}</div>}
          {successMsg && <div className="bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2 mb-3">{successMsg}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Client</label>
              <select value={form.client_id} onChange={e => handleClientChange(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Discount Type</label>
              <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Value ({form.discount_type === 'PERCENTAGE' ? '%' : '₹'})
              </label>
              <input type="number" min="0" max={form.discount_type === 'PERCENTAGE' ? 100 : undefined}
                value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button onClick={handleCreate} disabled={saving}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Creating…' : 'Create Discount'}
            </button>
          </div>
        </div>

        {/* Active discount */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Active Discount</h2>
          {!selectedClientId ? (
            <p className="text-sm text-gray-400">Select a client to view their active discount.</p>
          ) : loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : activeDiscount ? (
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex items-start justify-between">
              <div>
                <div className="text-2xl font-bold text-indigo-700">{fmtValue(activeDiscount)}</div>
                <div className="text-sm text-indigo-600 mt-1">{activeDiscount.discount_type === 'PERCENTAGE' ? 'Percentage off' : 'Fixed amount off'}</div>
                <div className="text-xs text-gray-500 mt-2">Created by {activeDiscount.created_by_name} on {fmtDate(activeDiscount.created_at)}</div>
              </div>
              <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(activeDiscount.discount_id)} title="Remove discount">
                <IconTrash size={16} />
              </ActionIcon>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No active discount for this client.</p>
          )}
        </div>
      </div>

      {/* Discount history */}
      {selectedClientId && (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Discount History</h2>
          </div>
          <ScrollArea>
            {loading ? (
              <Center py="xl"><Loader size="sm" /></Center>
            ) : history.length === 0 ? (
              <Center py="xl"><Text size="sm" c="dimmed">No discount history</Text></Center>
            ) : (
              <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Value</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Created By</Table.Th>
                    <Table.Th>Created At</Table.Th>
                    <Table.Th>Applied At</Table.Th>
                    <Table.Th>Applied To Order</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{historyRows}</Table.Tbody>
              </Table>
            )}
          </ScrollArea>
        </Paper>
      )}
    </div>
  );
}
