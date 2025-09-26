import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useUser } from '../../context/UserContext';
import { useUserPermissions } from '../../hooks/useUserPermissions';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AddUserModal from '../../components/modals/AddUserModal';
import EditUserModal from '../../components/modals/EditUserModal';
import DeleteUserModal from '../../components/modals/DeleteUserModal';

const UserManagement = () => {
  const {
    users,
    userStats,
    loading,
    error,
    pagination,
    getAllUsers,
    getUserStats,
    updateUserStatus,
    clearError
  } = useUser();

  const {
    canViewUser,
    canCreateUser,
    canEditUser,
    canDeleteUser,
    canAccessUserManagement
  } = useUserPermissions();

  const { user: currentUser } = useAuth();

  // Local state for filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Ref to prevent multiple concurrent API calls
  const isLoadingUsers = useRef(false);

  // Memoize the access check to prevent unnecessary re-renders
  const hasAccess = canAccessUserManagement();

  // Load users with current filters - memoized to prevent recreation
  const loadUsers = useCallback(async () => {
    // Prevent multiple concurrent calls
    if (isLoadingUsers.current) {
      return;
    }

    try {
      isLoadingUsers.current = true;

      const options = {
        page: currentPage,
        limit: 10,
        search: searchTerm,
        sortBy: 'created_at',
        sortOrder: 'desc'
      };

      await getAllUsers(options);
    } catch (err) {
      console.error('🏭 UserManagement: Failed to load users:', err);
    } finally {
      isLoadingUsers.current = false;
    }
  }, [currentPage, searchTerm, roleFilter, statusFilter, getAllUsers]);

  // Load users on component mount and when filters change
  useEffect(() => {
    if (hasAccess) {
      loadUsers();
    }
  }, [loadUsers, hasAccess]);

  // Load user stats only once on component mount
  useEffect(() => {
    if (hasAccess) {
      getUserStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  // Handle search with debouncing
  const handleSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page
  };

  // Handle filter changes
  const handleRoleFilter = (value) => {
    setRoleFilter(value);
    setCurrentPage(1);
  };

  const handleStatusFilter = (value) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  // Handle user actions
  const handleCreateUser = () => {
    if (canCreateUser) {
      setShowAddModal(true);
    }
  };

  const handleEditUser = (user) => {
    if (canEditUser) {
      setSelectedUser(user);
      setShowEditModal(true);
    }
  };

  const handleDeleteUser = (user) => {
    if (canDeleteUser && user.user_id !== currentUser.user_id) {
      setSelectedUser(user);
      setShowDeleteModal(true);
    }
  };

  const handleToggleUserStatus = async (user) => {
    if (canEditUser && user.user_id !== currentUser.user_id) {
      try {
        await updateUserStatus(user.user_id, !user.is_active);
      } catch (err) {
        console.error('Failed to update user status:', err);
      }
    }
  };

  // Permission check for entire page access
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-500">You don't have permission to view user information.</p>
        </div>
      </div>
    );
  }

  if (loading && users.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-600 mt-1">Manage user accounts and permissions</p>
        </div>
        {canCreateUser && (
          <button
            onClick={handleCreateUser}
            className="flex items-center px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <PlusIcon className="w-5 h-5 mr-2" />
            Add User
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={clearError}
                className="text-sm text-red-600 hover:text-red-500 underline mt-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="flex space-x-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => handleRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Roles</option>
          <option value="SYSTEM_ADMIN">System Admin</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="CLIENT_ADMIN">Client Admin</option>
          <option value="CLIENT_USER">Client User</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                  {loading ? 'Loading users...' : 'No users found'}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.user_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                        {user.user_id === currentUser.user_id && (
                          <span className="ml-2 text-xs text-blue-600">(You)</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                      <div className="text-xs text-gray-400">@{user.user_name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                      {user.role_name || 'Unknown'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.client_name ? (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                        {user.client_name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No Client</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleToggleUserStatus(user)}
                      disabled={!canEditUser || user.user_id === currentUser.user_id}
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer ${
                        user.is_active
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      } ${(!canEditUser || user.user_id === currentUser.user_id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      {canEditUser && (
                        <button
                          onClick={() => handleEditUser(user)}
                          className="text-indigo-600 hover:text-indigo-900 cursor-pointer"
                          title="Edit User"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      )}
                      {canDeleteUser && user.user_id !== currentUser?.user_id && (
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="text-red-600 hover:text-red-900 cursor-pointer"
                          title="Delete User"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                      {!canEditUser && !canDeleteUser && (
                        <span className="text-gray-400 text-xs">View only</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing{' '}
            <span className="font-medium">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>{' '}
            of <span className="font-medium">{pagination.total}</span> results
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(pagination.page - 1)}
              disabled={!pagination.hasPrev || loading}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-2 text-sm text-gray-700">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(pagination.page + 1)}
              disabled={!pagination.hasNext || loading}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddUserModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          // Refresh users list after successful creation
          loadUsers();
        }}
      />

      <EditUserModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSuccess={() => {
          // Refresh users list after successful update
          loadUsers();
        }}
      />

      <DeleteUserModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSuccess={() => {
          // Refresh users list after successful deletion
          loadUsers();
        }}
      />
    </div>
  );
};

export default UserManagement;