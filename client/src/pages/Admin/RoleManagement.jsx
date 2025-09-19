import React, { useState, useEffect, useCallback } from 'react';
import { useRole } from '../../context/RoleContext';
import { useRolePermissions } from '../../hooks/usePermissions';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  ShieldCheckIcon,
  CogIcon,
  TrashIcon,
  PencilIcon,
  EyeIcon
} from '@heroicons/react/24/outline';

// Import modal components
import RoleModal from '../../components/modals/RoleModal';
import PermissionModal from '../../components/modals/PermissionModal';
import RoleUsersModal from '../../components/modals/RoleUsersModal';
import DeleteRoleModal from '../../components/modals/DeleteRoleModal';

const RoleManagement = () => {
  const {
    roles,
    stats,
    loading,
    error,
    pagination,
    getAllRoles,
    getRoleStats,
    deleteRole,
    clearError
  } = useRole();

  const { canCreateRole, canEditRole, loading: permissionLoading } = useRolePermissions();

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  // Fetch roles on component mount and when search/page changes
  useEffect(() => {
    loadRoles();
  }, [searchTerm, currentPage]);

  // Fetch stats on component mount
  useEffect(() => {
    getRoleStats();
  }, [getRoleStats]);

  const loadRoles = useCallback(() => {
    const params = {
      page: currentPage,
      search: searchTerm || undefined
    };
    getAllRoles(params);
  }, [getAllRoles, currentPage, searchTerm]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const handleCreateRole = () => {
    setSelectedRole(null);
    setShowCreateModal(true);
  };

  const handleEditRole = (role) => {
    setSelectedRole(role);
    setShowEditModal(true);
  };

  const handleDeleteRole = (role) => {
    setSelectedRole(role);
    setShowDeleteModal(true);
  };

  const handleManagePermissions = (role) => {
    setSelectedRole(role);
    setShowPermissionsModal(true);
  };

  const handleViewUsers = (role) => {
    setSelectedRole(role);
    setShowUsersModal(true);
  };

  const confirmDelete = async () => {
    if (selectedRole) {
      try {
        await deleteRole(selectedRole.role_id);
        setShowDeleteModal(false);
        setSelectedRole(null);
        loadRoles(); // Refresh the list
      } catch (error) {
        // Error is handled by context
      }
    }
  };

  const closeModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
    setShowPermissionsModal(false);
    setShowUsersModal(false);
    setSelectedRole(null);
  };

  // Statistics cards data
  const statsCards = [
    {
      title: 'Total Roles',
      value: stats?.total_roles || 0,
      icon: ShieldCheckIcon,
      color: 'bg-blue-500'
    },
    {
      title: 'Total Users',
      value: stats?.total_users || 0,
      icon: UsersIcon,
      color: 'bg-green-500'
    },
    {
      title: 'Total Permissions',
      value: stats?.total_permissions || 0,
      icon: CogIcon,
      color: 'bg-purple-500'
    },
    {
      title: 'Avg Permissions/Role',
      value: stats?.avg_permissions_per_role || '0.0',
      icon: ShieldCheckIcon,
      color: 'bg-orange-500'
    }
  ];

  if (loading && !roles.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Role Management</h2>
          <p className="mt-1 text-sm text-gray-600">
            Manage roles and their permissions across the system
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          {canCreateRole && (
            <button
              onClick={handleCreateRole}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
              New Role
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
              <div className="mt-4">
                <div className="-mx-2 -my-1.5 flex">
                  <button
                    onClick={clearError}
                    className="px-2 py-1.5 rounded-md text-sm font-medium bg-red-50 text-red-800 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-red-50 focus:ring-red-600"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => (
          <div key={index} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <stat.icon className={`h-6 w-6 text-white p-1 rounded ${stat.color}`} />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      {stat.title}
                    </dt>
                    <dd className="text-lg font-medium text-gray-900">
                      {stat.value}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="sm:flex sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <div className="max-w-lg w-full lg:max-w-xs">
                <label htmlFor="search" className="sr-only">
                  Search roles
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="search"
                    name="search"
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Search roles..."
                    type="search"
                    value={searchTerm}
                    onChange={handleSearch}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Roles Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Roles ({pagination.totalCount})
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            List of all system roles and their configurations
          </p>
        </div>
        
        {roles.length === 0 ? (
          <div className="text-center py-12">
            <ShieldCheckIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No roles found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'Try adjusting your search criteria' : 'Get started by creating a new role.'}
            </p>
            {!searchTerm && canCreateRole && (
              <div className="mt-6">
                <button
                  onClick={handleCreateRole}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                  New Role
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-200">
              {roles.map((role) => (
                <li key={role.role_id}>
                  <div className="px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <ShieldCheckIcon className="h-6 w-6 text-indigo-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {role.role_name}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center space-x-4">
                          <span className="flex items-center">
                            <UsersIcon className="h-4 w-4 mr-1" />
                            {role.user_count} users
                          </span>
                          <span className="flex items-center">
                            <CogIcon className="h-4 w-4 mr-1" />
                            {role.permission_count} permissions
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleViewUsers(role)}
                        className="text-gray-400 hover:text-gray-500"
                        title="View Users"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                      {canEditRole && (
                        <button
                          onClick={() => handleManagePermissions(role)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Manage Permissions"
                        >
                          <CogIcon className="h-5 w-5" />
                        </button>
                      )}
                      {canEditRole && (
                        <button
                          onClick={() => handleEditRole(role)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Edit Role"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      )}
                      {canEditRole && (
                        <button
                          onClick={() => handleDeleteRole(role)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Role"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => handlePageChange(pagination.currentPage - 1)}
                    disabled={!pagination.hasPrevious}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.currentPage + 1)}
                    disabled={!pagination.hasNext}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing{' '}
                      <span className="font-medium">
                        {((pagination.currentPage - 1) * pagination.pageSize) + 1}
                      </span>{' '}
                      to{' '}
                      <span className="font-medium">
                        {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)}
                      </span>{' '}
                      of{' '}
                      <span className="font-medium">{pagination.totalCount}</span>{' '}
                      results
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      <button
                        onClick={() => handlePageChange(pagination.currentPage - 1)}
                        disabled={!pagination.hasPrevious}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => handlePageChange(pagination.currentPage + 1)}
                        disabled={!pagination.hasNext}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <RoleModal
        isOpen={showCreateModal}
        onClose={closeModals}
        role={null}
        onSuccess={() => {
          closeModals();
          loadRoles();
        }}
      />

      <RoleModal
        isOpen={showEditModal}
        onClose={closeModals}
        role={selectedRole}
        onSuccess={() => {
          closeModals();
          loadRoles();
        }}
      />

      <DeleteRoleModal
        isOpen={showDeleteModal}
        onClose={closeModals}
        role={selectedRole}
        onSuccess={() => {
          closeModals();
          loadRoles();
        }}
      />

      <PermissionModal
        isOpen={showPermissionsModal}
        onClose={closeModals}
        role={selectedRole}
        onSuccess={() => {
          closeModals();
          loadRoles();
        }}
      />

      <RoleUsersModal
        isOpen={showUsersModal}
        onClose={closeModals}
        role={selectedRole}
      />
      
    </div>
  );
};

export default RoleManagement;