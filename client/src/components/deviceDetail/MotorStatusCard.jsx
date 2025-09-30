import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';

const MotorStatusCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Motor Status
        </h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  if (!data?.operational_status) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Motor Status
        </h3>
        <div className="text-center py-8 text-gray-500">
          No motor status available
        </div>
      </div>
    );
  }

  const statusItems = [
    {
      label: 'Status',
      value: data.Motor_Current_mA > 0 ? 'Active' : 'Inactive',
      type: 'badge',
      badgeType: 'power'
    },
    {
      label: 'Motor ON Time (sec)',
      value: data.Motor_ON_Time_sec || 0,
      type: 'text'
    },
    {
      label: 'Motor OFF Time (sec)',
      value: data.Motor_OFF_Time_sec || 0,
      type: 'text'
    },
    {
      label: 'Motor OFF Time (min)',
      value: data.Motor_OFF_Time_min || 0,
      type: 'text'
    },
    {
      label: 'Motor Current (mA)',
      value: data.Motor_Current_mA || 0,
      type: 'text'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <svg className="w-5 h-5 text-gray-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Motor Status
      </h3>

      <div className="space-y-4">
        {statusItems.map((item, index) => (
          <div key={index} className="flex justify-between items-center py-2">
            <span className="text-sm font-medium text-gray-600">{item.label}:</span>
            <div className="text-sm text-gray-900">
              {item.type === 'badge' ? (
                <StatusBadge
                  status={item.value}
                  type={item.badgeType}
                />
              ) : (
                <span className="font-medium">{item.value}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MotorStatusCard;