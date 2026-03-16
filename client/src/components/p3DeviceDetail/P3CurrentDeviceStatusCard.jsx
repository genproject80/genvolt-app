import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const P3CurrentDeviceStatusCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Device Status</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  const latestStatus = data?.latest_device_status;
  const deviceStatus = latestStatus?.device_status || 'Unknown';
  const isActive = deviceStatus === 'Active';
  const gsmSignal = latestStatus?.gsm_signal ?? 0;
  const lastRecordTime = latestStatus?.last_record_time;

  // Determine communication status based on actual GSM signal strength (0-6 scale)
  const getCommunicationStatus = (signal) => {
    if (signal >= 4) {
      return {
        text: 'Connected',
        color: 'bg-green-100 text-green-600',
        description: 'Strong Signal'
      };
    }
    if (signal >= 2) {
      return {
        text: 'Weak Signal',
        color: 'bg-yellow-100 text-yellow-600',
        description: 'Fair Connection'
      };
    }
    if (signal >= 1) {
      return {
        text: 'Poor Signal',
        color: 'bg-orange-100 text-orange-600',
        description: 'Unstable Connection'
      };
    }
    return {
      text: 'No Signal',
      color: 'bg-red-100 text-red-600',
      description: 'Not Connected'
    };
  };

  const commStatus = getCommunicationStatus(gsmSignal);

  // Format the last record time
  const formatLastRecordTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hours ago`;
    return date.toLocaleString();
  };

  // Format full timestamp for display
  const formatFullTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md border border-blue-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <svg className="w-5 h-5 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Current Device Status
        </h3>
        <div className="text-xs text-gray-500">
          Last Update: {formatLastRecordTime(lastRecordTime)}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current Status */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="block text-xs font-medium text-gray-500 mb-2">Device Status</span>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
            <span className={`text-base font-semibold ${isActive ? 'text-green-600' : 'text-red-600'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {isActive
              ? 'Device is communicating normally'
              : 'No data received in last 90 minutes'}
          </div>
        </div>

        {/* Communication Status */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="block text-xs font-medium text-gray-500 mb-2">Communication</span>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${commStatus.color}`}>
              {commStatus.text}
            </span>
            <span className="text-xs text-gray-600">GSM: {gsmSignal}/6</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            As of {formatFullTimestamp(lastRecordTime)}
          </div>
        </div>

        {/* Last Event Date */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <span className="block text-xs font-medium text-gray-500 mb-2">Last Event Date</span>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">
              {formatLastRecordTime(lastRecordTime)}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Most recent data transmission
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded p-3 flex items-start">
        <svg className="w-4 h-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p className="text-xs text-blue-700">
          This shows the real-time status based on the most recent data from this device.
          Historical records below may show different statuses from when they were recorded.
        </p>
      </div>
    </div>
  );
};

export default P3CurrentDeviceStatusCard;
