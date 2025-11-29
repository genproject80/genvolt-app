import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../context/DashboardContext';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';

const HKMIStatusBadge = ({ status }) => {
  const getStatusClass = (status) => {
    if (!status) return 'bg-gray-100 text-gray-800';

    const statusLower = status.toLowerCase();
    if (statusLower === 'active') return 'bg-green-100 text-green-800';
    if (statusLower === 'maintenance') return 'bg-orange-100 text-orange-800';
    if (statusLower === 'offline') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide ${getStatusClass(status)}`}>
      {status || 'Unknown'}
    </span>
  );
};

const GreaseLevel = ({ greaseLeft }) => {
  const getGreaseColor = (level) => {
    if (level >= 8) return 'text-green-600';
    if (level >= 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <span className={`font-semibold ${getGreaseColor(greaseLeft)}`}>
      {greaseLeft ? `${greaseLeft} kg` : 'N/A'}
    </span>
  );
};

const ManagementHierarchy = ({ sden, den, aen, sse }) => {
  return (
    <div>
      <div className="font-medium">{sden || 'N/A'}</div>
      <div className="text-xs text-gray-500 mt-1">
        {den || 'N/A'} → {aen || 'N/A'} → {sse || 'N/A'}
      </div>
    </div>
  );
};

const GSMSignalBars = ({ strength }) => {
  const signalValue = strength || 0;
  const maxBars = 6;

  const getBarColor = (barIndex, signalStrength) => {
    if (barIndex > signalStrength) return 'bg-gray-300';

    if (signalStrength <= 1) return 'bg-red-500';
    if (signalStrength <= 3) return 'bg-yellow-500';
    if (signalStrength <= 5) return 'bg-green-500';
    return 'bg-green-600';
  };

  return (
    <div className="flex items-end space-x-0.5 min-w-20">
      {[1, 2, 3, 4, 5, 6].map((bar) => (
        <div
          key={bar}
          className={`w-1 rounded-sm transition-colors ${getBarColor(bar, signalValue)}`}
          style={{ height: `${bar * 2 + 2}px` }}
        />
      ))}
      <span className="ml-2 text-xs text-gray-600 font-medium">
        {signalValue}/6
      </span>
    </div>
  );
};

const Pagination = ({ pagination, onPageChange }) => {
  const { page, totalPages, hasNext, hasPrevious, total, limit } = pagination;

  const getVisiblePages = () => {
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const visiblePages = getVisiblePages();
  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevious}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{startRecord}</span> to{' '}
            <span className="font-medium">{endRecord}</span> of{' '}
            <span className="font-medium">{total}</span> results
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={!hasPrevious}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Previous</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>

            {visiblePages.map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                  pageNum === page
                    ? 'z-10 bg-green-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600'
                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                }`}
              >
                {pageNum}
              </button>
            ))}

            <button
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNext}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Next</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
};

const IoTDataTable = ({ className = "", disableRowClick = false, hideExport = false, showDeviceId = false, hideMachineId = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    iotData,
    iotDataLoading,
    iotDataError,
    iotDataPagination,
    fetchIoTData,
    exportIoTData,
    filteredDeviceIds
  } = useDashboard();

  // Local state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('Timestamp');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [isExporting, setIsExporting] = useState(false);

  // Check if row clicks are enabled (controlled by disableRowClick prop)
  const canViewDeviceDetails = useMemo(() => {
    return !disableRowClick;
  }, [disableRowClick]);

  // Handle row click to navigate to device detail page
  const handleRowClick = useCallback((row) => {
    if (canViewDeviceDetails && row.Entry_ID) {
      navigate(`/dashboard/device/${row.Entry_ID}`);
    }
  }, [navigate, canViewDeviceDetails]);

  // Table columns configuration matching HKMI dashboard
  const columns = useMemo(() => {
    let baseColumns = [
      { key: 'machine_id', label: 'Machine ID', sortable: true, width: 'w-36' },
      { key: 'management_hierarchy', label: 'Management Hierarchy', sortable: false, width: 'w-44' },
      { key: 'div_rly', label: 'Division/ Railway', sortable: true, width: 'w-20', wrapHeader: true },
      { key: 'section', label: 'Section', sortable: true, width: 'w-24' },
      { key: 'curve_number', label: 'Curve Number', sortable: true, width: 'w-20', wrapHeader: true },
      { key: 'line', label: 'Line', sortable: true, width: 'w-16' },
      { key: 'gps_location', label: 'GPS Location', sortable: false, width: 'w-32' },
      { key: 'GSM_Signal_Strength', label: 'GSM Strength', sortable: true, width: 'w-20', wrapHeader: true },
      { key: 'grease_left', label: 'Grease Left (kg)', sortable: true, width: 'w-20', wrapHeader: true },
      { key: 'status', label: 'Status', sortable: true, width: 'w-24' },
      { key: 'days_since_service', label: 'Days Since Service', sortable: true, width: 'w-20', wrapHeader: true }
    ];

    // Add Device ID column if showDeviceId is true
    if (showDeviceId) {
      baseColumns.splice(1, 0, { key: 'Device_ID', label: 'Device ID', sortable: true, width: 'w-28' });
    }

    // Remove Machine ID column if hideMachineId is true
    if (hideMachineId) {
      baseColumns = baseColumns.filter(col => col.key !== 'machine_id');
    }

    return baseColumns;
  }, [showDeviceId, hideMachineId]);

  // Format cell value based on column type
  const formatCellValue = useCallback((value, columnKey, row) => {
    switch (columnKey) {
      case 'Device_ID':
        return row?.Device_ID || '-';
      case 'machine_id':
        // Use machine_id from cloud_dashboard_hkmi if available
        return row?.machine_id || row?.Device_ID || '-';
      case 'div_rly':
        return row?.div_rly || '-';
      case 'section':
        return row?.section || '-';
      case 'curve_number':
        // Use curve_number from cloud_dashboard_hkmi if available, otherwise extract from machine_id
        if (row?.curve_number) {
          return row.curve_number;
        }
        const machineId = row?.machine_id || row?.Device_ID || '';
        const curveMatch = machineId.match(/RTM([^-]+)/);
        return curveMatch ? curveMatch[1] : '-';
      case 'line':
        // Use line from cloud_dashboard_hkmi if available, otherwise extract from machine_id
        if (row?.line) {
          return row.line;
        }
        const lineMatch = (row?.machine_id || '').match(/-([A-Z]{2})-/);
        return lineMatch ? lineMatch[1] : '-';
      case 'gps_location':
        const lat = row?.Latitude;
        const lng = row?.Longitude;
        if (lat && lng && lat !== 0 && lng !== 0) {
          return `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`;
        }
        return '-';
      case 'grease_left':
        // Use grease_left from cloud_dashboard_hkmi table
        return row?.grease_left ? parseFloat(row.grease_left).toFixed(1) : '-';
      case 'status':
        // Determine status based on fault codes and motor current
        const hasFault = row?.Fault_Code && row?.Fault_Code !== '0';
        const motorCurrent = row?.Motor_Current_mA || 0;
        if (hasFault) return 'Offline';
        if (motorCurrent > 50) return 'Active';
        return 'Maintenance';
      case 'days_since_service':
        // Calculate days since service from last_service_date
        if (row?.last_service_date) {
          // Parse date without timezone conversion
          const dateStr = String(row.last_service_date).split('T')[0];
          const [year, month, day] = dateStr.split('-').map(num => parseInt(num, 10));
          const lastServiceDate = new Date(year, month - 1, day);

          // Get today's date at midnight
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const diffTime = Math.abs(today - lastServiceDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return diffDays;
        }
        return '-';
      default:
        return value || '-';
    }
  }, []);

  // Handle search
  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    await fetchIoTData({
      search: searchTerm,
      page: 1,
      sortField,
      sortOrder
    });
  }, [searchTerm, sortField, sortOrder, fetchIoTData]);

  // Handle sort
  const handleSort = useCallback(async (field) => {
    const newSortOrder = field === sortField && sortOrder === 'DESC' ? 'ASC' : 'DESC';
    setSortField(field);
    setSortOrder(newSortOrder);

    await fetchIoTData({
      search: searchTerm,
      sortField: field,
      sortOrder: newSortOrder,
      page: 1
    });
  }, [sortField, sortOrder, searchTerm, fetchIoTData]);

  // Handle pagination
  const handlePageChange = useCallback(async (newPage) => {
    await fetchIoTData({
      search: searchTerm,
      sortField,
      sortOrder,
      page: newPage
    });
  }, [searchTerm, sortField, sortOrder, fetchIoTData]);

  // Handle export
  const handleExport = useCallback(async (format = 'csv') => {
    setIsExporting(true);
    try {
      if (format === 'csv') {
        // Use the download method from iotDataService for CSV
        const { iotDataService } = await import('../../services/iotDataService');
        await iotDataService.downloadCSVExport({
          deviceIds: filteredDeviceIds,
          search: searchTerm,
          filename: `iot_data_export_${new Date().toISOString().split('T')[0]}.csv`
        });
      } else {
        // For JSON, use the export method from context
        const result = await exportIoTData(format, {
          search: searchTerm
        });

        if (result.success) {
          // Create and download JSON file
          const blob = new Blob([JSON.stringify(result.data, null, 2)], {
            type: 'application/json'
          });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `iot_data_export_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [filteredDeviceIds, searchTerm, exportIoTData]);

  if (filteredDeviceIds.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center ${className}`}>
        <div className="mx-auto max-w-md">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Data Available</h3>
          <p className="mt-2 text-sm text-gray-500">
            Please apply hierarchy filters to view IoT data for specific devices.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Table Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Device Management</h3>
          </div>

          <div className="flex items-center space-x-4">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex items-center space-x-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search devices, messages..."
                className="block w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              />
              <button
                type="submit"
                disabled={iotDataLoading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </form>

            {/* Export Buttons */}
            {!hideExport && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleExport('csv')}
                  disabled={isExporting || iotDataLoading}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {isExporting && <LoadingSpinner size="sm" className="mr-2" />}
                  Export CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  disabled={isExporting || iotDataLoading}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                >
                  Export JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error State */}
      {iotDataError && (
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md">
            <svg className="h-5 w-5 text-red-400 mr-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-800">{iotDataError}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`${column.width} px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  onClick={column.sortable ? () => handleSort(column.key) : undefined}
                >
                  <div className="flex items-center space-x-1">
                    <span className={column.wrapHeader ? 'break-words whitespace-normal leading-tight inline-block' : 'whitespace-nowrap'}>{column.label}</span>
                    {column.sortable && (
                      <div className="flex flex-col flex-shrink-0">
                        <svg
                          className={`w-3 h-3 ${
                            sortField === column.key && sortOrder === 'ASC'
                              ? 'text-green-600'
                              : 'text-gray-300'
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        <svg
                          className={`w-3 h-3 -mt-1 ${
                            sortField === column.key && sortOrder === 'DESC'
                              ? 'text-green-600'
                              : 'text-gray-300'
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {iotDataLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-sm text-gray-500">Loading IoT data...</p>
                </td>
              </tr>
            ) : iotData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-sm text-gray-500">
                  No data found for the selected filters.
                </td>
              </tr>
            ) : (
              iotData.map((row, index) => (
                <tr
                  key={row.Entry_ID || index}
                  className={`transition-colors duration-150 ${
                    canViewDeviceDetails
                      ? 'hover:bg-gray-50 cursor-pointer'
                      : 'cursor-default'
                  }`}
                  onClick={() => handleRowClick(row)}
                  title={canViewDeviceDetails ? `Click to view details for device ${row.Device_ID}` : ''}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`px-2 py-2 text-sm text-gray-900 ${column.width} break-words`}>
                      {column.key === 'GSM_Signal_Strength' ? (
                        <GSMSignalBars strength={row[column.key]} />
                      ) : column.key === 'management_hierarchy' ? (
                        <ManagementHierarchy
                          sden={row.sden}
                          den={row.den}
                          aen={row.aen}
                          sse={row.sse}
                        />
                      ) : column.key === 'status' ? (
                        <HKMIStatusBadge status={formatCellValue(row[column.key], column.key, row)} />
                      ) : column.key === 'grease_left' ? (
                        <GreaseLevel greaseLeft={parseFloat(formatCellValue(row[column.key], column.key, row))} />
                      ) : column.key === 'gps_location' ? (
                        <span className="font-mono text-xs text-green-600">
                          {formatCellValue(row[column.key], column.key, row)}
                        </span>
                      ) : (
                        <span className={column.key === 'machine_id' ? 'font-medium' : ''}>
                          {formatCellValue(row[column.key], column.key, row)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {iotData.length > 0 && (
        <Pagination
          pagination={iotDataPagination}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
};

export default IoTDataTable;