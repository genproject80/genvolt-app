import React, { useState, useEffect, useCallback } from 'react';
import { IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Loader, Text, Group, Pagination,
} from '@mantine/core';
import { useAuth } from '../../context/AuthContext';
import hkmiTableService from '../../services/hkmiTableService';
import LoadingSpinner from '../common/LoadingSpinner';

const columns = [
  { key: 'machine_id',       label: 'Machine ID',        sortable: true },
  { key: 'sden',             label: 'SDEN',              sortable: true },
  { key: 'den',              label: 'DEN',               sortable: true },
  { key: 'aen',              label: 'AEN',               sortable: true },
  { key: 'sse',              label: 'SSE',               sortable: true },
  { key: 'div_rly',          label: 'Division/ Railway', sortable: true },
  { key: 'section',          label: 'Section',           sortable: true },
  { key: 'curve_number',     label: 'Curve Number',      sortable: true },
  { key: 'line',             label: 'Line',              sortable: true },
  { key: 'grease_left',      label: 'Grease Left (kg)',  sortable: true },
  { key: 'last_service_date', label: 'Last Service Date', sortable: true },
];

const HKMITable = () => {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrevious: false });

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadResults, setUploadResults] = useState(null);

  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await hkmiTableService.getHKMITableData({
        page: params.page || pagination.page,
        limit: params.limit || pagination.limit,
        search: params.search !== undefined ? params.search : searchTerm,
        sort_field: params.sort_field || sortField,
        sort_order: params.sort_order || sortOrder,
      });

      if (response.success) {
        setData(response.data);
        setPagination({
          page: response.meta.page,
          limit: response.meta.limit,
          total: response.meta.total,
          totalPages: response.meta.totalPages,
          hasNext: response.meta.hasNext,
          hasPrevious: response.meta.hasPrevious,
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, searchTerm, sortField, sortOrder]);

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    await fetchData({ search: searchTerm, page: 1 });
  }, [searchTerm, fetchData]);

  const handleSort = useCallback(async (field) => {
    const newSortOrder = field === sortField && sortOrder === 'DESC' ? 'ASC' : 'DESC';
    setSortField(field);
    setSortOrder(newSortOrder);
    await fetchData({ sort_field: field, sort_order: newSortOrder, page: 1 });
  }, [sortField, sortOrder, fetchData]);

  const handlePageChange = useCallback(async (newPage) => {
    await fetchData({ page: newPage });
  }, [fetchData]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowedExtensions = ['.csv', '.xls', '.xlsx'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!allowedExtensions.includes(fileExtension)) {
      setUploadError('Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.');
      setSelectedFile(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds 10MB limit.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setUploadError(null);
    setUploadResults(null);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) { setUploadError('Please select a file first.'); return; }
    setUploading(true);
    setUploadError(null);
    setUploadResults(null);
    try {
      const response = await hkmiTableService.uploadHKMIFile(selectedFile);
      if (response.success) {
        setUploadResults(response.data);
        setSelectedFile(null);
        if (response.data.successful_count > 0) await fetchData();
      }
    } catch (err) {
      setUploadError(err.response?.data?.message || err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const clearUploadResults = () => { setUploadResults(null); setUploadError(null); setSelectedFile(null); };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const dateStr = String(dateString).split('T')[0];
      const [year, month, day] = dateStr.split('-').map(num => parseInt(num, 10));
      return new Date(year, month - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return dateString; }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <IconChevronDown size={12} style={{ opacity: 0.3 }} />;
    return sortOrder === 'ASC' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />;
  };

  const startRecord = (pagination.page - 1) * pagination.limit + 1;
  const endRecord   = Math.min(pagination.page * pagination.limit, pagination.total);

  const rows = data.map((row, index) => (
    <Table.Tr key={row.id || index}>
      {columns.map((col) => (
        <Table.Td key={col.key}>
          <Text size="sm">
            {col.key === 'grease_left' && row[col.key]
              ? parseFloat(row[col.key]).toFixed(1)
              : col.key === 'last_service_date' || col.key === 'created_at' || col.key === 'updated_at'
              ? formatDate(row[col.key])
              : row[col.key] || '-'}
          </Text>
        </Table.Td>
      ))}
    </Table.Tr>
  ));

  const rejectedRows = uploadResults?.rejected_rows?.map((row, idx) => (
    <Table.Tr key={idx}>
      <Table.Td><Text size="xs">{row.row_number}</Text></Table.Td>
      <Table.Td><Text size="xs">{row.device_id || '-'}</Text></Table.Td>
      <Table.Td><Text size="xs">{row.machine_id || '-'}</Text></Table.Td>
      <Table.Td><Text size="xs">{row.grease_left || '-'}</Text></Table.Td>
      <Table.Td><Text size="xs">{row.last_service_date || '-'}</Text></Table.Td>
      <Table.Td>
        <ul className="list-disc list-inside">
          {row.reasons.map((reason, ridx) => (
            <li key={ridx} className="text-xs text-red-700">{reason}</li>
          ))}
        </ul>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      {/* Upload Feature */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Upload Configuration</h3>
            <p className="mt-1 text-xs text-gray-500">
              Required columns (exact names): <span className="font-mono font-semibold">device_id, machine_id, grease_left, last_service_date</span>
            </p>
          </div>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg className="h-8 w-8 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                {selectedFile ? (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">{selectedFile.name}</span>
                    <span className="text-gray-400 text-xs">({(selectedFile.size / 1024).toFixed(2)} KB)</span>
                  </div>
                ) : (
                  <>
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <span className="text-sm font-medium text-green-600 hover:text-green-700">Select CSV or Excel file</span>
                      <input id="file-upload" name="file-upload" type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={handleFileSelect} disabled={uploading} />
                    </label>
                    <p className="text-xs text-gray-500">Up to 10MB</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex space-x-2">
              {selectedFile && (
                <>
                  <button type="button" onClick={clearUploadResults} disabled={uploading}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
                    Clear
                  </button>
                  <button type="button" onClick={handleFileUpload} disabled={uploading}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                    {uploading ? <><LoadingSpinner size="sm" className="mr-1.5" />Uploading...</> : 'Upload'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {uploadError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{uploadError}</p>
          </div>
        )}

        {uploadResults && (
          <div className="mt-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 flex items-start justify-between">
              <div>
                <h4 className="text-sm font-medium text-blue-800">Upload Summary</h4>
                <div className="mt-2 text-sm">
                  <p className="text-blue-700">Total rows: <span className="font-semibold">{uploadResults.total_rows}</span></p>
                  <p className="text-green-700">Successful: <span className="font-semibold">{uploadResults.successful_count}</span></p>
                  <p className="text-red-700">Rejected: <span className="font-semibold">{uploadResults.rejected_count}</span></p>
                </div>
              </div>
              <button onClick={clearUploadResults} className="text-blue-400 hover:text-blue-600">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {uploadResults.rejected_count > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <h4 className="text-sm font-medium text-red-800 mb-3">Rejected Rows ({uploadResults.rejected_count})</h4>
                <Paper withBorder radius="sm" style={{ overflow: 'hidden' }}>
                  <ScrollArea>
                    <Table fz="xs" verticalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Row #</Table.Th>
                          <Table.Th>Device ID</Table.Th>
                          <Table.Th>Machine ID</Table.Th>
                          <Table.Th>Grease Left</Table.Th>
                          <Table.Th>Last Service Date</Table.Th>
                          <Table.Th>Rejection Reasons</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>{rejectedRows}</Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Table */}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Configuration Data</h3>
          <form onSubmit={handleSearch} className="flex items-center space-x-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search..."
              className="block w-48 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
            />
            <button type="submit" disabled={loading}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </form>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border-b border-red-200">
            <Text size="sm" c="red">{error}</Text>
          </div>
        )}

        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : data.length === 0 ? (
            <Center py="xl"><Text size="sm" c="dimmed">No data found.</Text></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  {columns.map((col) => (
                    <Table.Th
                      key={col.key}
                      style={col.sortable ? { cursor: 'pointer', userSelect: 'none' } : {}}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    >
                      <Group gap={4} wrap="nowrap">
                        <span>{col.label}</span>
                        {col.sortable && <SortIcon field={col.key} />}
                      </Group>
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>

        {data.length > 0 && (
          <Group justify="space-between" align="center" px="md" py="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Text size="sm" c="dimmed">
              Showing {startRecord}–{endRecord} of {pagination.total} results
            </Text>
            <Pagination total={pagination.totalPages} value={pagination.page} onChange={handlePageChange} size="sm" />
          </Group>
        )}
      </Paper>
    </div>
  );
};

export default HKMITable;
