import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const P3MachineConfigurationCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Machine Configuration</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  const machineConfig = data?.machine_configuration;

  const configItems = [
    {
      label: 'Motor On Time In Seconds',
      value: machineConfig?.motor_on_time_sec ?? data?.Motor_ON_Time_sec ?? 0
    },
    {
      label: 'Motor Off Time In Minutes',
      value: machineConfig?.motor_off_time_min ?? data?.Motor_OFF_Time_min ?? 0
    },
    {
      label: 'No. Of Wheels Configured',
      value: machineConfig?.wheel_threshold ?? data?.Number_of_Wheels_Configured ?? 0
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Machine Configuration
      </h3>

      <div className="space-y-3">
        {configItems.map((item, index) => (
          <div key={index} className="flex justify-between items-center py-2 border-b border-dashed border-gray-200 last:border-b-0">
            <span className="text-sm text-gray-600">{item.label}:</span>
            <span className="text-sm font-medium text-gray-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default P3MachineConfigurationCard;
