import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import hkmiTableService from '../../services/hkmiTableService';
import LoadingSpinner from '../common/LoadingSpinner';

const Pagination = ({ pagination, onPageChange }) => {
  const { page, totalPages, hasNext, hasPrevious, total, limit } = pagination;

  const getVisiblePages = () => {
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const visiblePages = getVisiblePages();
  const startRecord = (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrevious}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{startRecord}</span> to{' '}
            <span className="font-medium">{endRecord}</span> of{' '}
            <span className="font-medium">{total}</span> results
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={!hasPrevious}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Previous</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
              </svg>
            </button>

            {visiblePages.map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                  pageNum === page
                    ? 'z-10 bg-green-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600'
                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                }`}
              >
                {pageNum}
              </button>
            ))}

            <button
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNext}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Next</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
};

const HKMITable = () => {
  const { user } = useAuth();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  });

  // Upload related state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadResults, setUploadResults] = useState(null);

  // Fetch data
  const fetchData = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await hkmiTableService.getHKMITableData({
        page: params.page || pagination.page,
        limit: params.limit || pagination.limit,
        search: params.search !== undefined ? params.search : searchTerm,
        sort_field: params.sort_field || sortField,
        sort_order: params.sort_order || sortOrder
      });

      if (response.success) {
        setData(response.data);
        setPagination({
          page: response.meta.page,
          limit: response.meta.limit,
          total: response.meta.total,
          totalPages: response.meta.totalPages,
          hasNext: response.meta.hasNext,
          hasPrevious: response.meta.hasPrevious
        });
      }
    } catch (err) {
      console.error('Error fetching HKMI table data:', err);
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, searchTerm, sortField, sortOrder]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle search
  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    await fetchData({ search: searchTerm, page: 1 });
  }, [searchTerm, fetchData]);

  // Handle sort
  const handleSort = useCallback(async (field) => {
    const newSortOrder = field === sortField && sortOrder === 'DESC' ? 'ASC' : 'DESC';
    setSortField(field);
    setSortOrder(newSortOrder);
    await fetchData({ sort_field: field, sort_order: newSortOrder, page: 1 });
  }, [sortField, sortOrder, fetchData]);

  // Handle pagination
  const handlePageChange = useCallback(async (newPage) => {
    await fetchData({ page: newPage });
  }, [fetchData]);

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];
      const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      const allowedExtensions = ['.csv', '.xls', '.xlsx'];

      if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
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
    }
  };

  // Handle file upload
  const handleFileUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select a file first.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadResults(null);

    try {
      const response = await hkmiTableService.uploadHKMIFile(selectedFile);

      if (response.success) {
        setUploadResults(response.data);
        setSelectedFile(null);

        // Refresh the table data if any rows were updated
        if (response.data.successful_count > 0) {
          await fetchData();
        }
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError(err.response?.data?.message || err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  // Clear upload results
  const clearUploadResults = () => {
    setUploadResults(null);
    setUploadError(null);
    setSelectedFile(null);
  };

  // Format date - parse without timezone conversion
  const formatDate = (dateString) => {
    if (!dateString) return '-';

    try {
      // Extract date parts from SQL date string (YYYY-MM-DD)
      const dateStr = String(dateString).split('T')[0]; // Handle both "2024-11-20" and "2024-11-20T00:00:00"

      // Debug logging
      console.log('Raw date string:', dateString);
      console.log('Extracted date string:', dateStr);

      const [year, month, day] = dateStr.split('-').map(num => parseInt(num, 10));

      console.log('Parsed Y/M/D:', year, month, day);

      // Create date using local timezone (month is 0-indexed)
      const date = new Date(year, month - 1, day);

      const formatted = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });

      console.log('Formatted date:', formatted);

      return formatted;
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString;
    }
  };

  // Table columns matching database structure
  const columns = [
    { key: 'machine_id', label: 'Machine ID', sortable: true },
    { key: 'sden', label: 'SDEN', sortable: true },
    { key: 'den', label: 'DEN', sortable: true },
    { key: 'aen', label: 'AEN', sortable: true },
    { key: 'sse', label: 'SSE', sortable: true },
    { key: 'div_rly', label: 'Division/ Railway', sortable: true },
    { key: 'section', label: 'Section', sortable: true },
    { key: 'curve_number', label: 'Curve Number', sortable: true },
    { key: 'line', label: 'Line', sortable: true },
    { key: 'grease_left', label: 'Grease Left (kg)', sortable: true },
    { key: 'last_service_date', label: 'Last Service Date', sortable: true }
  ];

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

        {/* Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <svg
                className="h-8 w-8 text-gray-400"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
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
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="sr-only"
                        onChange={handleFileSelect}
                        disabled={uploading}
                      />
                    </label>
                    <p className="text-xs text-gray-500">Up to 10MB</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex space-x-2">
              {selectedFile && (
                <>
                  <button
                    type="button"
                    onClick={clearUploadResults}
                    disabled={uploading}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleFileUpload}
                    disabled={uploading}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-1.5" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Upload
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Upload Error */}
        {uploadError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="ml-3">
                <p className="text-sm text-red-800">{uploadError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Results */}
        {uploadResults && (
          <div className="mt-6 space-y-4">
            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-start">
                <svg className="h-5 w-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-blue-800">Upload Summary</h4>
                  <div className="mt-2 text-sm text-blue-700">
                    <p>Total rows processed: <span className="font-semibold">{uploadResults.total_rows}</span></p>
                    <p className="text-green-700">Successful updates: <span className="font-semibold">{uploadResults.successful_count}</span></p>
                    <p className="text-red-700">Rejected rows: <span className="font-semibold">{uploadResults.rejected_count}</span></p>
                  </div>
                </div>
                <button
                  onClick={clearUploadResults}
                  className="ml-3 text-blue-400 hover:text-blue-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Rejected Rows */}
            {uploadResults.rejected_count > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <h4 className="text-sm font-medium text-red-800 mb-3">Rejected Rows ({uploadResults.rejected_count})</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-red-200">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">Row #</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">Device ID</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">Machine ID</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">Grease Left</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">Last Service Date</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-red-700">Rejection Reasons</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-200">
                      {uploadResults.rejected_rows.map((row, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="px-3 py-2 text-xs text-gray-900">{row.row_number}</td>
                          <td className="px-3 py-2 text-xs text-gray-900">{row.device_id || '-'}</td>
                          <td className="px-3 py-2 text-xs text-gray-900">{row.machine_id || '-'}</td>
                          <td className="px-3 py-2 text-xs text-gray-900">{row.grease_left || '-'}</td>
                          <td className="px-3 py-2 text-xs text-gray-900">{row.last_service_date || '-'}</td>
                          <td className="px-3 py-2 text-xs text-red-700">
                            <ul className="list-disc list-inside">
                              {row.reasons.map((reason, ridx) => (
                                <li key={ridx}>{reason}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Table Header with Search */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Configuration Data</h3>

            {/* Search */}
            <form onSubmit={handleSearch} className="flex items-center space-x-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="block w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </form>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center p-3 bg-red-50 border border-red-200 rounded-md">
              <svg className="h-5 w-5 text-red-400 mr-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide ${
                      column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                    }`}
                    onClick={column.sortable ? () => handleSort(column.key) : undefined}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{column.label}</span>
                      {column.sortable && (
                        <div className="flex flex-col">
                          <svg
                            className={`w-3 h-3 ${
                              sortField === column.key && sortOrder === 'ASC'
                                ? 'text-green-600'
                                : 'text-gray-300'
                            }`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                          </svg>
                          <svg
                            className={`w-3 h-3 -mt-1 ${
                              sortField === column.key && sortOrder === 'DESC'
                                ? 'text-green-600'
                                : 'text-gray-300'
                            }`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center">
                    <LoadingSpinner size="lg" />
                    <p className="mt-4 text-sm text-gray-500">Loading data...</p>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-12 text-center text-sm text-gray-500">
                    No data found.
                  </td>
                </tr>
              ) : (
                data.map((row, index) => (
                  <tr key={row.id || index} className="hover:bg-gray-50">
                    {columns.map((column) => (
                      <td key={column.key} className="px-3 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {column.key === 'grease_left' && row[column.key]
                          ? parseFloat(row[column.key]).toFixed(1)
                          : column.key === 'last_service_date' || column.key === 'created_at' || column.key === 'updated_at'
                          ? formatDate(row[column.key])
                          : row[column.key] || '-'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data.length > 0 && (
          <Pagination
            pagination={pagination}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
};

export default HKMITable;
