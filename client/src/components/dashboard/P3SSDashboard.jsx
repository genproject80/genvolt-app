import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import ManagementHierarchyFilters from './ManagementHierarchyFilters';
import P3MetricsCards from './P3MetricsCards';
import P3StatusPieChart from './P3StatusPieChart';
import P3DataTable from './P3DataTable';

const P3SSDashboard = () => {
  const { user } = useAuth();
  const { activeDashboard } = useDashboard();

  return (
    <div className="space-y-6">
      {/* P3 Metrics Row - 4 metric cards + 1 pie chart tile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* The 4 metric tiles */}
        <P3MetricsCards />

        {/* Device Status Pie Chart - 5th tile */}
        <P3StatusPieChart />
      </div>

      {/* Management Hierarchy Filters */}
      <ManagementHierarchyFilters />

      {/* P3 Data Table - Hide Device ID and Machine ID, disable row clicks */}
      <P3DataTable showDeviceId={false} showMachineId={false} enableRowClick={false} />
    </div>
  );
};

export default P3SSDashboard;
