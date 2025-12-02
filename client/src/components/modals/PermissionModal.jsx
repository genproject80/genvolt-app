import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import {
  XMarkIcon,
  CogIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  MinusIcon
} from '@heroicons/react/24/outline';
import { useRole } from '../../context/RoleContext';
import { permissionService } from '../../services/permissionService';
import { useRolePermissions } from '../../hooks/usePermissions';

const PermissionModal = ({ isOpen, onClose, role = null, onSuccess }) => {
  const { updateRolePermissions, loading, error } = useRole();
  const { canEditRole } = useRolePermissions();
  
  const [rolePermissions, setRolePermissions] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [permissionCategories, setPermissionCategories] = useState({});
  const [selectedPermissions, setSelectedPermissions] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load permissions and role data when modal opens
  useEffect(() => {
    if (isOpen && role) {
      loadPermissionsData();
    }
  }, [isOpen, role]);

  // Track changes when selected permissions change
  useEffect(() => {
    if (rolePermissions.length > 0) {
      const currentIds = new Set(rolePermissions.map(p => p.permission_id));
      const newIds = selectedPermissions;
      
      const hasChanges = currentIds.size !== newIds.size || 
        ![...currentIds].every(id => newIds.has(id));
      
      setHasChanges(hasChanges);
    }
  }, [selectedPermissions, rolePermissions]);

  // Group permissions by category for better UX (same logic as RoleModal)
  const groupPermissionsByCategory = (permissions) => {
    return permissions.reduce((groups, permission) => {
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
  };

  const loadPermissionsData = async () => {
    if (!role) return;

    setIsLoading(true);
    try {
      // Load all permissions
      const [allPermsResponse, rolePermsResponse] = await Promise.all([
        permissionService.getAllPermissions(),
        permissionService.getUnassignedPermissions(role.role_id)
      ]);

      if (allPermsResponse.success) {
        setAllPermissions(allPermsResponse.data.permissions);

        // Group permissions using same logic as RoleModal
        const grouped = groupPermissionsByCategory(allPermsResponse.data.permissions);
        setPermissionCategories(grouped);
      }

      // Get currently assigned permissions
      const currentPermissions = allPermsResponse.data.permissions.filter(p =>
        !rolePermsResponse.data.unassigned_permissions.find(up => up.permission_id === p.permission_id)
      );

      setRolePermissions(currentPermissions);
      setSelectedPermissions(new Set(currentPermissions.map(p => p.permission_id)));

    } catch (error) {
      console.error('Failed to load permissions data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePermissionToggle = (permissionId) => {
    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(permissionId)) {
        newSet.delete(permissionId);
      } else {
        newSet.add(permissionId);
      }
      return newSet;
    });
  };

  const handleSelectAllInCategory = (categoryPermissions) => {
    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      categoryPermissions.forEach(p => newSet.add(p.permission_id));
      return newSet;
    });
  };

  const handleDeselectAllInCategory = (categoryPermissions) => {
    setSelectedPermissions(prev => {
      const newSet = new Set(prev);
      categoryPermissions.forEach(p => newSet.delete(p.permission_id));
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedPermissions(new Set(allPermissions.map(p => p.permission_id)));
  };

  const handleDeselectAll = () => {
    setSelectedPermissions(new Set());
  };

  const getFilteredPermissions = () => {
    let filtered = allPermissions;

    // Filter by category
    if (selectedCategory !== 'all') {
      const categoryPermissions = permissionCategories[selectedCategory] || [];
      const categoryIds = new Set(categoryPermissions.map(p => p.permission_id));
      filtered = filtered.filter(p => categoryIds.has(p.permission_id));
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.permission_name.toLowerCase().includes(search)
      );
    }

    return filtered;
  };

  const handleSubmit = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await updateRolePermissions(role.role_id, Array.from(selectedPermissions));
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      console.error('Failed to update role permissions:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  // Check permissions - prevent unauthorized access
  if (!canEditRole) {
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-center align-middle shadow-xl transition-all">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                    <XMarkIcon className="w-6 h-6 text-red-600" />
                  </div>
                  <Dialog.Title as="h3" className="text-lg font-medium text-gray-900 mb-2">
                    Access Denied
                  </Dialog.Title>
                  <p className="text-sm text-gray-500 mb-6">
                    You don't have permission to manage role permissions.
                  </p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  >
                    OK
                  </button>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    );
  }

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
              <Dialog.Panel className="w-full max-w-4xl transform overflow-hidden rounded-lg bg-white text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <CogIcon className="h-6 w-6 text-purple-600" />
                    </div>
                    <div className="ml-4">
                      <Dialog.Title as="h3" className="text-lg font-medium text-gray-900">
                        Manage Permissions
                      </Dialog.Title>
                      <p className="text-sm text-gray-500">
                        {role ? `Update permissions for role: ${role.role_name}` : 'Manage role permissions'}
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
                  <div className="mx-6 mt-4 rounded-md bg-red-50 p-4">
                    <div className="text-sm text-red-700">{error}</div>
                  </div>
                )}

                <div className="p-6">
                  {/* Search and Filter Controls */}
                  <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1">
                      <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search permissions..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="block w-full rounded-md border-gray-300 pl-10 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="sm:w-48">
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="block w-full rounded-md border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                      >
                        <option value="all">All Categories</option>
                        {Object.keys(permissionCategories).map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Permission Selection Summary */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500">
                      {selectedPermissions.size} of {allPermissions.length} permissions selected
                    </span>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="text-xs text-indigo-600 hover:text-indigo-500"
                      >
                        Select All
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="text-xs text-indigo-600 hover:text-indigo-500"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {/* Permissions List */}
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                      {selectedCategory === 'all' ? (
                        // Show by categories
                        Object.entries(permissionCategories).map(([category, categoryPermissions]) => {
                          const filteredCategoryPerms = categoryPermissions.filter(p => 
                            !searchTerm.trim() || p.permission_name.toLowerCase().includes(searchTerm.toLowerCase())
                          );
                          
                          if (filteredCategoryPerms.length === 0) return null;

                          const allSelected = filteredCategoryPerms.every(p => selectedPermissions.has(p.permission_id));
                          const someSelected = filteredCategoryPerms.some(p => selectedPermissions.has(p.permission_id));

                          return (
                            <div key={category} className="border-b border-gray-100 last:border-b-0">
                              <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                                <h4 className="text-sm font-medium text-gray-900">{category}</h4>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs text-gray-500">
                                    {filteredCategoryPerms.filter(p => selectedPermissions.has(p.permission_id)).length}/{filteredCategoryPerms.length}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => allSelected 
                                      ? handleDeselectAllInCategory(filteredCategoryPerms) 
                                      : handleSelectAllInCategory(filteredCategoryPerms)
                                    }
                                    className="text-xs text-indigo-600 hover:text-indigo-500"
                                  >
                                    {allSelected ? (
                                      <MinusIcon className="h-4 w-4" />
                                    ) : (
                                      <CheckIcon className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <div className="p-4 space-y-2">
                                {filteredCategoryPerms.map((permission) => (
                                  <label key={permission.permission_id} className="flex items-center">
                                    <input
                                      type="checkbox"
                                      checked={selectedPermissions.has(permission.permission_id)}
                                      onChange={() => handlePermissionToggle(permission.permission_id)}
                                      className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                    />
                                    <span className="ml-3 text-sm text-gray-700">
                                      {permission.permission_name}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        // Show filtered results
                        <div className="p-4 space-y-2">
                          {getFilteredPermissions().map((permission) => (
                            <label key={permission.permission_id} className="flex items-center">
                              <input
                                type="checkbox"
                                checked={selectedPermissions.has(permission.permission_id)}
                                onChange={() => handlePermissionToggle(permission.permission_id)}
                                className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              />
                              <span className="ml-3 text-sm text-gray-700">
                                {permission.permission_name}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isSubmitting}
                    className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !hasChanges}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Updating...
                      </div>
                    ) : (
                      hasChanges ? 'Update Permissions' : 'No Changes'
                    )}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default PermissionModal;