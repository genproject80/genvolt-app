import React from 'react';
import { useDashboard } from '../../context/DashboardContext';
import LoadingSpinner from '../common/LoadingSpinner';

const DashboardSelector = ({ className = "" }) => {
  const {
    dashboards,
    activeDashboard,
    setActiveDashboard,
    loading,
    error
  } = useDashboard();

  const handleDashboardChange = (e) => {
    const selectedId = parseInt(e.target.value);
    const selectedDashboard = dashboards.find(d => d.id === selectedId);
    if (selectedDashboard) {
      setActiveDashboard(selectedDashboard);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <LoadingSpinner size="sm" />
        <span className="text-sm text-gray-600">Loading dashboards...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="text-sm text-orange-600 bg-orange-50 px-3 py-1 rounded-md border border-orange-200">
          Dashboard connection issue
        </div>
      </div>
    );
  }

  if (dashboards.length === 0) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="text-sm text-gray-500">No dashboards available</div>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-3 ${className}`}>
      <label htmlFor="dashboard-select" className="text-sm font-medium text-gray-700">
        Dashboard:
      </label>
      <select
        id="dashboard-select"
        value={activeDashboard?.id || ''}
        onChange={handleDashboardChange}
        className="form-select block w-auto min-w-[200px] px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
      >
        {dashboards.map((dashboard) => (
          <option key={dashboard.id} value={dashboard.id}>
            {dashboard.display_name}
          </option>
        ))}
      </select>

      {activeDashboard && (
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <span>•</span>
          <span>{activeDashboard.client_name}</span>
        </div>
      )}
    </div>
  );
};

export default DashboardSelector;