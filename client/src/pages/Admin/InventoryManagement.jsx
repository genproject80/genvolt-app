import React, { useState, useEffect, useCallback } from 'react';
import { IconPlus, IconPencil, IconArchive } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Loader, Text, Badge, Group, ActionIcon, Tooltip, Code,
} from '@mantine/core';
import {
  getAllInventory, createInventory, updateInventory, deactivateInventory,
} from '../../services/inventoryService';

const LOGIC_ID_LABELS = { 1: 'HK — P3 SICK Sensor', 2: 'HY — P4 HyPure' };
const logicLabel = (id) => LOGIC_ID_LABELS[id] || `LogicId ${id}`;
const ALL_LOGIC_IDS = [1, 2];

const EMPTY_FORM = {
  model_number: '', display_name: '', device_id_prefix: '',
  decoder_logic_ids: [], description: '',
};

export default function InventoryManagement() {
  const [entries, setEntries]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editEntry, setEditEntry]     = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllInventory();
      setEntries(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditEntry(null); setForm(EMPTY_FORM); setError(''); setShowModal(true); };
  const openEdit = (entry) => {
    setEditEntry(entry);
    setForm({
      model_number: entry.model_number, display_name: entry.display_name,
      device_id_prefix: entry.device_id_prefix,
      decoder_logic_ids: entry.decoder_logic_ids || [], description: entry.description || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.model_number.trim())     { setError('Model number is required'); return; }
    if (!form.display_name.trim())     { setError('Display name is required'); return; }
    if (!form.device_id_prefix.trim()) { setError('Device ID prefix is required'); return; }
    if (form.decoder_logic_ids.length !== 1) { setError('Select exactly one decoder logic ID'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        model_number:     form.model_number.trim().toUpperCase(),
        device_id_prefix: form.device_id_prefix.trim().toUpperCase(),
      };
      if (editEntry) { await updateInventory(editEntry.model_number, payload); }
      else           { await createInventory(payload); }
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
    try { await deactivateInventory(archiveTarget.model_number); setArchiveTarget(null); load(); }
    finally { setArchiving(false); }
  };

  const handleUnarchive = async (entry) => {
    try { await updateInventory(entry.model_number, { is_active: true }); load(); }
    catch { /* ignore */ }
  };

  const rows = entries.map((entry) => (
    <Table.Tr key={entry.model_number} opacity={entry.is_active ? 1 : 0.5}>
      <Table.Td><Code fz="sm">{entry.model_number}</Code></Table.Td>
      <Table.Td><Text size="sm">{entry.display_name}</Text></Table.Td>
      <Table.Td><Code fz="xs">{entry.device_id_prefix}</Code></Table.Td>
      <Table.Td>
        {entry.decoder_logic_ids?.[0] != null
          ? <Badge color="indigo" variant="light" size="sm">{entry.decoder_logic_ids[0]} — {logicLabel(entry.decoder_logic_ids[0])}</Badge>
          : <Text size="xs" c="dimmed">—</Text>}
      </Table.Td>
      <Table.Td style={{ maxWidth: 240 }}>
        <Text size="sm" c="dimmed" truncate="end">{entry.description || '—'}</Text>
      </Table.Td>
      <Table.Td>
        <Badge color={entry.is_active ? 'green' : 'gray'} variant="light" size="sm">
          {entry.is_active ? 'Active' : 'Archived'}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="Edit" withArrow>
            <ActionIcon variant="subtle" color="indigo" size="sm" onClick={() => openEdit(entry)}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          {entry.is_active ? (
            <Tooltip label="Archive" withArrow>
              <ActionIcon variant="subtle" color="red" size="sm" onClick={() => setArchiveTarget(entry)}>
                <IconArchive size={16} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <button onClick={() => handleUnarchive(entry)} className="text-xs text-green-600 hover:underline">
              Unarchive
            </button>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="mt-1 text-sm text-gray-500">
            Device model registry — defines decoder logic and device ID prefix per model.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
        >
          <IconPlus className="w-4 h-4" />
          New Model
        </button>
      </div>

      {/* Table */}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : entries.length === 0 ? (
            <Center py="xl"><Text size="sm" c="dimmed">No inventory entries found.</Text></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Model Number</Table.Th>
                  <Table.Th>Display Name</Table.Th>
                  <Table.Th>ID Prefix</Table.Th>
                  <Table.Th>Decoder Logic ID</Table.Th>
                  <Table.Th>Description</Table.Th>
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editEntry ? `Edit Model: ${editEntry.model_number}` : 'New Model'}
            </h3>
            {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Model Number *</label>
                  <input type="text" value={form.model_number}
                    onChange={e => setForm(f => ({ ...f, model_number: e.target.value }))}
                    disabled={!!editEntry} placeholder="e.g. GV-M1"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400" />
                  {editEntry && <p className="text-xs text-gray-400 mt-1">Model number cannot be changed.</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Device ID Prefix *</label>
                  <input type="text" value={form.device_id_prefix}
                    onChange={e => setForm(f => ({ ...f, device_id_prefix: e.target.value.toUpperCase() }))}
                    placeholder="e.g. GV" maxLength={20}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <p className="text-xs text-gray-400 mt-1">Prepended to auto-generated device IDs.</p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Name *</label>
                <input type="text" value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="e.g. GenVolt Meter v1"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Decoder Logic ID *</label>
                <select value={form.decoder_logic_ids[0] ?? ''}
                  onChange={e => setForm(f => ({ ...f, decoder_logic_ids: [Number(e.target.value)] }))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="" disabled>Select decoder…</option>
                  {ALL_LOGIC_IDS.map(id => <option key={id} value={id}>{id} — {logicLabel(id)}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Each model maps to exactly one decoder.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Optional description"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60">
                {saving ? 'Saving…' : (editEntry ? 'Save Changes' : 'Create Model')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirm */}
      {archiveTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Archive Model</h3>
            <p className="text-sm text-gray-600 mb-2">
              Archive <strong>{archiveTarget.model_number}</strong> ({archiveTarget.display_name})?
              Existing devices using this model are unaffected.
            </p>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setArchiveTarget(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleArchive} disabled={archiving} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60">
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
