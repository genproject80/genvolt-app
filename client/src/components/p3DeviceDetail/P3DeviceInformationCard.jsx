import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const P3DeviceInformationCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Device Information</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleString();
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const deviceInfo = data?.device_information;
  const entryId = data?.Entry_ID;

  const informationItems = [
    { label: 'Device ID', value: deviceInfo?.device_id || data?.Device_ID || 'N/A' },
    { label: 'Entry ID', value: entryId || 'N/A' },
    { label: 'Record Time', value: formatTimestamp(deviceInfo?.record_time), highlight: !deviceInfo?.record_time },
    { label: 'Last Event Date', value: formatDate(deviceInfo?.latest_record_date), highlight: false }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Device Information
      </h3>

      <div className="space-y-3">
        {informationItems.map((item, index) => (
          <div key={index} className="flex justify-between items-center py-2 border-b border-dashed border-gray-200 last:border-b-0">
            <span className="text-sm text-gray-600">{item.label}:</span>
            <span className={`text-sm font-medium ${item.highlight ? 'text-red-500' : 'text-gray-900'}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default P3DeviceInformationCard;
