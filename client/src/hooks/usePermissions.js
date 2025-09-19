import { usePermissions as usePermissionsContext } from '../context/PermissionContext';

/**
 * Custom hook to access permission functionality
 * This is a convenience wrapper around the PermissionContext
 * @returns {Object} Permission context value
 */
export const usePermissions = () => {
  return usePermissionsContext();
};

/**
 * Custom hook to check a single permission
 * @param {string} permission - Permission name to check
 * @returns {Object} Permission check result with loading state
 */
export const useHasPermission = (permission) => {
  const { hasPermission, loading, error } = usePermissionsContext();

  return {
    hasPermission: hasPermission(permission),
    loading,
    error
  };
};

/**
 * Custom hook to check multiple permissions with AND logic
 * @param {string[]} permissions - Array of permission names
 * @returns {Object} Permission check result with loading state
 */
export const useHasAllPermissions = (permissions) => {
  const { hasAllPermissions, loading, error } = usePermissionsContext();

  return {
    hasAllPermissions: hasAllPermissions(permissions),
    loading,
    error
  };
};

/**
 * Custom hook to check multiple permissions with OR logic
 * @param {string[]} permissions - Array of permission names
 * @returns {Object} Permission check result with loading state
 */
export const useHasAnyPermission = (permissions) => {
  const { hasAnyPermission, loading, error } = usePermissionsContext();

  return {
    hasAnyPermission: hasAnyPermission(permissions),
    loading,
    error
  };
};

/**
 * Custom hook for role management permissions
 * @returns {Object} Role management permission flags
 */
export const useRolePermissions = () => {
  const { canCreateRole, canEditRole, loading, error } = usePermissionsContext();

  return {
    canCreateRole,
    canEditRole,
    canManageRoles: canCreateRole || canEditRole,
    loading,
    error
  };
};

export default usePermissions;