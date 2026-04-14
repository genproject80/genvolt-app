import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon, PencilIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';
import {
  getAllInventory,
  createInventory,
  updateInventory,
  deactivateInventory,
} from '../../services/inventoryService';

const LOGIC_ID_LABELS = {
  1: 'HK — P3 SICK Sensor',
  2: 'HY — P4 HyPure',
};
const logicLabel = (id) => LOGIC_ID_LABELS[id] || `LogicId ${id}`;
const ALL_LOGIC_IDS = [1, 2];

const EMPTY_FORM = {
  model_number: '',
  display_name: '',
  device_id_prefix: '',
  decoder_logic_ids: [],
  description: '',
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

  const openCreate = () => {
    setEditEntry(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (entry) => {
    setEditEntry(entry);
    setForm({
      model_number:      entry.model_number,
      display_name:      entry.display_name,
      device_id_prefix:  entry.device_id_prefix,
      decoder_logic_ids: entry.decoder_logic_ids || [],
      description:       entry.description || '',
    });
    setError('');
    setShowModal(true);
  };

  const selectLogicId = (id) => {
    setForm(f => ({ ...f, decoder_logic_ids: [id] }));
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
      if (editEntry) {
        await updateInventory(editEntry.model_number, payload);
      } else {
        await createInventory(payload);
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
      await deactivateInventory(archiveTarget.model_number);
      setArchiveTarget(null);
      load();
    } finally {
      setArchiving(false);
    }
  };

  const handleUnarchive = async (entry) => {
    try {
      await updateInventory(entry.model_number, { is_active: true });
      load();
    } catch { /* ignore */ }
  };

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
          <PlusIcon className="w-4 h-4" />
          New Model
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">No inventory entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Model Number</th>
                  <th className="px-4 py-3">Display Name</th>
                  <th className="px-4 py-3">ID Prefix</th>
                  <th className="px-4 py-3">Decoder Logic ID</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr
                    key={entry.model_number}
                    className={`text-sm text-gray-700 hover:bg-gray-50 ${!entry.is_active ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono font-medium">{entry.model_number}</td>
                    <td className="px-4 py-3">{entry.display_name}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">
                        {entry.device_id_prefix}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.decoder_logic_ids?.[0] != null ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                          {entry.decoder_logic_ids[0]} — {logicLabel(entry.decoder_logic_ids[0])}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{entry.description || '—'}</td>
                    <td className="px-4 py-3">
                      {entry.is_active ? (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-800">Active</span>
                      ) : (
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500">Archived</span>
                      )}
                    </td>
                    <td className="px-4 py-3 flex gap-2 items-center">
                      <button
                        onClick={() => openEdit(entry)}
                        className="text-indigo-500 hover:text-indigo-700"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      {entry.is_active ? (
                        <button
                          onClick={() => setArchiveTarget(entry)}
                          className="text-red-400 hover:text-red-600"
                          title="Archive"
                        >
                          <ArchiveBoxIcon className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUnarchive(entry)}
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editEntry ? `Edit Model: ${editEntry.model_number}` : 'New Model'}
            </h3>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-2 mb-4">{error}</div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Model Number *</label>
                  <input
                    type="text"
                    value={form.model_number}
                    onChange={e => setForm(f => ({ ...f, model_number: e.target.value }))}
                    disabled={!!editEntry}
                    placeholder="e.g. GV-M1"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                  />
                  {editEntry && <p className="text-xs text-gray-400 mt-1">Model number cannot be changed.</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Device ID Prefix *</label>
                  <input
                    type="text"
                    value={form.device_id_prefix}
                    onChange={e => setForm(f => ({ ...f, device_id_prefix: e.target.value.toUpperCase() }))}
                    placeholder="e.g. GV"
                    maxLength={20}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">Prepended to auto-generated device IDs.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Name *</label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder="e.g. GenVolt Meter v1"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Decoder Logic ID *</label>
                <select
                  value={form.decoder_logic_ids[0] ?? ''}
                  onChange={e => selectLogicId(Number(e.target.value))}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>Select decoder…</option>
                  {ALL_LOGIC_IDS.map(id => (
                    <option key={id} value={id}>{id} — {logicLabel(id)}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Each model maps to exactly one decoder. The device does not send a logic ID.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Optional description"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
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
              <button
                onClick={() => setArchiveTarget(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60"
              >
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
