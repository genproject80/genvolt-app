import React from 'react';
import HistoricDataTable from './HistoricDataTable';

const HistoricDataSection = ({
  deviceHistory,
  historyLoading,
  historyError,
  historyPagination,
  historyFilters,
  onHistoryPageChange,
  onHistoryFiltersChange,
  deviceId
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Historic Data for Motor Device {deviceId}
        </h3>
        <button
          onClick={() => onHistoryFiltersChange && onHistoryFiltersChange(historyFilters)}
          className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Historic Data Content */}
      <div>
        <HistoricDataTable
          data={deviceHistory}
          loading={historyLoading}
          error={historyError}
          pagination={historyPagination}
          filters={historyFilters}
          onPageChange={onHistoryPageChange}
          onFiltersChange={onHistoryFiltersChange}
        />
      </div>
    </div>
  );
};

export default HistoricDataSection;