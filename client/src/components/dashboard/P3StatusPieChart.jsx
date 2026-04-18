import React, { useState, useEffect, useCallback } from 'react';
import { DonutChart } from '@mantine/charts';
import { useDashboard } from '../../context/DashboardContext';
import { fetchP3StatusMetrics } from '../../services/p3DataService';
import LoadingSpinner from '../common/LoadingSpinner';

const COLORS = {
  active: '#10b981', // Green
  inactive: '#ef4444' // Red
};

const P3StatusPieChart = ({ className = "" }) => {
  const { filteredDeviceIds } = useDashboard();
  const [statusMetrics, setStatusMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadStatusMetrics = useCallback(async () => {
    if (filteredDeviceIds.length === 0) {
      setStatusMetrics(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchP3StatusMetrics({
        deviceIds: filteredDeviceIds
      });

      if (response.success) {
        setStatusMetrics(response.data);
      }
    } catch (err) {
      console.error('Error fetching P3 status metrics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filteredDeviceIds]);

  useEffect(() => {
    loadStatusMetrics();
  }, [loadStatusMetrics]);

  const hasData = filteredDeviceIds.length > 0;
  const activeDevices = statusMetrics?.active_devices || 0;
  const inactiveDevices = statusMetrics?.inactive_devices || 0;
  const totalDevices = statusMetrics?.total_devices || 0;

  // Prepare data for pie chart
  const chartData = [
    { name: 'Active', value: activeDevices, color: COLORS.active },
    { name: 'Inactive', value: inactiveDevices, color: COLORS.inactive }
  ];

  return (
    <div className={`bg-blue-50 rounded-lg p-4 shadow-sm border border-gray-200 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-600">Device Status Distribution</p>
          {loading ? (
            <div className="mt-1">
              <LoadingSpinner size="sm" />
            </div>
          ) : hasData && totalDevices > 0 ? (
            <>
              <p className="text-2xl font-bold text-blue-900 mt-1">{totalDevices}</p>
              <p className="text-xs text-gray-500 mt-1">Total Machines</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-blue-900 mt-1">-</p>
          )}
        </div>

        {hasData && totalDevices > 0 && !loading && (
          <div className="ml-3" style={{ width: 80, height: 80 }}>
            <DonutChart
              data={chartData}
              size={80}
              thickness={15}
              withTooltip
              tooltipDataSource="segment"
            />
          </div>
        )}

        {!hasData && (
          <div className="ml-3">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          </div>
        )}
      </div>

      {hasData && totalDevices > 0 && !loading && (
        <p className="text-xs text-gray-500 mt-1">
          Active: {activeDevices} | Inactive: {inactiveDevices}
        </p>
      )}

      {!hasData && (
        <p className="text-xs text-gray-500 mt-1">Select filters to view data</p>
      )}

      {error && (
        <div className="mt-3 pt-3 border-t border-red-200">
          <p className="text-xs text-red-600">Error: {error}</p>
        </div>
      )}
    </div>
  );
};

export default P3StatusPieChart;
