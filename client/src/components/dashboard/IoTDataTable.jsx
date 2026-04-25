import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Text, Badge, Group, Pagination,
} from '@mantine/core';
import { useDashboard } from '../../context/DashboardContext';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';

const HKMIStatusBadge = ({ status }) => {
  const color = !status ? 'gray'
    : status.toLowerCase() === 'active' ? 'green'
    : status.toLowerCase() === 'signal loss' ? 'red'
    : 'gray';
  return <Badge color={color} variant="light" size="sm">{status || 'Unknown'}</Badge>;
};

const GreaseLevel = ({ greaseLeft }) => {
  const color = greaseLeft >= 8 ? 'text-green-600' : greaseLeft >= 5 ? 'text-yellow-600' : 'text-red-600';
  return <span className={`font-semibold ${color}`}>{greaseLeft ? `${greaseLeft} kg` : 'N/A'}</span>;
};

const ManagementHierarchy = ({ sden, den, aen, sse }) => (
  <div>
    <div className="font-medium">{sden || 'N/A'}</div>
    <div className="text-xs text-gray-500 mt-1">{den || 'N/A'} → {aen || 'N/A'} → {sse || 'N/A'}</div>
  </div>
);

const GSMSignalBars = ({ strength }) => {
  const signalValue = strength || 0;
  const getBarColor = (barIndex, signalStrength) => {
    if (barIndex > signalStrength) return 'bg-gray-300';
    if (signalStrength <= 1) return 'bg-red-500';
    if (signalStrength <= 3) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  return (
    <div className="flex items-end space-x-0.5 min-w-20">
      {[1, 2, 3, 4, 5, 6].map((bar) => (
        <div key={bar} className={`w-1 rounded-sm transition-colors ${getBarColor(bar, signalValue)}`} style={{ height: `${bar * 2 + 2}px` }} />
      ))}
      <span className="ml-2 text-xs text-gray-600 font-medium">{signalValue}/6</span>
    </div>
  );
};

const SortIcon = ({ field, sortField, sortOrder }) => {
  if (sortField !== field) return <IconChevronDown size={12} style={{ opacity: 0.3, flexShrink: 0 }} />;
  return sortOrder === 'ASC'
    ? <IconChevronUp size={12} style={{ flexShrink: 0 }} />
    : <IconChevronDown size={12} style={{ flexShrink: 0 }} />;
};

const IoTDataTable = ({ className = '', disableRowClick = false, hideExport = false, showDeviceId = false, hideMachineId = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    iotData,
    iotDataLoading,
    iotDataError,
    iotDataPagination,
    fetchIoTData,
    exportIoTData,
    filteredDeviceIds,
  } = useDashboard();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('Entry_ID');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [isExporting, setIsExporting] = useState(false);

  const canViewDeviceDetails = useMemo(() => !disableRowClick, [disableRowClick]);

  const handleRowClick = useCallback((row) => {
    if (canViewDeviceDetails && row.Entry_ID) navigate(`/dashboard/device/${row.Entry_ID}`);
  }, [navigate, canViewDeviceDetails]);

  const columns = useMemo(() => {
    let base = [
      { key: 'machine_id',          label: 'Machine ID',                   sortable: true },
      { key: 'management_hierarchy', label: 'Management Hierarchy',         sortable: false },
      { key: 'div_rly',             label: 'Division/ Railway',            sortable: true },
      { key: 'section',             label: 'Section',                      sortable: true },
      { key: 'curve_number',        label: 'Curve Number',                 sortable: true },
      { key: 'line',                label: 'Line',                         sortable: true },
      { key: 'gps_location',        label: 'GPS Location',                 sortable: false },
      { key: 'GSM_Signal_Strength', label: 'GSM Strength',                 sortable: true },
      { key: 'grease_left',         label: 'Grease Left (kg)',             sortable: true },
      { key: 'motor_run_count',     label: 'Motor Run Count Last 24Hrs',   sortable: false },
      { key: 'status',              label: 'Status',                       sortable: true },
      { key: 'days_since_service',  label: 'Days Since Service',           sortable: true },
    ];
    if (showDeviceId) base.splice(1, 0, { key: 'Device_ID', label: 'Device ID', sortable: true });
    if (hideMachineId) base = base.filter(c => c.key !== 'machine_id');
    return base;
  }, [showDeviceId, hideMachineId]);

  const formatCellValue = useCallback((value, columnKey, row) => {
    switch (columnKey) {
      case 'Device_ID':    return row?.Device_ID || '-';
      case 'machine_id':  return row?.machine_id || row?.Device_ID || '-';
      case 'div_rly':     return row?.div_rly || '-';
      case 'section':     return row?.section || '-';
      case 'curve_number': {
        if (row?.curve_number) return row.curve_number;
        const machineId = row?.machine_id || row?.Device_ID || '';
        const curveMatch = machineId.match(/RTM([^-]+)/);
        return curveMatch ? curveMatch[1] : '-';
      }
      case 'line': {
        if (row?.line) return row.line;
        const lineMatch = (row?.machine_id || '').match(/-([A-Z]{2})-/);
        return lineMatch ? lineMatch[1] : '-';
      }
      case 'gps_location': {
        const lat = row?.Longitude;
        const lng = row?.Latitude;
        return (lat && lng && lat !== 0 && lng !== 0)
          ? `${parseFloat(lat).toFixed(4)},${parseFloat(lng).toFixed(4)}`
          : '-';
      }
      case 'grease_left':      return row?.grease_left ? parseFloat(row.grease_left).toFixed(1) : '-';
      case 'motor_run_count':  return row?.Motor_Run_Count_Last_24Hrs || 0;
      case 'status':           return (row?.Record_Count_Last_1Hr || 0) >= 12 ? 'Active' : 'Signal Loss';
      case 'days_since_service': {
        if (row?.last_service_date) {
          const dateStr = String(row.last_service_date).split('T')[0];
          const [year, month, day] = dateStr.split('-').map(n => parseInt(n, 10));
          const lastServiceDate = new Date(year, month - 1, day);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return Math.ceil(Math.abs(today - lastServiceDate) / (1000 * 60 * 60 * 24));
        }
        return '-';
      }
      default: return value || '-';
    }
  }, []);

  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    await fetchIoTData({ search: searchTerm, page: 1, sortField, sortOrder });
  }, [searchTerm, sortField, sortOrder, fetchIoTData]);

  const handleSort = useCallback(async (field) => {
    const newSortOrder = field === sortField && sortOrder === 'DESC' ? 'ASC' : 'DESC';
    setSortField(field);
    setSortOrder(newSortOrder);
    await fetchIoTData({ search: searchTerm, sortField: field, sortOrder: newSortOrder, page: 1 });
  }, [sortField, sortOrder, searchTerm, fetchIoTData]);

  const handlePageChange = useCallback(async (newPage) => {
    await fetchIoTData({ search: searchTerm, sortField, sortOrder, page: newPage });
  }, [searchTerm, sortField, sortOrder, fetchIoTData]);

  const handleExport = useCallback(async (format = 'csv') => {
    setIsExporting(true);
    try {
      if (format === 'csv') {
        const { iotDataService } = await import('../../services/iotDataService');
        await iotDataService.downloadCSVExport({
          deviceIds: filteredDeviceIds,
          search: searchTerm,
          filename: `iot_data_export_${new Date().toISOString().split('T')[0]}.csv`,
        });
      } else {
        const result = await exportIoTData(format, { search: searchTerm });
        if (result.success) {
          const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `iot_data_export_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [filteredDeviceIds, searchTerm, exportIoTData]);

  if (filteredDeviceIds.length === 0) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center ${className}`}>
        <div className="mx-auto max-w-md">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Data Available</h3>
          <p className="mt-2 text-sm text-gray-500">Please apply hierarchy filters to view IoT data for specific devices.</p>
        </div>
      </div>
    );
  }

  const rows = iotData.map((row, index) => (
    <Table.Tr
      key={row.Entry_ID || index}
      style={{ cursor: canViewDeviceDetails ? 'pointer' : 'default' }}
      onClick={() => handleRowClick(row)}
      title={canViewDeviceDetails ? `Click to view details for device ${row.Device_ID}` : ''}
    >
      {columns.map((col) => (
        <Table.Td key={col.key}>
          {col.key === 'GSM_Signal_Strength' ? (
            <GSMSignalBars strength={row[col.key]} />
          ) : col.key === 'management_hierarchy' ? (
            <ManagementHierarchy sden={row.sden} den={row.den} aen={row.aen} sse={row.sse} />
          ) : col.key === 'status' ? (
            <HKMIStatusBadge status={formatCellValue(row[col.key], col.key, row)} />
          ) : col.key === 'grease_left' ? (
            <GreaseLevel greaseLeft={parseFloat(formatCellValue(row[col.key], col.key, row))} />
          ) : col.key === 'gps_location' ? (
            <Text size="xs" ff="monospace" c="green">{formatCellValue(row[col.key], col.key, row)}</Text>
          ) : (
            <Text size="sm" fw={col.key === 'machine_id' ? 500 : undefined}>
              {formatCellValue(row[col.key], col.key, row)}
            </Text>
          )}
        </Table.Td>
      ))}
    </Table.Tr>
  ));

  const startRecord = iotDataPagination ? ((iotDataPagination.page - 1) * iotDataPagination.limit) + 1 : 0;
  const endRecord   = iotDataPagination ? Math.min(iotDataPagination.page * iotDataPagination.limit, iotDataPagination.total) : 0;

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Device Management</h3>
        <div className="flex items-center space-x-4">
          <form onSubmit={handleSearch} className="flex items-center space-x-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search devices, messages..."
              className="block w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
            />
            <button type="submit" disabled={iotDataLoading}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>

          {!hideExport && (
            <div className="flex items-center space-x-2">
              <button onClick={() => handleExport('csv')} disabled={isExporting || iotDataLoading}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                {isExporting && <LoadingSpinner size="sm" className="mr-2" />}
                Export CSV
              </button>
              <button onClick={() => handleExport('json')} disabled={isExporting || iotDataLoading}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                Export JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {iotDataError && (
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md">
            <svg className="h-5 w-5 text-red-400 mr-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-red-800">{iotDataError}</p>
          </div>
        </div>
      )}

      <ScrollArea>
        {iotDataLoading ? (
          <Center py="xl">
            <div className="text-center">
              <LoadingSpinner size="lg" />
              <p className="mt-4 text-sm text-gray-500">Loading IoT data...</p>
            </div>
          </Center>
        ) : iotData.length === 0 ? (
          <Center py="xl">
            <Text size="sm" c="dimmed">No data found for the selected filters.</Text>
          </Center>
        ) : (
          <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
            <Table.Thead>
              <Table.Tr>
                {columns.map((col) => (
                  <Table.Th
                    key={col.key}
                    style={col.sortable ? { cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' } : { whiteSpace: 'nowrap' }}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <Group gap={4} wrap="nowrap">
                      <span>{col.label}</span>
                      {col.sortable && <SortIcon field={col.key} sortField={sortField} sortOrder={sortOrder} />}
                    </Group>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>{rows}</Table.Tbody>
          </Table>
        )}
      </ScrollArea>

      {iotData.length > 0 && iotDataPagination && (
        <Group justify="space-between" align="center" px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
          <Text size="sm" c="dimmed">
            Showing {startRecord}–{endRecord} of {iotDataPagination.total} results
          </Text>
          <Pagination
            total={iotDataPagination.totalPages}
            value={iotDataPagination.page}
            onChange={handlePageChange}
            size="sm"
          />
        </Group>
      )}
    </div>
  );
};

export default IoTDataTable;
