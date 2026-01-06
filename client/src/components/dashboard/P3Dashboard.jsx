import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import ManagementHierarchyFilters from './ManagementHierarchyFilters';
import P3DataTable from './P3DataTable';

const P3Dashboard = () => {
  const { user } = useAuth();
  const { activeDashboard } = useDashboard();

  return (
    <div className="space-y-6">
      {/* Management Hierarchy Filters */}
      <ManagementHierarchyFilters />

      {/* P3 Data Table - Show Device ID */}
      <P3DataTable showDeviceId={true} />
    </div>
  );
};

export default P3Dashboard;
