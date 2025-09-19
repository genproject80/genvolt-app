import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { XMarkIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useRole } from '../../context/RoleContext';

const RoleModal = ({ isOpen, onClose, role = null, onSuccess }) => {
  const { createRole, updateRole, permissions, getAllPermissions, loading, error } = useRole();
  
  const [formData, setFormData] = useState({
    role_name: '',
    permission_ids: []
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEditMode = Boolean(role);

  // Initialize form data when modal opens or role changes
  useEffect(() => {
    if (isOpen) {
      if (isEditMode && role) {
        setFormData({
          role_name: role.role_name || '',
          permission_ids: role.permissions ? role.permissions.map(p => p.permission_id) : []
        });
      } else {
        setFormData({
          role_name: '',
          permission_ids: []
        });
      }
      setFormErrors({});
      
      // Load permissions if not already loaded
      if (!permissions.length) {
        getAllPermissions();
      }
    }
  }, [isOpen, role, isEditMode, getAllPermissions, permissions.length]);

  const validateForm = () => {
    const errors = {};

    // Validate role name
    if (!formData.role_name.trim()) {
      errors.role_name = 'Role name is required';
    } else if (formData.role_name.trim().length < 2) {
      errors.role_name = 'Role name must be at least 2 characters';
    } else if (formData.role_name.trim().length > 100) {
      errors.role_name = 'Role name must be less than 100 characters';
    } else if (!/^[a-zA-Z0-9\s_-]+$/.test(formData.role_name.trim())) {
      errors.role_name = 'Role name can only contain letters, numbers, spaces, underscores, and hyphens';
    }

    // Check for reserved role names (only for new roles)
    if (!isEditMode) {
      const reservedNames = ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER'];
      if (reservedNames.includes(formData.role_name.trim().toUpperCase())) {
        errors.role_name = 'This role name is reserved and cannot be used';
      }
    }

    // Validate permissions (optional but if provided should be valid)
    if (formData.permission_ids.length > 50) {
      errors.permission_ids = 'Cannot assign more than 50 permissions to a role';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const handlePermissionChange = (permissionId) => {
    setFormData(prev => {
      const isSelected = prev.permission_ids.includes(permissionId);
      const newPermissionIds = isSelected
        ? prev.permission_ids.filter(id => id !== permissionId)
        : [...prev.permission_ids, permissionId];
      
      return {
        ...prev,
        permission_ids: newPermissionIds
      };
    });
    
    // Clear permission errors
    if (formErrors.permission_ids) {
      setFormErrors(prev => ({
        ...prev,
        permission_ids: undefined
      }));
    }
  };

  const handleSelectAllPermissions = () => {
    const allPermissionIds = permissions.map(p => p.permission_id);
    setFormData(prev => ({
      ...prev,
      permission_ids: allPermissionIds
    }));
  };

  const handleDeselectAllPermissions = () => {
    setFormData(prev => ({
      ...prev,
      permission_ids: []
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const roleData = {
        role_name: formData.role_name.trim(),
        permission_ids: formData.permission_ids
      };

      let result;
      if (isEditMode) {
        result = await updateRole(role.role_id, { role_name: roleData.role_name });
        // Note: Permission updates are handled separately in the PermissionModal
      } else {
        result = await createRole(roleData);
      }

      if (onSuccess) {
        onSuccess(result);
      }
      
      onClose();
    } catch (error) {
      // Error is handled by context and will be displayed
      console.error('Failed to save role:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  // Group permissions by category for better UX
  const groupedPermissions = permissions.reduce((groups, permission) => {
    // Simple categorization based on permission name
    let category = 'Other';
    
    if (permission.permission_name.includes('User')) {
      category = 'User Management';
    } else if (permission.permission_name.includes('Client')) {
      category = 'Client Management';
    } else if (permission.permission_name.includes('Device')) {
      category = 'Device Management';
    } else if (permission.permission_name.includes('Role') || permission.permission_name.includes('role')) {
      category = 'System Administration';
    }

    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(permission);
    
    return groups;
  }, {});

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <ShieldCheckIcon className="h-6 w-6 text-indigo-600" />
                    </div>
                    <div className="ml-4">
                      <Dialog.Title as="h3" className="text-lg font-medium text-gray-900">
                        {isEditMode ? 'Edit Role' : 'Create New Role'}
                      </Dialog.Title>
                      <p className="text-sm text-gray-500">
                        {isEditMode 
                          ? 'Update the role name and basic settings' 
                          : 'Create a new role with permissions'
                        }
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="text-gray-400 hover:text-gray-500 focus:outline-none"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="mb-4 rounded-md bg-red-50 p-4">
                    <div className="text-sm text-red-700">{error}</div>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Role Name */}
                  <div>
                    <label htmlFor="role_name" className="block text-sm font-medium text-gray-700">
                      Role Name *
                    </label>
                    <input
                      type="text"
                      id="role_name"
                      name="role_name"
                      required
                      value={formData.role_name}
                      onChange={handleInputChange}
                      disabled={isSubmitting || loading}
                      placeholder="Enter role name (e.g., Content Manager)"
                      className={`mt-1 block w-full border rounded-md px-3 py-2 shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${
                        formErrors.role_name 
                          ? 'border-red-300 focus:ring-red-500 focus:border-red-500' 
                          : 'border-gray-300'
                      }`}
                    />
                    {formErrors.role_name && (
                      <p className="mt-2 text-sm text-red-600">{formErrors.role_name}</p>
                    )}
                  </div>

                  {/* Permissions (only for create mode) */}
                  {!isEditMode && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <label className="block text-sm font-medium text-gray-700">
                          Permissions (Optional)
                        </label>
                        <div className="flex space-x-2">
                          <button
                            type="button"
                            onClick={handleSelectAllPermissions}
                            className="text-xs text-indigo-600 hover:text-indigo-500"
                          >
                            Select All
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            type="button"
                            onClick={handleDeselectAllPermissions}
                            className="text-xs text-indigo-600 hover:text-indigo-500"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      
                      {loading ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
                        </div>
                      ) : (
                        <div className="border border-gray-200 rounded-md p-4 max-h-64 overflow-y-auto">
                          {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
                            <div key={category} className="mb-4 last:mb-0">
                              <h4 className="text-sm font-medium text-gray-900 mb-2">{category}</h4>
                              <div className="grid grid-cols-1 gap-2">
                                {categoryPermissions.map((permission) => (
                                  <label key={permission.permission_id} className="inline-flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={formData.permission_ids.includes(permission.permission_id)}
                                      onChange={() => handlePermissionChange(permission.permission_id)}
                                      className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                    />
                                    <span className="ml-2 text-sm text-gray-700">
                                      {permission.permission_name}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {formData.permission_ids.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {formData.permission_ids.length} permission(s) selected
                        </p>
                      )}
                      
                      {formErrors.permission_ids && (
                        <p className="mt-2 text-sm text-red-600">{formErrors.permission_ids}</p>
                      )}
                    </div>
                  )}

                  {/* Note for edit mode */}
                  {isEditMode && (
                    <div className="rounded-md bg-blue-50 p-4">
                      <div className="text-sm text-blue-700">
                        <p className="font-medium">Note:</p>
                        <p>To modify permissions for this role, use the "Manage Permissions" button from the role list.</p>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isSubmitting}
                      className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || loading}
                      className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          {isEditMode ? 'Updating...' : 'Creating...'}
                        </div>
                      ) : (
                        isEditMode ? 'Update Role' : 'Create Role'
                      )}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default RoleModal;