import { usePermissions } from './usePermissions';

/**
 * Permission hook for the Device Testing feature.
 */
export const useDeviceTestingPermissions = () => {
  const { hasPermission, loading, error } = usePermissions();

  return {
    canViewDeviceTesting: hasPermission('View Device Testing'),
    loading,
    error,
  };
};

export default useDeviceTestingPermissions;
