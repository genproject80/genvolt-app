import { useState } from 'react';
import { Group, Burger, Avatar, Text, Menu, UnstyledButton, Stack, Box } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';

const Header = ({ navbarOpened, onToggleNavbar }) => {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'AD';

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <Group h="100%" px="md" justify="space-between">
      {/* Left: burger (mobile) + branding */}
      <Group gap="sm">
        <Burger
          opened={navbarOpened}
          onClick={onToggleNavbar}
          hiddenFrom="lg"
          size="sm"
          aria-label="Toggle navigation"
        />
        <Group gap="xs">
          <Box
            w={40}
            h={40}
            bg="violet.6"
            style={{ borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text c="white" fw={700} size="sm">IoT</Text>
          </Box>
          <Text fw={600} size="lg" visibleFrom="sm">Device Monitor</Text>
        </Group>
      </Group>

      {/* Right: user menu */}
      <Menu shadow="md" width={220} position="bottom-end">
        <Menu.Target>
          <UnstyledButton>
            <Group gap="xs">
              <Avatar color="violet" radius="xl" size="sm">{initials}</Avatar>
              <Stack gap={0} visibleFrom="sm">
                <Text size="sm" fw={500} lh={1.2}>{user?.name || 'Admin Demo'}</Text>
                <Text size="xs" c="dimmed" lh={1.2}>{user?.role || 'Admin'}</Text>
              </Stack>
              <IconChevronDown size={16} color="gray" />
            </Group>
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Label>
            <Text size="sm" fw={500}>{user?.name || 'Admin Demo'}</Text>
            <Text size="xs" c="dimmed">{user?.email || 'admin@demo.com'}</Text>
          </Menu.Label>
          <Menu.Divider />
          <Menu.Item
            onClick={handleLogout}
            disabled={isLoggingOut}
            color="red"
          >
            {isLoggingOut ? 'Logging out…' : 'Sign out'}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
};

export default Header;
