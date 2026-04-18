import { useState, useEffect } from 'react';
import {
  Modal, TextInput, Text, Group, Stack, Avatar, ScrollArea,
  Badge, Loader, Center, Alert,
} from '@mantine/core';
import { IconUsers, IconSearch, IconUser, IconMail, IconBuilding, IconCalendar } from '@tabler/icons-react';
import { useRole } from '../../context/RoleContext';

const formatDate = (d) => {
  if (!d) return 'N/A';
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return 'Invalid Date'; }
};

const RoleUsersModal = ({ isOpen, onClose, role = null }) => {
  const { getRoleUsers } = useRole();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen && role) loadRoleUsers();
  }, [isOpen, role]);

  const loadRoleUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getRoleUsers(role.role_id);
      setUsers(res.users || []);
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = searchTerm
    ? users.filter((u) =>
        [u.first_name, u.last_name, u.user_name, u.email, u.client_name]
          .some((v) => v?.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : users;

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Group gap="sm">
          <Avatar color="violet" radius="xl" size="md"><IconUsers size={18} /></Avatar>
          <Stack gap={0}>
            <Text fw={600}>Users with Role: {role?.role_name}</Text>
            <Text size="xs" c="dimmed">{users.length} user{users.length !== 1 ? 's' : ''} assigned</Text>
          </Stack>
        </Group>
      }
      size="xl"
    >
      <TextInput
        placeholder="Search users..."
        leftSection={<IconSearch size={14} />}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        mb="md"
      />

      {error && <Alert color="red" mb="md">{error}</Alert>}

      {isLoading ? (
        <Center py="xl"><Loader color="violet" /></Center>
      ) : (
        <ScrollArea h={360} type="scroll">
          {filtered.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <IconUsers size={40} color="var(--mantine-color-gray-4)" />
                <Text size="sm" fw={500}>{searchTerm ? 'No users found' : 'No users assigned'}</Text>
                <Text size="xs" c="dimmed">
                  {searchTerm ? 'Try adjusting your search criteria' : 'No users are currently assigned to this role.'}
                </Text>
              </Stack>
            </Center>
          ) : (
            <Stack gap="sm">
              {filtered.map((user) => (
                <div
                  key={user.user_id}
                  style={{ border: '1px solid var(--mantine-color-gray-2)', borderRadius: 8, padding: '12px 16px' }}
                >
                  <Group align="flex-start" gap="sm">
                    <Avatar color="violet" radius="xl" size="md">
                      <IconUser size={16} />
                    </Avatar>
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs">
                        <Text size="sm" fw={500}>{user.first_name} {user.last_name}</Text>
                        <Badge color={user.is_active ? 'green' : 'gray'} variant="light" size="xs">
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Group>
                      <Group gap="md" wrap="wrap">
                        <Group gap={4}>
                          <IconUser size={13} color="var(--mantine-color-gray-5)" />
                          <Text size="xs" c="dimmed">{user.user_name}</Text>
                        </Group>
                        <Group gap={4}>
                          <IconMail size={13} color="var(--mantine-color-gray-5)" />
                          <Text size="xs" c="dimmed" truncate>{user.email}</Text>
                        </Group>
                        <Group gap={4}>
                          <IconBuilding size={13} color="var(--mantine-color-gray-5)" />
                          <Text size="xs" c="dimmed">{user.client_name}</Text>
                        </Group>
                        <Group gap={4}>
                          <IconCalendar size={13} color="var(--mantine-color-gray-5)" />
                          <Text size="xs" c="dimmed">Created {formatDate(user.created_at)}</Text>
                        </Group>
                      </Group>
                    </Stack>
                  </Group>
                </div>
              ))}
            </Stack>
          )}
        </ScrollArea>
      )}

      <Group justify="space-between" pt="sm" mt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
        <Text size="sm" c="dimmed">
          {searchTerm && filtered.length !== users.length
            ? `Showing ${filtered.length} of ${users.length} users`
            : `${users.length} user${users.length !== 1 ? 's' : ''} total`}
        </Text>
        <Text
          size="sm"
          c="violet"
          style={{ cursor: 'pointer' }}
          onClick={onClose}
        >
          Close
        </Text>
      </Group>
    </Modal>
  );
};

export default RoleUsersModal;
