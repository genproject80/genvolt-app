import { usePermissions } from './usePermissions';

/**
 * Permission hook for the Table Configuration admin feature.
 */
export const useTableConfigPermissions = () => {
  const { hasPermission, loading, error } = usePermissions();

  return {
    canManageTableConfig: hasPermission('Manage Device Testing Tables'),
    loading,
    error,
  };
};

export default useTableConfigPermissions;
