import React, { useState, useEffect, useCallback, useRef } from 'react';
import { IconPlus, IconPencil, IconTrash, IconAlertTriangle, IconKey } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Pagination, Center, Loader, Text, Group, Badge, ActionIcon, Tooltip,
} from '@mantine/core';
import { useUser } from '../../context/UserContext';
import { useUserPermissions } from '../../hooks/useUserPermissions';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import SearchableSelect from '../../components/common/SearchableSelect';
import AddUserModal from '../../components/modals/AddUserModal';
import EditUserModal from '../../components/modals/EditUserModal';
import DeleteUserModal from '../../components/modals/DeleteUserModal';
import ResetPasswordModal from '../../components/modals/ResetPasswordModal';

const UserManagement = () => {
  const {
    users, userStats, loading, error, pagination,
    getAllUsers, getUserStats, updateUserStatus, clearError
  } = useUser();

  const {
    canViewUser, canCreateUser, canEditUser, canDeleteUser,
    canResetPassword, canAccessUserManagement
  } = useUserPermissions();

  const { user: currentUser } = useAuth();

  const [searchTerm, setSearchTerm]   = useState('');
  const [roleFilter, setRoleFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal]                   = useState(false);
  const [showEditModal, setShowEditModal]                 = useState(false);
  const [showDeleteModal, setShowDeleteModal]             = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const isLoadingUsers = useRef(false);
  const hasAccess = canAccessUserManagement();

  const loadUsers = useCallback(async () => {
    if (isLoadingUsers.current) return;
    try {
      isLoadingUsers.current = true;
      await getAllUsers({
        page: currentPage, limit: 10,
        search: searchTerm, sortBy: 'created_at', sortOrder: 'desc',
      });
    } catch (err) {
      console.error('UserManagement: Failed to load users:', err);
    } finally {
      isLoadingUsers.current = false;
    }
  }, [currentPage, searchTerm, roleFilter, statusFilter, getAllUsers]);

  useEffect(() => { if (hasAccess) loadUsers(); }, [loadUsers, hasAccess]);
  useEffect(() => { if (hasAccess) getUserStats(); }, [hasAccess]); // eslint-disable-line

  const handleSearch       = (v) => { setSearchTerm(v); setCurrentPage(1); };
  const handleRoleFilter   = (v) => { setRoleFilter(v); setCurrentPage(1); };
  const handleStatusFilter = (v) => { setStatusFilter(v); setCurrentPage(1); };

  const handleToggleUserStatus = async (user) => {
    if (canEditUser && user.user_id !== currentUser.user_id) {
      try { await updateUserStatus(user.user_id, !user.is_active); }
      catch (err) { console.error('Failed to update user status:', err); }
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <IconAlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-500">You don't have permission to view user information.</p>
        </div>
      </div>
    );
  }

  if (loading && users.length === 0) return <LoadingSpinner />;

  const rows = users.map((user) => (
    <Table.Tr key={user.user_id}>
      <Table.Td>
        <Text size="sm" fw={500}>
          {user.first_name} {user.last_name}
          {user.user_id === currentUser.user_id && (
            <Text component="span" size="xs" c="blue" ml={6}>(You)</Text>
          )}
        </Text>
        <Text size="sm" c="dimmed">{user.email}</Text>
        <Text size="xs" c="dimmed">@{user.user_name}</Text>
      </Table.Td>
      <Table.Td>
        <Badge color="blue" variant="light" size="sm">{user.role_name || 'Unknown'}</Badge>
      </Table.Td>
      <Table.Td>
        {user.client_name
          ? <Badge color="violet" variant="light" size="sm">{user.client_name}</Badge>
          : <Text size="xs" c="dimmed">No Client</Text>}
      </Table.Td>
      <Table.Td>
        <Badge
          color={user.is_active ? 'green' : 'red'}
          variant="light"
          size="sm"
          style={{ cursor: (canEditUser && user.user_id !== currentUser.user_id) ? 'pointer' : 'default' }}
          onClick={() => handleToggleUserStatus(user)}
        >
          {user.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
        </Text>
      </Table.Td>
      <Table.Td>
        <Group gap={4}>
          {canEditUser && (
            <Tooltip label="Edit User" withArrow>
              <ActionIcon variant="subtle" color="indigo" size="sm"
                onClick={() => { setSelectedUser(user); setShowEditModal(true); }}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {canResetPassword && (
            <Tooltip label="Reset Password" withArrow>
              <ActionIcon variant="subtle" color="green" size="sm"
                onClick={() => { setSelectedUser(user); setShowResetPasswordModal(true); }}>
                <IconKey size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {canDeleteUser && user.user_id !== currentUser?.user_id && (
            <Tooltip label="Delete User" withArrow>
              <ActionIcon variant="subtle" color="red" size="sm"
                onClick={() => { setSelectedUser(user); setShowDeleteModal(true); }}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {!canEditUser && !canDeleteUser && !canResetPassword && (
            <Text size="xs" c="dimmed">View only</Text>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-600 mt-1">Manage user accounts and permissions</p>
        </div>
        {canCreateUser && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <IconPlus className="w-5 h-5 mr-2" />
            Add User
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <IconAlertTriangle className="w-5 h-5 text-red-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button onClick={clearError} className="text-sm text-red-600 hover:text-red-500 underline mt-2">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <SearchableSelect
          options={[
            { value: 'SYSTEM_ADMIN', label: 'System Admin' },
            { value: 'SUPER_ADMIN', label: 'Super Admin' },
            { value: 'CLIENT_ADMIN', label: 'Client Admin' },
            { value: 'CLIENT_USER', label: 'Client User' },
          ]}
          value={roleFilter}
          onChange={handleRoleFilter}
          placeholder="All Roles"
          className="w-full sm:w-44"
        />
        <SearchableSelect
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          value={statusFilter}
          onChange={handleStatusFilter}
          placeholder="All Status"
          className="w-full sm:w-36"
        />
      </div>

      {/* Table */}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : users.length === 0 ? (
            <Center py="xl"><Text size="sm" c="dimmed">No users found</Text></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Client</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Paper>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
          </Text>
          <Pagination
            total={pagination.totalPages}
            value={currentPage}
            onChange={setCurrentPage}
            size="sm"
          />
        </Group>
      )}

      {/* Modals */}
      <AddUserModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={loadUsers} />
      <EditUserModal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setSelectedUser(null); }}
        user={selectedUser}
        onSuccess={loadUsers}
      />
      <ResetPasswordModal
        isOpen={showResetPasswordModal}
        onClose={() => { setShowResetPasswordModal(false); setSelectedUser(null); }}
        user={selectedUser}
        onSuccess={loadUsers}
      />
      <DeleteUserModal
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setSelectedUser(null); }}
        user={selectedUser}
        onSuccess={loadUsers}
      />
    </div>
  );
};

export default UserManagement;
