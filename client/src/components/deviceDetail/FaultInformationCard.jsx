import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';

const FaultInformationCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          Fault Information & Diagnostics
        </h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  // Extract fault information from IoT data
  const faultCode = data?.Fault_Code;
  const faultDescriptions = data?.FaultDescriptions;
  const hasFaults = faultCode && faultCode !== '0' && faultCode !== '';

  // Parse fault descriptions if it's a JSON string
  let parsedDescriptions = [];
  if (faultDescriptions) {
    try {
      parsedDescriptions = JSON.parse(faultDescriptions);
      if (!Array.isArray(parsedDescriptions)) {
        parsedDescriptions = [faultDescriptions];
      }
    } catch (e) {
      parsedDescriptions = [faultDescriptions];
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        Fault Information & Diagnostics
      </h3>

      <div className="space-y-4">
        {/* Current Status Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-md p-3">
            <div className="text-xs font-medium text-gray-600 mb-1">Current Status</div>
            <div className="flex items-center">
              {hasFaults ? (
                <>
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-red-600">Fault Active</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm font-medium text-green-600">Normal</span>
                </>
              )}
            </div>
          </div>
          <div className="bg-gray-50 rounded-md p-3">
            <div className="text-xs font-medium text-gray-600 mb-1">Fault Code</div>
            <div className="text-sm font-mono font-medium">
              {hasFaults ? (
                <span className="text-red-600">{faultCode}</span>
              ) : (
                <span className="text-green-600">0 (OK)</span>
              )}
            </div>
          </div>
        </div>

        {/* Fault Descriptions */}
        {hasFaults && parsedDescriptions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Fault Details:</h4>
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="space-y-1">
                {parsedDescriptions.map((description, index) => (
                  <div key={index} className="text-sm text-red-800">
                    • {description}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* System Health Indicators */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">System Health:</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Motor Status:</span>
              <StatusBadge
                status={hasFaults ? 'Fault' : 'Running'}
                type="power"
              />
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-sm text-gray-600">Communication:</span>
              <StatusBadge
                status="Connected"
                type="signal"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaultInformationCard;