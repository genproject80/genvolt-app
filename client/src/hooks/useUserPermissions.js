import { usePermissions } from '../context/PermissionContext';

/**
 * Custom hook for user management permissions
 * Provides easy access to all user-related permission checks
 * @returns {Object} Object containing permission flags and utility functions
 */
export const useUserPermissions = () => {
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    loading,
    error,
    canViewUser,
    canCreateUser,
    canEditUser,
    canDeleteUser
  } = usePermissions();

  // Derived permission flags for more specific user management scenarios
  const canManageUsers = hasAnyPermission(['Create User', 'Edit User', 'Delete User']);
  const hasFullUserAccess = hasAllPermissions(['View User', 'Create User', 'Edit User', 'Delete User']);
  const canModifyUsers = hasAnyPermission(['Edit User', 'Delete User']);
  const isUserReadOnly = canViewUser && !canManageUsers;

  // Helper functions for specific user management scenarios
  const canPerformUserAction = (action) => {
    const actionPermissions = {
      view: 'View User',
      create: 'Create User',
      edit: 'Edit User',
      delete: 'Delete User',
      manage: ['Create User', 'Edit User', 'Delete User']
    };

    const permission = actionPermissions[action];
    if (!permission) return false;

    return Array.isArray(permission)
      ? hasAnyPermission(permission)
      : hasPermission(permission);
  };

  const canAccessUserManagement = () => {
    // User needs at least View User permission to access user management
    return canViewUser;
  };

  const getUserPermissionLevel = () => {
    if (hasFullUserAccess) return 'full';
    if (canManageUsers) return 'manage';
    if (canViewUser) return 'view';
    return 'none';
  };

  return {
    // Basic permission flags
    canViewUser,
    canCreateUser,
    canEditUser,
    canDeleteUser,

    // Derived permission flags
    canManageUsers,
    hasFullUserAccess,
    canModifyUsers,
    isUserReadOnly,

    // Utility functions
    canPerformUserAction,
    canAccessUserManagement,
    getUserPermissionLevel,

    // Raw permission functions for custom checks
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,

    // State
    loading,
    error
  };
};

export default useUserPermissions;