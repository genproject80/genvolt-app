import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { useAuth } from '../../context/AuthContext';
import { clientService } from '../../services/clientService';
import { getActiveInventory, getNextDeviceId } from '../../services/inventoryService';
import LoadingSpinner from '../common/LoadingSpinner';

const AddDeviceModal = ({ isOpen, onClose, onSuccess }) => {
  const { createDevice, loading } = useDevice();
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    device_id: '',
    model_number: '',
    imei: '',
    machin_id: '',
    client_id: ''
  });

  const [errors, setErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDeviceId, setLoadingDeviceId] = useState(false);

  // Load clients and inventory data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadFormData();
    }
  }, [isOpen]);

  const loadFormData = async () => {
    try {
      setLoadingData(true);

      const [clientsResponse, inventoryItems] = await Promise.all([
        clientService.getDescendantClients(),
        getActiveInventory()
      ]);

      setInventory(inventoryItems || []);

      if (clientsResponse && clientsResponse.success) {
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

        setClients(clientsData);

        if (user?.client_id && clientsData.length > 0) {
          setFormData(prev => ({
            ...prev,
            client_id: user.client_id.toString()
          }));
        }
      } else {
        console.warn('⚠️ AddDeviceModal: Failed to load descendant clients:', clientsResponse);
        setErrors({ submit: 'Failed to load clients data' });
      }
    } catch (error) {
      setErrors({ submit: 'Failed to load form data. Please try again.' });
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = async (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }

    if (name === 'model_number') {
      if (!value) {
        setFormData(prev => ({ ...prev, device_id: '' }));
        return;
      }
      try {
        setLoadingDeviceId(true);
        const nextId = await getNextDeviceId(value);
        setFormData(prev => ({ ...prev, device_id: nextId || '' }));
      } catch {
        setFormData(prev => ({ ...prev, device_id: '' }));
      } finally {
        setLoadingDeviceId(false);
      }
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.model_number) {
      newErrors.model_number = 'Model number is required';
    }

    if (!formData.device_id) {
      newErrors.device_id = 'Select a model number to generate the Device ID';
    }

    if (!formData.imei.trim()) {
      newErrors.imei = 'IMEI is required';
    } else if (!/^\d{15,17}$/.test(formData.imei.trim())) {
      newErrors.imei = 'IMEI must be 15–17 digits';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const createData = {
        device_id: formData.device_id,
        model_number: formData.model_number,
        imei: formData.imei,
        machin_id: formData.machin_id || null,
        client_id: formData.client_id ? parseInt(formData.client_id) : null
      };

      await createDevice(createData);
      setFormData({
        device_id: '',
        model_number: '',
        imei: '',
        machin_id: '',
        client_id: user?.client_id ? user.client_id.toString() : ''
      });
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to create device:', error);
      console.error('Error details:', error.response?.data);

      let errorMessage = 'Failed to create device';

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (error.response?.data?.details) {
        const fieldErrors = {};
        error.response.data.details.forEach(detail => {
          if (detail.path) {
            fieldErrors[detail.path] = detail.msg || detail.message;
          }
        });

        if (Object.keys(fieldErrors).length > 0) {
          setErrors({ ...fieldErrors, submit: errorMessage });
          return;
        }
      }

      if (errorMessage.includes('device_id already exists') || errorMessage.includes('duplicate') && errorMessage.includes('device_id')) {
        setErrors({ device_id: 'A device with this ID already exists', submit: errorMessage });
      } else {
        setErrors({ submit: errorMessage });
      }
    }
  };

  const handleClose = () => {
    setFormData({
      device_id: '',
      model_number: '',
      imei: '',
      machin_id: '',
      client_id: user?.client_id ? user.client_id.toString() : ''
    });
    setErrors({});
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New Device"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2">
            <p className="text-xs text-red-700">{errors.submit}</p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Device ID
            {formData.model_number && (
              <span className="ml-1 text-xs font-normal text-gray-400">(auto-generated)</span>
            )}
          </label>
          <div className="relative">
            <input
              type="text"
              name="device_id"
              value={loadingDeviceId ? '' : formData.device_id}
              readOnly
              placeholder={formData.model_number ? (loadingDeviceId ? 'Generating…' : '—') : 'Select a model to generate'}
              className={`w-full px-2 py-1.5 text-sm border rounded bg-gray-50 text-gray-700 cursor-default select-all ${
                errors.device_id ? 'border-red-500' : 'border-gray-200'
              }`}
            />
            {loadingDeviceId && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2">
                <LoadingSpinner size="sm" inline />
              </span>
            )}
          </div>
          {errors.device_id && (
            <p className="text-xs text-red-600 mt-0.5">{errors.device_id}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Model Number *
          </label>
          <select
            name="model_number"
            value={formData.model_number}
            onChange={handleChange}
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.model_number ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          >
            <option value="">Select model number</option>
            {inventory.map(item => (
              <option key={item.model_number} value={item.model_number}>
                {item.model_number}{item.display_name ? ` — ${item.display_name}` : ''}
              </option>
            ))}
          </select>
          {errors.model_number && (
            <p className="text-xs text-red-600 mt-0.5">{errors.model_number}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            IMEI *
          </label>
          <input
            type="text"
            name="imei"
            value={formData.imei}
            onChange={handleChange}
            placeholder="Enter 15–17 digit IMEI"
            maxLength={17}
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.imei ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.imei && (
            <p className="text-xs text-red-600 mt-0.5">{errors.imei}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Machine ID
          </label>
          <input
            type="text"
            name="machin_id"
            value={formData.machin_id}
            onChange={handleChange}
            placeholder="Enter machine ID (optional)"
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.machin_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.machin_id && (
            <p className="text-xs text-red-600 mt-0.5">{errors.machin_id}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Client
          </label>
          <select
            name="client_id"
            value={formData.client_id}
            onChange={handleChange}
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.client_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          >
            {clients.map(client => (
              <option key={client.client_id} value={client.client_id}>
                {client.name} {client.level === 0 ? '(My Client)' : ''}
              </option>
            ))}
          </select>
          {errors.client_id && (
            <p className="text-xs text-red-600 mt-0.5">{errors.client_id}</p>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200 mt-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            disabled={loading || loadingData}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            disabled={loading || loadingData}
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Create Device
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddDeviceModal;
