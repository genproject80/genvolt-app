import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useP3DeviceDetail } from '../../context/P3DeviceDetailContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

// Import P3 device detail cards
import {
  P3DeviceInformationCard,
  P3MachineConfigurationCard,
  P3CommunicationGPSCard,
  P3FaultDiagnosticsCard,
  P3TechnicalDetailsCard,
  P3HistoricDataTable
} from '../../components/p3DeviceDetail';

const P3DeviceDetailPage = () => {
  const { entryId } = useParams();
  const navigate = useNavigate();
  const [entryIdState, setEntryIdState] = useState(null);

  const {
    deviceDetail,
    deviceHistory,
    loading,
    historyLoading,
    error,
    historyError,
    historyFilters,
    historyPagination,
    fetchDeviceDetail,
    fetchDeviceHistory,
    updateHistoryFilters,
    clearDeviceDetail,
    navigateHistoryPage
  } = useP3DeviceDetail();

  // Scroll to top when component mounts or entryId changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [entryId]);

  // Initialize P3 device detail data
  useEffect(() => {
    if (entryId && entryId !== entryIdState) {
      setEntryIdState(entryId);
      clearDeviceDetail();

      const loadDeviceData = async () => {
        try {
          await fetchDeviceDetail(entryId);
          await fetchDeviceHistory(entryId);
        } catch (err) {
          console.error('Error loading P3 device data:', err);
        }
      };

      loadDeviceData();
    }
  }, [entryId, entryIdState, fetchDeviceDetail, fetchDeviceHistory, clearDeviceDetail]);

  // Update history when filters change
  useEffect(() => {
    if (entryId && entryIdState === entryId) {
      fetchDeviceHistory(entryId, historyFilters);
    }
  }, [historyFilters, entryId, entryIdState, fetchDeviceHistory]);

  // Update history when pagination changes
  useEffect(() => {
    if (entryId && entryIdState === entryId && historyPagination.page > 1) {
      fetchDeviceHistory(entryId, { page: historyPagination.page });
    }
  }, [historyPagination.page, entryId, entryIdState, fetchDeviceHistory]);

  const handleBack = () => {
    navigate('/dashboard');
  };

  const handleHistoryFiltersChange = (newFilters) => {
    console.log('P3DeviceDetailPage: handleHistoryFiltersChange called with:', newFilters);
    updateHistoryFilters(newFilters);
  };

  const handleHistoryPageChange = (direction) => {
    navigateHistoryPage(direction);
  };

  const handleHistoryRowClick = async (newEntryId) => {
    // Update the URL to reflect the new entry
    navigate(`/dashboard/p3-device/${newEntryId}`, { replace: true });

    // Fetch device details for the new entry
    try {
      await fetchDeviceDetail(newEntryId);
    } catch (err) {
      console.error('Error loading P3 device data for entry:', newEntryId, err);
    }
  };

  // Determine device status
  const deviceStatus = deviceDetail?.fault_diagnostics?.device_status;
  const isInactive = deviceStatus === 'Inactive';

  // Loading state for initial page load
  if (loading && !deviceDetail) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading P3 device details...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !deviceDetail) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center max-w-md mx-auto">
          <svg className="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">Error Loading P3 Device</h3>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
          <div className="mt-6">
            <button
              onClick={handleBack}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={handleBack}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <div className="ml-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Motor Device {deviceDetail?.device_information?.device_id || 'Loading...'}
            </h1>
            <p className="text-sm text-gray-500">
              Entry #{entryId} - {deviceDetail?.hierarchy_info?.machine_id || 'N/A'}
            </p>
          </div>
        </div>
        {isInactive && (
          <div className="flex items-center">
            <svg className="w-5 h-5 text-yellow-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              Device Inactive
            </span>
          </div>
        )}
      </div>

      {/* Main Content Layout matching the provided design */}
      <div className="space-y-6">
        {/* Top Row: Device Information, Machine Configuration, Communication & GPS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <P3DeviceInformationCard data={deviceDetail} loading={loading} />
          <P3MachineConfigurationCard data={deviceDetail} loading={loading} />
          <P3CommunicationGPSCard data={deviceDetail} loading={loading} />
        </div>

        {/* Second Row: Fault Information & Diagnostics (Full Width) */}
        <div className="grid grid-cols-1 gap-6">
          <P3FaultDiagnosticsCard data={deviceDetail} loading={loading} />
        </div>

        {/* Third Row: Technical Details & Raw Data (Full Width) */}
        <div>
          <P3TechnicalDetailsCard data={deviceDetail} loading={loading} />
        </div>

        {/* Fourth Row: Historic Data (Full Width) */}
        <div>
          <P3HistoricDataTable
            data={deviceHistory}
            loading={historyLoading}
            pagination={historyPagination}
            filters={historyFilters}
            onPageChange={handleHistoryPageChange}
            onFiltersChange={handleHistoryFiltersChange}
            deviceId={deviceDetail?.device_information?.device_id || entryId}
            onRowClick={handleHistoryRowClick}
          />
        </div>
      </div>
    </div>
  );
};

export default P3DeviceDetailPage;
