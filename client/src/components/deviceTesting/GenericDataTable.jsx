import React, { useState, useEffect, useCallback } from 'react';
import { IconSearch, IconDownload } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Loader, Text, Badge, Group, Pagination, Code,
} from '@mantine/core';
import { deviceTestingService } from '../../services/deviceTestingService';

const PAGE_SIZE = 100;

const formatCell = (value, col) => {
  if (value === null || value === undefined) return <Text component="span" size="sm" c="dimmed">—</Text>;

  if (col.type === 'json') {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    const preview = str.length > 120 ? str.slice(0, 120) + '…' : str;
    return <Code fz="xs" title={str} style={{ wordBreak: 'break-all' }}>{preview}</Code>;
  }

  if (col.type === 'datetime') {
    return <Text size="sm" style={{ whiteSpace: 'nowrap' }}>{String(value).slice(0, 19).replace('T', ' ')}</Text>;
  }

  if (col.type === 'boolean') {
    return (
      <Badge color={value ? 'green' : 'gray'} variant="light" size="sm">
        {value ? 'Yes' : 'No'}
      </Badge>
    );
  }

  return <Text size="sm">{String(value)}</Text>;
};

const GenericDataTable = ({ tableKey, onError }) => {
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [meta, setMeta] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tableKey) return;
    setLoading(true);
    try {
      const result = await deviceTestingService.getTableData(tableKey, {
        page,
        limit: PAGE_SIZE,
        ...(search ? { search } : {}),
      });
      setData(result.data || []);
      setMeta(result.meta);
      setConfig(result.config);
      setColumns(result.config?.columns || []);
      onError?.(null);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to load data';
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }, [tableKey, page, search]);

  useEffect(() => { setPage(1); }, [tableKey, search]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await deviceTestingService.exportTableData(tableKey, search ? { search } : {});
    } catch (err) {
      onError?.(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const rows = data.map((row, idx) => (
    <Table.Tr key={idx}>
      {columns.map((col) => (
        <Table.Td key={col.field}>{formatCell(row[col.field], col)}</Table.Td>
      ))}
    </Table.Tr>
  ));

  const startRecord = meta ? ((meta.page - 1) * meta.limit) + 1 : 0;
  const endRecord   = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Device ID…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button type="submit" className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
            Search
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }}
              className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Clear
            </button>
          )}
        </form>

        {config?.is_exportable && (
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50">
            <IconDownload className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : data.length === 0 ? (
            <Center py="xl">
              <Text size="sm" c="dimmed">
                {search ? 'No records match your search.' : 'No records found.'}
              </Text>
            </Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  {columns.map((col) => (
                    <Table.Th key={col.field}>{col.header}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>

        {meta && meta.totalPages > 1 && (
          <Group justify="space-between" align="center" px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="sm" c="dimmed">
              Showing {startRecord}–{endRecord} of {meta.total.toLocaleString()} records
            </Text>
            <Pagination total={meta.totalPages} value={page} onChange={setPage} size="sm" />
          </Group>
        )}
        {meta && meta.totalPages <= 1 && meta.total > 0 && (
          <Group px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="sm" c="dimmed">{meta.total.toLocaleString()} record{meta.total !== 1 ? 's' : ''}</Text>
          </Group>
        )}
      </Paper>
    </div>
  );
};

export default GenericDataTable;
