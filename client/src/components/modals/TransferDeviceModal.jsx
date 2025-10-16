import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { clientService } from '../../services/clientService';
import { ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../common/LoadingSpinner';

const TransferDeviceModal = ({ isOpen, onClose, device, onSuccess }) => {
  const { transferDevice, loading } = useDevice();

  const [targetClientId, setTargetClientId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [clients, setClients] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');

  // Load clients data and populate machine ID when modal opens
  useEffect(() => {
    if (isOpen) {
      loadClients();
      // Pre-populate machine ID if device has one
      if (device?.machin_id) {
        setMachineId(device.machin_id);
      }
    }
  }, [isOpen, device]);

  const loadClients = async () => {
    try {
      setLoadingData(true);
      console.log('🔄 TransferDeviceModal: Loading descendant clients...');

      const clientsResponse = await clientService.getDescendantClients();

      if (clientsResponse && clientsResponse.success) {
        // Extract the actual clients array from the response
        let clientsData = [];

        if (clientsResponse.data?.clients && Array.isArray(clientsResponse.data.clients)) {
          clientsData = clientsResponse.data.clients;
        } else if (clientsResponse.data?.data && Array.isArray(clientsResponse.data.data)) {
          clientsData = clientsResponse.data.data;
        } else if (clientsResponse.clients && Array.isArray(clientsResponse.clients)) {
          clientsData = clientsResponse.clients;
        } else if (Array.isArray(clientsResponse.data)) {
          clientsData = clientsResponse.data;
        }

        // Filter to show only descendants, not the user's own client (level 0)
        // Also exclude the client that currently owns this device
        let descendantsOnly = clientsData.filter(client => client.level && client.level > 0);

        // Filter out the current device owner from the list
        if (device?.client_id) {
          descendantsOnly = descendantsOnly.filter(client => client.client_id !== device.client_id);
        }

        setClients(descendantsOnly);
        console.log('✅ TransferDeviceModal: Loaded descendant clients (excluding own and current owner):', descendantsOnly);
      } else {
        console.warn('⚠️ TransferDeviceModal: Failed to load descendant clients:', clientsResponse);
        setError('Failed to load clients data');
      }
    } catch (error) {
      console.error('❌ TransferDeviceModal: Failed to load descendant clients:', error);
      setError('Failed to load form data. Please try again.');
    } finally {
      setLoadingData(false);
    }
  };

  const handleTransfer = async () => {
    if (!device || !targetClientId) {
      setError('Please select a target client');
      return;
    }

    if (!machineId || !machineId.trim()) {
      setError('Machine ID is required');
      return;
    }

    try {
      setError('');
      await transferDevice(device.id, parseInt(targetClientId), machineId.trim());
      setTargetClientId('');
      setMachineId('');
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to transfer device:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to transfer device';
      setError(errorMessage);
    }
  };

  const handleClose = () => {
    setTargetClientId('');
    setMachineId('');
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
      title="Transfer Device"
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-center space-x-3 text-blue-600 bg-blue-50 p-3 rounded-lg">
          <ArrowsRightLeftIcon className="w-6 h-6" />
          <div className="flex-1">
            <p className="text-sm font-medium">Device Transfer</p>
            <p className="text-xs text-blue-500">
              Transfer device ownership to another client
            </p>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <div>
            <p className="text-xs text-gray-600">Device ID</p>
            <p className="text-sm font-semibold text-gray-900">{device.device_id}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Model</p>
            <p className="text-sm text-gray-900">{device.Model || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Current Client</p>
            <p className="text-sm text-gray-900">
              {device.client_name || 'No client assigned'}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Transfer to Client *
          </label>
          <select
            value={targetClientId}
            onChange={(e) => {
              setTargetClientId(e.target.value);
              setError('');
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            disabled={loading || loadingData}
          >
            <option value="">Select target client</option>
            {clients.map(client => (
              <option key={client.client_id} value={client.client_id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Machine ID *
          </label>
          <input
            type="text"
            value={machineId}
            onChange={(e) => {
              setMachineId(e.target.value);
              setError('');
            }}
            placeholder="Enter machine ID"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            disabled={loading || loadingData}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            Note: Transfer history will be maintained for audit purposes.
          </p>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            disabled={loading || loadingData}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            disabled={loading || loadingData || !targetClientId || !machineId.trim()}
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Transfer Device
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default TransferDeviceModal;
