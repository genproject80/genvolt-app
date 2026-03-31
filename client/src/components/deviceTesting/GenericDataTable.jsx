import React, { useState, useEffect, useCallback } from 'react';
import { MagnifyingGlassIcon, ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { deviceTestingService } from '../../services/deviceTestingService';
import LoadingSpinner from '../common/LoadingSpinner';

const PAGE_SIZE = 100;

/**
 * Formats a cell value based on its column type.
 */
const formatCell = (value, col) => {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;

  if (col.type === 'json') {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    const preview = str.length > 120 ? str.slice(0, 120) + '…' : str;
    return (
      <span className="font-mono text-xs text-gray-600 break-all" title={str}>
        {preview}
      </span>
    );
  }

  if (col.type === 'datetime') {
    return <span className="whitespace-nowrap text-gray-700">{String(value).slice(0, 19).replace('T', ' ')}</span>;
  }

  if (col.type === 'boolean') {
    return value ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Yes</span>
    ) : (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">No</span>
    );
  }

  return <span>{String(value)}</span>;
};

/**
 * GenericDataTable - Reusable paginated table component driven by table config.
 * Props:
 *   tableKey   {string}  - The table_key from DeviceTesting_TableConfig
 *   onError    {fn}      - Callback receiving error messages
 */
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

  useEffect(() => {
    setPage(1);
  }, [tableKey, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Device ID…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); }}
              className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        {config?.is_exportable && (
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.field}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length || 1} className="px-4 py-12 text-center text-sm text-gray-500">
                    {search ? 'No records match your search.' : 'No records found.'}
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    {columns.map((col) => (
                      <td key={col.field} className="px-4 py-2.5 text-sm text-gray-900 align-top">
                        {formatCell(row[col.field], col)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>
            Showing {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} of{' '}
            {meta.total.toLocaleString()} records
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!meta.hasPrevious || loading}
              className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 rounded border border-gray-300 bg-white font-medium text-gray-700">
              {meta.page} / {meta.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={!meta.hasNext || loading}
              className="p-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {meta && meta.totalPages <= 1 && meta.total > 0 && (
        <div className="text-sm text-gray-500">
          {meta.total.toLocaleString()} record{meta.total !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default GenericDataTable;
