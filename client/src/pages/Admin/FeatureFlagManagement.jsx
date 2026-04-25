import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Paper, ScrollArea, Center, Loader, Text, Badge, Switch,
} from '@mantine/core';
import { getFeatureFlags, updateFeatureFlag } from '../../services/featureFlagService';
import { useFeatureFlags } from '../../context/FeatureFlagContext';

export default function FeatureFlagManagement() {
  const { refreshFlags } = useFeatureFlags();

  const [flags, setFlags]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(null);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFeatureFlags();
      setFlags(data || []);
    } catch (err) {
      setError(err?.message || 'Failed to load feature flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (flag) => {
    setSaving(flag.flag_id);
    setError('');
    try {
      const updated = await updateFeatureFlag(flag.flag_id, !flag.is_enabled);
      setFlags(prev => prev.map(f => f.flag_id === updated.flag_id ? updated : f));
      await refreshFlags();
    } catch (err) {
      setError(err?.message || 'Failed to update flag');
    } finally {
      setSaving(null);
    }
  };

  const rows = flags.map((flag) => (
    <Table.Tr key={flag.flag_id}>
      <Table.Td>
        <Text size="sm" fw={500}>{flag.display_name}</Text>
        <Text size="xs" ff="monospace" c="dimmed">{flag.flag_name}</Text>
      </Table.Td>
      <Table.Td style={{ maxWidth: 320 }}>
        <Text size="sm" c="dimmed">{flag.description}</Text>
      </Table.Td>
      <Table.Td>
        <Badge color={flag.is_enabled ? 'green' : 'gray'} variant="light" size="sm">
          {flag.is_enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Switch
          checked={flag.is_enabled}
          onChange={() => handleToggle(flag)}
          disabled={saving === flag.flag_id}
          size="md"
        />
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Feature Flags</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enable or disable platform features globally. Changes take effect immediately for all users.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
      )}

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <ScrollArea>
          {loading ? (
            <Center py="xl"><Loader size="sm" /></Center>
          ) : flags.length === 0 ? (
            <Center py="xl"><Text size="sm" c="dimmed">No feature flags configured.</Text></Center>
          ) : (
            <Table striped highlightOnHover verticalSpacing="sm" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Feature</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Toggle</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>{rows}</Table.Tbody>
            </Table>
          )}
        </ScrollArea>
      </Paper>

      <p className="text-xs text-gray-400">
        Last updated values are shown. Refresh the page if you need the latest state.
      </p>
    </div>
  );
}
