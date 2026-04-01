import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { clientService } from '../../services/clientService';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * ActivateDeviceModal
 *
 * Props:
 *   isOpen        — boolean
 *   onClose       — function
 *   device        — device object ({ device_id, imei, device_type, firmware_version, ... })
 *   onSuccess     — callback after successful activation
 *   fixedClientId — (optional) when set, the client dropdown is hidden and this value is used
 *                   (used from ClientDeviceDashboard where client is already known)
 */
const ActivateDeviceModal = ({ isOpen, onClose, device, onSuccess, fixedClientId }) => {
  const { activateDevice, loading } = useDevice();
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingClients, setLoadingClients] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setError('');

    // If fixedClientId provided, skip fetching clients
    if (fixedClientId) {
      setSelectedClientId(String(fixedClientId));
      return;
    }

    setSelectedClientId(device?.client_id ? String(device.client_id) : '');

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
  }, [isOpen, device, fixedClientId]);

  const handleActivate = async () => {
    if (!device) return;
    if (!selectedClientId) {
      setError('Please select a client to assign this device to.');
      return;
    }
    try {
      setError('');
      const payload = { client_id: selectedClientId };
      // activateDevice uses imei as identifier when device_id is absent
      const identifier = device.device_id || device.imei;
      await activateDevice(identifier, payload);
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
          {device.device_id && (
            <p className="text-sm text-gray-700">
              Device ID: <span className="font-semibold">{device.device_id}</span>
            </p>
          )}
          {device.imei && (
            <p className="text-sm text-gray-700">
              IMEI: <span className="font-semibold">{device.imei}</span>
            </p>
          )}
          {device.device_type && (
            <p className="text-sm text-gray-600">Type: {device.device_type}</p>
          )}
          {device.firmware_version && (
            <p className="text-sm text-gray-600">Firmware: {device.firmware_version}</p>
          )}
        </div>

        {device.model_number && (
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg space-y-1">
            <p className="text-xs font-medium text-indigo-700 uppercase tracking-wide">Model</p>
            <p className="text-sm font-semibold text-indigo-900 font-mono">{device.model_number}</p>
            {device.model_info?.display_name && (
              <p className="text-sm text-indigo-700">{device.model_info.display_name}</p>
            )}
            {device.model_info?.device_id_prefix && (
              <p className="text-xs text-indigo-600">
                Device ID prefix:{' '}
                <span className="font-mono font-semibold">{device.model_info.device_id_prefix}</span>
              </p>
            )}
            {device.model_info?.decoder_logic_ids?.length > 0 && (
              <p className="text-xs text-indigo-600">
                Decoder logic IDs:{' '}
                <span className="font-mono">[{device.model_info.decoder_logic_ids.join(', ')}]</span>
              </p>
            )}
          </div>
        )}

        {!fixedClientId && (
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
        )}

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
