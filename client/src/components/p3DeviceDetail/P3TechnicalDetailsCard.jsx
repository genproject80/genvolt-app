import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const P3TechnicalDetailsCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Technical Details & Raw Data</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  const techDetails = data?.technical_details;

  if (!techDetails) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Technical Details & Raw Data</h3>
        <div className="text-center py-8 text-gray-500">
          No technical details available
        </div>
      </div>
    );
  }

  const wheelsDetected = techDetails.wheels_detected ?? data?.Number_of_Wheels_Detected ?? 0;
  const currentAvg = techDetails.current_draw_ma ?? data?.Motor_Current_Average_mA ?? 0;
  const currentMin = techDetails.current_min_ma ?? data?.Motor_Current_Min_mA ?? 0;
  const currentMax = techDetails.current_max_ma ?? data?.Motor_Current_Max_mA ?? 0;
  const batteryVoltage = techDetails.battery_voltage_mv ?? data?.Battery_Voltage_mV ?? 0;
  const rawHexData = techDetails.raw_hex_data || 'No raw data available';

  const formatHexData = (rawData) => {
    if (!rawData) return 'No raw data available';
    if (typeof rawData === 'string' && rawData.match(/^[0-9A-Fa-f]+$/)) {
      return rawData.toUpperCase();
    }
    return rawData.toString().toUpperCase();
  };

  const performanceMetrics = [
    { label: 'Wheels Detected', value: wheelsDetected },
    { label: 'Motor Current (Avg)', value: `${currentAvg} mA` },
    { label: 'Motor Current (Min)', value: `${currentMin} mA` },
    { label: 'Motor Current (Max)', value: `${currentMax} mA` },
    { label: 'Battery Voltage', value: `${batteryVoltage} mV` }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Technical Details & Raw Data</h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance Metrics Section */}
        <div>
          <h4 className="text-md font-medium text-gray-900 mb-4">Performance Metrics</h4>
          <div className="space-y-0">
            {performanceMetrics.map((item, index) => (
              <div
                key={index}
                className={`flex justify-between items-center py-3 ${
                  index < performanceMetrics.length - 1 ? 'border-b border-gray-200' : ''
                }`}
              >
                <span className="text-sm text-gray-600">{item.label}:</span>
                <span className="text-sm font-medium text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Raw Hex Data Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-md font-medium text-gray-900">Raw Hex Data</h4>
            <button className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Troubleshoot
            </button>
          </div>
          <div className="bg-gray-50 rounded-md p-4 border border-gray-200 h-40 overflow-y-auto">
            <div className="text-xs font-mono text-gray-700 break-all leading-relaxed">
              {formatHexData(rawHexData)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default P3TechnicalDetailsCard;
