import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';

const ElectricalParametersCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Electrical Parameters</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  if (!data?.electrical_parameters) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Electrical Parameters</h3>
        <div className="text-center py-8 text-gray-500">
          No electrical parameters available
        </div>
      </div>
    );
  }

  const { electrical_parameters } = data;

  const formatVoltage = (voltage) => {
    if (!voltage && voltage !== 0) return '0 kV';
    return `${voltage} kV`;
  };

  const formatCurrent = (current) => {
    if (!current && current !== 0) return '0 mA';
    return `${current} mA`;
  };

  const electricalItems = [
    {
      label: 'HV Output Voltage',
      value: formatVoltage(electrical_parameters.hv_output_voltage),
      type: 'text'
    },
    {
      label: 'HV Output Current',
      value: formatCurrent(electrical_parameters.hv_output_current),
      type: 'text'
    },
    {
      label: 'HV Source No',
      value: electrical_parameters.hv_source_no || '0',
      type: 'text'
    },
    {
      label: 'Power Status',
      value: electrical_parameters.power_status || 'Inactive',
      type: 'badge',
      badgeType: 'power'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Electrical Parameters</h3>

      <div className="space-y-4">
        {electricalItems.map((item, index) => (
          <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
            <span className="text-sm font-medium text-gray-600">{item.label}:</span>
            <div className="text-sm text-gray-900">
              {item.type === 'badge' ? (
                <StatusBadge
                  status={item.value}
                  type={item.badgeType}
                />
              ) : (
                <span className="font-mono">{item.value}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ElectricalParametersCard;