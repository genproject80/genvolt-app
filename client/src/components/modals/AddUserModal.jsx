import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { roleService } from '../../services/roleService';
import { clientService } from '../../services/clientService';
import LoadingSpinner from '../common/LoadingSpinner';

const AddUserModal = ({ isOpen, onClose, onSuccess }) => {
  const { createUser, loading } = useUser();
  const { user: currentUser } = useAuth();

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    user_name: '',
    password: '!Ktest123',
    role_id: '',
    role_name: '',
    client_id: currentUser?.role_name === 'CLIENT_ADMIN' ? currentUser.client_id : '',
    is_active: true
  });

  const [errors, setErrors] = useState({});
  const [roles, setRoles] = useState([]);
  const [clients, setClients] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  // Load roles and clients data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadRolesAndClients();
    }
  }, [isOpen]);

  // Set default role for CLIENT_ADMIN users after roles are loaded
  useEffect(() => {
    if (isOpen && currentUser?.role_name === 'CLIENT_ADMIN' && roles.length > 0) {
      const clientUserRole = roles.find(role => role.role_name === 'CLIENT_USER');
      if (clientUserRole && !formData.role_id) {
        setFormData(prev => ({
          ...prev,
          role_id: clientUserRole.role_id,
          role_name: 'CLIENT_USER'
        }));
      }
    }
  }, [isOpen, roles, currentUser?.role_name, formData.role_id]);


  const loadRolesAndClients = async () => {
    try {
      setLoadingData(true);
      console.log('🔄 AddUserModal: Loading roles and clients...');

      // Load roles and hierarchical clients (descendants only)
      const [rolesResponse, clientsResponse] = await Promise.all([
        roleService.getAllRoles({ limit: 100 }),
        clientService.getDescendantClients() // Fetch only user's client and descendants
      ]);

      console.log('📊 AddUserModal: Roles response:', rolesResponse);
      console.log('📊 AddUserModal: Clients response (hierarchical):', clientsResponse);


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
        console.log('✅ AddUserModal: Loaded roles:', rolesData);
      } else {
        console.warn('⚠️ AddUserModal: Failed to load roles:', rolesResponse);
        setErrors({ submit: 'Failed to load roles data' });
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
        console.log('✅ AddUserModal: Loaded clients:', clientsData);
      } else {
        console.warn('⚠️ AddUserModal: Failed to load clients:', clientsResponse);
        setErrors({ submit: 'Failed to load clients data' });
      }
    } catch (error) {
      console.error('❌ AddUserModal: Failed to load roles and clients:', error);
      setErrors({ submit: 'Failed to load form data. Please try again.' });
    } finally {
      console.log('🏁 AddUserModal: Loading complete, setting loadingData to false');
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

    if (!formData.password.trim()) {
      newErrors.password = 'Password is required';
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
      // Prepare data for API
      const createData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        user_name: formData.user_name,
        password: formData.password,
        role_id: parseInt(formData.role_id),
        client_id: formData.client_id ? parseInt(formData.client_id) : null,
        is_active: formData.is_active
      };

      await createUser(createData);
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        user_name: '',
        password: '!Ktest123',
        role_id: '',
        role_name: '',
        client_id: currentUser?.role_name === 'CLIENT_ADMIN' ? currentUser.client_id : '',
        is_active: true
      });
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to create user:', error);
      console.error('Error details:', error.response?.data);

      // Extract error message from server response
      let errorMessage = 'Failed to create user';

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
      if (errorMessage.includes('email already exists') || errorMessage.includes('duplicate') && errorMessage.includes('email')) {
        setErrors({ email: 'A user with this email already exists', submit: errorMessage });
      } else if (errorMessage.includes('username already exists') || errorMessage.includes('duplicate') && errorMessage.includes('username')) {
        setErrors({ user_name: 'A user with this username already exists', submit: errorMessage });
      } else {
        setErrors({ submit: errorMessage });
      }
    }
  };

  const handleClose = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      user_name: '',
      password: '!Ktest123',
      role_id: '',
      role_name: '',
      client_id: currentUser?.role_name === 'CLIENT_ADMIN' ? currentUser.client_id : '',
      is_active: true
    });
    setErrors({});
    onClose();
  };

  // Show all available roles from database - permissions will be enforced by backend
  const getAvailableRoles = () => {
    if (!roles.length) return [];

    // Return all roles - let the backend enforce permissions based on role_permission table
    return roles;
  };

  // Show all available clients from database - permissions will be enforced by backend
  const getAvailableClients = () => {
    if (!clients.length) return [];

    // Return all clients - let the backend enforce permissions based on role_permission table
    return clients;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add New User"
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
            disabled={loading || loadingData}
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
            disabled={loading || loadingData}
          />
          {errors.user_name && (
            <p className="text-sm text-red-600 mt-1">{errors.user_name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Temporary Password *
          </label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Enter temporary password"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.password ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading || loadingData}
          />
          {errors.password && (
            <p className="text-sm text-red-600 mt-1">{errors.password}</p>
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
            disabled={loading || loadingData}
          />
          <label className="ml-2 block text-sm text-gray-700">
            Active User
          </label>
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
            Create User
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddUserModal;