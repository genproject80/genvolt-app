import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { roleService } from '../../services/roleService';
import { clientService } from '../../services/clientService';
import LoadingSpinner from '../common/LoadingSpinner';

const EditUserModal = ({ isOpen, onClose, user, onSuccess }) => {
  const { updateUser, loading } = useUser();
  const { user: currentUser } = useAuth();

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    user_name: '',
    role_name: '',
    client_id: '',
    is_active: true
  });

  const [errors, setErrors] = useState({});
  const [roles, setRoles] = useState([]);
  const [clients, setClients] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Populate form when user prop changes
  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        user_name: user.user_name || '',
        ph_no: user.ph_no || '',
        role_id: user.role_id || '',
        role_name: user.role_name || '',
        client_id: user.client_id || '',
        is_active: user.is_active ?? true
      });
    }
  }, [user]);

  // Load roles and clients data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadRolesAndClients();
    }
  }, [isOpen]);


  const loadRolesAndClients = async () => {
    try {
      setLoadingData(true);

      // Load roles and hierarchical clients (descendants only)
      const [rolesResponse, clientsResponse] = await Promise.all([
        roleService.getAllRoles({ limit: 100 }),
        clientService.getDescendantClients() // Fetch only user's client and descendants
      ]);


      if (rolesResponse && rolesResponse.success) {
        // Extract the actual roles array from the response
        let rolesData = [];

        if (rolesResponse.data?.roles && Array.isArray(rolesResponse.data.roles)) {
          rolesData = rolesResponse.data.roles;
        } else if (rolesResponse.data?.data && Array.isArray(rolesResponse.data.data)) {
          rolesData = rolesResponse.data.data;
        } else if (rolesResponse.roles && Array.isArray(rolesResponse.roles)) {
          rolesData = rolesResponse.roles;
        } else if (Array.isArray(rolesResponse.data)) {
          rolesData = rolesResponse.data;
        }

        setRoles(rolesData);
      } else {
      }

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
      } else {
      }
    } catch (error) {
      console.error('❌ EditUserModal: Failed to load roles and clients:', error);
      setErrors({ submit: 'Failed to load form data' });
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let newValue = type === 'checkbox' ? checked : value;

    // Handle role change - find role_name when role_id changes
    if (name === 'role_id') {
      const selectedRole = roles.find(role => role.role_id === parseInt(value));
      setFormData(prev => ({
        ...prev,
        [name]: value,
        role_name: selectedRole?.role_name || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: newValue
      }));
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }

    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.user_name.trim()) {
      newErrors.user_name = 'Username is required';
    }

    if (!formData.role_id) {
      newErrors.role_id = 'Role is required';
    }

    // Client is required for all users
    if (!formData.client_id) {
      newErrors.client_id = 'Client is required';
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
      // Prepare data for API - only send fields that should be updated
      const roleId = formData.role_id ? parseInt(formData.role_id) : null;
      const clientId = formData.client_id ? parseInt(formData.client_id) : null;

      // Only send fields that the server allows to be updated
      const updateData = {
        first_name: formData.first_name?.trim(),
        last_name: formData.last_name?.trim(),
        ph_no: formData.ph_no && formData.ph_no.trim() ? formData.ph_no.trim() : null,
        role_id: parseInt(formData.role_id),
        client_id: parseInt(formData.client_id),
        is_active: Boolean(formData.is_active)
      };

      // Validate the data before sending
      if (isNaN(updateData.role_id) || updateData.role_id === null) {
        throw new Error('Invalid role selected');
      }

      if (isNaN(updateData.client_id) || updateData.client_id === null) {
        throw new Error('Invalid client selected');
      }

      console.log('📝 EditUserModal: Sending update data:', updateData);
      await updateUser(user.user_id, updateData);
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('❌ EditUserModal: Failed to update user:', error);
      console.error('❌ EditUserModal: Error details:', error.response?.data);
      console.error('❌ EditUserModal: Status code:', error.response?.status);

      // Extract error message from server response
      let errorMessage = 'Failed to update user';

      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setErrors({ submit: errorMessage });
    }
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  // Show all available roles from database - permissions will be enforced by backend
  const getAvailableRoles = () => {

    if (!roles.length) {
      return [];
    }

    // Return all roles - let the backend enforce permissions based on role_permission table
    return roles;
  };

  // Show all available clients from database - permissions will be enforced by backend
  const getAvailableClients = () => {
    if (!clients.length) return [];

    // Return all clients - let the backend enforce permissions based on role_permission table
    return clients;
  };

  if (!user) {
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit User: ${user.first_name} ${user.last_name}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{errors.submit}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name *
            </label>
            <input
              type="text"
              name="first_name"
              value={formData.first_name}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                errors.first_name ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading || loadingData}
            />
            {errors.first_name && (
              <p className="text-sm text-red-600 mt-1">{errors.first_name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name *
            </label>
            <input
              type="text"
              name="last_name"
              value={formData.last_name}
              onChange={handleChange}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                errors.last_name ? 'border-red-500' : 'border-gray-300'
              }`}
              disabled={loading || loadingData}
            />
            {errors.last_name && (
              <p className="text-sm text-red-600 mt-1">{errors.last_name}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email *
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.email ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.email && (
            <p className="text-sm text-red-600 mt-1">{errors.email}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Username *
          </label>
          <input
            type="text"
            name="user_name"
            value={formData.user_name}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.user_name ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.user_name && (
            <p className="text-sm text-red-600 mt-1">{errors.user_name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Role *
          </label>
          <select
            name="role_id"
            value={formData.role_id}
            onChange={handleChange}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.role_id ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          >
            <option value="">Select a role</option>
            {getAvailableRoles().map(role => (
              <option key={role.role_id} value={role.role_id}>
                {role.role_name}
              </option>
            ))}
          </select>
          {errors.role_id && (
            <p className="text-sm text-red-600 mt-1">{errors.role_id}</p>
          )}
        </div>

        {/* Client selection - show for all roles since all users need client assignment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Client *
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
            <option value="">Select a client</option>
            {getAvailableClients().map(client => (
              <option key={client.client_id} value={client.client_id}>
                {client.name}
              </option>
            ))}
          </select>
          {errors.client_id && (
            <p className="text-sm text-red-600 mt-1">{errors.client_id}</p>
          )}
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            name="is_active"
            checked={formData.is_active}
            onChange={handleChange}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            disabled={loading}
          />
          <label className="ml-2 block text-sm text-gray-700">
            Active User
          </label>
        </div>

        <div className="bg-gray-50 px-4 py-3 rounded-lg">
          <div className="text-sm text-gray-600">
            <p><span className="font-medium">User ID:</span> {user.user_id}</p>
            <p><span className="font-medium">Created:</span> {user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}</p>
            {user.updated_at && (
              <p><span className="font-medium">Last Updated:</span> {new Date(user.updated_at).toLocaleString()}</p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            disabled={loading}
          >
            {loading && <LoadingSpinner size="sm" inline className="mr-2" />}
            Update User
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditUserModal;