import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { clientService } from '../../services/clientService';
import LoadingSpinner from '../common/LoadingSpinner';

const AddDeviceModal = ({ isOpen, onClose, onSuccess }) => {
  const { createDevice, loading } = useDevice();

  const [formData, setFormData] = useState({
    device_id: '',
    machin_id: '',
    Model: '',
    client_id: '',
    conversionLogic_ld: '',
    TransactionTableID: '',
    TransactionTableName: ''
  });

  const [errors, setErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Load clients data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadClients();
    }
  }, [isOpen]);

  const loadClients = async () => {
    try {
      setLoadingData(true);
      console.log('🔄 AddDeviceModal: Loading descendant clients...');

      const clientsResponse = await clientService.getDescendantClients();

      console.log('📊 AddDeviceModal: Descendant clients response:', clientsResponse);

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

        setClients(clientsData);
        console.log('✅ AddDeviceModal: Loaded descendant clients:', clientsData);
      } else {
        console.warn('⚠️ AddDeviceModal: Failed to load descendant clients:', clientsResponse);
        setErrors({ submit: 'Failed to load clients data' });
      }
    } catch (error) {
      console.error('❌ AddDeviceModal: Failed to load descendant clients:', error);
      setErrors({ submit: 'Failed to load form data. Please try again.' });
    } finally {
      console.log('🏁 AddDeviceModal: Loading complete, setting loadingData to false');
      setLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Clear error when user starts typing
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

    // All other fields are optional: Model, machin_id, client_id, conversionLogic_ld, TransactionTableID, and TransactionTableName

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      // Prepare data for API
      const createData = {
        device_id: formData.device_id,
        machin_id: formData.machin_id || null,
        Model: formData.Model || null,
        client_id: formData.client_id ? parseInt(formData.client_id) : null,
        conversionLogic_ld: formData.conversionLogic_ld || null,
        TransactionTableID: formData.TransactionTableID ? parseInt(formData.TransactionTableID) : null,
        TransactionTableName: formData.TransactionTableName || null
      };

      await createDevice(createData);
      setFormData({
        device_id: '',
        machin_id: '',
        Model: '',
        client_id: '',
        conversionLogic_ld: '',
        TransactionTableID: '',
        TransactionTableName: ''
      });
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to create device:', error);
      console.error('Error details:', error.response?.data);

      // Extract error message from server response
      let errorMessage = 'Failed to create device';

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      // Handle specific validation errors for individual fields
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

      // Handle common errors
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
      machin_id: '',
      Model: '',
      client_id: '',
      conversionLogic_ld: '',
      TransactionTableID: '',
      TransactionTableName: ''
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
            Device ID *
          </label>
          <input
            type="text"
            name="device_id"
            value={formData.device_id}
            onChange={handleChange}
            placeholder="Enter unique device ID"
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.device_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.device_id && (
            <p className="text-xs text-red-600 mt-0.5">{errors.device_id}</p>
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
            Model
          </label>
          <input
            type="text"
            name="Model"
            value={formData.Model}
            onChange={handleChange}
            placeholder="Enter device model (optional)"
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.Model ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.Model && (
            <p className="text-xs text-red-600 mt-0.5">{errors.Model}</p>
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
            <option value="">No client assigned</option>
            {clients.map(client => (
              <option key={client.client_id} value={client.client_id}>
                {client.name}
              </option>
            ))}
          </select>
          {errors.client_id && (
            <p className="text-xs text-red-600 mt-0.5">{errors.client_id}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Conversion Logic
          </label>
          <input
            type="text"
            name="conversionLogic_ld"
            value={formData.conversionLogic_ld}
            onChange={handleChange}
            placeholder="Enter conversion logic (optional)"
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.conversionLogic_ld ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.conversionLogic_ld && (
            <p className="text-xs text-red-600 mt-0.5">{errors.conversionLogic_ld}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Transaction Table ID
          </label>
          <input
            type="number"
            name="TransactionTableID"
            value={formData.TransactionTableID}
            onChange={handleChange}
            placeholder="Enter transaction table ID (optional)"
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.TransactionTableID ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.TransactionTableID && (
            <p className="text-xs text-red-600 mt-0.5">{errors.TransactionTableID}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Transaction Table Name
          </label>
          <input
            type="text"
            name="TransactionTableName"
            value={formData.TransactionTableName}
            onChange={handleChange}
            placeholder="Enter transaction table name (optional)"
            className={`w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.TransactionTableName ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.TransactionTableName && (
            <p className="text-xs text-red-600 mt-0.5">{errors.TransactionTableName}</p>
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
