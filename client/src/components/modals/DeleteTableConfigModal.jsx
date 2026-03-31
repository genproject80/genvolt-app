import React, { useState } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { tableConfigService } from '../../services/tableConfigService';

/**
 * DeleteTableConfigModal - Confirmation dialog for deleting a table configuration.
 * Props:
 *   config   {Object}  - The config to delete
 *   onClose  {fn}
 *   onDeleted {fn}     - Callback after successful delete
 */
const DeleteTableConfigModal = ({ config, onClose, onDeleted }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await tableConfigService.deleteConfig(config.config_id);
      onDeleted();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete configuration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-red-100">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Delete Table Configuration</h3>
              <p className="text-sm text-gray-500">This action cannot be undone.</p>
            </div>
          </div>

          <p className="text-sm text-gray-700 mb-4">
            Are you sure you want to delete <strong>{config.display_name}</strong> (
            <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">{config.table_key}</code>
            )? The actual database table will not be affected.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteTableConfigModal;
