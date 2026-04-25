import React, { useState, useEffect, useCallback } from 'react';
import {
  getAllSubscriptions, getPlans, cancelSubscription,
  createManualSubscription, changePlan, extendEndDate,
} from '../../services/subscriptionService';
import { clientService } from '../../services/clientService';
import { IconFilter, IconPlus, IconPencil, IconCalendar } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Pagination, Center, Loader, Text, Group, Badge, ActionIcon, Tooltip,
} from '@mantine/core';
import SearchableSelect from '../../components/common/SearchableSelect';

const STATUS_COLORS = {
  ACTIVE: 'green', GRACE: 'yellow', EXPIRED: 'red', CANCELLED: 'gray', PENDING: 'blue',
};
const ASSIGN_TYPE_COLORS = { PAYMENT: 'indigo', MANUAL: 'violet', TRIAL: 'teal' };

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const defaultEndDate = () => {
  const d = new Date(); d.setMonth(d.getMonth() + 1);
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

  const [cancellingId, setCancellingId]   = useState(null);
  const [cancelReason, setCancelReason]   = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [targetSub, setTargetSub]         = useState(null);

  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ client_id: '', plan_id: '', billing_cycle: 'monthly', end_date: defaultEndDate(), assignment_type: 'MANUAL', admin_notes: '' });
  const [manualSaving, setManualSaving]   = useState(false);
  const [manualError, setManualError]     = useState('');

  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [changePlanTarget, setChangePlanTarget]       = useState(null);
  const [newPlanId, setNewPlanId]                     = useState('');
  const [changingPlan, setChangingPlan]               = useState(false);

  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendTarget, setExtendTarget]       = useState(null);
  const [newEndDate, setNewEndDate]           = useState('');
  const [extending, setExtending]             = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, planList] = await Promise.all([
        getAllSubscriptions({ page, limit: 20, status: filterStatus || undefined, plan_id: filterPlan || undefined }),
        plans.length === 0 ? getPlans() : Promise.resolve(plans),
      ]);
      setSubscriptions(subRes.data || []);
      setMeta(subRes.meta || {});
      if (plans.length === 0) setPlans(planList || []);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterPlan]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    clientService.getAllClients({ limit: 1000 })
      .then(res => setClients(res?.clients || []))
      .catch(() => {});
  }, []);

  const handleCancelConfirm = async () => {
    if (!targetSub) return;
    setCancellingId(targetSub.subscription_id);
    try { await cancelSubscription(targetSub.subscription_id, cancelReason); setShowCancelModal(false); setCancelReason(''); load(); }
    finally { setCancellingId(null); }
  };

  const handleManualSave = async () => {
    if (!manualForm.client_id) { setManualError('Select a client'); return; }
    if (!manualForm.plan_id)   { setManualError('Select a plan'); return; }
    if (!manualForm.end_date)  { setManualError('Set end date'); return; }
    setManualSaving(true);
    setManualError('');
    try {
      await createManualSubscription({
        client_id: parseInt(manualForm.client_id), plan_id: parseInt(manualForm.plan_id),
        billing_cycle: manualForm.billing_cycle, end_date: manualForm.end_date,
        assignment_type: manualForm.assignment_type, admin_notes: manualForm.admin_notes,
      });
      setShowManualModal(false);
      setManualForm({ client_id: '', plan_id: '', billing_cycle: 'monthly', end_date: defaultEndDate(), assignment_type: 'MANUAL', admin_notes: '' });
      load();
    } catch (err) { setManualError(err?.message || 'Failed to create subscription'); }
    finally { setManualSaving(false); }
  };

  const handleChangePlan = async () => {
    if (!newPlanId) return;
    setChangingPlan(true);
    try { await changePlan(changePlanTarget.subscription_id, parseInt(newPlanId)); setShowChangePlanModal(false); load(); }
    finally { setChangingPlan(false); }
  };

  const handleExtend = async () => {
    if (!newEndDate) return;
    setExtending(true);
    try { await extendEndDate(extendTarget.subscription_id, newEndDate); setShowExtendModal(false); load(); }
    finally { setExtending(false); }
  };

  const rows = subscriptions.map((sub) => (
    <Table.Tr key={sub.subscription_id}>
      <Table.Td>
        <Text size="sm" fw={500}>{sub.client_name}</Text>
        <Text size="xs" c="dimmed">{sub.client_email}</Text>
      </Table.Td>
      <Table.Td><Text size="sm" fw={500}>{sub.plan_name}</Text></Table.Td>
      <Table.Td>
        <Badge color={STATUS_COLORS[sub.status] || 'gray'} variant="light" size="sm">{sub.status}</Badge>
      </Table.Td>
      <Table.Td>
        {sub.assignment_type && (
          <Badge color={ASSIGN_TYPE_COLORS[sub.assignment_type] || 'gray'} variant="light" size="sm">
            {sub.assignment_type}
          </Badge>
        )}
        {sub.admin_notes && (
          <Text component="span" size="xs" c="dimmed" ml={4} title={sub.admin_notes} style={{ cursor: 'help' }}>ⓘ</Text>
        )}
      </Table.Td>
      <Table.Td><Text size="xs" c="dimmed" tt="capitalize">{sub.billing_cycle}</Text></Table.Td>
      <Table.Td><Text size="xs">{fmtDate(sub.start_date)}</Text></Table.Td>
      <Table.Td><Text size="xs">{fmtDate(sub.end_date)}</Text></Table.Td>
      <Table.Td><Text size="xs">{fmtDate(sub.grace_end_date)}</Text></Table.Td>
      <Table.Td>
        {!['CANCELLED', 'EXPIRED'].includes(sub.status) && (
          <Group gap={4}>
            <Tooltip label="Change Plan" withArrow>
              <ActionIcon variant="subtle" color="indigo" size="sm"
                onClick={() => { setChangePlanTarget(sub); setNewPlanId(''); setShowChangePlanModal(true); }}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Extend End Date" withArrow>
              <ActionIcon variant="subtle" color="green" size="sm"
                onClick={() => { setExtendTarget(sub); setNewEndDate(sub.end_date ? new Date(sub.end_date).toISOString().split('T')[0] : defaultEndDate()); setShowExtendModal(true); }}>
                <IconCalendar size={16} />
              </ActionIcon>
            </Tooltip>
            <button onClick={() => { setTargetSub(sub); setShowCancelModal(true); }}
              className="text-xs text-red-500 hover:text-red-700 hover:underline">
              Cancel
            </button>
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Management</h1>
          <p className="mt-1 text-sm text-gray-500">View and manage all client subscriptions. Total: {meta.total}</p>
        </div>
        <button
          onClick={() => { setManualForm({ client_id: '', plan_id: '', billing_cycle: 'monthly', end_date: defaultEndDate(), assignment_type: 'MANUAL', admin_notes: '' }); setManualError(''); setShowManualModal(true); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <IconPlus className="w-4 h-4" />
          Assign Subscription
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <IconFilter className="w-4 h-4 text-gray-400" />
        <SearchableSelect
          options={[
            { value: 'ACTIVE', label: 'Active' }, { value: 'GRACE', label: 'Grace Period' },
            { value: 'EXPIRED', label: 'Expired' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: 'PENDING', label: 'Pending' },
          ]}
          value={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1); }}
          placeholder="All Statuses" className="w-full sm:w-40"
        />
        <SearchableSelect
          options={plans.map((p) => ({ value: String(p.plan_id), label: p.name }))}
          value={filterPlan} onChange={(v) => { setFilterPlan(v); setPage(1); }}
          placeholder="All Plans" className="w-full sm:w-44"
        />
        <button onClick={() => { setFilterStatus(''); setFilterPlan(''); setPage(1); }}
          className="text-sm text-gray-500 hover:text-gray-700 underline">
          Clear filters
        </button>
      </div>

      {/* Table */}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : subscriptions.length === 0 ? (
            <Center py="xl"><Text size="sm" c="dimmed">No subscriptions found</Text></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Client</Table.Th>
                  <Table.Th>Plan</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Billing</Table.Th>
                  <Table.Th>Start</Table.Th>
                  <Table.Th>End</Table.Th>
                  <Table.Th>Grace End</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>

        {meta.totalPages > 1 && (
          <Group justify="space-between" align="center" px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="sm" c="dimmed">Page {meta.page} of {meta.totalPages}</Text>
            <Pagination total={meta.totalPages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
      </Paper>

      {/* Manual assign modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Assign Subscription</h3>
            {manualError && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{manualError}</div>}
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
              <button onClick={() => setShowManualModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleManualSave} disabled={manualSaving} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
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
            <p className="text-sm text-gray-600 mb-1">Client: <strong>{changePlanTarget.client_name}</strong><br />Current plan: <strong>{changePlanTarget.plan_name}</strong></p>
            <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2 mb-4">Price takes effect at next renewal.</p>
            <select value={newPlanId} onChange={e => setNewPlanId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Select new plan…</option>
              {plans.filter(p => p.plan_id !== changePlanTarget.plan_id).map(p => (
                <option key={p.plan_id} value={p.plan_id}>{p.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowChangePlanModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleChangePlan} disabled={changingPlan || !newPlanId} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {changingPlan ? 'Saving…' : 'Change Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend modal */}
      {showExtendModal && extendTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Extend End Date</h3>
            <p className="text-sm text-gray-600 mb-4">Extending for <strong>{extendTarget.client_name}</strong>. Current end date: <strong>{fmtDate(extendTarget.end_date)}</strong></p>
            <label className="block text-xs font-medium text-gray-700 mb-1">New End Date</label>
            <input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowExtendModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleExtend} disabled={extending || !newEndDate} className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-60">
                {extending ? 'Extending…' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel modal */}
      {showCancelModal && targetSub && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel Subscription</h3>
            <p className="text-sm text-gray-600 mb-4">Cancel the <strong>{targetSub.plan_name}</strong> subscription for <strong>{targetSub.client_name}</strong>? This cannot be undone.</p>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)" rows={3}
              className="w-full text-sm border border-gray-300 rounded-lg p-3 mb-4 focus:outline-none focus:ring-2 focus:ring-red-400" />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowCancelModal(false); setCancelReason(''); }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Keep Active</button>
              <button onClick={handleCancelConfirm} disabled={!!cancellingId} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60">
                {cancellingId ? 'Cancelling…' : 'Cancel Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
