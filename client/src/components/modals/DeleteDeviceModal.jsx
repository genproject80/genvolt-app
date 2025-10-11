import React, { useState } from 'react';
import { useDevice } from '../../context/DeviceContext';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import AccessDeniedModal from '../common/AccessDeniedModal';
import Modal from '../common/Modal';

const DeleteDeviceModal = ({ isOpen, onClose, onSuccess, device }) => {
  const { deleteDevice, loading, error } = useDevice();
  const { canRemoveDevice } = useDevicePermissions();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Permission check
  if (!canRemoveDevice) {
    return (
      <AccessDeniedModal
        isOpen={isOpen}
        onClose={onClose}
        message="You don't have permission to remove devices."
      />
    );
  }

  const handleDelete = async () => {
    if (!device) return;

    try {
      setIsDeleting(true);
      setDeleteError('');

      await deleteDevice(device.id);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error deleting device:', error);
      setDeleteError(error.message || 'Failed to delete device');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!device) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Device"
      size="md"
    >
      <div className="space-y-6">
        {/* Error Display */}
        {(deleteError || error) && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{deleteError || error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Warning Icon and Message */}
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <svg className="h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Are you sure you want to delete this device?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This action cannot be undone. All data associated with this device will be permanently removed.
            </p>
          </div>
        </div>

        {/* Device Information */}
        <div className="bg-gray-50 rounded-md p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Device Details:</h4>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Device ID:</span>
              <span className="font-medium text-gray-900">{device.device_id}</span>
            </div>
            {device.Model && (
              <div className="flex justify-between">
                <span className="text-gray-600">Model:</span>
                <span className="font-medium text-gray-900">{device.Model}</span>
              </div>
            )}
            {device.client_name && (
              <div className="flex justify-between">
                <span className="text-gray-600">Client:</span>
                <span className="font-medium text-gray-900">{device.client_name}</span>
              </div>
            )}
            {device.machin_id && (
              <div className="flex justify-between">
                <span className="text-gray-600">Machine ID:</span>
                <span className="font-medium text-gray-900">{device.machin_id}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Created:</span>
              <span className="font-medium text-gray-900">
                {new Date(device.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Warning Message */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-800">
                <strong>Important:</strong> Deleting this device will:
              </p>
              <ul className="text-sm text-yellow-800 mt-2 list-disc list-inside space-y-1">
                <li>Permanently remove all device configuration</li>
                <li>Remove all associated transfer history</li>
                <li>Make the device unavailable for data collection</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting || loading}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting || loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Deleting...
              </span>
            ) : (
              'Delete Device'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteDeviceModal;