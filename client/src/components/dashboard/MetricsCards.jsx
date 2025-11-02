import React from 'react';
import { useDashboard } from '../../context/DashboardContext';
import LoadingSpinner from '../common/LoadingSpinner';

const MetricCard = ({ title, value, subtitle, icon, color = "green", loading = false, onClick, isActive = false }) => {
  const colorClasses = {
    green: {
      bg: 'bg-green-50',
      icon: 'text-green-600',
      text: 'text-green-900',
      activeBorder: 'border-green-500'
    },
    blue: {
      bg: 'bg-blue-50',
      icon: 'text-blue-600',
      text: 'text-blue-900',
      activeBorder: 'border-blue-500'
    },
    yellow: {
      bg: 'bg-yellow-50',
      icon: 'text-yellow-600',
      text: 'text-yellow-900',
      activeBorder: 'border-yellow-500'
    },
    red: {
      bg: 'bg-red-50',
      icon: 'text-red-600',
      text: 'text-red-900',
      activeBorder: 'border-red-500'
    }
  };

  const colors = colorClasses[color] || colorClasses.green;
  const isClickable = !!onClick;
  const borderClass = isActive ? `border-2 ${colors.activeBorder}` : 'border border-gray-200';
  const cursorClass = isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : '';

  return (
    <div
      className={`${colors.bg} rounded-lg p-4 shadow-sm ${borderClass} ${cursorClass}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-600">{title}</p>
          {loading ? (
            <div className="mt-1">
              <LoadingSpinner size="sm" />
            </div>
          ) : (
            <>
              <p className={`text-2xl font-bold ${colors.text} mt-1`}>
                {value}
              </p>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
              )}
            </>
          )}
        </div>
        {icon && (
          <div className={`${colors.icon} ml-3`}>
            {icon}
          </div>
        )}
      </div>
      {isClickable && isActive && (
        <div className="mt-3 pt-3 border-t border-gray-300">
          <p className="text-xs text-gray-600 font-medium">Filter active - click to clear</p>
        </div>
      )}
    </div>
  );
};

const MetricsCards = ({ className = "" }) => {
  const {
    statistics,
    statisticsLoading,
    filteredDeviceIds,
    iotData,
    iotDataLoading,
    activeDashboard,
    gsmFilter,
    toggleGsmFilter
  } = useDashboard();

  // Calculate metrics from statistics and current data
  const getMetrics = () => {
    if (!activeDashboard) {
      return {
        totalRecords: '-',
        activeDevices: '-',
        avgSignalStrength: '-',
        faultCount: '-'
      };
    }

    if (!statistics) {
      return {
        totalRecords: filteredDeviceIds.length > 0 ? '0' : '-',
        activeDevices: filteredDeviceIds.length.toString(),
        avgSignalStrength: '-',
        faultCount: '0'
      };
    }

    const { overall_stats, device_stats } = statistics;

    return {
      totalRecords: overall_stats?.total_records?.toLocaleString() || '0',
      activeDevices: overall_stats?.unique_devices?.toString() || filteredDeviceIds.length.toString(),
      avgSignalStrength: overall_stats?.avg_signal_strength
        ? `${overall_stats.avg_signal_strength}/5`
        : '-',
      faultCount: overall_stats?.fault_records_count?.toString() || '0'
    };
  };

  const metrics = getMetrics();
  const hasData = activeDashboard && filteredDeviceIds.length > 0;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
      <MetricCard
        title="Total Records"
        value={metrics.totalRecords}
        subtitle={hasData ? "IoT data points" : "Select filters to view data"}
        color="blue"
        loading={statisticsLoading && hasData}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
      />

      <MetricCard
        title="Active Devices"
        value={metrics.activeDevices}
        subtitle={hasData ? "Devices monitored" : "No devices selected"}
        color="green"
        loading={statisticsLoading && hasData}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
      />

      <MetricCard
        title="Avg Signal Strength"
        value={metrics.avgSignalStrength}
        subtitle={
          gsmFilter.enabled
            ? `Showing below ${gsmFilter.avgSignalStrength}/5`
            : hasData
            ? "Click to filter below average"
            : "No signal data"
        }
        color="yellow"
        loading={statisticsLoading && hasData}
        onClick={hasData && !statisticsLoading ? toggleGsmFilter : undefined}
        isActive={gsmFilter.enabled}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        }
      />

      <MetricCard
        title="Fault Records"
        value={metrics.faultCount}
        subtitle={hasData ? "Fault conditions detected" : "No fault data"}
        color={parseInt(metrics.faultCount) > 0 ? "red" : "green"}
        loading={statisticsLoading && hasData}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        }
      />
    </div>
  );
};

export default MetricsCards;