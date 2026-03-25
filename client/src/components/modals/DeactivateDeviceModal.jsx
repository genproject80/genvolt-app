import React, { useState } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../common/LoadingSpinner';

const DeactivateDeviceModal = ({ isOpen, onClose, device, onSuccess }) => {
  const { deactivateDevice, loading } = useDevice();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleDeactivate = async () => {
    if (!device) return;
    try {
      setError('');
      await deactivateDevice(device.device_id, { reason: reason.trim() || undefined });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Deactivation failed');
    }
  };

  const handleClose = () => {
    setReason('');
    setError('');
    onClose();
  };

  if (!device) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Deactivate Device" size="sm">
      <div className="space-y-4">
        <div className="flex items-center space-x-3 text-amber-600">
          <ExclamationTriangleIcon className="w-6 h-6 flex-shrink-0" />
          <p className="text-sm font-medium">The device will be disconnected from MQTT and denied future connections.</p>
        </div>

        <p className="text-sm text-gray-700">
          Are you sure you want to deactivate{' '}
          <span className="font-semibold">{device.device_id}</span>?
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Payment failed, hardware replaced..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeactivate}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Deactivate
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeactivateDeviceModal;
