import React, { useState, useCallback, useEffect } from 'react';
import {
  Table, Paper, ScrollArea, Center, Text, Badge, Group, ActionIcon, Tooltip,
} from '@mantine/core';
import { IconEye, IconDownload, IconRefresh } from '@tabler/icons-react';
import LoadingSpinner from '../common/LoadingSpinner';
import SearchableSelect from '../common/SearchableSelect';

const P3HistoricDataTable = ({ data, loading, pagination, onPageChange, onFiltersChange, filters, onRowClick, deviceId }) => {
  const [localFilters, setLocalFilters] = useState(filters || {
    timeRange: 'all',
    status: 'all',
    search: '',
    date: '',
  });

  useEffect(() => {
    if (filters) setLocalFilters(filters);
  }, [filters]);

  const handleFilterChange = useCallback((key, value) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    if (onFiltersChange) onFiltersChange(newFilters);
  }, [localFilters, onFiltersChange]);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    if (onFiltersChange) onFiltersChange(localFilters);
  }, [localFilters, onFiltersChange]);

  const formatTimestamp = (ts) => ts ? new Date(ts).toLocaleString() : 'N/A';
  const formatSignalStrength = (s) => (s || s === 0) ? `${s}/6` : 'N/A';
  const formatCurrent = (c) => (c || c === 0) ? `${c} mA` : '0 mA';

  const getMotorStatusBadge = (motorStatus, motorOnFlag) => {
    const isRunning = motorStatus === 'Running' || motorOnFlag === 1 || motorOnFlag === true;
    return { label: isRunning ? 'Running' : 'Stopped', color: isRunning ? 'green' : 'gray' };
  };

  const getSignalBadge = (strength) => {
    if (strength >= 5) return { label: 'Excellent', color: 'green' };
    if (strength >= 4) return { label: 'Good',      color: 'green' };
    if (strength >= 3) return { label: 'Fair',       color: 'yellow' };
    if (strength >= 1) return { label: 'Poor',       color: 'red' };
    return { label: 'None', color: 'gray' };
  };

  const getEventTypeBadge = (eventType) => {
    if (eventType === 4)              return 'red';
    if (eventType === 2 || eventType === 3) return 'blue';
    return 'gray';
  };

  const rows = (data || []).map((row, index) => {
    const motorBadge  = getMotorStatusBadge(row.Motor_Status, row.Motor_ON_Flag);
    const signalBadge = getSignalBadge(row.Signal_Strength);

    return (
      <Table.Tr
        key={row.Entry_ID || index}
        style={{ cursor: 'pointer' }}
        onClick={() => onRowClick && onRowClick(row.Entry_ID)}
      >
        <Table.Td><Text size="sm">{formatTimestamp(row.CreatedAt)}</Text></Table.Td>
        <Table.Td><Text size="sm" ff="monospace">#{row.Entry_ID}</Text></Table.Td>
        <Table.Td>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" fw={500}>{formatSignalStrength(row.Signal_Strength)}</Text>
            <Badge color={signalBadge.color} variant="light" size="xs">{signalBadge.label}</Badge>
          </Group>
        </Table.Td>
        <Table.Td>
          <Badge color={motorBadge.color} variant="light" size="sm">{motorBadge.label}</Badge>
        </Table.Td>
        <Table.Td><Text size="sm" ff="monospace">{formatCurrent(row.Motor_Current_Average_mA)}</Text></Table.Td>
        <Table.Td><Text size="sm">{row.Motor_ON_Time_sec || 0}</Text></Table.Td>
        <Table.Td><Text size="sm">{row.Motor_OFF_Time_min || 0}</Text></Table.Td>
        <Table.Td><Text size="sm">{row.Wheel_Threshold || 0}</Text></Table.Td>
        <Table.Td><Text size="sm" ff="monospace" c="dimmed">{row.IMSI != null ? row.IMSI : 'N/A'}</Text></Table.Td>
        <Table.Td>
          <Group gap={4} wrap="wrap">
            <Badge color={getEventTypeBadge(row.Event_Type)} variant="light" size="xs">
              Type {row.Event_Type}
            </Badge>
            {row.Event_Type_Description && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{row.Event_Type_Description}</Text>
            )}
          </Group>
        </Table.Td>
        <Table.Td>
          <Tooltip label="View details" withArrow>
            <ActionIcon variant="subtle" color="violet" size="sm"
              onClick={(e) => { e.stopPropagation(); onRowClick && onRowClick(row.Entry_ID); }}>
              <IconEye size={16} />
            </ActionIcon>
          </Tooltip>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900">
            Historic Data for Motor Device {deviceId || 'Loading...'}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors">
            <IconDownload className="w-4 h-4" />
            Export CSV
          </button>
          <button onClick={() => onFiltersChange && onFiltersChange(localFilters)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors">
            <IconRefresh className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Time Range:</label>
          <SearchableSelect
            options={[
              { value: 'all', label: 'All Time' },
              { value: '2h',  label: 'Last 2 Hours' },
              { value: '24h', label: 'Last 24 Hours' },
              { value: '7d',  label: 'Last 7 Days' },
              { value: '30d', label: 'Last 30 Days' },
            ]}
            value={localFilters.timeRange === 'all' ? '' : localFilters.timeRange}
            onChange={(v) => handleFilterChange('timeRange', v || 'all')}
            placeholder="All Time"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Specific Date:</label>
          <input type="date" value={localFilters.date}
            onChange={(e) => handleFilterChange('date', e.target.value)}
            className="w-full text-sm border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status:</label>
          <SearchableSelect
            options={[
              { value: 'all',    label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'fault',  label: 'Fault' },
            ]}
            value={localFilters.status === 'all' ? '' : localFilters.status}
            onChange={(v) => handleFilterChange('status', v || 'all')}
            placeholder="All Status"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Search:</label>
          <form onSubmit={handleSearchSubmit} className="flex rounded-md shadow-sm">
            <input type="text" value={localFilters.search}
              onChange={(e) => setLocalFilters(prev => ({ ...prev, search: e.target.value }))}
              placeholder="Search fault codes..."
              className="block w-full rounded-l-md border-gray-300 focus:border-purple-500 focus:ring-purple-500 text-sm" />
            <button type="submit"
              className="inline-flex items-center rounded-r-md border border-l-0 border-gray-300 bg-purple-600 px-3 text-white hover:bg-purple-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
        </div>
      </div>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><LoadingSpinner size="lg" /></Center>
          ) : !data || data.length === 0 ? (
            <Center py="md"><Text size="sm" c="dimmed">No recent data to display</Text></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm" style={{ cursor: 'pointer' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Timestamp</Table.Th>
                  <Table.Th>Entry ID</Table.Th>
                  <Table.Th>GSM Signal</Table.Th>
                  <Table.Th>Motor Status</Table.Th>
                  <Table.Th>Current (mA)</Table.Th>
                  <Table.Th>Motor On Time (sec)</Table.Th>
                  <Table.Th>Motor Off Time (min)</Table.Th>
                  <Table.Th>Wheels Configured</Table.Th>
                  <Table.Th>IMSI Number</Table.Th>
                  <Table.Th>Event Type</Table.Th>
                  <Table.Th ta="right">Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>

        {pagination && pagination.totalPages > 1 && (
          <Group justify="space-between" align="center" px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="sm" c="dimmed">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total records)
            </Text>
            <Group gap="xs">
              <button
                onClick={() => onPageChange && onPageChange('previous')}
                disabled={!pagination.hasPrevious}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => onPageChange && onPageChange('next')}
                disabled={!pagination.hasNext}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </Group>
          </Group>
        )}
      </Paper>
    </div>
  );
};

export default P3HistoricDataTable;
