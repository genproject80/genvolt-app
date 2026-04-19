import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import {
  Stack, Group, Text, Button, TextInput, Box,
  Badge, Alert, Table, Loader, Center, Paper, ScrollArea,
  Pagination as MantinePagination, UnstyledButton,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconRefresh, IconSearch, IconDownload, IconAlertCircle, IconDatabase,
  IconChevronDown, IconChevronUp, IconSelector,
} from '@tabler/icons-react';
import classes from './P3DataTable.module.css';
import { fetchP3Data, downloadP3CSVExport, exportP3Data } from '../../services/p3DataService';

function Th({ children, sorted, reversed, onSort, wrap, width }) {
  const Icon = sorted ? (reversed ? IconChevronUp : IconChevronDown) : IconSelector;
  return (
    <Table.Th style={{ width, padding: 0 }}>
      <UnstyledButton
        onClick={onSort}
        className={classes.control}
        style={{ width: '100%', display: 'block', padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)' }}
      >
        <Group justify="space-between" gap={4} wrap="nowrap" align="center">
          <Text fw={500} fz="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: wrap ? 'normal' : 'nowrap', lineHeight: wrap ? 1.2 : undefined, minWidth: 0, flex: 1 }}>
            {children}
          </Text>
          <Icon size={14} stroke={1.5} style={{ flexShrink: 0 }} />
        </Group>
      </UnstyledButton>
    </Table.Th>
  );
}

const DeviceStatusBadge = ({ status, minutesSinceLastData }) => {
  const getColor = (s) => {
    if (!s) return 'gray';
    const lower = s.toLowerCase();
    if (lower === 'active') return 'green';
    if (lower === 'inactive') return 'red';
    return 'gray';
  };

  const formatLastSeen = (minutes) => {
    if (!minutes && minutes !== 0) return '';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return `${Math.floor(minutes / 1440)}d ago`;
  };

  return (
    <Stack gap={2}>
      <Badge color={getColor(status)} size="sm" variant="light" tt="uppercase">
        {status || 'Unknown'}
      </Badge>
      {minutesSinceLastData !== undefined && (
        <Text size="xs" c="dimmed">{formatLastSeen(minutesSinceLastData)}</Text>
      )}
    </Stack>
  );
};

const GreaseLevel = ({ greaseLeft }) => {
  const getColor = (level) => {
    if (level >= 8) return 'green';
    if (level >= 5) return 'yellow';
    return 'red';
  };
  return (
    <Text fw={600} c={getColor(greaseLeft)} size="sm">
      {greaseLeft ? `${greaseLeft} kg` : 'N/A'}
    </Text>
  );
};

const ManagementHierarchy = ({ sden, den, aen, sse }) => (
  <Stack gap={2}>
    <Text fw={500} size="sm">{sden || 'N/A'}</Text>
    <Text size="xs" c="dimmed">{den || 'N/A'} → {aen || 'N/A'} → {sse || 'N/A'}</Text>
  </Stack>
);

const GSMSignalBars = ({ strength }) => {
  const signalValue = strength || 0;

  const getBarColor = (barIndex, sig) => {
    if (barIndex > sig) return '#d1d5db';
    if (sig <= 1) return '#ef4444';
    if (sig <= 3) return '#eab308';
    if (sig <= 5) return '#22c55e';
    return '#16a34a';
  };

  return (
    <Group gap={2} align="flex-end" wrap="nowrap">
      {[1, 2, 3, 4, 5, 6].map((bar) => (
        <div
          key={bar}
          style={{
            width: 4,
            height: bar * 4 + 4,
            backgroundColor: getBarColor(bar, signalValue),
            borderRadius: 2,
          }}
        />
      ))}
      <Text size="xs" c="dimmed" fw={500} ml={4}>{signalValue}/6</Text>
    </Group>
  );
};

const PaginationBar = ({ pagination, onPageChange }) => {
  const { page, totalPages, total, limit } = pagination;
  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  return (
    <Group
      justify="space-between"
      px="md"
      py="sm"
      wrap="wrap"
      style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}
    >
      <Text size="sm" c="dimmed">
        Showing {startRecord}–{endRecord} of {total} results
      </Text>
      <MantinePagination
        value={page}
        onChange={onPageChange}
        total={totalPages}
        size="sm"
      />
    </Group>
  );
};

const P3DataTable = ({ className = "", showDeviceId = true, showMachineId = true, enableRowClick = true }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hierarchyFilters, filteredDeviceIds } = useDashboard();

  const [p3Data, setP3Data] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrevious: false,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('CreatedAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [isExporting, setIsExporting] = useState(false);
  const [eventDate, setEventDate] = useState(() => new Date());

  const eventDateStr = useMemo(() => {
    if (!eventDate || !(eventDate instanceof Date) || isNaN(eventDate.getTime())) return null;
    return eventDate.toISOString().split('T')[0];
  }, [eventDate]);

  const loadP3Data = useCallback(async (options = {}) => {
    const {
      page = 1,
      limit = 20,
      search = searchTerm,
      sortFieldParam = sortField,
      sortOrderParam = sortOrder,
      dateFilter = eventDateStr,
    } = options;

    setLoading(true);
    setError(null);

    try {
      const response = await fetchP3Data({
        deviceIds: filteredDeviceIds,
        page, limit, search,
        sortField: sortFieldParam,
        sortOrder: sortOrderParam,
        sden: hierarchyFilters.sden,
        den: hierarchyFilters.den,
        aen: hierarchyFilters.aen,
        sse: hierarchyFilters.sse,
        eventDate: dateFilter || null,
      });

      setP3Data(response.data || []);
      setPagination(response.meta || {
        page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrevious: false,
      });
    } catch (err) {
      console.error('Error fetching P3 data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filteredDeviceIds, hierarchyFilters, searchTerm, sortField, sortOrder, eventDateStr]);

  useEffect(() => {
    if (filteredDeviceIds.length > 0) {
      loadP3Data({ page: 1 });
    } else {
      setP3Data([]);
      setPagination({ page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrevious: false });
    }
  }, [filteredDeviceIds, hierarchyFilters, eventDateStr]);

  const columns = useMemo(() => {
    let cols = [];
    if (showMachineId) cols.push({ key: 'machine_id', label: 'Machine ID', sortable: true, width: 120 });
    cols.push(
      { key: 'management_hierarchy', label: 'Management Hierarchy', sortable: false, width: 160, wrapHeader: true },
      { key: 'div_rly', label: 'Division/ Railway', sortable: true, width: 90, wrapHeader: true },
      { key: 'section', label: 'Section', sortable: true, width: 90 },
      { key: 'curve_number', label: 'Curve Number', sortable: true, width: 90, wrapHeader: true },
      { key: 'line', label: 'Line', sortable: true, width: 60 },
      { key: 'imsi_number', label: 'IMSI Number', sortable: false, width: 120 },
      { key: 'Signal_Strength', label: 'GSM Strength', sortable: true, width: 100, wrapHeader: true },
      { key: 'grease_left', label: 'Grease Left (kg)', sortable: true, width: 90, wrapHeader: true },
      { key: 'Motor_Runs', label: 'Motor Runs', sortable: false, width: 80, wrapHeader: true },
      { key: 'Train_Passed_Count', label: 'Train Passed', sortable: false, width: 80, wrapHeader: true },
      { key: 'Device_Status', label: 'Device Status', sortable: false, width: 90, wrapHeader: true },
      { key: 'days_since_service', label: 'Days Since Service', sortable: true, width: 90, wrapHeader: true },
      { key: 'last_cof_date', label: 'Last CoF Date', sortable: true, width: 100, wrapHeader: true },
      { key: 'last_cof_value', label: 'Last CoF Value', sortable: true, width: 100, wrapHeader: true },
    );
    if (showDeviceId) {
      cols.splice(showMachineId ? 1 : 0, 0, { key: 'Device_ID', label: 'Device ID', sortable: true, width: 110 });
    }
    return cols;
  }, [showDeviceId, showMachineId]);

  const formatCellValue = useCallback((value, columnKey, row) => {
    switch (columnKey) {
      case 'Device_ID': return row?.Device_ID || '-';
      case 'machine_id': return row?.machine_id || row?.Device_ID || '-';
      case 'div_rly': return row?.div_rly || '-';
      case 'section': return row?.section || '-';
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
      case 'imsi_number': return row?.IMSI != null ? row.IMSI : '-';
      case 'grease_left': return row?.grease_left ? parseFloat(row.grease_left).toFixed(1) : '-';
      case 'Motor_Runs': return row?.Motor_Runs || 0;
      case 'Train_Passed_Count': return row?.Train_Passed_Count || 0;
      case 'Device_Status': return row?.Device_Status || 'Unknown';
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
      case 'last_cof_date': return row?.last_cof_date ? String(row.last_cof_date).split('T')[0] : '-';
      case 'last_cof_value': return row?.last_cof_value ? parseFloat(row.last_cof_value).toFixed(2) : '-';
      default: return value || '-';
    }
  }, []);

  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    await loadP3Data({ search: searchTerm, page: 1, sortFieldParam: sortField, sortOrderParam: sortOrder });
  }, [searchTerm, sortField, sortOrder, loadP3Data]);

  const handleSort = useCallback(async (field) => {
    const newSortOrder = field === sortField && sortOrder === 'DESC' ? 'ASC' : 'DESC';
    setSortField(field);
    setSortOrder(newSortOrder);
    await loadP3Data({ search: searchTerm, sortFieldParam: field, sortOrderParam: newSortOrder, page: 1 });
  }, [sortField, sortOrder, searchTerm, loadP3Data]);

  const handlePageChange = useCallback(async (newPage) => {
    await loadP3Data({ search: searchTerm, sortFieldParam: sortField, sortOrderParam: sortOrder, page: newPage });
  }, [searchTerm, sortField, sortOrder, loadP3Data]);

  const handleExport = useCallback(async (format = 'csv') => {
    setIsExporting(true);
    try {
      if (format === 'csv') {
        await downloadP3CSVExport({
          deviceIds: filteredDeviceIds,
          search: searchTerm,
          filename: `p3_data_export_${new Date().toISOString().split('T')[0]}.csv`,
          sden: hierarchyFilters.sden,
          den: hierarchyFilters.den,
          aen: hierarchyFilters.aen,
          sse: hierarchyFilters.sse,
          eventDate: eventDateStr || null,
        });
      } else {
        const result = await exportP3Data({
          deviceIds: filteredDeviceIds,
          search: searchTerm,
          format: 'json',
          sden: hierarchyFilters.sden,
          den: hierarchyFilters.den,
          aen: hierarchyFilters.aen,
          sse: hierarchyFilters.sse,
          eventDate: eventDateStr || null,
        });
        if (result.success) {
          const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `p3_data_export_${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [filteredDeviceIds, searchTerm, hierarchyFilters, eventDateStr]);

  const handleRowClick = useCallback((row) => {
    if (row.Entry_ID) navigate(`/dashboard/p3-device/${row.Entry_ID}`);
  }, [navigate]);

  if (filteredDeviceIds.length === 0) {
    return (
      <Paper withBorder radius="md" p="xl" className={className}>
        <Center py="xl">
          <Stack align="center" gap="sm">
            <IconDatabase size={48} color="var(--mantine-color-gray-5)" />
            <Text fw={500} size="lg">No Data Available</Text>
            <Text size="sm" c="dimmed" ta="center">
              Please apply hierarchy filters to view P3 IoT data for specific devices.
            </Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="md" className={className}>
      {/* Header */}
      <Stack gap="sm" p="md" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <div>
          <Text fw={600} size="lg">P3 Device Data</Text>
          <Text size="sm" c="dimmed">Event-based SICK sensor data with motor runs and train detection</Text>
        </div>

        {/* Controls: Date filter + Refresh + Export */}
        <Group gap="sm" align="flex-end" wrap="wrap">
          <DateInput
            label="Event Date"
            value={eventDate}
            onChange={(val) => setEventDate(val instanceof Date ? val : null)}
            clearable
            size="sm"
            w={160}
            valueFormat="DD/MM/YYYY"
            placeholder="Pick date"
          />
          <Button
            variant="default"
            size="sm"
            leftSection={<IconRefresh size={16} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />}
            onClick={() => loadP3Data({ page: pagination.page })}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            leftSection={isExporting ? <Loader size={14} /> : <IconDownload size={16} />}
            onClick={() => handleExport('csv')}
            disabled={isExporting || loading}
          >
            Export CSV
          </Button>
          <Button
            variant="default"
            size="sm"
            leftSection={isExporting ? <Loader size={14} /> : <IconDownload size={16} />}
            onClick={() => handleExport('json')}
            disabled={isExporting || loading}
          >
            Export JSON
          </Button>
        </Group>
      </Stack>

      {/* Error */}
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" m="md" variant="light">
          {error}
        </Alert>
      )}

      {/* Search — sticky so it stays visible while scrolling on mobile */}
      <Box
        px="md"
        py="sm"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backgroundColor: 'var(--mantine-color-white)',
          borderBottom: '1px solid var(--mantine-color-gray-2)',
        }}
      >
        <form onSubmit={handleSearch}>
          <TextInput
            placeholder="Search by any field"
            leftSection={<IconSearch size={16} stroke={1.5} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </form>
      </Box>

      {/* Table */}
      <ScrollArea>
        <Table horizontalSpacing="sm" verticalSpacing="xs" layout="fixed" miw={900} stickyHeader highlightOnHover={enableRowClick}>
          <Table.Thead>
            <Table.Tr>
              {columns.map((column) =>
                column.sortable ? (
                  <Th
                    key={column.key}
                    sorted={sortField === column.key}
                    reversed={sortField === column.key && sortOrder === 'ASC'}
                    onSort={() => handleSort(column.key)}
                    wrap={column.wrapHeader}
                    width={column.width}
                  >
                    {column.label}
                  </Th>
                ) : (
                  <Table.Th
                    key={column.key}
                    style={{ width: column.width, padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-md)' }}
                  >
                    <Text fw={500} fz="sm" style={column.wrapHeader ? { whiteSpace: 'normal', lineHeight: 1.2 } : { whiteSpace: 'nowrap' }}>
                      {column.label}
                    </Text>
                  </Table.Th>
                )
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Center py="xl">
                    <Stack align="center" gap="xs">
                      <Loader size="md" />
                      <Text size="sm" c="dimmed">Loading P3 data...</Text>
                    </Stack>
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : p3Data.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={columns.length}>
                  <Center py="xl">
                    <Text size="sm" c="dimmed">No P3 data found for the selected filters.</Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            ) : (
              p3Data.map((row, index) => (
                <Table.Tr
                  key={row.Entry_ID || index}
                  style={{ cursor: enableRowClick ? 'pointer' : 'default' }}
                  onClick={enableRowClick ? () => handleRowClick(row) : undefined}
                  title={enableRowClick ? `Click to view details for device ${row.Device_ID}` : undefined}
                >
                  {columns.map((column) => (
                    <Table.Td
                      key={column.key}
                      style={{ width: column.width, padding: '8px', wordBreak: 'break-word', fontSize: 13 }}
                    >
                      {column.key === 'Signal_Strength' ? (
                        <GSMSignalBars strength={row[column.key]} />
                      ) : column.key === 'management_hierarchy' ? (
                        <ManagementHierarchy sden={row.sden} den={row.den} aen={row.aen} sse={row.sse} />
                      ) : column.key === 'grease_left' ? (
                        <GreaseLevel greaseLeft={parseFloat(formatCellValue(row[column.key], column.key, row))} />
                      ) : column.key === 'imsi_number' ? (
                        <Text size="xs" ff="monospace" c="dark">
                          {formatCellValue(row[column.key], column.key, row)}
                        </Text>
                      ) : column.key === 'Motor_Runs' || column.key === 'Train_Passed_Count' ? (
                        <Text fw={600} c="blue">
                          {formatCellValue(row[column.key], column.key, row)}
                        </Text>
                      ) : column.key === 'Device_Status' ? (
                        <DeviceStatusBadge status={row.Device_Status} minutesSinceLastData={row.Minutes_Since_Last_Data} />
                      ) : (
                        <Text fw={column.key === 'machine_id' ? 500 : 400} size="sm">
                          {formatCellValue(row[column.key], column.key, row)}
                        </Text>
                      )}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Pagination */}
      {p3Data.length > 0 && (
        <PaginationBar pagination={pagination} onPageChange={handlePageChange} />
      )}
    </Paper>
  );
};

export default P3DataTable;
