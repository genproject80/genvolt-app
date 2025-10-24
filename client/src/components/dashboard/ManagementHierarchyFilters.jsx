import React, { useState, useCallback, useEffect } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import LoadingSpinner from '../common/LoadingSpinner';

const FilterTag = ({ label, value, onRemove }) => (
  <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
    <span>{label}: {value}</span>
    <button
      onClick={onRemove}
      className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-green-400 hover:bg-green-200 hover:text-green-600 focus:outline-none"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
);

const ManagementHierarchyFilters = ({ className = "" }) => {
  const {
    hierarchyFilters,
    filterOptions,
    updateHierarchyFilters,
    clearFilters,
    applyFilters,
    filteredDeviceIds,
    activeDashboard,
    iotDataPagination
  } = useDashboard();

  // Local state for form inputs
  const [localFilters, setLocalFilters] = useState(hierarchyFilters);
  const [machineSearchTerm, setMachineSearchTerm] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState(null);

  // Sync local state with context when hierarchy filters change
  useEffect(() => {
    setLocalFilters(hierarchyFilters);
    setMachineSearchTerm(hierarchyFilters.machineId || '');
  }, [hierarchyFilters]);

  const handleFilterChange = useCallback((filterType, value) => {
    setLocalFilters(prev => {
      const newFilters = { ...prev, [filterType]: value || null };

      // Clear dependent filters when parent changes
      if (filterType === 'sden') {
        newFilters.den = null;
        newFilters.aen = null;
        newFilters.sse = null;
      } else if (filterType === 'den') {
        newFilters.aen = null;
        newFilters.sse = null;
      } else if (filterType === 'aen') {
        newFilters.sse = null;
      }

      return newFilters;
    });
  }, []);

  const handleMachineSearchChange = useCallback((e) => {
    const value = e.target.value;
    setMachineSearchTerm(value);
    setLocalFilters(prev => ({
      ...prev,
      machineId: value || null
    }));
  }, []);

  const handleApplyFilters = useCallback(async () => {
    setIsApplying(true);
    setError(null);

    try {
      // Update context with local filters
      updateHierarchyFilters(localFilters);

      // Apply filters and get matching devices
      await applyFilters(localFilters);
    } catch (err) {
      console.error('Error applying filters:', err);
      setError(err.message || 'Failed to apply filters');
    } finally {
      setIsApplying(false);
    }
  }, [localFilters, updateHierarchyFilters, applyFilters]);

  const handleClearFilters = useCallback(() => {
    setLocalFilters({
      sden: null,
      den: null,
      aen: null,
      sse: null,
      machineId: null
    });
    setMachineSearchTerm('');
    clearFilters();
    setError(null);
  }, [clearFilters]);

  const handleRemoveFilter = useCallback((filterType) => {
    handleFilterChange(filterType, null);
    if (filterType === 'machineId') {
      setMachineSearchTerm('');
    }
  }, [handleFilterChange]);

  // Get active filter tags
  const getActiveFilters = () => {
    const active = [];
    const filterLabels = {
      sden: 'Overall Manager',
      den: 'Level 2 Manager',
      aen: 'Level 3 Manager',
      sse: 'Level 4 Manager',
      machineId: 'Machine ID'
    };

    Object.entries(hierarchyFilters).forEach(([key, value]) => {
      if (value) {
        active.push({
          key,
          label: filterLabels[key],
          value
        });
      }
    });

    return active;
  };

  const activeFilters = getActiveFilters();
  const hasChanges = JSON.stringify(localFilters) !== JSON.stringify(hierarchyFilters);

  // Show message when no dashboard is available
  if (!activeDashboard) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="text-center py-8">
          <div className="mx-auto max-w-md">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Dashboard Available</h3>
            <p className="mt-2 text-sm text-gray-500">
              You need to select a dashboard to view and filter IoT data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Management Hierarchy Filters</h3>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {/* Overall Manager (SDEN) */}
        <div>
          <label htmlFor="sden-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Overall Manager
          </label>
          <select
            id="sden-filter"
            value={localFilters.sden || ''}
            onChange={(e) => handleFilterChange('sden', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
          >
            <option value="">All Managers</option>
            {filterOptions.sden.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Level 2 Manager (DEN) */}
        <div>
          <label htmlFor="den-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Level 2 Manager
          </label>
          <select
            id="den-filter"
            value={localFilters.den || ''}
            onChange={(e) => handleFilterChange('den', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
            disabled={filterOptions.den.length === 0}
          >
            <option value="">All Managers</option>
            {filterOptions.den.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Level 3 Manager (AEN) */}
        <div>
          <label htmlFor="aen-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Level 3 Manager
          </label>
          <select
            id="aen-filter"
            value={localFilters.aen || ''}
            onChange={(e) => handleFilterChange('aen', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
            disabled={filterOptions.aen.length === 0}
          >
            <option value="">All Managers</option>
            {filterOptions.aen.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Level 4 Manager (SSE) */}
        <div>
          <label htmlFor="sse-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Level 4 Manager
          </label>
          <select
            id="sse-filter"
            value={localFilters.sse || ''}
            onChange={(e) => handleFilterChange('sse', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
            disabled={filterOptions.sse.length === 0}
          >
            <option value="">All Managers</option>
            {filterOptions.sse.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {/* Machine ID Search */}
        <div>
          <label htmlFor="machine-search" className="block text-sm font-medium text-gray-700 mb-2">
            Machine ID
          </label>
          <input
            type="text"
            id="machine-search"
            value={machineSearchTerm}
            onChange={handleMachineSearchChange}
            placeholder="Search machine ID..."
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleApplyFilters}
            disabled={isApplying || !hasChanges}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApplying && <LoadingSpinner size="sm" className="mr-2" />}
            Apply Filters
          </button>

          <button
            onClick={handleClearFilters}
            disabled={isApplying}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear All
          </button>
        </div>

        {hasChanges && (
          <div className="text-sm text-orange-600 flex items-center">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Filters changed - click Apply to update
          </div>
        )}
      </div>

      {/* Active Filters Display */}
      {activeFilters.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900">Active Filters</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <FilterTag
                key={filter.key}
                label={filter.label}
                value={filter.value}
                onRemove={() => handleRemoveFilter(filter.key)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagementHierarchyFilters;