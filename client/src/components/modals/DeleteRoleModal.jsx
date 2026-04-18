import { useState, useEffect } from 'react';
import {
  Modal, Text, Group, Stack, TextInput, Button, Alert, ThemeIcon, Badge,
} from '@mantine/core';
import { IconAlertTriangle, IconShieldCheck, IconUsers } from '@tabler/icons-react';
import { useRole } from '../../context/RoleContext';

const SYSTEM_ROLES = ['SYSTEM_ADMIN', 'SUPER_ADMIN', 'CLIENT_ADMIN', 'CLIENT_USER'];

const DeleteRoleModal = ({ isOpen, onClose, role = null, onSuccess }) => {
  const { deleteRole, getRoleUsers } = useRole();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState(null);

  const isSystemRole = role && SYSTEM_ROLES.includes(role.role_name);
  const canDelete = !isSystemRole && userCount === 0;
  const expectedText = `DELETE ${role?.role_name || ''}`;

  useEffect(() => {
    if (isOpen && role) loadUserCount();
  }, [isOpen, role]);

  useEffect(() => {
    if (!isOpen) { setConfirmText(''); setError(null); setUserCount(0); }
  }, [isOpen]);

  const loadUserCount = async () => {
    setIsLoadingUsers(true);
    setError(null);
    try {
      const res = await getRoleUsers(role.role_id);
      setUserCount(res.users?.length ?? 0);
    } catch (e) {
      setError('Failed to check user assignments');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || confirmText !== expectedText) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await deleteRole(role.role_id);
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to delete role');
    } finally {
      setIsSubmitting(false);
    }
  };

  const warningType = isSystemRole ? 'system' : userCount > 0 ? 'users' : 'confirmation';
  const warningColor = warningType === 'confirmation' ? 'red' : 'yellow';
  const warningTitle = warningType === 'system'
    ? 'Cannot Delete System Role'
    : warningType === 'users'
    ? 'Role Has Assigned Users'
    : 'Confirm Role Deletion';
  const warningMessage = warningType === 'system'
    ? 'This is a system role required for the application to function and cannot be deleted.'
    : warningType === 'users'
    ? `This role is assigned to ${userCount} user${userCount !== 1 ? 's' : ''}. Reassign or remove them before deleting.`
    : 'This action cannot be undone. The role and all its permission assignments will be permanently removed.';

  return (
    <Modal
      opened={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={
        <Group gap="sm">
          <ThemeIcon color={warningColor} size="lg" radius="xl" variant="light">
            <IconAlertTriangle size={18} />
          </ThemeIcon>
          <Text fw={600}>{warningTitle}</Text>
        </Group>
      }
      size="sm"
    >
      <Stack gap="md">
        {role && (
          <Group gap="sm" p="sm" style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 8 }}>
            <IconShieldCheck size={18} color="var(--mantine-color-gray-5)" />
            <Stack gap={2}>
              <Text size="sm" fw={500}>{role.role_name}</Text>
              <Group gap="md">
                <Group gap={4}>
                  <IconUsers size={12} color="var(--mantine-color-gray-5)" />
                  <Text size="xs" c="dimmed">
                    {isLoadingUsers ? 'Loading…' : `${userCount} user${userCount !== 1 ? 's' : ''}`}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed">{role.permission_count} permissions</Text>
              </Group>
            </Stack>
          </Group>
        )}

        <Alert color={warningColor} variant="light">{warningMessage}</Alert>

        {error && <Alert color="red" variant="light">{error}</Alert>}

        {canDelete && (
          <TextInput
            label={
              <Text size="sm">
                Type <Badge variant="outline" size="sm" style={{ fontFamily: 'monospace' }}>{expectedText}</Badge> to confirm:
              </Text>
            }
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={isSubmitting}
            placeholder={expectedText}
          />
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={() => !isSubmitting && onClose()} disabled={isSubmitting}>Cancel</Button>
          {canDelete && (
            <Button
              color="red"
              onClick={handleDelete}
              disabled={isSubmitting || isLoadingUsers || confirmText !== expectedText}
              loading={isSubmitting}
            >
              Delete Role
            </Button>
          )}
        </Group>

        {!canDelete && (
          <Text size="xs" c="dimmed" ta="center">
            {isSystemRole ? 'System roles are protected and cannot be deleted.' : 'Remove all user assignments to enable deletion.'}
          </Text>
        )}
      </Stack>
    </Modal>
  );
};

export default DeleteRoleModal;
