import React, { useState, useEffect, useCallback } from 'react';
import { IconPlus, IconPencil, IconArchive } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Loader, Text, Badge, Group, ActionIcon, Tooltip,
} from '@mantine/core';
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
    try { const data = await getAllPlans(); setPlans(data || []); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditPlan(null); setForm(EMPTY_FORM); setError(''); setShowModal(true); };
  const openEdit = (plan) => {
    setEditPlan(plan);
    setForm({
      name: plan.name, description: plan.description || '',
      max_devices: plan.max_devices, price_monthly: plan.price_monthly, price_yearly: plan.price_yearly,
      grace_days: plan.grace_days, features: (plan.features || []).join(', '),
      razorpay_plan_id_monthly: plan.razorpay_plan_id_monthly || '',
      razorpay_plan_id_yearly:  plan.razorpay_plan_id_yearly  || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim())       { setError('Name is required'); return; }
    if (!form.price_monthly)     { setError('Monthly price is required'); return; }
    if (!form.price_yearly)      { setError('Yearly price is required'); return; }
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
      if (editPlan) { await updatePlan(editPlan.plan_id, payload); }
      else          { await createPlan(payload); }
      setShowModal(false);
      load();
    } catch (err) { setError(err?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try { await deactivatePlan(archiveTarget.plan_id); setArchiveTarget(null); load(); }
    finally { setArchiving(false); }
  };

  const handleUnarchive = async (plan) => {
    try { await updatePlan(plan.plan_id, { is_active: true }); load(); }
    catch { /* ignore */ }
  };

  const rows = plans.map((plan) => (
    <Table.Tr key={plan.plan_id} opacity={plan.is_active ? 1 : 0.5}>
      <Table.Td>
        <Text size="sm" fw={500}>{plan.name}</Text>
        <Text size="xs" c="dimmed">{plan.description}</Text>
      </Table.Td>
      <Table.Td><Text size="sm">{fmtPrice(plan.price_monthly)}</Text></Table.Td>
      <Table.Td><Text size="sm">{fmtPrice(plan.price_yearly)}</Text></Table.Td>
      <Table.Td><Text size="sm">{plan.max_devices === -1 ? 'Unlimited' : plan.max_devices}</Text></Table.Td>
      <Table.Td><Text size="sm">{plan.grace_days}d</Text></Table.Td>
      <Table.Td>
        <Badge color={plan.is_active ? 'green' : 'gray'} variant="light" size="sm">
          {plan.is_active ? 'Active' : 'Archived'}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="Edit" withArrow>
            <ActionIcon variant="subtle" color="indigo" size="sm" onClick={() => openEdit(plan)}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          {plan.is_active ? (
            <Tooltip label="Archive" withArrow>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => setArchiveTarget(plan)}>
                <IconArchive size={16} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <button onClick={() => handleUnarchive(plan)} className="text-xs text-green-600 hover:underline">Unarchive</button>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plan Management</h1>
          <p className="mt-1 text-sm text-gray-500">Create, edit, and archive subscription plans.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
          <IconPlus className="w-4 h-4" />New Plan
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-3">
        Price changes apply to <strong>new subscriptions only</strong>. Existing active subscriptions are billed at their original locked-in amount.
      </div>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Monthly</Table.Th>
                  <Table.Th>Yearly</Table.Th>
                  <Table.Th>Max Devices</Table.Th>
                  <Table.Th>Grace Days</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Paper>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{editPlan ? `Edit Plan: ${editPlan.name}` : 'Create New Plan'}</h3>
            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>}
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
              {[
                { label: 'Monthly Price (₹) *', field: 'price_monthly' },
                { label: 'Yearly Price (₹) *',  field: 'price_yearly' },
                { label: 'Max Devices (-1 = unlimited)', field: 'max_devices' },
                { label: 'Grace Days', field: 'grace_days' },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input type="number" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Features (comma-separated)</label>
                <input type="text" value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))}
                  placeholder="e.g. 10 devices, Real-time monitoring"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              {[
                { label: 'Razorpay Plan ID (Monthly)', field: 'razorpay_plan_id_monthly' },
                { label: 'Razorpay Plan ID (Yearly)',  field: 'razorpay_plan_id_yearly' },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input type="text" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Saving…' : (editPlan ? 'Save Changes' : 'Create Plan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirm */}
      {archiveTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Archive Plan</h3>
            <p className="text-sm text-gray-600 mb-2">Archive <strong>{archiveTarget.name}</strong>? Existing subscriptions are unaffected.</p>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setArchiveTarget(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleArchive} disabled={archiving} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60">
                {archiving ? 'Archiving…' : 'Archive Plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
