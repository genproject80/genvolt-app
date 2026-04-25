import React, { useState, useEffect, useCallback } from 'react';
import {
  Stack, Group, Box, Text, Title, Badge, Alert, Table, Loader, Center,
  Paper, ScrollArea, Pagination, Select, Code, ActionIcon, Tooltip,
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconAlertCircle, IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import { getAuditLogs, getActivityTypes } from '../../services/auditService';

const BADGE_COLORS = {
  AUTHENTICATION:    'blue',
  USER_MANAGEMENT:   'violet',
  CLIENT_MANAGEMENT: 'indigo',
  DEVICE_MANAGEMENT: 'cyan',
  DATA_ACCESS:       'green',
  CONFIGURATION:     'yellow',
  SECURITY:          'red',
  SYSTEM:            'gray',
};

const PAGE_SIZE = 50;

const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const getUserDisplay = (log) => {
  if (log.first_name || log.last_name) {
    return `${log.first_name ?? ''} ${log.last_name ?? ''}`.trim();
  }
  return log.email || log.user_name || `User #${log.user_id}`;
};

const prettyDetails = (raw) => {
  try { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch { return raw; }
};

export default function AuditLogs() {
  const [logs, setLogs]                   = useState([]);
  const [pagination, setPagination]       = useState(null);
  const [activityTypes, setActivityTypes] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [expandedRow, setExpandedRow]     = useState(null);

  const [activityType, setActivityType] = useState(null);
  const [startDate, setStartDate]       = useState(null);
  const [endDate, setEndDate]           = useState(null);
  const [page, setPage]                 = useState(1);

  const load = useCallback(async (currentPage, filters) => {
    setLoading(true);
    setError('');
    try {
      const params = { page: currentPage, limit: PAGE_SIZE };
      if (filters.activityType) params.activity_type = filters.activityType;
      if (filters.startDate)    params.start_date    = new Date(filters.startDate).toISOString();
      if (filters.endDate)      params.end_date      = new Date(filters.endDate).toISOString();

      const result = await getAuditLogs(params);
      setLogs(result.data || []);
      setPagination(result.pagination || null);
    } catch (err) {
      setError(err?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    getActivityTypes()
      .then((types) => setActivityTypes((types || []).map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load(page, { activityType, startDate, endDate });
  }, [load, page, activityType, startDate, endDate]);

  const handleFilterChange = (setter) => (value) => {
    setPage(1);
    setter(value);
  };

  const clearFilters = () => {
    setPage(1);
    setActivityType(null);
    setStartDate(null);
    setEndDate(null);
  };

  const hasFilters = activityType || startDate || endDate;

  const rows = logs.map((log) => (
    <React.Fragment key={log.audit_id}>
      <Table.Tr>
        <Table.Td>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {formatDate(log.created_at)}
          </Text>
        </Table.Td>
        <Table.Td>
          <Text size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>{getUserDisplay(log)}</Text>
          {log.email && (log.first_name || log.last_name) && (
            <Text size="xs" c="dimmed">{log.email}</Text>
          )}
        </Table.Td>
        <Table.Td style={{ whiteSpace: 'nowrap' }}>
          <Badge
            color={BADGE_COLORS[log.activity_type] || 'gray'}
            variant="light"
            size="sm"
            tt="none"
          >
            {log.activity_type?.replace(/_/g, ' ')}
          </Badge>
        </Table.Td>
        <Table.Td style={{ whiteSpace: 'nowrap' }}>
          <Code fz="xs">{log.action}</Code>
        </Table.Td>
        <Table.Td style={{ maxWidth: 260 }}>
          <Text size="sm" c="dimmed" truncate="end">{log.message}</Text>
        </Table.Td>
        <Table.Td style={{ whiteSpace: 'nowrap' }}>
          <Text size="xs" c="dimmed">
            {log.target_type ? `${log.target_type}${log.target_id ? ` #${log.target_id}` : ''}` : '—'}
          </Text>
        </Table.Td>
        <Table.Td style={{ whiteSpace: 'nowrap' }}>
          <Code fz="xs" c="dimmed">{log.ip_address || '—'}</Code>
        </Table.Td>
        <Table.Td>
          {log.details && (
            <Tooltip label={expandedRow === log.audit_id ? 'Hide details' : 'Show details'} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => setExpandedRow(expandedRow === log.audit_id ? null : log.audit_id)}
              >
                {expandedRow === log.audit_id
                  ? <IconChevronUp size={14} />
                  : <IconChevronDown size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </Table.Td>
      </Table.Tr>
      {expandedRow === log.audit_id && log.details && (
        <Table.Tr>
          <Table.Td colSpan={8} p={0}>
            <Box bg="gray.0" p="sm">
              <Code block fz="xs" style={{ maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {prettyDetails(log.details)}
              </Code>
            </Box>
          </Table.Td>
        </Table.Tr>
      )}
    </React.Fragment>
  ));

  return (
    <Stack gap="lg">
      {/* Header */}
      <Box>
        <Title order={2}>Audit Logs</Title>
        <Text size="sm" c="dimmed" mt={4}>
          View all audited system activity. Each row represents an action performed by a user.
        </Text>
      </Box>

      {/* Filters */}
      <Paper withBorder radius="md" p="md">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Select
            label="Activity Type"
            placeholder="All types"
            data={activityTypes}
            value={activityType}
            onChange={handleFilterChange(setActivityType)}
            clearable
            style={{ minWidth: 200 }}
          />
          <DateTimePicker
            label="From"
            placeholder="Start date"
            value={startDate}
            onChange={handleFilterChange(setStartDate)}
            clearable
            style={{ minWidth: 200 }}
          />
          <DateTimePicker
            label="To"
            placeholder="End date"
            value={endDate}
            onChange={handleFilterChange(setEndDate)}
            clearable
            style={{ minWidth: 200 }}
          />
          {hasFilters && (
            <Tooltip label="Clear all filters" withArrow>
              <ActionIcon variant="subtle" color="gray" size="lg" onClick={clearFilters} mb={1}>
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Paper>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          {error}
        </Alert>
      )}

      {/* Table */}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : logs.length === 0 ? (
            <Center py="xl">
              <Text size="sm" c="dimmed">No audit records found.</Text>
            </Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Activity</Table.Th>
                  <Table.Th>Action</Table.Th>
                  <Table.Th>Message</Table.Th>
                  <Table.Th>Target</Table.Th>
                  <Table.Th>IP</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Paper>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} records
          </Text>
          <Pagination
            total={pagination.totalPages}
            value={page}
            onChange={setPage}
            size="sm"
          />
        </Group>
      )}
    </Stack>
  );
}
