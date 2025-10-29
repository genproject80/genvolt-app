import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDeviceDetail } from '../../context/DeviceDetailContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';

// Import device detail cards to match dashboarddetails_5.png layout
import DeviceInformationCard from '../../components/deviceDetail/DeviceInformationCard';
import MotorStatusCard from '../../components/deviceDetail/MotorStatusCard';
import CommunicationGPSCard from '../../components/deviceDetail/CommunicationGPSCard';
import WheelConfigurationCard from '../../components/deviceDetail/WheelConfigurationCard';
import FaultInformationCard from '../../components/deviceDetail/FaultInformationCard';
import TechnicalDetailsCard from '../../components/deviceDetail/TechnicalDetailsCard';
import DeviceDetailTabs from '../../components/deviceDetail/DeviceDetailTabs';

const DeviceDetailPage = () => {
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
  } = useDeviceDetail();

  // Scroll to top when component mounts or entryId changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [entryId]);

  // Initialize device detail data
  useEffect(() => {
    if (entryId && entryId !== entryIdState) {
      setEntryIdState(entryId);
      clearDeviceDetail();

      const loadDeviceData = async () => {
        try {
          await fetchDeviceDetail(entryId);
          await fetchDeviceHistory(entryId);
        } catch (err) {
          console.error('Error loading device data:', err);
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
    console.log('DeviceDetailPage: handleHistoryFiltersChange called with:', newFilters);
    updateHistoryFilters(newFilters);
  };

  const handleHistoryPageChange = (direction) => {
    navigateHistoryPage(direction);
  };

  const handleHistoryRowClick = async (newEntryId) => {
    // Update the URL to reflect the new entry
    navigate(`/dashboard/device/${newEntryId}`, { replace: true });

    // Fetch device details for the new entry
    try {
      await fetchDeviceDetail(newEntryId);
    } catch (err) {
      console.error('Error loading device data for entry:', newEntryId, err);
    }
  };

  // Determine if device has faults based on fault code
  const hasFaults = deviceDetail?.fault_information?.fault_code && deviceDetail.fault_information.fault_code !== '0';

  // Loading state for initial page load
  if (loading && !deviceDetail) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Loading device details...</p>
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
          <h3 className="mt-4 text-lg font-medium text-gray-900">Error Loading Device</h3>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
          <div className="mt-6">
            <button
              onClick={handleBack}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
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
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
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
              Entry #{entryId} - {deviceDetail?.device_information?.record_time || 'Detailed device information and diagnostics'}
            </p>
          </div>
        </div>
        {hasFaults && (
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              Fault Detected
            </span>
          </div>
        )}
      </div>

      {/* Main Content Layout matching dashboarddetails_5.png */}
      <div className="space-y-6">
        {/* Top Row: Device Information, Motor Status, Communication & GPS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DeviceInformationCard data={deviceDetail} loading={loading} />
          <MotorStatusCard data={deviceDetail} loading={loading} />
          <CommunicationGPSCard data={deviceDetail} loading={loading} />
        </div>

        {/* Second Row: Wheel Configuration, Fault Information and Diagnostic */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WheelConfigurationCard data={deviceDetail} loading={loading} />
          <FaultInformationCard data={deviceDetail} loading={loading} />
        </div>

        {/* Third Row: Technical Details & Raw Data (Full Width) */}
        <div>
          <TechnicalDetailsCard data={deviceDetail} loading={loading} />
        </div>

        {/* Fourth Row: Historic Data (Full Width) */}
        <div>
          <DeviceDetailTabs
            deviceHistory={deviceHistory}
            historyLoading={historyLoading}
            historyError={historyError}
            historyPagination={historyPagination}
            historyFilters={historyFilters}
            onHistoryPageChange={handleHistoryPageChange}
            onHistoryFiltersChange={handleHistoryFiltersChange}
            deviceId={deviceDetail?.device_information?.device_id || entryId}
            onRowClick={handleHistoryRowClick}
          />
        </div>
      </div>
    </div>
  );
};

export default DeviceDetailPage;