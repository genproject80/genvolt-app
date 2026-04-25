import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  IconArrowLeft, IconCircleCheck, IconBan, IconRefresh,
  IconPlayerPause, IconPlayerPlay, IconSettings,
} from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Text, Badge, Group, ActionIcon, Tooltip,
} from '@mantine/core';
import { useDevice } from '../../context/DeviceContext';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import { clientService } from '../../services/clientService';
import { deviceService } from '../../services/deviceService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ActivateDeviceModal from '../../components/modals/ActivateDeviceModal';
import DeactivateDeviceModal from '../../components/modals/DeactivateDeviceModal';
import DeviceConfigModal from '../../components/modals/DeviceConfigModal';

const STATUS_COLORS = { ACTIVE: 'green', PENDING: 'yellow', INACTIVE: 'red' };

const ClientDeviceDashboard = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { reactivateDevice } = useDevice();
  const { canOnboardDevice, canEditDevice, canPauseResume } = useDevicePermissions();

  const [client, setClient]           = useState(null);
  const [devices, setDevices]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError]             = useState('');

  const [activateDevice, setActivateDevice]     = useState(null);
  const [deactivateDevice, setDeactivateDevice] = useState(null);
  const [configDevice, setConfigDevice]         = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [clientRes, devicesRes] = await Promise.all([
        clientService.getClientById(clientId),
        deviceService.getAllDevices({ client_id: clientId, limit: 200 }),
      ]);
      if (clientRes?.success || clientRes?.data) setClient(clientRes.data || clientRes);
      const list = devicesRes?.data?.devices || devicesRes?.devices || devicesRes?.data || [];
      setDevices(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleReactivate = async (device) => {
    try { setActionLoading(device.device_id); await reactivateDevice(device.device_id); await loadData(); }
    catch (err) { setError(err.response?.data?.message || err.message || 'Reactivation failed'); }
    finally { setActionLoading(null); }
  };

  const handlePause = async (device) => {
    try { setActionLoading(device.device_id); await deviceService.pauseDevice(device.device_id); await loadData(); }
    catch (err) { setError(err.response?.data?.message || err.message || 'Pause failed'); }
    finally { setActionLoading(null); }
  };

  const handleResume = async (device) => {
    try { setActionLoading(device.device_id); await deviceService.resumeDevice(device.device_id); await loadData(); }
    catch (err) { setError(err.response?.data?.message || err.message || 'Resume failed'); }
    finally { setActionLoading(null); }
  };

  const stats = {
    total:    devices.length,
    active:   devices.filter(d => d.activation_status === 'ACTIVE').length,
    pending:  devices.filter(d => d.activation_status === 'PENDING').length,
    inactive: devices.filter(d => d.activation_status === 'INACTIVE').length,
  };

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;

  const rows = devices.map(device => {
    const isBusy     = actionLoading === device.device_id;
    const isActive   = device.activation_status === 'ACTIVE';
    const isPending  = device.activation_status === 'PENDING';
    const isInactive = device.activation_status === 'INACTIVE';
    const isPaused   = device.data_enabled === false || device.data_enabled === 0;

    return (
      <Table.Tr key={device.device_id || device.imei}>
        <Table.Td>
          <Text size="sm" fw={500}>
            {device.device_id || <Text component="span" size="sm" c="dimmed" fs="italic">unassigned</Text>}
          </Text>
        </Table.Td>
        <Table.Td><Text size="sm" c="dimmed">{device.imei || '—'}</Text></Table.Td>
        <Table.Td><Text size="sm" c="dimmed">{device.device_type || '—'}</Text></Table.Td>
        <Table.Td>
          <Badge color={STATUS_COLORS[device.activation_status] || 'gray'} variant="light" size="sm">
            {device.activation_status}
          </Badge>
        </Table.Td>
        <Table.Td>
          {isActive
            ? (isPaused
              ? <Text size="sm" c="orange" fw={500}>Paused</Text>
              : <Text size="sm" c="green" fw={500}>Enabled</Text>)
            : <Text size="sm" c="dimmed">—</Text>}
        </Table.Td>
        <Table.Td>
          <Group gap={4}>
            {isBusy && <LoadingSpinner size="sm" inline />}
            {isPending && canOnboardDevice && (
              <Tooltip label="Activate" withArrow>
                <ActionIcon variant="subtle" color="green" size="sm" disabled={isBusy}
                  onClick={() => setActivateDevice(device)}>
                  <IconCircleCheck size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {isActive && canEditDevice && (
              <Tooltip label="Deactivate" withArrow>
                <ActionIcon variant="subtle" color="red" size="sm" disabled={isBusy}
                  onClick={() => setDeactivateDevice(device)}>
                  <IconBan size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {isInactive && canOnboardDevice && (
              <Tooltip label="Reactivate" withArrow>
                <ActionIcon variant="subtle" color="blue" size="sm" disabled={isBusy}
                  onClick={() => handleReactivate(device)}>
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            {isActive && canPauseResume && (
              isPaused ? (
                <Tooltip label="Resume Data" withArrow>
                  <ActionIcon variant="subtle" color="green" size="sm" disabled={isBusy}
                    onClick={() => handleResume(device)}>
                    <IconPlayerPlay size={16} />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Tooltip label="Pause Data" withArrow>
                  <ActionIcon variant="subtle" color="orange" size="sm" disabled={isBusy}
                    onClick={() => handlePause(device)}>
                    <IconPlayerPause size={16} />
                  </ActionIcon>
                </Tooltip>
              )
            )}
            {isActive && canEditDevice && (
              <Tooltip label="Config & Credentials" withArrow>
                <ActionIcon variant="subtle" color="gray" size="sm" disabled={isBusy}
                  onClick={() => setConfigDevice(device)}>
                  <IconSettings size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100">
          <IconArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{client?.name || `Client ${clientId}`} — Devices</h1>
          <p className="text-sm text-gray-500">Manage device lifecycle and configuration</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-gray-800' },
          { label: 'Active',   value: stats.active,   color: 'text-green-700' },
          { label: 'Pending',  value: stats.pending,  color: 'text-yellow-700' },
          { label: 'Inactive', value: stats.inactive, color: 'text-red-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {devices.length === 0 ? (
            <Center py="xl"><Text size="sm" c="dimmed">No devices found for this client.</Text></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  {['Device ID', 'IMEI', 'Type', 'Status', 'Data', 'Actions'].map(h => (
                    <Table.Th key={h}>{h}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Paper>

      {/* Modals */}
      <ActivateDeviceModal isOpen={!!activateDevice} onClose={() => setActivateDevice(null)} device={activateDevice} fixedClientId={clientId} onSuccess={loadData} />
      <DeactivateDeviceModal isOpen={!!deactivateDevice} onClose={() => setDeactivateDevice(null)} device={deactivateDevice} onSuccess={loadData} />
      <DeviceConfigModal isOpen={!!configDevice} onClose={() => setConfigDevice(null)} device={configDevice} onSuccess={loadData} />
    </div>
  );
};

export default ClientDeviceDashboard;
