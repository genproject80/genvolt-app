import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';

const CommunicationGPSCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
          Communication & GPS
        </h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  // Extract actual GPS data from the device details
  const latitude = data?.Longitude;
  const longitude = data?.Latitude;
  const gsmSignal = data?.GSM_Signal_Strength || 0;


  // Format GPS coordinates
  const formatCoordinate = (value) => {
    if (value === null || value === undefined || value === 0) return 'N/A';
    return parseFloat(value).toFixed(6);
  };

  // Determine GPS status
  const hasValidGPS = latitude && longitude && latitude !== 0 && longitude !== 0;

  // Get signal strength badge
  const getSignalBadge = (strength) => {
    if (strength >= 4) return 'Excellent';
    if (strength >= 3) return 'Good';
    if (strength >= 2) return 'Fair';
    if (strength >= 1) return 'Poor';
    return 'No Signal';
  };

  const communicationItems = [
    {
      label: 'GSM Signal',
      value: gsmSignal,
      type: 'signal',
      badge: getSignalBadge(gsmSignal)
    },
    {
      label: 'GPS Location',
      value: hasValidGPS ? 'View on Maps' : 'No GPS Data',
      type: 'link',
      disabled: !hasValidGPS
    },
    {
      label: 'Latitude',
      value: formatCoordinate(latitude),
      type: 'coordinate'
    },
    {
      label: 'Longitude',
      value: formatCoordinate(longitude),
      type: 'coordinate'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        Communication & GPS
      </h3>

      <div className="space-y-4">
        {communicationItems.map((item, index) => (
          <div key={index} className="flex justify-between items-center py-2">
            <span className="text-sm font-medium text-gray-600">{item.label}:</span>
            <div className="text-sm text-gray-900">
              {item.type === 'signal' ? (
                <div className="flex items-center space-x-2">
                  <span className="font-medium">{item.value}</span>
                  <StatusBadge status={item.badge} type="signal" />
                </div>
              ) : item.type === 'link' ? (
                <button
                  className={`flex items-center ${
                    item.disabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-green-600 hover:text-green-800'
                  }`}
                  disabled={item.disabled}
                  onClick={() => {
                    if (!item.disabled && hasValidGPS) {
                      const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
                      window.open(url, '_blank');
                    }
                  }}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {item.value}
                </button>
              ) : (
                <span className="font-mono text-xs">{item.value}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommunicationGPSCard;