import React, { useState, useEffect } from 'react';
import { IconPlus, IconPencil, IconTrash, IconAlertTriangle } from '@tabler/icons-react';
import {
  Table, Paper, ScrollArea, Center, Loader, Text, Badge, Group, ActionIcon, Tooltip, Switch, Code,
} from '@mantine/core';
import { usePermissions } from '../../hooks/usePermissions';
import { tableConfigService } from '../../services/tableConfigService';
import TableConfigModal from '../../components/modals/TableConfigModal';
import DeleteTableConfigModal from '../../components/modals/DeleteTableConfigModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const TableConfigManagement = () => {
  const { canManageDeviceTestingTables, loading: permLoading } = usePermissions();
  const [configs, setConfigs]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingConfig, setEditingConfig]     = useState(null);
  const [deletingConfig, setDeletingConfig]   = useState(null);
  const [togglingId, setTogglingId]           = useState(null);

  const loadConfigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await tableConfigService.getAllConfigs();
      setConfigs(result.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load table configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canManageDeviceTestingTables) loadConfigs(); }, [canManageDeviceTestingTables]);

  const handleToggle = async (config) => {
    setTogglingId(config.config_id);
    try { await tableConfigService.toggleConfig(config.config_id); await loadConfigs(); }
    catch (err) { setError(err.response?.data?.message || 'Failed to toggle configuration'); }
    finally { setTogglingId(null); }
  };

  if (permLoading) return <div className="flex items-center justify-center min-h-64"><LoadingSpinner /></div>;

  if (!canManageDeviceTestingTables) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-center">
        <IconAlertTriangle className="w-12 h-12 text-yellow-400 mb-3" />
        <h3 className="text-lg font-semibold text-gray-800">Access Denied</h3>
        <p className="text-sm text-gray-500 mt-1">Only SYSTEM_ADMIN can manage table configurations.</p>
      </div>
    );
  }

  const rows = configs.map((cfg) => (
    <Table.Tr key={cfg.config_id}>
      <Table.Td><Text size="sm" fw={500}>{cfg.display_name}</Text></Table.Td>
      <Table.Td><Code fz="xs">{cfg.table_key}</Code></Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{cfg.table_name}</Text></Table.Td>
      <Table.Td>
        <Text size="sm" c="dimmed">
          {Array.isArray(cfg.column_config) ? cfg.column_config.length : '—'}
        </Text>
      </Table.Td>
      <Table.Td><Text size="sm" c="dimmed">{cfg.sort_order}</Text></Table.Td>
      <Table.Td>
        <Switch
          checked={cfg.is_active}
          onChange={() => handleToggle(cfg)}
          disabled={togglingId === cfg.config_id}
          size="sm"
        />
      </Table.Td>
      <Table.Td>
        <Group gap={4} justify="flex-end">
          <Tooltip label="Edit" withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setEditingConfig(cfg)}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete" withArrow>
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => setDeletingConfig(cfg)}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Table Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage which database tables appear in Device Testing. Changes take effect immediately.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
        >
          <IconPlus className="w-4 h-4" />
          Add New Table
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : configs.length === 0 ? (
            <Center py="xl">
              <Text size="sm" c="dimmed">No table configurations yet. Click "Add New Table" to get started.</Text>
            </Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Display Name</Table.Th>
                  <Table.Th>Table Key</Table.Th>
                  <Table.Th>DB Table</Table.Th>
                  <Table.Th>Columns</Table.Th>
                  <Table.Th>Order</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th ta="right">Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Paper>

      {showCreateModal && (
        <TableConfigModal mode="create" onClose={() => setShowCreateModal(false)} onSaved={loadConfigs} />
      )}
      {editingConfig && (
        <TableConfigModal mode="edit" config={editingConfig} onClose={() => setEditingConfig(null)} onSaved={() => { setEditingConfig(null); loadConfigs(); }} />
      )}
      {deletingConfig && (
        <DeleteTableConfigModal config={deletingConfig} onClose={() => setDeletingConfig(null)} onDeleted={() => { setDeletingConfig(null); loadConfigs(); }} />
      )}
    </div>
  );
};

export default TableConfigManagement;
