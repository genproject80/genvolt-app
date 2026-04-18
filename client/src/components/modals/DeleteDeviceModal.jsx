import React, { useState } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { IconAlertTriangle } from '@tabler/icons-react';
import LoadingSpinner from '../common/LoadingSpinner';

const DeleteDeviceModal = ({ isOpen, onClose, device, onSuccess }) => {
  const { deleteDevice, loading } = useDevice();
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!device) return;

    try {
      setError('');
      await deleteDevice(device.id);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to delete device:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to delete device';
      setError(errorMessage);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  if (!device) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Delete Device"
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-center space-x-3 text-red-600">
          <IconAlertTriangle className="w-6 h-6" />
          <p className="text-sm font-medium">This action cannot be undone.</p>
        </div>

        <p className="text-sm text-gray-700">
          Are you sure you want to delete the device{' '}
          <span className="font-semibold">{device.device_id}</span>?
        </p>

        {device.client_name && (
          <p className="text-sm text-gray-600">
            This device is currently assigned to client:{' '}
            <span className="font-semibold">{device.client_name}</span>
          </p>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            disabled={loading}
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Delete Device
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteDeviceModal;
