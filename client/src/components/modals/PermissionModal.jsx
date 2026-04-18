import { useState, useEffect } from 'react';
import {
  Modal, TextInput, Button, Group, Stack, Text, Loader, Center,
  ScrollArea, Checkbox, Badge, ActionIcon,
} from '@mantine/core';
import { IconSettings, IconSearch, IconCheck, IconMinus } from '@tabler/icons-react';
import SearchableSelect from '../common/SearchableSelect';
import AccessDeniedModal from '../common/AccessDeniedModal';
import { useRole } from '../../context/RoleContext';
import { permissionService } from '../../services/permissionService';
import { useRolePermissions } from '../../hooks/usePermissions';

const groupPermissionsByCategory = (permissions) =>
  permissions.reduce((groups, p) => {
    let category = 'Other';
    if (p.permission_name.includes('User') || p.permission_name.includes('Password')) category = 'User Management';
    else if (p.permission_name.includes('Client')) category = 'Client Management';
    else if (p.permission_name.includes('Device')) category = 'Device Management';
    else if (p.permission_name.includes('Role') || p.permission_name.includes('role')) category = 'System Administration';
    if (!groups[category]) groups[category] = [];
    groups[category].push(p);
    return groups;
  }, {});

const PermissionModal = ({ isOpen, onClose, role = null, onSuccess }) => {
  const { updateRolePermissions, error } = useRole();
  const { canEditRole } = useRolePermissions();

  const [rolePermissions, setRolePermissions] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [permissionCategories, setPermissionCategories] = useState({});
  const [selectedPermissions, setSelectedPermissions] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (isOpen && role) loadPermissionsData();
  }, [isOpen, role]);

  useEffect(() => {
    if (rolePermissions.length > 0) {
      const currentIds = new Set(rolePermissions.map((p) => p.permission_id));
      setHasChanges(
        currentIds.size !== selectedPermissions.size ||
          ![...currentIds].every((id) => selectedPermissions.has(id))
      );
    }
  }, [selectedPermissions, rolePermissions]);

  const loadPermissionsData = async () => {
    setIsLoading(true);
    try {
      const [allPermsRes, rolePermsRes] = await Promise.all([
        permissionService.getAllPermissions(),
        permissionService.getUnassignedPermissions(role.role_id),
      ]);
      if (allPermsRes.success) {
        setAllPermissions(allPermsRes.data.permissions);
        setPermissionCategories(groupPermissionsByCategory(allPermsRes.data.permissions));
      }
      const current = allPermsRes.data.permissions.filter(
        (p) => !rolePermsRes.data.unassigned_permissions.find((u) => u.permission_id === p.permission_id)
      );
      setRolePermissions(current);
      setSelectedPermissions(new Set(current.map((p) => p.permission_id)));
    } catch (e) {
      console.error('Failed to load permissions:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const toggle = (id) =>
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectCategory = (perms) =>
    setSelectedPermissions((prev) => { const next = new Set(prev); perms.forEach((p) => next.add(p.permission_id)); return next; });
  const deselectCategory = (perms) =>
    setSelectedPermissions((prev) => { const next = new Set(prev); perms.forEach((p) => next.delete(p.permission_id)); return next; });

  const getFiltered = () => {
    let list = allPermissions;
    if (selectedCategory !== 'all') {
      const ids = new Set((permissionCategories[selectedCategory] || []).map((p) => p.permission_id));
      list = list.filter((p) => ids.has(p.permission_id));
    }
    if (searchTerm.trim()) list = list.filter((p) => p.permission_name.toLowerCase().includes(searchTerm.toLowerCase()));
    return list;
  };

  const handleSubmit = async () => {
    if (!hasChanges) { onClose(); return; }
    setIsSubmitting(true);
    try {
      await updateRolePermissions(role.role_id, Array.from(selectedPermissions));
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canEditRole) {
    return (
      <AccessDeniedModal
        isOpen={isOpen}
        onClose={onClose}
        message="You don't have permission to manage role permissions."
      />
    );
  }

  return (
    <Modal
      opened={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={
        <Group gap="sm">
          <ActionIcon variant="light" color="violet" size="lg" radius="xl">
            <IconSettings size={18} />
          </ActionIcon>
          <Stack gap={0}>
            <Text fw={600}>Manage Permissions</Text>
            <Text size="xs" c="dimmed">{role ? `Role: ${role.role_name}` : ''}</Text>
          </Stack>
        </Group>
      }
      size="xl"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      {error && <Text c="red" size="sm" mb="sm">{error}</Text>}

      <Group mb="md" align="flex-end">
        <TextInput
          placeholder="Search permissions..."
          leftSection={<IconSearch size={14} />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1 }}
        />
        <div style={{ width: 180 }}>
          <SearchableSelect
            options={Object.keys(permissionCategories).map((c) => ({ value: c, label: c }))}
            value={selectedCategory === 'all' ? '' : selectedCategory}
            onChange={(v) => setSelectedCategory(v || 'all')}
            placeholder="All Categories"
          />
        </div>
      </Group>

      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed">{selectedPermissions.size} of {allPermissions.length} selected</Text>
        <Group gap="xs">
          <Button variant="subtle" size="xs" onClick={() => setSelectedPermissions(new Set(allPermissions.map((p) => p.permission_id)))}>Select All</Button>
          <Text c="dimmed">|</Text>
          <Button variant="subtle" size="xs" onClick={() => setSelectedPermissions(new Set())}>Clear All</Button>
        </Group>
      </Group>

      {isLoading ? (
        <Center py="xl"><Loader color="violet" /></Center>
      ) : (
        <ScrollArea h={380} type="scroll">
          {selectedCategory === 'all'
            ? Object.entries(permissionCategories).map(([cat, catPerms]) => {
                const filtered = catPerms.filter((p) => !searchTerm.trim() || p.permission_name.toLowerCase().includes(searchTerm.toLowerCase()));
                if (!filtered.length) return null;
                const allSel = filtered.every((p) => selectedPermissions.has(p.permission_id));
                return (
                  <div key={cat} style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', marginBottom: 4 }}>
                    <Group px="sm" py={6} bg="gray.0" justify="space-between">
                      <Text size="sm" fw={500}>{cat}</Text>
                      <Group gap={4}>
                        <Badge size="xs" variant="outline">{filtered.filter((p) => selectedPermissions.has(p.permission_id)).length}/{filtered.length}</Badge>
                        <ActionIcon size="xs" variant="subtle" onClick={() => allSel ? deselectCategory(filtered) : selectCategory(filtered)}>
                          {allSel ? <IconMinus size={12} /> : <IconCheck size={12} />}
                        </ActionIcon>
                      </Group>
                    </Group>
                    <Stack gap={4} px="sm" py="xs">
                      {filtered.map((p) => (
                        <Checkbox
                          key={p.permission_id}
                          checked={selectedPermissions.has(p.permission_id)}
                          onChange={() => toggle(p.permission_id)}
                          label={p.permission_name}
                          size="sm"
                          color="violet"
                        />
                      ))}
                    </Stack>
                  </div>
                );
              })
            : (
              <Stack gap={4} px="sm" py="xs">
                {getFiltered().map((p) => (
                  <Checkbox
                    key={p.permission_id}
                    checked={selectedPermissions.has(p.permission_id)}
                    onChange={() => toggle(p.permission_id)}
                    label={p.permission_name}
                    size="sm"
                    color="violet"
                  />
                ))}
              </Stack>
            )}
        </ScrollArea>
      )}

      <Group justify="flex-end" mt="lg" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
        <Button variant="default" onClick={() => !isSubmitting && onClose()} disabled={isSubmitting}>Cancel</Button>
        <Button
          color="violet"
          onClick={handleSubmit}
          disabled={isSubmitting || !hasChanges}
          loading={isSubmitting}
        >
          {hasChanges ? 'Update Permissions' : 'No Changes'}
        </Button>
      </Group>
    </Modal>
  );
};

export default PermissionModal;
