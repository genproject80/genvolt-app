import React, { useState, useEffect } from 'react';
import { IconFlask, IconChartBar, IconAlertTriangle } from '@tabler/icons-react';
import { usePermissions } from '../../hooks/usePermissions';
import { deviceTestingService } from '../../services/deviceTestingService';
import GenericDataTable from '../../components/deviceTesting/GenericDataTable';
import HourlyDashboard from './HourlyDashboard';
import TableStatsCards from './TableStatsCards';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const DeviceTesting = () => {
  const { canViewDeviceTesting, loading: permLoading } = usePermissions();
  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('hourly');
  const [tableError, setTableError] = useState(null);
  const [dataError, setDataError] = useState(null);

  useEffect(() => {
    if (!canViewDeviceTesting) return;
    setTablesLoading(true);
    deviceTestingService
      .getAvailableTables()
      .then((result) => {
        const active = result.data || [];
        setTables(active);
        if (active.length > 0) setActiveTab(active[0].table_key);
        else setActiveTab('hourly');
      })
      .catch((err) => {
        setTableError(err.response?.data?.message || 'Failed to load table list');
      })
      .finally(() => setTablesLoading(false));
  }, [canViewDeviceTesting]);

  if (permLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canViewDeviceTesting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-center">
        <IconAlertTriangle className="w-12 h-12 text-yellow-400 mb-3" />
        <h3 className="text-lg font-semibold text-gray-800">Access Denied</h3>
        <p className="text-sm text-gray-500 mt-1">You do not have permission to view Device Testing data.</p>
      </div>
    );
  }

  const isHourlyTab = activeTab === 'hourly';
  const activeTableConfig = tables.find((t) => t.table_key === activeTab);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary-100 rounded-lg">
          <IconFlask className="w-6 h-6 text-primary-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Device Testing</h1>
          <p className="text-sm text-gray-500">View raw IoT data, hourly activity heatmap, and statistics</p>
        </div>
      </div>

      {/* Stats Cards for selected data table */}
      {!isHourlyTab && activeTableConfig && (
        <TableStatsCards tableKey={activeTab} />
      )}

      {/* Error banners */}
      {tableError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {tableError}
        </div>
      )}
      {dataError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {dataError}
        </div>
      )}

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
          {/* Hourly Dashboard tab always first */}
          <button
            onClick={() => setActiveTab('hourly')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              isHourlyTab
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconChartBar className="w-4 h-4" />
            Hourly Dashboard
          </button>

          {tablesLoading ? (
            <div className="px-4 py-2.5 flex items-center">
              <LoadingSpinner size="sm" />
            </div>
          ) : (
            tables.map((table) => (
              <button
                key={table.table_key}
                onClick={() => setActiveTab(table.table_key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === table.table_key
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {table.display_name}
              </button>
            ))
          )}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {isHourlyTab ? (
          <HourlyDashboard
            tableKey={tables.length > 0 ? tables[0].table_key : 'raw_messages'}
          />
        ) : (
          activeTableConfig && (
            <GenericDataTable
              tableKey={activeTab}
              onError={setDataError}
            />
          )
        )}

        {!isHourlyTab && !activeTableConfig && !tablesLoading && (
          <div className="py-12 text-center text-sm text-gray-500">
            No active tables configured. Ask a SYSTEM_ADMIN to add tables via Admin → Table Configuration.
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceTesting;
