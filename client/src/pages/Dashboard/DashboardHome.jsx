import React, { useMemo, useEffect } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import HKMI from '../../components/dashboard/HKMI';
import Railway from '../../components/dashboard/Railway';
import HKMITable from '../../components/dashboard/HKMITable';
import P3Dashboard from '../../components/dashboard/P3Dashboard';

// Dashboard component mapping based on dashboard name
const dashboardComponents = {
  'HKMI': HKMI,
  'Railway': Railway,
  'HKMI Table': HKMITable,
  'HKMI_Table': HKMITable,
  'HKMITable': HKMITable,
  'HKMI_maping_data': HKMITable,
  'HKMI_mapping_data': HKMITable,
  'HKMI Mapping Data': HKMITable,
  'P3': P3Dashboard,
  'P3_Dashboard': P3Dashboard,
  'P3 Dashboard': P3Dashboard,
  'P3Dashboard': P3Dashboard,
  'P3_Logic': P3Dashboard,
  'P3 Logic': P3Dashboard
};

const DashboardHome = () => {
  const { activeDashboard } = useDashboard();

  // Scroll to top when component mounts or when active dashboard changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeDashboard?.id]);

  // Dynamically select the dashboard component based on the active dashboard's name
  const DashboardComponent = useMemo(() => {
    if (!activeDashboard?.name) {
      return null;
    }

    // Get the component from the mapping using the dashboard name
    const component = dashboardComponents[activeDashboard.name];

    if (!component) {
      console.warn(`No dashboard component found for: ${activeDashboard.name}`);
      return null;
    }

    return component;
  }, [activeDashboard?.name]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {activeDashboard?.display_name || 'Dashboard'}
        </h1>
      </div>

      {/* Dynamically Loaded Dashboard Content */}
      {DashboardComponent ? (
        <DashboardComponent />
      ) : activeDashboard ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto max-w-md">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Dashboard Not Available</h3>
            <p className="mt-2 text-sm text-gray-500">
              The dashboard component "{activeDashboard.name}" is not configured. Please contact support.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto max-w-md">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Dashboard Selected</h3>
            <p className="mt-2 text-sm text-gray-500">
              Please select a dashboard from the navigation menu on the left to view data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardHome;