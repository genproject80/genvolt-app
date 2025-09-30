import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import DashboardSelector from '../../components/dashboard/DashboardSelector';
import MetricsCards from '../../components/dashboard/MetricsCards';
import ManagementHierarchyFilters from '../../components/dashboard/ManagementHierarchyFilters';
import IoTDataTable from '../../components/dashboard/IoTDataTable';

const DashboardHome = () => {
  const { user } = useAuth();
  const { activeDashboard } = useDashboard();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {activeDashboard?.display_name || 'Dashboard'}
            </h1>
            <p className="text-gray-600">
              Welcome back, {user?.name}! Monitor your IoT devices and analyze data in real-time.
            </p>
            {activeDashboard?.description && (
              <p className="text-sm text-gray-500 mt-1">
                {activeDashboard.description}
              </p>
            )}
          </div>
          <DashboardSelector />
        </div>
      </div>

      {/* Key Metrics */}
      <MetricsCards />

      {/* Management Hierarchy Filters */}
      <ManagementHierarchyFilters />

      {/* IoT Data Table */}
      <IoTDataTable />
    </div>
  );
};

export default DashboardHome;