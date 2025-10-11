import { usePermissions } from '../context/PermissionContext';

/**
 * Custom hook to access device management permission functionality
 * @returns {Object} Device permission context value
 */
export const useDevicePermissions = () => {
  const {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    loading,
    error
  } = usePermissions();

  // Device specific permission checks
  const canViewDevice = hasPermission('View Device');
  const canOnboardDevice = hasPermission('Onboard Device');
  const canRemoveDevice = hasPermission('Remove Device');

  return {
    // Direct permission checks
    canViewDevice,
    canOnboardDevice,
    canRemoveDevice,

    // Composite permission checks
    canManageDevices: canOnboardDevice || canRemoveDevice,
    canTransferDevice: canRemoveDevice, // Transfer requires remove permission
    hasFullDeviceAccess: canViewDevice && canOnboardDevice && canRemoveDevice,
    hasReadOnlyAccess: canViewDevice && !canOnboardDevice && !canRemoveDevice,

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
 * Custom hook to check a single device permission
 * @param {string} permission - Permission name to check
 * @returns {Object} Permission check result with loading state
 */
export const useHasDevicePermission = (permission) => {
  const { hasPermission, loading, error } = usePermissions();

  return {
    hasPermission: hasPermission(permission),
    loading,
    error
  };
};

/**
 * Custom hook to check multiple device permissions with AND logic
 * @param {string[]} permissions - Array of device permission names
 * @returns {Object} Permission check result with loading state
 */
export const useHasAllDevicePermissions = (permissions) => {
  const { hasAllPermissions, loading, error } = usePermissions();

  return {
    hasAllPermissions: hasAllPermissions(permissions),
    loading,
    error
  };
};

/**
 * Custom hook to check multiple device permissions with OR logic
 * @param {string[]} permissions - Array of device permission names
 * @returns {Object} Permission check result with loading state
 */
export const useHasAnyDevicePermission = (permissions) => {
  const { hasAnyPermission, loading, error } = usePermissions();

  return {
    hasAnyPermission: hasAnyPermission(permissions),
    loading,
    error
  };
};

export default useDevicePermissions;