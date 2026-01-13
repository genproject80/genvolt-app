import React, { useState, useEffect, useCallback } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import { fetchP3ServiceMetrics, fetchP3CofMetrics, fetchP3CofDateMetrics, fetchP3GreaseMetrics } from '../../services/p3DataService';
import LoadingSpinner from '../common/LoadingSpinner';

const MetricCard = ({ title, value, subtitle, icon, color = "red", loading = false }) => {
  const colorClasses = {
    green: {
      bg: 'bg-green-50',
      icon: 'text-green-600',
      text: 'text-green-900',
    },
    blue: {
      bg: 'bg-blue-50',
      icon: 'text-blue-600',
      text: 'text-blue-900',
    },
    yellow: {
      bg: 'bg-yellow-50',
      icon: 'text-yellow-600',
      text: 'text-yellow-900',
    },
    red: {
      bg: 'bg-red-50',
      icon: 'text-red-600',
      text: 'text-red-900',
    }
  };

  const colors = colorClasses[color] || colorClasses.red;

  return (
    <div className={`${colors.bg} rounded-lg p-4 shadow-sm border border-gray-200`}>
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
    </div>
  );
};

const P3MetricsCards = ({ className = "" }) => {
  const { filteredDeviceIds } = useDashboard();
  const [serviceMetrics, setServiceMetrics] = useState(null);
  const [cofMetrics, setCofMetrics] = useState(null);
  const [cofDateMetrics, setCofDateMetrics] = useState(null);
  const [greaseMetrics, setGreaseMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadMetrics = useCallback(async () => {
    if (filteredDeviceIds.length === 0) {
      setServiceMetrics(null);
      setCofMetrics(null);
      setCofDateMetrics(null);
      setGreaseMetrics(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch all four metrics in parallel
      const [serviceResponse, cofResponse, cofDateResponse, greaseResponse] = await Promise.all([
        fetchP3ServiceMetrics({ deviceIds: filteredDeviceIds }),
        fetchP3CofMetrics({ deviceIds: filteredDeviceIds }),
        fetchP3CofDateMetrics({ deviceIds: filteredDeviceIds }),
        fetchP3GreaseMetrics({ deviceIds: filteredDeviceIds })
      ]);

      if (serviceResponse.success) {
        setServiceMetrics(serviceResponse.data);
      }

      if (cofResponse.success) {
        setCofMetrics(cofResponse.data);
      }

      if (cofDateResponse.success) {
        setCofDateMetrics(cofDateResponse.data);
      }

      if (greaseResponse.success) {
        setGreaseMetrics(greaseResponse.data);
      }
    } catch (err) {
      console.error('Error fetching P3 metrics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filteredDeviceIds]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const hasData = filteredDeviceIds.length > 0;
  const curvesNeedingService = serviceMetrics?.curves_needing_service || 0;
  const curvesHighCof = cofMetrics?.curves_high_cof || 0;
  const curvesOldCofMeasurement = cofDateMetrics?.curves_old_cof_measurement || 0;
  const curvesLowGrease = greaseMetrics?.curves_low_grease || 0;
  const totalCurves = serviceMetrics?.total_curves || 0;

  const cards = [
    <MetricCard
      key="service"
        title="Count of Curves with last service date > 15 days"
        value={hasData ? curvesNeedingService.toString() : '-'}
        subtitle={
          hasData
            ? `Out of ${totalCurves} total curve${totalCurves !== 1 ? 's' : ''}`
            : "Select filters to view data"
        }
        color={curvesNeedingService > 0 ? "red" : "green"}
        loading={loading && hasData}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />,
    <MetricCard
      key="cof"
        title="Count of Curves With CoF > 0.25"
        value={hasData ? curvesHighCof.toString() : '-'}
        subtitle={
          hasData
            ? `Out of ${totalCurves} total curve${totalCurves !== 1 ? 's' : ''}`
            : "Select filters to view data"
        }
        color={curvesHighCof > 0 ? "yellow" : "green"}
        loading={loading && hasData}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
      />,
    <MetricCard
      key="cofdate"
        title="Count of Curves with last CoF measured > 1 month"
        value={hasData ? curvesOldCofMeasurement.toString() : '-'}
        subtitle={
          hasData
            ? `Out of ${totalCurves} total curve${totalCurves !== 1 ? 's' : ''}`
            : "Select filters to view data"
        }
        color={curvesOldCofMeasurement > 0 ? "red" : "green"}
        loading={loading && hasData}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      />,
    <MetricCard
      key="grease"
        title="Count of Curves with grease < 40 Kgs"
        value={hasData ? curvesLowGrease.toString() : '-'}
        subtitle={
          hasData
            ? `Out of ${totalCurves} total curve${totalCurves !== 1 ? 's' : ''}`
            : "Select filters to view data"
        }
        color={curvesLowGrease > 0 ? "red" : "green"}
        loading={loading && hasData}
        icon={
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        }
      />
  ];

  return (
    <>
      {cards}
      {error && (
        <div className="col-span-1 md:col-span-2 lg:col-span-5 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">Error loading metrics: {error}</p>
        </div>
      )}
    </>
  );
};

export default P3MetricsCards;
