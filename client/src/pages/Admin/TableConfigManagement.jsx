import React, { useState, useEffect } from 'react';
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { usePermissions } from '../../hooks/usePermissions';
import { tableConfigService } from '../../services/tableConfigService';
import TableConfigModal from '../../components/modals/TableConfigModal';
import DeleteTableConfigModal from '../../components/modals/DeleteTableConfigModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const TableConfigManagement = () => {
  const { canManageDeviceTestingTables, loading: permLoading } = usePermissions();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [deletingConfig, setDeletingConfig] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const loadConfigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await tableConfigService.getAllConfigs();
      setConfigs(result.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load table configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManageDeviceTestingTables) loadConfigs();
  }, [canManageDeviceTestingTables]);

  const handleToggle = async (config) => {
    setTogglingId(config.config_id);
    try {
      await tableConfigService.toggleConfig(config.config_id);
      await loadConfigs();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to toggle configuration');
    } finally {
      setTogglingId(null);
    }
  };

  if (permLoading) {
    return <div className="flex items-center justify-center min-h-64"><LoadingSpinner /></div>;
  }

  if (!canManageDeviceTestingTables) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-center">
        <ExclamationTriangleIcon className="w-12 h-12 text-yellow-400 mb-3" />
        <h3 className="text-lg font-semibold text-gray-800">Access Denied</h3>
        <p className="text-sm text-gray-500 mt-1">Only SYSTEM_ADMIN can manage table configurations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Table Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage which database tables appear in Device Testing. Changes take effect immediately — no deployment needed.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Add New Table
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
        ) : configs.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            No table configurations yet. Click "Add New Table" to get started.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Display Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Table Key</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">DB Table</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Columns</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Order</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {configs.map((cfg) => (
                <tr key={cfg.config_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{cfg.display_name}</td>
                  <td className="px-4 py-3 text-sm">
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{cfg.table_key}</code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{cfg.table_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {Array.isArray(cfg.column_config) ? cfg.column_config.length : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{cfg.sort_order}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(cfg)}
                      disabled={togglingId === cfg.config_id}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        cfg.is_active ? 'bg-primary-600' : 'bg-gray-200'
                      } ${togglingId === cfg.config_id ? 'opacity-50' : ''}`}
                      title={cfg.is_active ? 'Active – click to disable' : 'Inactive – click to enable'}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                          cfg.is_active ? 'translate-x-4' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingConfig(cfg)}
                        className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        title="Edit"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingConfig(cfg)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <TableConfigModal
          mode="create"
          onClose={() => setShowCreateModal(false)}
          onSaved={loadConfigs}
        />
      )}

      {editingConfig && (
        <TableConfigModal
          mode="edit"
          config={editingConfig}
          onClose={() => setEditingConfig(null)}
          onSaved={() => { setEditingConfig(null); loadConfigs(); }}
        />
      )}

      {deletingConfig && (
        <DeleteTableConfigModal
          config={deletingConfig}
          onClose={() => setDeletingConfig(null)}
          onDeleted={() => { setDeletingConfig(null); loadConfigs(); }}
        />
      )}
    </div>
  );
};

export default TableConfigManagement;
