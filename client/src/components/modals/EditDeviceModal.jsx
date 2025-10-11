import React, { useState, useEffect } from 'react';
import { useDevice } from '../../context/DeviceContext';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import { useClient } from '../../context/ClientContext';
import AccessDeniedModal from '../common/AccessDeniedModal';
import Modal from '../common/Modal';

const EditDeviceModal = ({ isOpen, onClose, onSuccess, device }) => {
  const { updateDevice, loading, error } = useDevice();
  const { canOnboardDevice } = useDevicePermissions();
  const { getAllClients, clients } = useClient();

  const [formData, setFormData] = useState({
    device_id: '',
    client_id: '',
    channel_id: '',
    api_key: '',
    Model: '',
    machin_id: '',
    field_id: '',
    conversionLogic_ld: '',
    TransactionTableID: '',
    TransactionTableName: ''
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Permission check
  if (!canOnboardDevice) {
    return (
      <AccessDeniedModal
        isOpen={isOpen}
        onClose={onClose}
        message="You don't have permission to edit devices."
      />
    );
  }

  useEffect(() => {
    if (isOpen && device) {
      getAllClients();
      setFormData({
        device_id: device.device_id || '',
        client_id: device.client_id || '',
        channel_id: device.channel_id || '',
        api_key: device.api_key || '',
        Model: device.Model || '',
        machin_id: device.machin_id || '',
        field_id: device.field_id || '',
        conversionLogic_ld: device.conversionLogic_ld || '',
        TransactionTableID: device.TransactionTableID || '',
        TransactionTableName: device.TransactionTableName || ''
      });
      setValidationErrors({});
      setSubmitError('');
    }
  }, [isOpen, device, getAllClients]);

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    const fieldValue = type === 'number' ? (value === '' ? '' : parseInt(value)) : value;

    setFormData(prev => ({
      ...prev,
      [name]: fieldValue
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

    if (!formData.device_id.trim()) {
      errors.device_id = 'Device ID is required';
    } else if (formData.device_id.length > 100) {
      errors.device_id = 'Device ID must be less than 100 characters';
    }

    if (formData.channel_id && formData.channel_id.length > 100) {
      errors.channel_id = 'Channel ID must be less than 100 characters';
    }

    if (formData.api_key && formData.api_key.length > 255) {
      errors.api_key = 'API key must be less than 255 characters';
    }

    if (formData.Model && formData.Model.length > 100) {
      errors.Model = 'Model must be less than 100 characters';
    }

    if (formData.machin_id && formData.machin_id.length > 100) {
      errors.machin_id = 'Machine ID must be less than 100 characters';
    }

    if (formData.field_id && formData.field_id.length > 100) {
      errors.field_id = 'Field ID must be less than 100 characters';
    }

    if (formData.TransactionTableName && formData.TransactionTableName.length > 255) {
      errors.TransactionTableName = 'Transaction table name must be less than 255 characters';
    }

    if (formData.TransactionTableID && (isNaN(formData.TransactionTableID) || formData.TransactionTableID < 1)) {
      errors.TransactionTableID = 'Transaction Table ID must be a positive number';
    }

    if (formData.client_id && (isNaN(formData.client_id) || formData.client_id < 1)) {
      errors.client_id = 'Please select a valid client';
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
      setIsSubmitting(true);
      setSubmitError('');

      // Prepare data for submission
      const submitData = { ...formData };

      // Convert empty strings to null for optional fields
      Object.keys(submitData).forEach(key => {
        if (key !== 'device_id' && submitData[key] === '') {
          submitData[key] = null;
        }
      });

      // Convert string numbers to integers
      if (submitData.TransactionTableID) {
        submitData.TransactionTableID = parseInt(submitData.TransactionTableID);
      }
      if (submitData.client_id) {
        submitData.client_id = parseInt(submitData.client_id);
      }

      await updateDevice(device.id, submitData);

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error updating device:', error);
      setSubmitError(error.message || 'Failed to update device');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!device) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Device"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error Display */}
        {(submitError || error) && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{submitError || error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Device ID - Required */}
          <div className="md:col-span-1">
            <label htmlFor="device_id" className="block text-sm font-medium text-gray-700 mb-1">
              Device ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="device_id"
              name="device_id"
              value={formData.device_id}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.device_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Enter unique device identifier"
              maxLength={100}
              required
            />
            {validationErrors.device_id && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.device_id}</p>
            )}
          </div>

          {/* Client Selection */}
          <div className="md:col-span-1">
            <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <select
              id="client_id"
              name="client_id"
              value={formData.client_id}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.client_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
            >
              <option value="">Select a client (optional)</option>
              {clients.map((client) => (
                <option key={client.client_id} value={client.client_id}>
                  {client.name}
                </option>
              ))}
            </select>
            {validationErrors.client_id && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.client_id}</p>
            )}
          </div>

          {/* Model */}
          <div className="md:col-span-1">
            <label htmlFor="Model" className="block text-sm font-medium text-gray-700 mb-1">
              Device Model
            </label>
            <input
              type="text"
              id="Model"
              name="Model"
              value={formData.Model}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.Model ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Device model information"
              maxLength={100}
            />
            {validationErrors.Model && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.Model}</p>
            )}
          </div>

          {/* Machine ID */}
          <div className="md:col-span-1">
            <label htmlFor="machin_id" className="block text-sm font-medium text-gray-700 mb-1">
              Machine ID
            </label>
            <input
              type="text"
              id="machin_id"
              name="machin_id"
              value={formData.machin_id}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.machin_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Machine identifier"
              maxLength={100}
            />
            {validationErrors.machin_id && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.machin_id}</p>
            )}
          </div>

          {/* Channel ID */}
          <div className="md:col-span-1">
            <label htmlFor="channel_id" className="block text-sm font-medium text-gray-700 mb-1">
              Channel ID
            </label>
            <input
              type="text"
              id="channel_id"
              name="channel_id"
              value={formData.channel_id}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.channel_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="ThinkSpeak or IoT channel ID"
              maxLength={100}
            />
            {validationErrors.channel_id && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.channel_id}</p>
            )}
          </div>

          {/* API Key */}
          <div className="md:col-span-1">
            <label htmlFor="api_key" className="block text-sm font-medium text-gray-700 mb-1">
              API Key
            </label>
            <input
              type="text"
              id="api_key"
              name="api_key"
              value={formData.api_key}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.api_key ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Device API key for data submission"
              maxLength={255}
            />
            {validationErrors.api_key && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.api_key}</p>
            )}
          </div>

          {/* Field ID */}
          <div className="md:col-span-1">
            <label htmlFor="field_id" className="block text-sm font-medium text-gray-700 mb-1">
              Field ID
            </label>
            <input
              type="text"
              id="field_id"
              name="field_id"
              value={formData.field_id}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.field_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Field identifier for data mapping"
              maxLength={100}
            />
            {validationErrors.field_id && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.field_id}</p>
            )}
          </div>

          {/* Transaction Table ID */}
          <div className="md:col-span-1">
            <label htmlFor="TransactionTableID" className="block text-sm font-medium text-gray-700 mb-1">
              Transaction Table ID
            </label>
            <input
              type="number"
              id="TransactionTableID"
              name="TransactionTableID"
              value={formData.TransactionTableID}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.TransactionTableID ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Reference to transaction table"
              min="1"
            />
            {validationErrors.TransactionTableID && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.TransactionTableID}</p>
            )}
          </div>

          {/* Transaction Table Name */}
          <div className="md:col-span-2">
            <label htmlFor="TransactionTableName" className="block text-sm font-medium text-gray-700 mb-1">
              Transaction Table Name
            </label>
            <input
              type="text"
              id="TransactionTableName"
              name="TransactionTableName"
              value={formData.TransactionTableName}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.TransactionTableName ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Name of associated transaction table"
              maxLength={255}
            />
            {validationErrors.TransactionTableName && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.TransactionTableName}</p>
            )}
          </div>

          {/* Conversion Logic */}
          <div className="md:col-span-2">
            <label htmlFor="conversionLogic_ld" className="block text-sm font-medium text-gray-700 mb-1">
              Conversion Logic
            </label>
            <textarea
              id="conversionLogic_ld"
              name="conversionLogic_ld"
              value={formData.conversionLogic_ld}
              onChange={handleInputChange}
              rows={4}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent ${
                validationErrors.conversionLogic_ld ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
              }`}
              placeholder="Logic for data conversion/processing (optional)"
            />
            {validationErrors.conversionLogic_ld && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.conversionLogic_ld}</p>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-3 pt-6 border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || loading}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting || loading ? 'Updating Device...' : 'Update Device'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditDeviceModal;