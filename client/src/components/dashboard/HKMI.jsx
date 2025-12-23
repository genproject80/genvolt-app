import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import MetricsCards from './MetricsCards';
import ManagementHierarchyFilters from './ManagementHierarchyFilters';
import IoTDataTable from './IoTDataTable';

const HKMI = () => {
  const { user } = useAuth();
  const { activeDashboard } = useDashboard();

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      {/* <MetricsCards /> */}

      {/* Management Hierarchy Filters */}
      <ManagementHierarchyFilters />

      {/* IoT Data Table - Show Device ID for HKMI dashboard */}
      <IoTDataTable showDeviceId={true} />
    </div>
  );
};

export default HKMI;
