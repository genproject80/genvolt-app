import React from 'react';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';

const OperationalStatusCard = ({ data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Operational Status</h3>
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" />
        </div>
      </div>
    );
  }

  if (!data?.operational_status) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Operational Status</h3>
        <div className="text-center py-8 text-gray-500">
          No operational status available
        </div>
      </div>
    );
  }

  const { operational_status } = data;

  const formatRuntime = (runtime) => {
    if (!runtime && runtime !== 0) return 'N/A';
    const minutes = parseInt(runtime);
    if (minutes < 60) {
      return `${minutes} minutes`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const statusItems = [
    {
      label: 'Runtime',
      value: formatRuntime(operational_status.runtime),
      type: 'text'
    },
    {
      label: 'Genset Signal',
      value: operational_status.genset_signal,
      type: 'badge',
      badgeType: 'signal'
    },
    {
      label: 'Thermostat',
      value: operational_status.thermostat,
      type: 'badge',
      badgeType: 'signal'
    },
    {
      label: 'Entry ID',
      value: operational_status.entry_id || 'N/A',
      type: 'text'
    },
    {
      label: 'Power Status',
      value: operational_status.power_status || 'Unknown',
      type: 'badge',
      badgeType: 'power'
    }
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Operational Status</h3>

      <div className="space-y-4">
        {statusItems.map((item, index) => (
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

export default OperationalStatusCard;