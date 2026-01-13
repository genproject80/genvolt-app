import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const P3FaultDiagnosticsCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Device Health</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  const faultDiag = data?.fault_diagnostics;
  const deviceStatus = faultDiag?.device_status || 'Unknown';
  const isActive = deviceStatus === 'Active';
  const batteryStatus = faultDiag?.battery_status || 'Unknown';
  const motorStatus = faultDiag?.motor_status || 'Unknown';

  // Determine if motor has fault (not running when it should be, etc.)
  const hasMotorFault = motorStatus === 'Fault' || (faultDiag?.event_type === 4);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        Device Health
      </h3>

      {/* Row 1: Current Status & Communication */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Current Status */}
        <div className="bg-gray-50 p-3 rounded border border-gray-200">
          <span className="block text-xs text-gray-600 mb-1">Current Status</span>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className={isActive ? 'text-green-600' : 'text-red-600'}>
              {isActive ? 'Device Active' : 'Device Inactive'}
            </span>
          </div>
        </div>

        {/* Communication */}
        <div className="bg-gray-50 p-3 rounded border border-gray-200">
          <span className="block text-xs text-gray-600 mb-1">Communication</span>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`px-2 py-0.5 text-xs rounded ${
              isActive
                ? 'bg-green-100 text-green-600'
                : 'bg-yellow-100 text-yellow-600'
            }`}>
              {isActive ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Row 2: Battery Status & Motor Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Battery Status */}
        <div className="bg-gray-50 p-3 rounded border border-gray-200">
          <span className="block text-xs text-gray-600 mb-1">Battery Status</span>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`${
              batteryStatus.includes('Full') || batteryStatus.includes('Good')
                ? 'text-green-600'
                : batteryStatus.includes('Low')
                  ? 'text-yellow-600'
                  : batteryStatus.includes('Critical')
                    ? 'text-red-600'
                    : 'text-gray-600'
            }`}>
              {batteryStatus}
            </span>
          </div>
        </div>

        {/* Motor Status */}
        <div className="bg-gray-50 p-3 rounded border border-gray-200">
          <span className="block text-xs text-gray-600 mb-1">Motor Status</span>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className={`px-2 py-0.5 text-xs rounded ${
              hasMotorFault
                ? 'bg-red-100 text-red-700'
                : motorStatus === 'Running'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
            }`}>
              {hasMotorFault ? 'Fault' : motorStatus}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
};

export default P3FaultDiagnosticsCard;
