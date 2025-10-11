import React, { useState, useEffect, useCallback } from 'react';
import { useDevice } from '../../context/DeviceContext';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import { useClient } from '../../context/ClientContext';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AddDeviceModal from '../../components/modals/AddDeviceModal';
import EditDeviceModal from '../../components/modals/EditDeviceModal';
import DeleteDeviceModal from '../../components/modals/DeleteDeviceModal';
import TransferDeviceModal from '../../components/modals/TransferDeviceModal';
import { PlusIcon, PencilIcon, TrashIcon, ArrowRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const DeviceManagement = () => {
  const {
    devices,
    deviceStats,
    loading,
    error,
    pagination,
    getAllDevices,
    getDeviceStats,
    clearError
  } = useDevice();

  const {
    canViewDevice,
    canOnboardDevice,
    canRemoveDevice,
    canTransferDevice,
    loading: permissionsLoading
  } = useDevicePermissions();

  const { getAllClients, clients } = useClient();
  const { user } = useAuth();

  // Component state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortField, setSortField] = useState('onboarding_date');
  const [sortDirection, setSortDirection] = useState('desc');

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Permission check for page access
  if (permissionsLoading) {
    return <LoadingSpinner />;
  }

  if (!canViewDevice) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-500">You don't have permission to view device information.</p>
        </div>
      </div>
    );
  }

  // Initialize data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        console.log('Loading device management initial data...');

        // Test basic connectivity first
        try {
          const testResponse = await fetch('http://localhost:5001/api/devices', {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
              'Content-Type': 'application/json'
            }
          });
          console.log('Device API test response status:', testResponse.status);
          if (!testResponse.ok) {
            console.error('Device API test failed:', testResponse.status, testResponse.statusText);
          }
        } catch (testError) {
          console.error('Device API connectivity test failed:', testError);
        }

        await Promise.all([
          getAllDevices({
            page: currentPage,
            limit: pageSize,
            search: searchTerm,
            clientId: selectedClient,
            sortField,
            sortDirection
          }),
          getDeviceStats(),
          getAllClients()
        ]);
        console.log('Device management data loaded successfully');
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, []);

  // Handle search and filters
  const handleFiltersChange = useCallback(async () => {
    try {
      await getAllDevices({
        page: 1,
        limit: pageSize,
        search: searchTerm,
        clientId: selectedClient,
        sortField,
        sortDirection
      });
      setCurrentPage(1);
    } catch (error) {
      console.error('Failed to apply filters:', error);
    }
  }, [searchTerm, selectedClient, pageSize, sortField, sortDirection, getAllDevices]);

  useEffect(() => {
    const timeoutId = setTimeout(handleFiltersChange, 300);
    return () => clearTimeout(timeoutId);
  }, [handleFiltersChange]);

  // Modal handlers
  const handleAddDevice = () => {
    if (!canOnboardDevice) return;
    setAddModalOpen(true);
  };

  const handleEditDevice = (device) => {
    if (!canOnboardDevice) return;
    setSelectedDevice(device);
    setEditModalOpen(true);
  };

  const handleDeleteDevice = (device) => {
    if (!canRemoveDevice) return;
    setSelectedDevice(device);
    setDeleteModalOpen(true);
  };

  const handleTransferDevice = (device) => {
    if (!canTransferDevice) return;
    setSelectedDevice(device);
    setTransferModalOpen(true);
  };

  const handleModalClose = () => {
    setAddModalOpen(false);
    setEditModalOpen(false);
    setDeleteModalOpen(false);
    setTransferModalOpen(false);
    setSelectedDevice(null);
  };

  const handleOperationSuccess = () => {
    handleModalClose();
    // Refresh data
    getAllDevices({
      page: currentPage,
      limit: pageSize,
      search: searchTerm,
      clientId: selectedClient,
      sortField,
      sortDirection
    });
    getDeviceStats();
  };

  // Pagination handlers
  const handlePageChange = (page) => {
    setCurrentPage(page);
    getAllDevices({
      page,
      limit: pageSize,
      search: searchTerm,
      clientId: selectedClient,
      sortField,
      sortDirection
    });
  };

  // Sort handler
  const handleSort = (field) => {
    const direction = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(direction);
  };

  if (loading && devices.length === 0) {
    return <LoadingSpinner />;
  }

  // Show error if there's an API error
  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error Loading Device Management</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <div className="mt-4">
                <button
                  onClick={() => {
                    clearError();
                    // Try to reload data
                    getAllDevices({
                      page: currentPage,
                      limit: pageSize,
                      search: searchTerm,
                      clientId: selectedClient,
                      sortField,
                      sortDirection
                    });
                    getDeviceStats();
                    getAllClients();
                  }}
                  className="bg-red-100 px-3 py-2 rounded-md text-red-800 text-sm hover:bg-red-200"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Device Management</h2>
          <p className="text-sm text-gray-600 mt-1">Manage IoT devices and their configurations</p>
        </div>
        <div className="flex space-x-2">
          {canOnboardDevice && ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(user?.role) && (
            <button
              onClick={handleAddDevice}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Device
            </button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Devices</p>
              <p className="text-2xl font-semibold text-gray-900">
                {deviceStats.totalDevices || 0}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Recent Onboardings</p>
              <p className="text-2xl font-semibold text-gray-900">
                {deviceStats.recentOnboardings || 0}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Clients</p>
              <p className="text-2xl font-semibold text-gray-900">
                {deviceStats.activeClients || 0}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Data Tables</p>
              <p className="text-2xl font-semibold text-gray-900">
                {deviceStats.dataTables || 0}
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
              Search Devices
            </label>
            <div className="relative">
              <input
                type="text"
                id="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by device ID, model, or machine ID..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-2.5" />
            </div>
          </div>

          <div>
            <label htmlFor="client" className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Client
            </label>
            <select
              id="client"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Clients</option>
              {clients.map((client) => (
                <option key={client.client_id} value={client.client_id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pageSize" className="block text-sm font-medium text-gray-700 mb-1">
              Items per Page
            </label>
            <select
              id="pageSize"
              value={pageSize}
              onChange={(e) => setPageSize(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedClient('');
                setSortField('onboarding_date');
                setSortDirection('desc');
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <div className="ml-auto pl-3">
              <button
                onClick={clearError}
                className="text-red-400 hover:text-red-600"
              >
                <span className="sr-only">Dismiss</span>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Devices Table */}
      <div className="bg-white shadow-sm rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('device_id')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Device ID</span>
                    {sortField === 'device_id' && (
                      <svg className={`h-4 w-4 ${sortDirection === 'asc' ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Model
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Machine ID
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Client
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Channel ID
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('onboarding_date')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Onboarded</span>
                    {sortField === 'onboarding_date' && (
                      <svg className={`h-4 w-4 ${sortDirection === 'asc' ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="text-gray-500">
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">No devices found</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {searchTerm || selectedClient ? 'Try adjusting your search or filter criteria.' : 'Get started by adding your first device.'}
                      </p>
                      {canOnboardDevice && ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(user?.role) && !searchTerm && !selectedClient && (
                        <div className="mt-6">
                          <button
                            onClick={handleAddDevice}
                            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                          >
                            <PlusIcon className="h-4 w-4 mr-2" />
                            Add Device
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                devices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{device.device_id}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{device.Model || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{device.machin_id || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{device.client_name || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{device.channel_id || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {device.onboarding_date ? new Date(device.onboarding_date).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {canOnboardDevice && (
                          <button
                            onClick={() => handleEditDevice(device)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit Device"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                        )}
                        {canTransferDevice && (
                          <button
                            onClick={() => handleTransferDevice(device)}
                            className="text-purple-600 hover:text-purple-900"
                            title="Transfer Device"
                          >
                            <ArrowRightIcon className="h-4 w-4" />
                          </button>
                        )}
                        {canRemoveDevice && (
                          <button
                            onClick={() => handleDeleteDevice(device)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete Device"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                        {!canOnboardDevice && !canRemoveDevice && !canTransferDevice && (
                          <span className="text-gray-400 text-xs">View only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between items-center">
              <div className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">
                  {((pagination.currentPage - 1) * pagination.pageSize) + 1}
                </span>{' '}
                to{' '}
                <span className="font-medium">
                  {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalCount)}
                </span>{' '}
                of{' '}
                <span className="font-medium">{pagination.totalCount}</span>{' '}
                results
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={!pagination.hasPrevious}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                {/* Page Numbers */}
                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  const pageNumber = pagination.currentPage - 2 + i;
                  if (pageNumber < 1 || pageNumber > pagination.totalPages) return null;

                  return (
                    <button
                      key={pageNumber}
                      onClick={() => handlePageChange(pageNumber)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md ${
                        pageNumber === pagination.currentPage
                          ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}

                <button
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={!pagination.hasNext}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {loading && devices.length > 0 && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <LoadingSpinner />
            <p className="mt-2 text-sm text-gray-600 text-center">Loading devices...</p>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddDeviceModal
        isOpen={addModalOpen}
        onClose={handleModalClose}
        onSuccess={handleOperationSuccess}
      />

      <EditDeviceModal
        isOpen={editModalOpen}
        onClose={handleModalClose}
        onSuccess={handleOperationSuccess}
        device={selectedDevice}
      />

      <DeleteDeviceModal
        isOpen={deleteModalOpen}
        onClose={handleModalClose}
        onSuccess={handleOperationSuccess}
        device={selectedDevice}
      />

      <TransferDeviceModal
        isOpen={transferModalOpen}
        onClose={handleModalClose}
        onSuccess={handleOperationSuccess}
        device={selectedDevice}
      />
    </div>
  );
};

export default DeviceManagement;