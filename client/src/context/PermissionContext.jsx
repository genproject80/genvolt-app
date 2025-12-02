import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/authService';
import { useAuth } from './AuthContext';

const PermissionContext = createContext({});

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
};

export const PermissionProvider = ({ children }) => {
  const [userPermissions, setUserPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { isAuthenticated, user } = useAuth();

  // Fetch user permissions when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchUserPermissions();
    } else {
      // Clear permissions when user is not authenticated
      setUserPermissions([]);
      setError(null);
    }
  }, [isAuthenticated, user]);

  const fetchUserPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await authService.getUserPermissions();
      setUserPermissions(response.data.permissions || []);
    } catch (error) {
      console.error('🔑 PermissionContext: Failed to fetch user permissions:', error);
      setError(error.message || 'Failed to fetch permissions');
      setUserPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Check if user has a specific permission
   * @param {string} permission - Permission name to check
   * @returns {boolean} True if user has the permission
   */
  const hasPermission = (permission) => {
    if (!permission || !Array.isArray(userPermissions)) {
      return false;
    }
    return userPermissions.includes(permission);
  };

  /**
   * Check if user has any of the specified permissions
   * @param {string[]} permissions - Array of permission names
   * @returns {boolean} True if user has at least one permission
   */
  const hasAnyPermission = (permissions) => {
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return false;
    }
    return permissions.some(permission => hasPermission(permission));
  };

  /**
   * Check if user has all of the specified permissions
   * @param {string[]} permissions - Array of permission names
   * @returns {boolean} True if user has all permissions
   */
  const hasAllPermissions = (permissions) => {
    if (!Array.isArray(permissions) || permissions.length === 0) {
      return false;
    }
    return permissions.every(permission => hasPermission(permission));
  };

  /**
   * Refresh user permissions manually
   * @returns {Promise<void>}
   */
  const refreshPermissions = async () => {
    if (isAuthenticated && user) {
      await fetchUserPermissions();
    }
  };

  /**
   * Clear any permission-related errors
   */
  const clearError = () => {
    setError(null);
  };

  // Convenience permission checks for role management
  const canCreateRole = hasPermission('Create Role');
  const canEditRole = hasPermission('Edit Role');

  // Convenience permission checks for client management
  const canViewClient = hasPermission('View Client');
  const canCreateClient = hasPermission('Create Client');
  const canEditClient = hasPermission('Edit Client');
  const canDeleteClient = hasPermission('Delete Client');

  // Convenience permission checks for user management
  const canViewUser = hasPermission('View User');
  const canCreateUser = hasPermission('Create User');
  const canEditUser = hasPermission('Edit User');
  const canDeleteUser = hasPermission('Delete User');
  const canResetPassword = hasPermission('Reset Password');

  const value = {
    // State
    userPermissions,
    loading,
    error,

    // Permission check methods
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,

    // Actions
    refreshPermissions,
    clearError,

    // Convenience flags for role management
    canCreateRole,
    canEditRole,

    // Convenience flags for client management
    canViewClient,
    canCreateClient,
    canEditClient,
    canDeleteClient,

    // Convenience flags for user management
    canViewUser,
    canCreateUser,
    canEditUser,
    canDeleteUser,
    canResetPassword
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

export default PermissionContext;