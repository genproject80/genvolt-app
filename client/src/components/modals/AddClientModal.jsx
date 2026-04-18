import React, { useState, useEffect } from 'react';
import SearchableSelect from '../common/SearchableSelect';
import { useClient } from '../../context/ClientContext';
import { useClientPermissions } from '../../hooks/useClientPermissions';
import AccessDeniedModal from '../common/AccessDeniedModal';

const AddClientModal = ({ isOpen, onClose, onSuccess, client = null, mode = 'add' }) => {
  const { createClient, updateClient, getClientHierarchy, clientHierarchy, loading, error } = useClient();
  const { canCreateClient, canEditClient } = useClientPermissions();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    Address: '',
    contact_person: '',
    thinkspeak_subscription_info: '',
    city: '',
    state: '',
    parent_id: '',
    is_active: true
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (isOpen) {
      // For edit mode, exclude current client from hierarchy
      if (mode === 'edit' && client) {
        getClientHierarchy(client.client_id);
      } else {
        getClientHierarchy();
      }
      
      if (mode === 'edit' && client) {
        // Pre-populate form with existing client data
        setFormData({
          name: client.name || '',
          email: client.email || '',
          phone: client.phone || '',
          Address: client.Address || '',
          contact_person: client.contact_person || '',
          thinkspeak_subscription_info: client.thinkspeak_subscription_info || '',
          city: client.city || '',
          state: client.state || '',
          parent_id: client.parent_id || '',
          is_active: client.is_active !== undefined ? client.is_active : true
        });
      } else {
        // Clear form for add mode
        setFormData({
          name: '',
          email: '',
          phone: '',
          Address: '',
          contact_person: '',
          thinkspeak_subscription_info: '',
          city: '',
          state: '',
          parent_id: '',
          is_active: true
        });
      }
      
      setValidationErrors({});
      setSubmitError('');
    }
  }, [isOpen, mode, client, getClientHierarchy]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === 'checkbox' ? checked : value;
    
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

    if (!formData.name.trim()) {
      errors.name = 'Client name is required';
    } else if (formData.name.length > 255) {
      errors.name = 'Client name must be less than 255 characters';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    } else if (formData.email.length > 255) {
      errors.email = 'Email must be less than 255 characters';
    }

    if (formData.phone && formData.phone.trim()) {
      // Remove all non-digit characters except +
      const cleanPhone = formData.phone.replace(/[\s\-\.\(\)]/g, '');
      
      // Indian phone number validation
      if (cleanPhone.startsWith('+91')) {
        // International format: +91 followed by 10 digits
        if (cleanPhone.length !== 13) {
          errors.phone = 'Indian phone number with +91 must be 13 digits total';
        } else if (!/^\+91[6789]\d{9}$/.test(cleanPhone)) {
          errors.phone = 'Invalid Indian phone number format (must start with 6, 7, 8, or 9 after +91)';
        }
      } else if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
        // Without + but with country code
        if (!/^91[6789]\d{9}$/.test(cleanPhone)) {
          errors.phone = 'Invalid Indian phone number format (must start with 6, 7, 8, or 9 after 91)';
        }
      } else if (cleanPhone.length === 10) {
        // Local format: 10 digits starting with 6, 7, 8, or 9
        if (!/^[6789]\d{9}$/.test(cleanPhone)) {
          errors.phone = 'Invalid Indian phone number (must be 10 digits starting with 6, 7, 8, or 9)';
        }
      } else {
        errors.phone = 'Phone number must be 10 digits, or 12 digits with 91, or 13 digits with +91';
      }
    }

    if (formData.Address && formData.Address.length > 500) {
      errors.Address = 'Address must be less than 500 characters';
    }

    if (formData.contact_person && formData.contact_person.length > 255) {
      errors.contact_person = 'Contact person name must be less than 255 characters';
    }

    if (formData.thinkspeak_subscription_info && formData.thinkspeak_subscription_info.length > 500) {
      errors.thinkspeak_subscription_info = 'ThinkSpeak subscription info must be less than 500 characters';
    }

    if (formData.city && formData.city.length > 100) {
      errors.city = 'City must be less than 100 characters';
    }

    if (formData.state && formData.state.length > 100) {
      errors.state = 'State must be less than 100 characters';
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

    setIsSubmitting(true);
    setSubmitError('');
    
    try {
      const clientData = {
        ...formData,
        parent_id: formData.parent_id ? parseInt(formData.parent_id) : null
      };

      let result;
      if (mode === 'edit' && client) {
        result = await updateClient(client.client_id, clientData);
      } else {
        result = await createClient(clientData);
      }
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      onClose();
    } catch (err) {
      if (err.validationErrors) {
        setValidationErrors(err.validationErrors);
      } else {
        setSubmitError(err.message || `Failed to ${mode === 'edit' ? 'update' : 'create'} client`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Check permissions - prevent unauthorized access
  const canPerformAction = mode === 'edit' ? canEditClient : canCreateClient;

  if (!canPerformAction) {
    return (
      <AccessDeniedModal
        isOpen={isOpen}
        onClose={onClose}
        title="Access Denied"
        message={`You don't have permission to ${mode} clients.`}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'edit' ? 'Edit Client' : 'Add New Client'}
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {(submitError || error) && (
            <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
              {submitError || error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Client Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
                required
              />
              {validationErrors.name && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
                required
              />
              {validationErrors.email && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.phone ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              {validationErrors.phone && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.phone}</p>
              )}
            </div>

            <div>
              <label htmlFor="contact_person" className="block text-sm font-medium text-gray-700 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                id="contact_person"
                name="contact_person"
                value={formData.contact_person}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.contact_person ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              {validationErrors.contact_person && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.contact_person}</p>
              )}
            </div>

            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.city ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              {validationErrors.city && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.city}</p>
              )}
            </div>

            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <input
                type="text"
                id="state"
                name="state"
                value={formData.state}
                onChange={handleInputChange}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  validationErrors.state ? 'border-red-500' : 'border-gray-300'
                }`}
                disabled={isSubmitting}
              />
              {validationErrors.state && (
                <p className="mt-1 text-sm text-red-600">{validationErrors.state}</p>
              )}
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="Address" className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              id="Address"
              name="Address"
              rows="3"
              value={formData.Address}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                validationErrors.Address ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isSubmitting}
            />
            {validationErrors.Address && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.Address}</p>
            )}
          </div>

          <div className="mb-4">
            <label htmlFor="thinkspeak_subscription_info" className="block text-sm font-medium text-gray-700 mb-1">
              ThinkSpeak Subscription Info
            </label>
            <textarea
              id="thinkspeak_subscription_info"
              name="thinkspeak_subscription_info"
              rows="3"
              value={formData.thinkspeak_subscription_info}
              onChange={handleInputChange}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                validationErrors.thinkspeak_subscription_info ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={isSubmitting}
            />
            {validationErrors.thinkspeak_subscription_info && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.thinkspeak_subscription_info}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label htmlFor="parent_id" className="block text-sm font-medium text-gray-700 mb-1">
                Parent Client
              </label>
              <SearchableSelect
                options={clientHierarchy.map(client => ({
                  value: String(client.client_id),
                  label: client.name,
                }))}
                value={formData.parent_id ? String(formData.parent_id) : ''}
                onChange={(v) => handleInputChange({ target: { name: 'parent_id', value: v } })}
                placeholder="Select Parent Client (Optional)"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                name="is_active"
                checked={formData.is_active}
                onChange={handleInputChange}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                disabled={isSubmitting}
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
                Active Client
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-4 pt-4 border-t">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || loading || !canPerformAction}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              title={!canPerformAction ? `You don't have permission to ${mode} clients` : ''}
            >
              {isSubmitting ? (mode === 'edit' ? 'Updating...' : 'Creating...') : (mode === 'edit' ? 'Update Client' : 'Create Client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddClientModal;