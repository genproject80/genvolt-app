import React, { useState, useEffect, useCallback } from 'react';
import { PencilIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  getAllTopicConfigs,
  getClientTopicConfig,
  saveClientTopicConfig,
  resetTopicConfig,
} from '../../services/topicConfigService';
import { clientService } from '../../services/clientService';

const DEVICE_TYPES = ['P1', 'P2', 'P3', 'HKMI', 'GAS'];

const DEFAULT_CONFIG = {
  topic_prefix: 'cloudsynk',
  telemetry_suffix: 'telemetry',
  config_suffix: 'config',
  device_type_overrides: {},
};

export default function TopicPatternConfig() {
  const [clients, setClients]               = useState([]);
  const [configuredMap, setConfiguredMap]   = useState({}); // clientId -> config
  const [loading, setLoading]               = useState(true);
  const [editClientId, setEditClientId]     = useState(null);
  const [form, setForm]                     = useState(DEFAULT_CONFIG);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');
  const [successMsg, setSuccessMsg]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clientsRes, configs] = await Promise.all([
        clientService.getAllClients({ limit: 1000 }),
        getAllTopicConfigs(),
      ]);
      const clientList = clientsRes?.clients || [];
      setClients(clientList);
      const map = {};
      (configs || []).forEach(c => { map[c.client_id] = c; });
      setConfiguredMap(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = async (client) => {
    setError('');
    setSuccessMsg('');
    setEditClientId(client.client_id);
    try {
      const config = await getClientTopicConfig(client.client_id);
      setForm({
        topic_prefix:     config.topic_prefix     || 'cloudsynk',
        telemetry_suffix: config.telemetry_suffix || 'telemetry',
        config_suffix:    config.config_suffix    || 'config',
        device_type_overrides: config.device_type_overrides || {},
      });
    } catch {
      setForm(DEFAULT_CONFIG);
    }
  };

  const handleSave = async () => {
    if (!form.topic_prefix.trim()) { setError('Topic prefix is required'); return; }
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      await saveClientTopicConfig(editClientId, form);
      setSuccessMsg('Config saved. Topic update pushed to all active devices. Subscriber reload signaled.');
      load();
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (clientId) => {
    if (!window.confirm('Reset this client to default topic patterns?')) return;
    try {
      await resetTopicConfig(clientId);
      setConfiguredMap(m => { const n = { ...m }; delete n[clientId]; return n; });
      if (editClientId === clientId) setEditClientId(null);
    } catch { /* ignore */ }
  };

  const updateOverride = (devType, field, value) => {
    setForm(f => ({
      ...f,
      device_type_overrides: {
        ...f.device_type_overrides,
        [devType]: {
          ...(f.device_type_overrides[devType] || {}),
          [field]: value,
        },
      },
    }));
  };

  const editClient = clients.find(c => c.client_id === editClientId);
  const previewPrefix = form.topic_prefix || 'cloudsynk';
  const previewTelemetry = `${previewPrefix}/{client_id}/{device_id}/${form.telemetry_suffix || 'telemetry'}`;
  const previewConfig    = `${previewPrefix}/{client_id}/{device_id}/${form.config_suffix || 'config'}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Topic Pattern Configuration</h1>
        <p className="mt-1 text-sm text-gray-500">
          Customize MQTT topic patterns per client. Changes immediately push to active devices and reload the Python subscriber.
        </p>
      </div>

      {/* Warning banner */}
      <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3 flex gap-2">
        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <span>
          Saving a config will immediately push updated topic paths to all active devices for this client and signal the Python subscriber to re-subscribe.
          <strong> Devices must reconnect to complete the transition.</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Client list */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Clients</h2>
            </div>
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {clients.map(client => {
                  const config = configuredMap[client.client_id];
                  return (
                    <div
                      key={client.client_id}
                      className={`px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${editClientId === client.client_id ? 'bg-indigo-50' : ''}`}
                      onClick={() => openEdit(client)}
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-800">{client.name}</div>
                        {config ? (
                          <div className="text-xs text-indigo-600">{config.topic_prefix}/…</div>
                        ) : (
                          <div className="text-xs text-gray-400">Default (cloudsynk/…)</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button className="text-indigo-500 hover:text-indigo-700">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        {config && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReset(client.client_id); }}
                            className="text-gray-400 hover:text-red-500"
                            title="Reset to defaults"
                          >
                            <ArrowPathIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Config editor */}
        <div className="lg:col-span-3">
          {editClientId && editClient ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
              <h2 className="text-base font-semibold text-gray-900">
                Config: <span className="text-indigo-600">{editClient.name}</span>
              </h2>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>
              )}
              {successMsg && (
                <div className="bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2">{successMsg}</div>
              )}

              {/* Base pattern */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Topic Prefix</label>
                  <input type="text" value={form.topic_prefix}
                    onChange={e => setForm(f => ({ ...f, topic_prefix: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Telemetry Suffix</label>
                  <input type="text" value={form.telemetry_suffix}
                    onChange={e => setForm(f => ({ ...f, telemetry_suffix: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Config Suffix</label>
                  <input type="text" value={form.config_suffix}
                    onChange={e => setForm(f => ({ ...f, config_suffix: e.target.value }))}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Live Preview */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono">
                <div className="text-gray-400 mb-1">Live Preview:</div>
                <div className="text-indigo-700">Telemetry: {previewTelemetry}</div>
                <div className="text-green-700">Config:    {previewConfig}</div>
              </div>

              {/* Device Type Overrides */}
              <div>
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Device Type Overrides (optional)</h3>
                <div className="space-y-2">
                  {DEVICE_TYPES.map(dt => {
                    const ovr = form.device_type_overrides[dt] || {};
                    return (
                      <div key={dt} className="grid grid-cols-3 gap-2 items-center">
                        <span className="text-xs font-medium text-gray-600">{dt}</span>
                        <input
                          type="text"
                          placeholder={`Telemetry (default: ${form.telemetry_suffix})`}
                          value={ovr.telemetry || ''}
                          onChange={e => updateOverride(dt, 'telemetry', e.target.value)}
                          className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                        <input
                          type="text"
                          placeholder={`Config (default: ${form.config_suffix})`}
                          value={ovr.config || ''}
                          onChange={e => updateOverride(dt, 'config', e.target.value)}
                          className="text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save & Push to Devices'}
                </button>
                <button
                  onClick={() => handleReset(editClientId)}
                  className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  Reset to Default
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 flex items-center justify-center text-sm text-gray-400">
              Select a client from the list to configure its topic patterns.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
