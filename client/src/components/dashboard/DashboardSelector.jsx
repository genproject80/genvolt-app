import React from 'react';
import { useDashboard } from '../../context/DashboardContext';
import LoadingSpinner from '../common/LoadingSpinner';
import SearchableSelect from '../common/SearchableSelect';

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
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <label className="text-sm font-medium text-gray-700 shrink-0">Dashboard:</label>
      <SearchableSelect
        options={dashboards.map((d) => ({ value: String(d.id), label: d.display_name }))}
        value={activeDashboard ? String(activeDashboard.id) : ''}
        onChange={(v) => {
          const selected = dashboards.find((d) => String(d.id) === v);
          if (selected) setActiveDashboard(selected);
        }}
        placeholder="Select dashboard…"
        className="w-full sm:w-56"
      />
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