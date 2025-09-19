import { usePermissions } from '../context/PermissionContext';

/**
 * Custom hook to access client management permission functionality
 * @returns {Object} Client permission context value
 */
export const useClientPermissions = () => {
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canViewClient,
    canCreateClient,
    canEditClient,
    canDeleteClient,
    loading,
    error
  } = usePermissions();

  return {
    // Direct permission checks
    canViewClient,
    canCreateClient,
    canEditClient,
    canDeleteClient,

    // Composite permission checks
    canManageClients: canCreateClient || canEditClient || canDeleteClient,
    hasFullAccess: canViewClient && canCreateClient && canEditClient && canDeleteClient,
    hasReadOnlyAccess: canViewClient && !canCreateClient && !canEditClient && !canDeleteClient,

    // Generic permission helpers
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,

    // State
    loading,
    error
  };
};

/**
 * Custom hook to check a single client permission
 * @param {string} permission - Permission name to check
 * @returns {Object} Permission check result with loading state
 */
export const useHasClientPermission = (permission) => {
  const { hasPermission, loading, error } = usePermissions();

  return {
    hasPermission: hasPermission(permission),
    loading,
    error
  };
};

/**
 * Custom hook to check multiple client permissions with AND logic
 * @param {string[]} permissions - Array of client permission names
 * @returns {Object} Permission check result with loading state
 */
export const useHasAllClientPermissions = (permissions) => {
  const { hasAllPermissions, loading, error } = usePermissions();

  return {
    hasAllPermissions: hasAllPermissions(permissions),
    loading,
    error
  };
};

/**
 * Custom hook to check multiple client permissions with OR logic
 * @param {string[]} permissions - Array of client permission names
 * @returns {Object} Permission check result with loading state
 */
export const useHasAnyClientPermission = (permissions) => {
  const { hasAnyPermission, loading, error } = usePermissions();

  return {
    hasAnyPermission: hasAnyPermission(permissions),
    loading,
    error
  };
};

export default useClientPermissions;