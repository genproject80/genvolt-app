import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconPlus, IconPencil, IconTrash, IconAlertTriangle, IconArrowsRightLeft,
  IconCircleCheck, IconBan, IconRefresh, IconPlayerPause, IconPlayerPlay,
} from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Pagination, Center, Loader, Text, Group, Badge, ActionIcon, Tooltip,
} from '@mantine/core';
import deviceService from '../../services/deviceService';
import { getActiveInventory } from '../../services/inventoryService';
import { useDevice } from '../../context/DeviceContext';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { useFeatureFlags } from '../../context/FeatureFlagContext';
import { clientService } from '../../services/clientService';
import SubscribePlanModal from '../../components/modals/SubscribePlanModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import AddDeviceModal from '../../components/modals/AddDeviceModal';
import EditDeviceModal from '../../components/modals/EditDeviceModal';
import DeleteDeviceModal from '../../components/modals/DeleteDeviceModal';
import TransferDeviceModal from '../../components/modals/TransferDeviceModal';
import DeviceDetailsModal from '../../components/modals/DeviceDetailsModal';
import ActivateDeviceModal from '../../components/modals/ActivateDeviceModal';
import DeactivateDeviceModal from '../../components/modals/DeactivateDeviceModal';
import SearchableSelect from '../../components/common/SearchableSelect';

const DeviceManagement = () => {
  const {
    devices, deviceStats, loading, error, pagination,
    getAllDevices, getDeviceStats, getPendingDevices, reactivateDevice, clearError
  } = useDevice();

  const { canViewDevice, canOnboardDevice, canEditDevice, canRemoveDevice, canTransferDevice } = useDevicePermissions();
  const { user: currentUser } = useAuth();
  const { isActive, isGrace, subscription } = useSubscription();
  const { isPaymentsEnabled } = useFeatureFlags();

  const [searchTerm, setSearchTerm]                   = useState('');
  const [modelNumberFilter, setModelNumberFilter]     = useState('');
  const [inventoryModels, setInventoryModels]         = useState([]);
  const [activationStatusFilter, setActivationStatusFilter] = useState('');
  const [startDate, setStartDate]                     = useState('');
  const [endDate, setEndDate]                         = useState('');
  const [selectedClientId, setSelectedClientId]       = useState('');
  const [clients, setClients]                         = useState([]);
  const [loadingClients, setLoadingClients]           = useState(false);
  const [currentPage, setCurrentPage]                 = useState(1);
  const [activeTab, setActiveTab]                     = useState('all');
  const [pendingDevices, setPendingDevices]           = useState([]);
  const [loadingPending, setLoadingPending]           = useState(false);
  const [showAddModal, setShowAddModal]               = useState(false);
  const [showEditModal, setShowEditModal]             = useState(false);
  const [showDeleteModal, setShowDeleteModal]         = useState(false);
  const [showTransferModal, setShowTransferModal]     = useState(false);
  const [showDetailsModal, setShowDetailsModal]       = useState(false);
  const [showActivateModal, setShowActivateModal]     = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [selectedDevice, setSelectedDevice]           = useState(null);
  const [showSubscribeModal, setShowSubscribeModal]   = useState(false);
  const [subscriptionBlockReason, setSubscriptionBlockReason] = useState(null);
  const [pauseTarget, setPauseTarget]                 = useState(null);
  const [pausingDeviceId, setPausingDeviceId]         = useState(null);
  const [pauseError, setPauseError]                   = useState('');

  const isLoadingDevices = useRef(false);
  const hasInitialLoadCompleted = useRef(false);
  const hasAccess = canViewDevice;

  useEffect(() => {
    getActiveInventory().then(data => setInventoryModels(data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!hasAccess) return;
    const loadClients = async () => {
      try {
        setLoadingClients(true);
        const response = await clientService.getDescendantClients();
        if (response?.success) {
          const d = response.data?.clients || response.data?.data || response.clients || (Array.isArray(response.data) ? response.data : []);
          setClients(d);
        }
      } catch { /* ignore */ } finally { setLoadingClients(false); }
    };
    loadClients();
  }, [hasAccess]);

  const loadDevices = useCallback(async () => {
    if (isLoadingDevices.current) return;
    try {
      isLoadingDevices.current = true;
      const options = { page: currentPage, limit: 10, sortBy: 'onboarding_date', sortOrder: 'desc' };
      if (selectedClientId && selectedClientId !== 'all') options.client_id = selectedClientId.trim();
      if (searchTerm?.trim()) options.search = searchTerm.trim();
      if (modelNumberFilter?.trim()) options.model_number = modelNumberFilter.trim();
      if (activationStatusFilter) options.activation_status = activationStatusFilter;
      if (startDate && endDate) { options.startDate = startDate; options.endDate = endDate; }
      await getAllDevices(options);
    } catch { /* ignore */ } finally { isLoadingDevices.current = false; }
  }, [currentPage, searchTerm, modelNumberFilter, activationStatusFilter, startDate, endDate, selectedClientId, getAllDevices]);

  useEffect(() => {
    if (!hasAccess || !currentUser?.client_id) return;
    setSelectedClientId('all');
    const loadInitial = async () => {
      try {
        isLoadingDevices.current = true;
        await getAllDevices({ page: 1, limit: 10, sortBy: 'onboarding_date', sortOrder: 'desc' });
        hasInitialLoadCompleted.current = true;
      } catch { /* ignore */ } finally { isLoadingDevices.current = false; }
    };
    loadInitial();
  }, [hasAccess, currentUser]); // eslint-disable-line

  useEffect(() => {
    if (hasAccess && hasInitialLoadCompleted.current && !isLoadingDevices.current) loadDevices();
  }, [currentPage, searchTerm, modelNumberFilter, activationStatusFilter, startDate, endDate, selectedClientId]); // eslint-disable-line

  useEffect(() => { if (hasAccess) getDeviceStats(); }, [hasAccess]); // eslint-disable-line

  const loadPendingDevices = useCallback(async () => {
    try { setLoadingPending(true); const data = await getPendingDevices(); setPendingDevices(data?.devices || data || []); }
    catch { /* ignore */ } finally { setLoadingPending(false); }
  }, [getPendingDevices]);

  const handleTabChange = (tab) => { setActiveTab(tab); if (tab === 'pending') loadPendingDevices(); };

  const handleActivateDevice = (device) => {
    if (!canOnboardDevice) return;
    const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role);
    if (!isAdmin && isPaymentsEnabled) {
      if (!isActive && !isGrace) { setSubscriptionBlockReason(!subscription ? 'NO_SUBSCRIPTION' : 'SUBSCRIPTION_EXPIRED'); setShowSubscribeModal(true); return; }
      if (isGrace) { setSubscriptionBlockReason('GRACE_PERIOD'); setShowSubscribeModal(true); return; }
    }
    setSelectedDevice(device);
    setShowActivateModal(true);
  };

  const handleReactivateDevice = async (device) => {
    if (!canEditDevice) return;
    try { await reactivateDevice(device.device_id); loadDevices(); } catch { /* ignore */ }
  };

  const handlePauseDeviceConfirm = async () => {
    if (!pauseTarget) return;
    setPausingDeviceId(pauseTarget.device_id);
    setPauseError('');
    try { await deviceService.pauseDevice(pauseTarget.device_id, 'Client initiated pause'); setPauseTarget(null); loadDevices(); }
    catch (err) { setPauseError(err?.response?.data?.message || 'Failed to pause device'); }
    finally { setPausingDeviceId(null); }
  };

  const handleResumeDevice = async (device) => {
    setPausingDeviceId(device.device_id);
    setPauseError('');
    try { await deviceService.resumeDevice(device.device_id); loadDevices(); }
    catch (err) { setPauseError(err?.response?.data?.message || 'Failed to resume device'); }
    finally { setPausingDeviceId(null); }
  };

  const formatDate = (d) => (!d ? 'N/A' : new Date(d).toLocaleDateString());

  const ActivationBadge = ({ device }) => {
    const status = device?.activation_status;
    if (!status) return <Text size="xs" c="dimmed">—</Text>;
    if (status === 'ACTIVE' && !device.data_enabled) {
      const isAdminPaused = device.paused_by === 'ADMIN';
      return <Badge color={isAdminPaused ? 'red' : 'orange'} variant="light" size="sm">{isAdminPaused ? 'Inactive (Admin)' : 'Paused'}</Badge>;
    }
    const colors = { PENDING: 'yellow', ACTIVE: 'green', INACTIVE: 'red' };
    return <Badge color={colors[status] || 'gray'} variant="light" size="sm">{status}</Badge>;
  };

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <IconAlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-500">You don't have permission to view device information.</p>
        </div>
      </div>
    );
  }

  if (loading && devices.length === 0) return <LoadingSpinner />;

  const pendingRows = pendingDevices.map((device) => (
    <Table.Tr key={device.device_id || device.imei || device.id}>
      <Table.Td>
        {device.device_id
          ? <Text size="sm" fw={500}>{device.device_id}</Text>
          : <Text size="sm" c="dimmed" fs="italic">unassigned</Text>}
      </Table.Td>
      <Table.Td><Text size="sm" ff="monospace" c="dimmed">{device.imei || '—'}</Text></Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{device.device_type || '—'}</Text></Table.Td>
      <Table.Td><Text size="sm" ff="monospace" c="dimmed">{device.mac_address || '—'}</Text></Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{device.firmware_version || '—'}</Text></Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{formatDate(device.onboarding_date || device.first_seen)}</Text></Table.Td>
      <Table.Td>
        {canOnboardDevice && (
          <button onClick={() => handleActivateDevice(device)}
            className="flex items-center px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors">
            <IconCircleCheck className="w-3.5 h-3.5 mr-1" />Activate
          </button>
        )}
      </Table.Td>
    </Table.Tr>
  ));

  const deviceRows = devices.map((device) => (
    <Table.Tr key={device.id}>
      <Table.Td>
        <Text size="sm" fw={500}>{device.device_id}</Text>
        {device.channel_id && <Text size="xs" c="dimmed">Channel: {device.channel_id}</Text>}
      </Table.Td>
      <Table.Td>
        {device.model_number ? (
          <>
            <Text size="xs" ff="monospace" fw={500}>{device.model_number}</Text>
            {device.model_info?.display_name && <Text size="xs" c="dimmed">{device.model_info.display_name}</Text>}
          </>
        ) : <Text size="xs" c="dimmed">—</Text>}
      </Table.Td>
      <Table.Td><Text size="sm">{device.machin_id || '-'}</Text></Table.Td>
      <Table.Td>
        {device.client_name
          ? <Badge color="violet" variant="light" size="sm">{device.client_name}</Badge>
          : <Text size="xs" c="dimmed">No Client</Text>}
      </Table.Td>
      <Table.Td><ActivationBadge device={device} /></Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{formatDate(device.onboarding_date)}</Text></Table.Td>
      <Table.Td>
        <Group gap={4}>
          <Tooltip label="View Details" withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm"
              onClick={() => { setSelectedDevice(device); setShowDetailsModal(true); }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </ActionIcon>
          </Tooltip>
          {canEditDevice && (
            <Tooltip label="Edit Device" withArrow>
              <ActionIcon variant="subtle" color="indigo" size="sm"
                onClick={() => { setSelectedDevice(device); setShowEditModal(true); }}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {canTransferDevice && (
            <Tooltip label="Transfer Device" withArrow>
              <ActionIcon variant="subtle" color="green" size="sm"
                onClick={() => { setSelectedDevice(device); setShowTransferModal(true); }}>
                <IconArrowsRightLeft size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {canRemoveDevice && (
            <Tooltip label="Delete Device" withArrow>
              <ActionIcon variant="subtle" color="red" size="sm"
                onClick={() => { setSelectedDevice(device); setShowDeleteModal(true); }}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {canOnboardDevice && device.activation_status === 'PENDING' && (
            <Tooltip label="Activate Device" withArrow>
              <ActionIcon variant="subtle" color="green" size="sm" onClick={() => handleActivateDevice(device)}>
                <IconCircleCheck size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {canEditDevice && device.activation_status === 'ACTIVE' && (
            <Tooltip label="Deactivate Device" withArrow>
              <ActionIcon variant="subtle" color="orange" size="sm"
                onClick={() => { setSelectedDevice(device); setShowDeactivateModal(true); }}>
                <IconBan size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {canEditDevice && device.activation_status === 'INACTIVE' && (
            <Tooltip label="Reactivate Device" withArrow>
              <ActionIcon variant="subtle" color="blue" size="sm" onClick={() => handleReactivateDevice(device)}>
                <IconRefresh size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {device.activation_status === 'ACTIVE' && !!device.data_enabled && (
            <Tooltip label="Pause device data collection" withArrow>
              <ActionIcon variant="subtle" color="orange" size="sm"
                disabled={pausingDeviceId === device.device_id}
                onClick={() => { setPauseError(''); setPauseTarget(device); }}>
                <IconPlayerPause size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {device.activation_status === 'ACTIVE' && !device.data_enabled &&
            (device.paused_by === 'CLIENT' || ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser?.role)) && (
            <Tooltip label="Resume device data collection" withArrow>
              <ActionIcon variant="subtle" color="green" size="sm"
                disabled={pausingDeviceId === device.device_id}
                onClick={() => handleResumeDevice(device)}>
                <IconPlayerPlay size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {!canEditDevice && !canRemoveDevice && !canTransferDevice && (
            <Text size="xs" c="dimmed">View only</Text>
          )}
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Device Management</h2>
          <p className="text-sm text-gray-600 mt-1">Manage IoT devices and their configurations</p>
        </div>
        {canOnboardDevice && (
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors">
            <IconPlus className="w-5 h-5 mr-2" />Add Device
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6">
          <button onClick={() => handleTabChange('all')}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'all' ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            All Devices
          </button>
          {canOnboardDevice && (
            <button onClick={() => handleTabChange('pending')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center space-x-1.5 ${activeTab === 'pending' ? 'border-yellow-500 text-yellow-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <span>Pending Activation</span>
              {pendingDevices.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold bg-yellow-100 text-yellow-800 rounded-full">{pendingDevices.length}</span>
              )}
            </button>
          )}
        </nav>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <IconAlertTriangle className="w-5 h-5 text-red-400 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button onClick={clearError} className="text-sm text-red-600 hover:text-red-500 underline mt-2">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pending Tab ── */}
      {activeTab === 'pending' && (
        <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Devices awaiting activation</h3>
            <button onClick={loadPendingDevices} disabled={loadingPending}
              className="flex items-center text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50">
              <IconRefresh className={`w-4 h-4 mr-1 ${loadingPending ? 'animate-spin' : ''}`} />Refresh
            </button>
          </div>
          <ScrollArea>
            {loadingPending ? (
              <Center py="xl"><Loader size="sm" /></Center>
            ) : pendingDevices.length === 0 ? (
              <Center py="xl"><Text size="sm" c="dimmed">No pending devices</Text></Center>
            ) : (
              <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Device ID</Table.Th>
                    <Table.Th>IMEI</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>MAC Address</Table.Th>
                    <Table.Th>Firmware</Table.Th>
                    <Table.Th>Registered</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{pendingRows}</Table.Tbody>
              </Table>
            )}
          </ScrollArea>
        </Paper>
      )}

      {/* ── All Devices Tab ── */}
      {activeTab === 'all' && (
        <>
          {/* Stats */}
          {deviceStats?.summary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Devices',      value: deviceStats.summary.total_devices || 0 },
                { label: 'Active Clients',      value: deviceStats.summary.active_clients || 0 },
                { label: 'Device Models',       value: deviceStats.summary.unique_models || 0 },
                { label: 'Recent Onboardings',  value: deviceStats.summary.recent_onboardings || 0 },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600">{label}</p>
                  <p className="text-2xl font-semibold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full sm:flex-1 sm:min-w-[160px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Client</label>
                <SearchableSelect
                  options={[{ value: 'all', label: 'All Clients' }, ...clients.map(c => ({ value: String(c.client_id), label: c.name }))]}
                  value={selectedClientId} onChange={setSelectedClientId} placeholder="Select a client" disabled={loadingClients}
                />
              </div>
              <div className="w-full sm:w-auto">
                <button onClick={() => { setCurrentPage(1); loadDevices(); }} disabled={!selectedClientId || loading}
                  className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                  Show Devices
                </button>
              </div>
              <div className="w-full sm:flex-1 sm:min-w-[160px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Search Devices</label>
                <input type="text" placeholder="Search devices..." value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
              </div>
              <div className="w-full sm:w-52">
                <label className="block text-sm font-medium text-gray-700 mb-2">Model Number</label>
                <SearchableSelect
                  options={inventoryModels.map(m => ({ value: m.model_number, label: `${m.model_number} — ${m.display_name}` }))}
                  value={modelNumberFilter} onChange={(v) => { setModelNumberFilter(v); setCurrentPage(1); }} placeholder="All Models"
                />
              </div>
              <div className="w-full sm:w-44">
                <label className="block text-sm font-medium text-gray-700 mb-2">Activation Status</label>
                <SearchableSelect
                  options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'PENDING', label: 'Pending' }, { value: 'INACTIVE', label: 'Inactive' }]}
                  value={activationStatusFilter} onChange={(v) => { setActivationStatusFilter(v); setCurrentPage(1); }} placeholder="All Statuses"
                />
              </div>
              <div className="w-full sm:w-40">
                <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
                <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
              </div>
              <div className="w-full sm:w-40">
                <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
                <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500" />
              </div>
            </div>
          </div>

          {/* Table */}
          <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
            <ScrollArea>
              {loading ? (
                <Center py="xl"><Loader size="sm" /></Center>
              ) : devices.length === 0 ? (
                <Center py="xl"><Text size="sm" c="dimmed">No devices found</Text></Center>
              ) : (
                <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Device ID</Table.Th>
                      <Table.Th>Model Number</Table.Th>
                      <Table.Th>Machine ID</Table.Th>
                      <Table.Th>Client</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Onboarding Date</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>{deviceRows}</Table.Tbody>
                </Table>
              )}
            </ScrollArea>
          </Paper>

          {/* Pagination */}
          {pagination && pagination.total > 0 && (
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
              </Text>
              <Pagination total={pagination.totalPages} value={currentPage} onChange={setCurrentPage} size="sm" />
            </Group>
          )}
        </>
      )}

      {/* Modals */}
      <AddDeviceModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={loadDevices} />
      <EditDeviceModal isOpen={showEditModal} onClose={() => { setShowEditModal(false); setSelectedDevice(null); }} device={selectedDevice} onSuccess={loadDevices} />
      <DeleteDeviceModal isOpen={showDeleteModal} onClose={() => { setShowDeleteModal(false); setSelectedDevice(null); }} device={selectedDevice} onSuccess={loadDevices} />
      <TransferDeviceModal isOpen={showTransferModal} onClose={() => { setShowTransferModal(false); setSelectedDevice(null); }} device={selectedDevice} onSuccess={loadDevices} />
      <DeviceDetailsModal isOpen={showDetailsModal} onClose={() => { setShowDetailsModal(false); setSelectedDevice(null); }} device={selectedDevice} />
      <ActivateDeviceModal isOpen={showActivateModal} onClose={() => { setShowActivateModal(false); setSelectedDevice(null); }} device={selectedDevice} onSuccess={() => { loadDevices(); if (activeTab === 'pending') loadPendingDevices(); }} />
      <DeactivateDeviceModal isOpen={showDeactivateModal} onClose={() => { setShowDeactivateModal(false); setSelectedDevice(null); }} device={selectedDevice} onSuccess={loadDevices} />

      {showSubscribeModal && subscriptionBlockReason === 'GRACE_PERIOD' && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <IconAlertTriangle className="w-6 h-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-gray-900">Subscription in Grace Period</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">Your subscription has expired and is in the grace period. New device activations are blocked. Please renew your subscription.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowSubscribeModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <a href="/billing" className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Renew Subscription →</a>
            </div>
          </div>
        </div>
      )}
      {showSubscribeModal && subscriptionBlockReason !== 'GRACE_PERIOD' && (
        <SubscribePlanModal onClose={() => setShowSubscribeModal(false)} onSuccess={() => { setShowSubscribeModal(false); setSubscriptionBlockReason(null); }} />
      )}

      {pauseTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Pause Device Data Collection</h3>
            <p className="text-sm text-gray-600 mb-4">Device <strong>{pauseTarget.device_id}</strong> will stop sending data. You can resume at any time. Billing continues normally.</p>
            {pauseError && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-3">{pauseError}</div>}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setPauseTarget(null); setPauseError(''); }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handlePauseDeviceConfirm} disabled={!!pausingDeviceId} className="px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-60">
                {pausingDeviceId ? 'Pausing…' : 'Pause Device'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceManagement;
