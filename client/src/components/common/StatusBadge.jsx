import React from 'react';

const StatusBadge = ({ status, type = 'general', className = '' }) => {
  const getStatusConfig = () => {
    const configs = {
      // General status
      general: {
        Active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
        Inactive: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Inactive' },
        Unknown: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Unknown' }
      },

      // On/Off status
      signal: {
        On: { bg: 'bg-green-100', text: 'text-green-800', label: 'On' },
        Off: { bg: 'bg-red-100', text: 'text-red-800', label: 'Off' },
        true: { bg: 'bg-green-100', text: 'text-green-800', label: 'On' },
        false: { bg: 'bg-red-100', text: 'text-red-800', label: 'Off' },
        1: { bg: 'bg-green-100', text: 'text-green-800', label: 'On' },
        0: { bg: 'bg-red-100', text: 'text-red-800', label: 'Off' }
      },

      // Fault status
      fault: {
        fault: { bg: 'bg-red-100', text: 'text-red-800', label: 'Fault Detected' },
        normal: { bg: 'bg-green-100', text: 'text-green-800', label: 'Normal' },
        warning: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Warning' }
      },

      // Power status
      power: {
        Active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
        Inactive: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Inactive' },
        Fault: { bg: 'bg-red-100', text: 'text-red-800', label: 'Fault' }
      }
    };

    const typeConfig = configs[type] || configs.general;
    return typeConfig[status] || typeConfig.Unknown || { bg: 'bg-gray-100', text: 'text-gray-500', label: status || 'Unknown' };
  };

  const config = getStatusConfig();

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text} ${className}`}>
      {config.label}
    </span>
  );
};

export default StatusBadge;