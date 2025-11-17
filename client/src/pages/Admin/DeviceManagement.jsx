import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { useDevice } from '../../context/DeviceContext';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import { useAuth } from '../../context/AuthContext';
import { clientService } from '../../services/clientService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AddDeviceModal from '../../components/modals/AddDeviceModal';
import EditDeviceModal from '../../components/modals/EditDeviceModal';
import DeleteDeviceModal from '../../components/modals/DeleteDeviceModal';
import TransferDeviceModal from '../../components/modals/TransferDeviceModal';
import DeviceDetailsModal from '../../components/modals/DeviceDetailsModal';

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
    canEditDevice,
    canRemoveDevice,
    canTransferDevice
  } = useDevicePermissions();

  const { user: currentUser } = useAuth();

  // Local state for filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(''); // New state for client filter
  const [clients, setClients] = useState([]); // New state for clients list
  const [loadingClients, setLoadingClients] = useState(false); // New state for loading clients
  const [currentPage, setCurrentPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);

  // Ref to prevent multiple concurrent API calls
  const isLoadingDevices = useRef(false);
  const hasInitialLoadCompleted = useRef(false);

  // Check if user has access
  const hasAccess = canViewDevice;

  // Load clients on component mount
  useEffect(() => {
    const loadClients = async () => {
      try {
        setLoadingClients(true);
        const response = await clientService.getDescendantClients();

        if (response && response.success) {
          let clientsData = [];

          if (response.data?.clients && Array.isArray(response.data.clients)) {
            clientsData = response.data.clients;
          } else if (response.data?.data && Array.isArray(response.data.data)) {
            clientsData = response.data.data;
          } else if (response.clients && Array.isArray(response.clients)) {
            clientsData = response.clients;
          } else if (Array.isArray(response.data)) {
            clientsData = response.data;
          }

          // Include all clients (user's own + descendants)
          setClients(clientsData);
        }
      } catch (err) {
        console.error('Failed to load clients:', err);
      } finally {
        setLoadingClients(false);
      }
    };

    if (hasAccess) {
      loadClients();
    }
  }, [hasAccess]);

  // Load devices with current filters - memoized to prevent recreation
  const loadDevices = useCallback(async () => {
    // Prevent multiple concurrent calls
    if (isLoadingDevices.current) {
      return;
    }

    try {
      isLoadingDevices.current = true;

      const options = {
        page: currentPage,
        limit: 10,
        sortBy: 'onboarding_date',
        sortOrder: 'desc'
      };

      // Add client_id filter if a specific client is selected (not "all")
      // When "all" is selected or no client is selected, don't add client_id filter
      // This will load all devices under the user's hierarchy
      if (selectedClientId && selectedClientId.trim() && selectedClientId !== 'all') {
        options.client_id = selectedClientId.trim();
      }

      // Only add non-empty filters
      if (searchTerm && searchTerm.trim()) {
        options.search = searchTerm.trim();
      }

      if (modelFilter && modelFilter.trim()) {
        options.Model = modelFilter.trim();
      }

      await getAllDevices(options);
    } catch (err) {
      console.error('🔧 DeviceManagement: Failed to load devices:', err);
    } finally {
      isLoadingDevices.current = false;
    }
  }, [currentPage, searchTerm, modelFilter, selectedClientId, getAllDevices]);

  // Initialize selectedClientId with "all" on mount
  // and load all devices under the user's hierarchy automatically
  useEffect(() => {
    if (hasAccess && currentUser && currentUser.client_id) {
      // Set default to "all" to show all devices in hierarchy
      setSelectedClientId('all');

      // Automatically load all devices under user's hierarchy on initial mount
      const loadInitialDevices = async () => {
        try {
          isLoadingDevices.current = true;
          const options = {
            page: 1,
            limit: 10,
            sortBy: 'onboarding_date',
            sortOrder: 'desc'
            // No client_id filter - loads all devices under user's hierarchy
          };
          await getAllDevices(options);
          hasInitialLoadCompleted.current = true;
        } catch (err) {
          console.error('Failed to load initial devices:', err);
        } finally {
          isLoadingDevices.current = false;
        }
      };

      loadInitialDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, currentUser]);

  // Load devices when page, search, or filter changes (after initial load)
  useEffect(() => {
    if (hasAccess && hasInitialLoadCompleted.current && !isLoadingDevices.current) {
      loadDevices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, searchTerm, modelFilter, selectedClientId]);

  // Load device stats only once on component mount
  useEffect(() => {
    if (hasAccess) {
      getDeviceStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess]);

  // Handle Show Device button click
  const handleShowDevices = () => {
    setCurrentPage(1); // Reset to first page
    loadDevices();
  };

  // Handle search
  const handleSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page
  };

  // Handle filter changes
  const handleModelFilter = (value) => {
    setModelFilter(value);
    setCurrentPage(1);
  };

  // Handle device actions
  const handleCreateDevice = () => {
    if (canOnboardDevice) {
      setShowAddModal(true);
    }
  };

  const handleEditDevice = (device) => {
    if (canEditDevice) {
      setSelectedDevice(device);
      setShowEditModal(true);
    }
  };

  const handleDeleteDevice = (device) => {
    if (canRemoveDevice) {
      setSelectedDevice(device);
      setShowDeleteModal(true);
    }
  };

  const handleTransferDevice = (device) => {
    if (canTransferDevice) {
      setSelectedDevice(device);
      setShowTransferModal(true);
    }
  };

  const handleViewDetails = (device) => {
    setSelectedDevice(device);
    setShowDetailsModal(true);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Permission check for entire page access
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <ExclamationTriangleIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-500">You don't have permission to view device information.</p>
        </div>
      </div>
    );
  }

  if (loading && devices.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Device Management</h2>
          <p className="text-sm text-gray-600 mt-1">Manage IoT devices and their configurations</p>
        </div>
        {canOnboardDevice && (
          <button
            onClick={handleCreateDevice}
            className="flex items-center px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            <PlusIcon className="w-5 h-5 mr-2" />
            Add Device
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={clearError}
                className="text-sm text-red-600 hover:text-red-500 underline mt-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Cards */}
      {deviceStats && deviceStats.summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Total Devices</p>
            <p className="text-2xl font-semibold text-gray-900">{deviceStats.summary.total_devices || 0}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Active Clients</p>
            <p className="text-2xl font-semibold text-gray-900">{deviceStats.summary.active_clients || 0}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Device Models</p>
            <p className="text-2xl font-semibold text-gray-900">{deviceStats.summary.unique_models || 0}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">Recent Onboardings</p>
            <p className="text-2xl font-semibold text-gray-900">{deviceStats.summary.recent_onboardings || 0}</p>
          </div>
        </div>
      )}

      {/* Client Filter, Search and Filter in One Row */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-end space-x-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Client
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              disabled={loadingClients}
            >
              <option value="">Select a client</option>
              <option value="all">All Clients</option>
              {clients.map(client => (
                <option key={client.client_id} value={client.client_id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              onClick={handleShowDevices}
              disabled={!selectedClientId || selectedClientId === '' || loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Show Devices
            </button>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Devices
            </label>
            <input
              type="text"
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div className="w-64">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter By Model
            </label>
            <input
              type="text"
              placeholder="Filter by model..."
              value={modelFilter}
              onChange={(e) => handleModelFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>
      </div>

      {/* Devices Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Device ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Model
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Machine ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Onboarding Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {devices.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                  {loading ? 'Loading devices...' : 'No devices found'}
                </td>
              </tr>
            ) : (
              devices.map((device) => (
                <tr key={device.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {device.device_id}
                    </div>
                    {device.channel_id && (
                      <div className="text-xs text-gray-500">Channel: {device.channel_id}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {device.Model ? (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {device.Model}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {device.machin_id || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {device.client_name ? (
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                        {device.client_name}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No Client</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(device.onboarding_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleViewDetails(device)}
                        className="text-gray-600 hover:text-gray-900 cursor-pointer"
                        title="View Details"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      {canEditDevice && (
                        <button
                          onClick={() => handleEditDevice(device)}
                          className="text-indigo-600 hover:text-indigo-900 cursor-pointer"
                          title="Edit Device"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      )}
                      {canTransferDevice && (
                        <button
                          onClick={() => handleTransferDevice(device)}
                          className="text-green-600 hover:text-green-900 cursor-pointer"
                          title="Transfer Device"
                        >
                          <ArrowsRightLeftIcon className="w-4 h-4" />
                        </button>
                      )}
                      {canRemoveDevice && (
                        <button
                          onClick={() => handleDeleteDevice(device)}
                          className="text-red-600 hover:text-red-900 cursor-pointer"
                          title="Delete Device"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                      {!canEditDevice && !canRemoveDevice && !canTransferDevice && (
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
      {pagination && pagination.total > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing{' '}
            <span className="font-medium">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>{' '}
            to{' '}
            <span className="font-medium">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>{' '}
            of <span className="font-medium">{pagination.total}</span> results
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(pagination.page - 1)}
              disabled={!pagination.hasPrev || loading}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-2 text-sm text-gray-700">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(pagination.page + 1)}
              disabled={!pagination.hasNext || loading}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddDeviceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          // Refresh devices list after successful creation
          loadDevices();
        }}
      />

      <EditDeviceModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedDevice(null);
        }}
        device={selectedDevice}
        onSuccess={() => {
          // Refresh devices list after successful update
          loadDevices();
        }}
      />

      <DeleteDeviceModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedDevice(null);
        }}
        device={selectedDevice}
        onSuccess={() => {
          // Refresh devices list after successful deletion
          loadDevices();
        }}
      />

      <TransferDeviceModal
        isOpen={showTransferModal}
        onClose={() => {
          setShowTransferModal(false);
          setSelectedDevice(null);
        }}
        device={selectedDevice}
        onSuccess={() => {
          // Refresh devices list after successful transfer
          loadDevices();
        }}
      />

      <DeviceDetailsModal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedDevice(null);
        }}
        device={selectedDevice}
      />
    </div>
  );
};

export default DeviceManagement;
