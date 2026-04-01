import { usePermissions } from './usePermissions';

/**
 * Custom hook for device-specific permission checks
 * @returns {Object} Device permission flags and utilities
 */
export const useDevicePermissions = () => {
  const { hasPermission, loading, error } = usePermissions();

  return {
    // Individual permission checks
    canViewDevice: hasPermission('View Device'),
    canOnboardDevice: hasPermission('Onboard Device'),
    canEditDevice: hasPermission('Edit Device'),
    canRemoveDevice: hasPermission('Remove Device'),
    canTransferDevice: hasPermission('Transfer Device'),
    canPauseResume: hasPermission('Pause Resume Devices'),

    // Composite permission checks
    canManageDevices: hasPermission('Onboard Device') || hasPermission('Edit Device') || hasPermission('Remove Device'),
    hasFullDeviceAccess: hasPermission('View Device') &&
                         hasPermission('Onboard Device') &&
                         hasPermission('Edit Device') &&
                         hasPermission('Remove Device') &&
                         hasPermission('Transfer Device'),

    // Utility states
    loading,
    error
  };
};

export default useDevicePermissions;
