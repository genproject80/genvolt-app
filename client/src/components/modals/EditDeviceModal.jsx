import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { clientService } from '../../services/clientService';
import { getActiveInventory } from '../../services/inventoryService';
import LoadingSpinner from '../common/LoadingSpinner';

const EditDeviceModal = ({ isOpen, onClose, device, onSuccess }) => {
  const { updateDevice, loading } = useDevice();

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

  // Load clients and inventory data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadFormData();
    }
  }, [isOpen]);

  // Populate form with device data
  useEffect(() => {
    if (device && isOpen) {
      setFormData({
        device_id: device.device_id || '',
        model_number: device.model_number || '',
        imei: device.imei || '',
        machin_id: device.machin_id || '',
        client_id: device.client_id || ''
      });
    }
  }, [device, isOpen]);

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
      } else {
        setErrors({ submit: 'Failed to load clients data' });
      }
    } catch (error) {
      setErrors({ submit: 'Failed to load form data. Please try again.' });
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.device_id.trim()) {
      newErrors.device_id = 'Device ID is required';
    } else if (formData.device_id.length < 3) {
      newErrors.device_id = 'Device ID must be at least 3 characters';
    }

    if (!formData.model_number) {
      newErrors.model_number = 'Model number is required';
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
      const updateData = {
        device_id: formData.device_id,
        model_number: formData.model_number,
        imei: formData.imei,
        machin_id: formData.machin_id || null,
        client_id: formData.client_id ? parseInt(formData.client_id) : null
      };

      await updateDevice(device.id, updateData);
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to update device:', error);
      console.error('Error details:', error.response?.data);

      let errorMessage = 'Failed to update device';

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
      client_id: ''
    });
    setErrors({});
    onClose();
  };

  if (!device) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Device"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{errors.submit}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Device ID *
          </label>
          <input
            type="text"
            name="device_id"
            value={formData.device_id}
            onChange={handleChange}
            placeholder="Enter unique device ID"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.device_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.device_id && (
            <p className="text-sm text-red-600 mt-1">{errors.device_id}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Model Number *
          </label>
          <select
            name="model_number"
            value={formData.model_number}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
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
            <p className="text-sm text-red-600 mt-1">{errors.model_number}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            IMEI *
          </label>
          <input
            type="text"
            name="imei"
            value={formData.imei}
            onChange={handleChange}
            placeholder="Enter 15–17 digit IMEI"
            maxLength={17}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.imei ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.imei && (
            <p className="text-sm text-red-600 mt-1">{errors.imei}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Machine ID
          </label>
          <input
            type="text"
            name="machin_id"
            value={formData.machin_id}
            onChange={handleChange}
            placeholder="Enter machine ID (optional)"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.machin_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.machin_id && (
            <p className="text-sm text-red-600 mt-1">{errors.machin_id}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client
          </label>
          <select
            name="client_id"
            value={formData.client_id}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.client_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          >
            <option value="">No client assigned</option>
            {clients.map(client => (
              <option key={client.client_id} value={client.client_id}>
                {client.name}
              </option>
            ))}
          </select>
          {errors.client_id && (
            <p className="text-sm text-red-600 mt-1">{errors.client_id}</p>
          )}
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
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            disabled={loading || loadingData}
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Update Device
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditDeviceModal;
