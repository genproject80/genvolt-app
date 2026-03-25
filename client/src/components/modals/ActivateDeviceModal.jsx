import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { clientService } from '../../services/clientService';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../common/LoadingSpinner';

const ActivateDeviceModal = ({ isOpen, onClose, device, onSuccess }) => {
  const { activateDevice, loading } = useDevice();
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingClients, setLoadingClients] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      try {
        setLoadingClients(true);
        const res = await clientService.getDescendantClients();
        if (res?.success) {
          const data = res.data?.clients || res.data?.data || res.clients || res.data || [];
          setClients(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error('Failed to load clients:', e);
      } finally {
        setLoadingClients(false);
      }
    };
    load();
    setSelectedClientId(device?.client_id ? String(device.client_id) : '');
    setError('');
  }, [isOpen, device]);

  const handleActivate = async () => {
    if (!device) return;
    if (!selectedClientId) {
      setError('Please select a client to assign this device to.');
      return;
    }
    try {
      setError('');
      await activateDevice(device.device_id, { client_id: selectedClientId });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Activation failed');
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  if (!device) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Activate Device" size="md">
      <div className="space-y-4">
        <div className="flex items-start space-x-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">Activating device</p>
            <p className="text-sm text-green-700 mt-0.5">
              This will generate MQTT credentials and send the activation payload to the device.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-sm text-gray-700">
            Device ID: <span className="font-semibold">{device.device_id}</span>
          </p>
          {device.device_type && (
            <p className="text-sm text-gray-600">Type: {device.device_type}</p>
          )}
          {device.firmware_version && (
            <p className="text-sm text-gray-600">Firmware: {device.firmware_version}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Assign to Client <span className="text-red-500">*</span>
          </label>
          {loadingClients ? (
            <p className="text-sm text-gray-500">Loading clients...</p>
          ) : (
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
            >
              <option value="">Select a client...</option>
              {clients.map(c => (
                <option key={c.client_id} value={c.client_id}>{c.name}</option>
              ))}
            </select>
          )}
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
            onClick={handleActivate}
            disabled={loading || !selectedClientId}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Activate Device
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ActivateDeviceModal;
