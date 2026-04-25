import React, { useState, useCallback, useEffect } from 'react';
import {
  Table, Paper, ScrollArea, Center, Text, Badge, Group, Pagination, ActionIcon, Tooltip,
} from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';
import SearchableSelect from '../common/SearchableSelect';

const HistoricDataTable = ({ data, loading, pagination, onPageChange, onFiltersChange, filters, onRowClick }) => {
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
  const formatSignalStrength = (s) => (s || s === 0) ? `${s}/5` : 'N/A';
  const formatCurrent = (c) => (c || c === 0) ? `${c} mA` : '0 mA';
  const formatMotorStatus = (onTime) => (onTime && onTime > 0) ? 'Running' : 'Stopped';
  const formatWheels = (configured, detected) => `${detected || 0}/${configured || 0}`;
  const formatLocation = (lat, lng) => (lat && lng) ? `${parseFloat(lat).toFixed(6)}, ${parseFloat(lng).toFixed(6)}` : 'N/A';

  const rows = (data || []).map((row, index) => (
    <Table.Tr
      key={index}
      style={{ cursor: 'pointer' }}
      onClick={() => onRowClick && onRowClick(row.Entry_ID)}
    >
      <Table.Td><Text size="sm">{formatTimestamp(row.CreatedAt || row.Timestamp)}</Text></Table.Td>
      <Table.Td><Text size="sm" ff="monospace">#{row.Entry_ID}</Text></Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={500}>{formatSignalStrength(row.GSM_Signal_Strength)}</Text>
          <StatusBadge
            status={row.GSM_Signal_Strength >= 3 ? 'Good' : row.GSM_Signal_Strength >= 2 ? 'Fair' : 'Poor'}
            type="signal"
          />
        </Group>
      </Table.Td>
      <Table.Td>
        <StatusBadge
          status={formatMotorStatus(row.Motor_ON_Time_sec)}
          type={row.Motor_ON_Time_sec > 0 ? 'success' : 'inactive'}
        />
      </Table.Td>
      <Table.Td><Text size="sm" ff="monospace">{formatCurrent(row.Motor_Current_mA)}</Text></Table.Td>
      <Table.Td><Text size="sm" ff="monospace">{formatWheels(row.Number_of_Wheels_Configured, row.Number_of_Wheels_Detected)}</Text></Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{formatLocation(row.Longitude, row.Latitude)}</Text></Table.Td>
      <Table.Td>
        <Badge
          color={row.Fault_Code && row.Fault_Code !== '0' ? 'red' : 'green'}
          variant="light"
          size="sm"
        >
          {row.Fault_Code && row.Fault_Code !== '0' ? row.Fault_Code : 'OK'}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Tooltip label="View details" withArrow>
          <ActionIcon variant="subtle" color="green" size="sm"
            onClick={(e) => { e.stopPropagation(); onRowClick && onRowClick(row.Entry_ID); }}>
            <IconEye size={16} />
          </ActionIcon>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 p-4 bg-gray-50 rounded-md">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Range:</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Specific Date:</label>
            <div className="flex">
              <input type="date" value={localFilters.date}
                onChange={(e) => handleFilterChange('date', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-l-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              {localFilters.date && (
                <button type="button" onClick={() => handleFilterChange('date', '')}
                  className="px-3 py-2 bg-gray-300 text-gray-700 rounded-r-md hover:bg-gray-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status:</label>
            <SearchableSelect
              options={[
                { value: 'all',   label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'fault', label: 'Fault' },
              ]}
              value={localFilters.status === 'all' ? '' : localFilters.status}
              onChange={(v) => handleFilterChange('status', v || 'all')}
              placeholder="All Status"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search:</label>
            <form onSubmit={handleSearchSubmit} className="flex">
              <input type="text" value={localFilters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Search fault codes, descriptions..."
                className="block w-full px-3 py-2 border border-gray-300 rounded-l-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm" />
              <button type="submit"
                className="px-3 py-2 bg-green-600 text-white rounded-r-md hover:bg-green-700">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><LoadingSpinner size="lg" /></Center>
          ) : !data || data.length === 0 ? (
            <Center py="xl">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 00-2-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <Text size="sm" c="dimmed" mt="sm">No motor operational data found for this device with the current filters.</Text>
              </div>
            </Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm" style={{ cursor: 'pointer' }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Timestamp</Table.Th>
                  <Table.Th>Entry ID</Table.Th>
                  <Table.Th>GSM Signal</Table.Th>
                  <Table.Th>Motor Status</Table.Th>
                  <Table.Th>Current (mA)</Table.Th>
                  <Table.Th>Wheels</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th>Fault Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
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

export default HistoricDataTable;
