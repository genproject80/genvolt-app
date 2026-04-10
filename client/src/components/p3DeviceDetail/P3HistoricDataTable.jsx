import React, { useState, useCallback, useEffect } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const P3HistoricDataTable = ({ data, loading, pagination, onPageChange, onFiltersChange, filters, onRowClick, deviceId }) => {
  const [localFilters, setLocalFilters] = useState(filters || {
    timeRange: 'all',
    status: 'all',
    search: '',
    date: ''
  });

  // Sync local filters with prop filters when they change
  useEffect(() => {
    if (filters) {
      setLocalFilters(filters);
    }
  }, [filters]);

  const handleFilterChange = useCallback((key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    if (onFiltersChange) {
      onFiltersChange(newFilters);
    }
  }, [localFilters, onFiltersChange]);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    if (onFiltersChange) {
      onFiltersChange(localFilters);
    }
  }, [localFilters, onFiltersChange]);

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
  };

  const formatSignalStrength = (signal) => {
    if (!signal && signal !== 0) return 'N/A';
    return `${signal}/6`;
  };

  const formatCurrent = (current) => {
    if (!current && current !== 0) return '0 mA';
    return `${current} mA`;
  };

  const getMotorStatusBadge = (motorStatus, motorOnFlag) => {
    const isRunning = motorStatus === 'Running' || motorOnFlag === 1 || motorOnFlag === true;
    return {
      label: isRunning ? 'Running' : 'Stopped',
      className: isRunning ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
    };
  };

  const getSignalBadge = (strength) => {
    if (strength >= 5) return { label: 'Excellent', className: 'bg-green-100 text-green-800' };
    if (strength >= 4) return { label: 'Good', className: 'bg-green-100 text-green-700' };
    if (strength >= 3) return { label: 'Fair', className: 'bg-yellow-100 text-yellow-700' };
    if (strength >= 1) return { label: 'Poor', className: 'bg-red-100 text-red-700' };
    return { label: 'None', className: 'bg-gray-100 text-gray-600' };
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">
            Historic Data for Motor Device {deviceId || 'Loading...'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => onFiltersChange && onFiltersChange(localFilters)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Time Range Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Time Range:</label>
          <select
            value={localFilters.timeRange}
            onChange={(e) => handleFilterChange('timeRange', e.target.value)}
            className="w-full text-sm border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="all">All Time</option>
            <option value="2h">Last 2 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>

        {/* Specific Date */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Specific Date:</label>
          <div className="relative">
            <input
              type="date"
              value={localFilters.date}
              onChange={(e) => handleFilterChange('date', e.target.value)}
              className="w-full text-sm border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status:</label>
          <select
            value={localFilters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full text-sm border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="fault">Fault</option>
          </select>
        </div>

        {/* Search */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Search:</label>
          <form onSubmit={handleSearchSubmit} className="flex rounded-md shadow-sm">
            <input
              type="text"
              value={localFilters.search}
              onChange={(e) => setLocalFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Search fault codes..."
              className="block w-full rounded-l-md border-gray-300 focus:border-purple-500 focus:ring-purple-500 text-sm"
            />
            <button
              type="submit"
              className="inline-flex items-center rounded-r-md border border-l-0 border-gray-300 bg-purple-600 px-3 text-white hover:bg-purple-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : data && data.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Timestamp
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Entry ID
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  GSM Signal
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Motor Status
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Current (mA)
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Motor On Time (sec)
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Motor Off Time (min)
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Wheels Configured
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  IMSI Number
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Event Type
                </th>
                <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((row, index) => {
                const motorStatusBadge = getMotorStatusBadge(row.Motor_Status, row.Motor_ON_Flag);
                const signalBadge = getSignalBadge(row.Signal_Strength);

                return (
                  <tr
                    key={row.Entry_ID || index}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => onRowClick && onRowClick(row.Entry_ID)}
                  >
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTimestamp(row.CreatedAt)}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      #{row.Entry_ID}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatSignalStrength(row.Signal_Strength)}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${signalBadge.className}`}>
                          {signalBadge.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-0.5 text-xs rounded ${motorStatusBadge.className}`}>
                        {motorStatusBadge.label}
                      </span>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      {formatCurrent(row.Motor_Current_Average_mA)}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.Motor_ON_Time_sec || 0}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.Motor_OFF_Time_min || 0}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                      {row.Wheel_Threshold || 0}
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                      {row.IMSI != null ? row.IMSI : 'N/A'}
                    </td>
                    <td className="px-3 py-4 text-sm">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-0.5 text-xs rounded inline-block w-fit ${
                          row.Event_Type === 4
                            ? 'bg-red-100 text-red-800'
                            : row.Event_Type === 2 || row.Event_Type === 3
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          Type {row.Event_Type}
                        </span>
                        {row.Event_Type_Description && (
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {row.Event_Type_Description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 whitespace-nowrap text-sm text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick && onRowClick(row.Entry_ID);
                        }}
                        className="text-purple-600 hover:text-purple-900 flex items-center justify-end"
                      >
                        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">No recent data to display</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => onPageChange && onPageChange('previous')}
              disabled={!pagination.hasPrevious}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange && onPageChange('next')}
              disabled={!pagination.hasNext}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing page{' '}
                <span className="font-medium">{pagination.page}</span> of{' '}
                <span className="font-medium">{pagination.totalPages}</span>
                {' '}({pagination.total} total records)
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => onPageChange && onPageChange('previous')}
                  disabled={!pagination.hasPrevious}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => onPageChange && onPageChange('next')}
                  disabled={!pagination.hasNext}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default P3HistoricDataTable;
