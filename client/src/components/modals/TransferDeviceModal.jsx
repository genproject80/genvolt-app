import React, { useState, useEffect } from 'react';
import { useDevice } from '../../context/DeviceContext';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import { useClient } from '../../context/ClientContext';
import AccessDeniedModal from '../common/AccessDeniedModal';
import Modal from '../common/Modal';

const TransferDeviceModal = ({ isOpen, onClose, onSuccess, device }) => {
  const { transferDevice, loading, error } = useDevice();
  const { canTransferDevice } = useDevicePermissions();
  const { getClientHierarchyForTransfer, clientHierarchy } = useClient();

  const [formData, setFormData] = useState({
    buyer_id: ''
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');

  // Permission check
  if (!canTransferDevice) {
    return (
      <AccessDeniedModal
        isOpen={isOpen}
        onClose={onClose}
        message="You don't have permission to transfer devices."
      />
    );
  }

  useEffect(() => {
    if (isOpen) {
      // Load clients for transfer (only immediate children for CLIENT_ADMIN)
      getClientHierarchyForTransfer(device?.client_id);
      setFormData({
        buyer_id: ''
      });
      setValidationErrors({});
      setTransferError('');
    }
  }, [isOpen, device?.client_id, getClientHierarchyForTransfer]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.buyer_id) {
      errors.buyer_id = 'Please select a buyer client';
    } else if (device?.client_id && parseInt(formData.buyer_id) === device.client_id) {
      errors.buyer_id = 'Cannot transfer device to the same client';
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    try {
      setIsTransferring(true);
      setTransferError('');

      await transferDevice(device.id, parseInt(formData.buyer_id));

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error transferring device:', error);

      // Extract the error message from different possible sources
      let errorMessage = 'Failed to transfer device';

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      console.log('Setting transfer error message:', errorMessage);
      setTransferError(errorMessage);
    } finally {
      setIsTransferring(false);
    }
  };

  if (!device) {
    return null;
  }

  // Use clientHierarchy from the new endpoint (already filtered)
  // The backend already excludes the current device owner
  const availableClients = clientHierarchy || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transfer Device Ownership"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Display */}
        {(transferError || error) && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <div className="text-sm text-red-800">
                  {transferError || error}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Device Information */}
        <div className="bg-gray-50 rounded-md p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Device to Transfer:</h4>
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
            <div className="flex justify-between">
              <span className="text-gray-600">Current Owner:</span>
              <span className="font-medium text-gray-900">
                {device.client_name || 'Unassigned'}
              </span>
            </div>
            {device.machin_id && (
              <div className="flex justify-between">
                <span className="text-gray-600">Machine ID:</span>
                <span className="font-medium text-gray-900">{device.machin_id}</span>
              </div>
            )}
          </div>
        </div>

        {/* Transfer Form */}
        <div className="space-y-4">
          <div>
            <label htmlFor="buyer_id" className="block text-sm font-medium text-gray-700 mb-1">
              Transfer To <span className="text-red-500">*</span>
            </label>
            <select
              id="buyer_id"
              name="buyer_id"
              value={formData.buyer_id}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.buyer_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              required
            >
              <option value="">Select a client to transfer to...</option>
              {availableClients.map((client) => (
                <option key={client.client_id} value={client.client_id}>
                  {client.name}
                </option>
              ))}
            </select>
            {validationErrors.buyer_id && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.buyer_id}</p>
            )}
            {availableClients.length === 0 && (
              <p className="mt-1 text-sm text-gray-500">
                No other clients available for transfer
              </p>
            )}
          </div>
        </div>

        {/* Transfer Information */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-800">
                <strong>Transfer Information:</strong>
              </p>
              <ul className="text-sm text-blue-800 mt-2 list-disc list-inside space-y-1">
                <li>The device ownership will be immediately transferred</li>
                <li>Transfer history will be recorded for audit purposes</li>
                <li>The new owner will have full access to the device</li>
                <li>This action cannot be undone automatically</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-6 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={isTransferring}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isTransferring || loading || availableClients.length === 0}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTransferring || loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Transferring...
              </span>
            ) : (
              'Transfer Device'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default TransferDeviceModal;