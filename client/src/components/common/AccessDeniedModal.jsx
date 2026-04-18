import { Modal, Stack, Text, Button, ThemeIcon } from '@mantine/core';
import { IconShieldX } from '@tabler/icons-react';

const AccessDeniedModal = ({
  isOpen,
  onClose,
  title = 'Access Denied',
  message = "You don't have permission to perform this action.",
  actionText = 'OK',
}) => {
  return (
    <Modal opened={isOpen} onClose={onClose} withCloseButton={false} centered size="sm">
      <Stack align="center" gap="md" py="sm">
        <ThemeIcon color="red" size={48} radius="xl" variant="light">
          <IconShieldX size={24} />
        </ThemeIcon>

        <Stack align="center" gap={4}>
          <Text fw={600} size="lg">{title}</Text>
          <Text size="sm" c="dimmed" ta="center">{message}</Text>
        </Stack>

        <Button onClick={onClose} color="violet" fullWidth>
          {actionText}
        </Button>
      </Stack>
    </Modal>
  );
};

export default AccessDeniedModal;
