import { useState, useEffect } from 'react';
import {
  Modal, TextInput, Button, Group, Stack, Text, Loader, Center,
  Checkbox, Alert, ScrollArea, ActionIcon,
} from '@mantine/core';
import { IconShieldCheck, IconInfoCircle } from '@tabler/icons-react';
import AccessDeniedModal from '../common/AccessDeniedModal';
import { useRole } from '../../context/RoleContext';
import { useRolePermissions } from '../../hooks/usePermissions';

const RESERVED = ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER'];

const groupPermissions = (permissions) =>
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

const RoleModal = ({ isOpen, onClose, role = null, onSuccess }) => {
  const { createRole, updateRole, permissions, getAllPermissions, loading, error } = useRole();
  const { canCreateRole, canEditRole } = useRolePermissions();

  const isEditMode = Boolean(role);
  const canPerformAction = isEditMode ? canEditRole : canCreateRole;

  const [formData, setFormData] = useState({ role_name: '', permission_ids: [] });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      role_name: isEditMode ? role.role_name || '' : '',
      permission_ids: isEditMode && role.permissions ? role.permissions.map((p) => p.permission_id) : [],
    });
    setFormErrors({});
    if (!permissions.length) getAllPermissions();
  }, [isOpen, role, isEditMode]);

  const validate = () => {
    const errors = {};
    const name = formData.role_name.trim();
    if (!name) errors.role_name = 'Role name is required';
    else if (name.length < 2) errors.role_name = 'Minimum 2 characters';
    else if (name.length > 100) errors.role_name = 'Maximum 100 characters';
    else if (!/^[a-zA-Z0-9\s_-]+$/.test(name)) errors.role_name = 'Letters, numbers, spaces, _ and - only';
    else if (!isEditMode && RESERVED.includes(name.toUpperCase())) errors.role_name = 'This role name is reserved';
    if (formData.permission_ids.length > 50) errors.permission_ids = 'Maximum 50 permissions';
    setFormErrors(errors);
    return !Object.keys(errors).length;
  };

  const togglePermission = (id) =>
    setFormData((prev) => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(id)
        ? prev.permission_ids.filter((x) => x !== id)
        : [...prev.permission_ids, id],
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const data = { role_name: formData.role_name.trim(), permission_ids: formData.permission_ids };
      const result = isEditMode
        ? await updateRole(role.role_id, { role_name: data.role_name })
        : await createRole(data);
      onSuccess?.(result);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canPerformAction) {
    return (
      <AccessDeniedModal
        isOpen={isOpen}
        onClose={onClose}
        message={`You don't have permission to ${isEditMode ? 'edit' : 'create'} roles.`}
      />
    );
  }

  const grouped = groupPermissions(permissions);

  return (
    <Modal
      opened={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={
        <Group gap="sm">
          <ActionIcon variant="light" color="violet" size="lg" radius="xl">
            <IconShieldCheck size={18} />
          </ActionIcon>
          <Stack gap={0}>
            <Text fw={600}>{isEditMode ? 'Edit Role' : 'Create New Role'}</Text>
            <Text size="xs" c="dimmed">
              {isEditMode ? 'Update the role name and basic settings' : 'Create a new role with permissions'}
            </Text>
          </Stack>
        </Group>
      }
      size="lg"
    >
      {error && <Text c="red" size="sm" mb="sm">{error}</Text>}

      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label="Role Name"
            required
            value={formData.role_name}
            onChange={(e) => {
              setFormData((p) => ({ ...p, role_name: e.target.value }));
              if (formErrors.role_name) setFormErrors((p) => ({ ...p, role_name: undefined }));
            }}
            disabled={isSubmitting || loading}
            placeholder="e.g. Content Manager"
            error={formErrors.role_name}
          />

          {!isEditMode && (
            <div>
              <Group justify="space-between" mb="xs">
                <Text size="sm" fw={500}>Permissions (Optional)</Text>
                <Group gap="xs">
                  <Button variant="subtle" size="xs" onClick={() => setFormData((p) => ({ ...p, permission_ids: permissions.map((x) => x.permission_id) }))}>Select All</Button>
                  <Text c="dimmed">|</Text>
                  <Button variant="subtle" size="xs" onClick={() => setFormData((p) => ({ ...p, permission_ids: [] }))}>Clear All</Button>
                </Group>
              </Group>

              {loading ? (
                <Center py="md"><Loader size="sm" color="violet" /></Center>
              ) : (
                <ScrollArea h={240} type="scroll" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
                  <Stack gap={0} p="sm">
                    {Object.entries(grouped).map(([cat, catPerms]) => (
                      <div key={cat} mb={8}>
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={4}>{cat}</Text>
                        <Stack gap={4} mb="sm">
                          {catPerms.map((p) => (
                            <Checkbox
                              key={p.permission_id}
                              checked={formData.permission_ids.includes(p.permission_id)}
                              onChange={() => togglePermission(p.permission_id)}
                              label={p.permission_name}
                              size="sm"
                              color="violet"
                            />
                          ))}
                        </Stack>
                      </div>
                    ))}
                  </Stack>
                </ScrollArea>
              )}

              {formData.permission_ids.length > 0 && (
                <Text size="xs" c="dimmed" mt={4}>{formData.permission_ids.length} permission(s) selected</Text>
              )}
              {formErrors.permission_ids && <Text c="red" size="xs">{formErrors.permission_ids}</Text>}
            </div>
          )}

          {isEditMode && (
            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              To modify permissions for this role, use the "Manage Permissions" button from the role list.
            </Alert>
          )}

          <Group justify="flex-end" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Button variant="default" onClick={() => !isSubmitting && onClose()} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" color="violet" loading={isSubmitting} disabled={isSubmitting || loading}>
              {isEditMode ? 'Update Role' : 'Create Role'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default RoleModal;
