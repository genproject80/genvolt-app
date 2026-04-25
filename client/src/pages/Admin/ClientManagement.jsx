import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconPlus, IconPencil, IconTrash, IconServer, IconBuilding, IconCircleCheck, IconCpu, IconTrendingUp } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Loader, Text, Group, Badge, ActionIcon, Tooltip,
} from '@mantine/core';
import { useClient } from '../../context/ClientContext';
import { useClientPermissions } from '../../hooks/useClientPermissions';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import AddClientModal from '../../components/modals/AddClientModal';
import DeleteClientModal from '../../components/modals/DeleteClientModal';
import { getAllSubscriptions } from '../../services/subscriptionService';
import SearchableSelect from '../../components/common/SearchableSelect';

const SUB_STATUS_COLORS = {
  ACTIVE: 'green', GRACE: 'yellow', EXPIRED: 'red', CANCELLED: 'gray', PENDING: 'blue',
};

const ClientManagement = () => {
  const navigate = useNavigate();
  const {
    clients, loading, error, pagination,
    getAllClients, getClientStats, clearError
  } = useClient();

  const { canViewClient, canCreateClient, canEditClient, canDeleteClient } = useClientPermissions();
  const { canViewDevice } = useDevicePermissions();

  const [showAddModal, setShowAddModal]       = useState(false);
  const [showEditModal, setShowEditModal]     = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedClient, setSelectedClient]   = useState(null);
  const [searchTerm, setSearchTerm]           = useState('');
  const [statusFilter, setStatusFilter]       = useState('');
  const [clientStats, setClientStats]         = useState({ totalClients: 0, activeClients: 0, totalDevices: 0, avgDevicesPerClient: 0 });
  const [subscriptionsMap, setSubscriptionsMap] = useState({});

  useEffect(() => {
    const loadData = async () => {
      await getAllClients({ includeInactive: true });
      const stats = await getClientStats();
      if (stats) setClientStats(stats);
    };
    loadData();
  }, [getAllClients, getClientStats]);

  useEffect(() => {
    getAllSubscriptions()
      .then((res) => {
        const map = {};
        (res?.data || []).forEach((sub) => {
          if (!map[sub.client_id] || sub.status !== 'CANCELLED') map[sub.client_id] = sub;
        });
        setSubscriptionsMap(map);
      })
      .catch(() => {});
  }, []);

  const filteredClients = clients.filter(client => {
    const matchesSearch = searchTerm === '' ||
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === '' ||
      (statusFilter === 'active' && client.is_active) ||
      (statusFilter === 'inactive' && !client.is_active);
    return matchesSearch && matchesStatus;
  });

  const handleAddSuccess = async () => {
    await getAllClients({ includeInactive: true });
    const stats = await getClientStats();
    if (stats) setClientStats(stats);
  };

  const handleEditSuccess = async () => {
    setShowEditModal(false);
    setSelectedClient(null);
    await getAllClients({ includeInactive: true });
    const stats = await getClientStats();
    if (stats) setClientStats(stats);
  };

  const handleDeleteSuccess = async () => {
    setShowDeleteModal(false);
    setSelectedClient(null);
    await getAllClients({ includeInactive: true });
    const stats = await getClientStats();
    if (stats) setClientStats(stats);
  };

  const formatDate = (d) => new Date(d).toLocaleDateString();

  if (!canViewClient) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-500">You don't have permission to view client information.</p>
        </div>
      </div>
    );
  }

  const rows = filteredClients.map((client) => {
    const sub = subscriptionsMap[client.client_id];
    return (
      <Table.Tr key={client.client_id}>
        <Table.Td>
          <Text size="sm" fw={500}>{client.name}</Text>
          <Text size="sm" c="dimmed">{client.email}</Text>
          <Text size="xs" c="dimmed">Created: {formatDate(client.created_at)}</Text>
        </Table.Td>
        <Table.Td>
          <Text size="sm">{client.contact_person || 'N/A'}</Text>
        </Table.Td>
        <Table.Td>
          <Text size="sm">{client.phone || 'N/A'}</Text>
          <Text size="xs" c="dimmed">{client.Address || 'No address provided'}</Text>
        </Table.Td>
        <Table.Td>
          <Badge color="violet" variant="light" size="sm">{client.device_count || 0} devices</Badge>
        </Table.Td>
        <Table.Td>
          {sub ? (
            <div>
              <Text size="xs" fw={500}>{sub.plan_name}</Text>
              <Badge color={SUB_STATUS_COLORS[sub.status] || 'gray'} variant="light" size="xs" mt={2}>{sub.status}</Badge>
            </div>
          ) : <Text size="xs" c="dimmed">No plan</Text>}
        </Table.Td>
        <Table.Td>
          <Badge color={client.is_active ? 'green' : 'red'} variant="light" size="sm">
            {client.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            {canViewDevice && (
              <Tooltip label="Manage Devices" withArrow>
                <ActionIcon variant="subtle" color="blue" size="sm"
                  onClick={() => navigate(`/admin/clients/${client.client_id}/devices`)}>
                  <IconServer size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {canEditClient && (
              <Tooltip label="Edit Client" withArrow>
                <ActionIcon variant="subtle" color="indigo" size="sm"
                  onClick={() => { setSelectedClient(client); setShowEditModal(true); }}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {canDeleteClient && (
              <Tooltip label="Delete Client" withArrow>
                <ActionIcon variant="subtle" color="red" size="sm"
                  onClick={() => { setSelectedClient(client); setShowDeleteModal(true); }}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {!canEditClient && !canDeleteClient && <Text size="xs" c="dimmed">No actions available</Text>}
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <span>{error}</span>
          <button className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={clearError}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Client Management</h2>
          <p className="text-sm text-gray-600 mt-1">Manage client organizations and their details</p>
        </div>
        {canCreateClient && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <IconPlus className="w-5 h-5 mr-2" />
            Add Client
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { icon: IconBuilding,   color: 'text-blue-600',   bg: 'bg-blue-100',   label: 'Total Clients',      value: clientStats.totalClients },
          { icon: IconCircleCheck,color: 'text-green-600',  bg: 'bg-green-100',  label: 'Active Clients',     value: clientStats.activeClients },
          { icon: IconCpu,        color: 'text-purple-600', bg: 'bg-purple-100', label: 'Total Devices',      value: clientStats.totalDevices },
          { icon: IconTrendingUp, color: 'text-orange-600', bg: 'bg-orange-100', label: 'Avg Devices/Client', value: clientStats.avgDevicesPerClient },
        ].map(({ icon: Icon, color, bg, label, value }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center">
              <div className={`p-2 ${bg} rounded-lg`}><Icon className={`w-6 h-6 ${color}`} size={24} /></div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-gray-900">{label}</h3>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search clients..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <SearchableSelect
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Status"
          className="w-full sm:w-36"
        />
      </div>

      {/* Table */}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : filteredClients.length === 0 ? (
            <Center py="xl"><Text size="sm" c="dimmed">No clients found</Text></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Client</Table.Th>
                  <Table.Th>Contact Person</Table.Th>
                  <Table.Th>Contact Info</Table.Th>
                  <Table.Th>Devices</Table.Th>
                  <Table.Th>Subscription</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Paper>

      {/* Modals */}
      <AddClientModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={handleAddSuccess} />
      <AddClientModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} onSuccess={handleEditSuccess} client={selectedClient} mode="edit" />
      <DeleteClientModal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} onSuccess={handleDeleteSuccess} client={selectedClient} />
    </div>
  );
};

export default ClientManagement;
