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
      {/* Dashboard Description */}
      {activeDashboard?.description && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <p className="text-sm text-gray-600">
            {activeDashboard.description}
          </p>
        </div>
      )}

      {/* Key Metrics */}
      <MetricsCards />

      {/* Management Hierarchy Filters */}
      <ManagementHierarchyFilters />

      {/* IoT Data Table - Row clicks disabled and export hidden for Railway dashboard */}
      <IoTDataTable disableRowClick={true} hideExport={true} />
    </div>
  );
};

export default Railway;
