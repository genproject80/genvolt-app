import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import MetricsCards from './MetricsCards';
import ManagementHierarchyFilters from './ManagementHierarchyFilters';
import IoTDataTable from './IoTDataTable';

const Railway = () => {
  const { user } = useAuth();
  const { activeDashboard } = useDashboard();

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
       {/* <MetricsCards /> */}

      {/* Management Hierarchy Filters */}
      <ManagementHierarchyFilters />

      {/* IoT Data Table - Row clicks disabled, export hidden, and machine ID hidden for Railway dashboard */}
      <IoTDataTable disableRowClick={true} hideExport={true} hideMachineId={true} />
    </div>
  );
};

export default Railway;
