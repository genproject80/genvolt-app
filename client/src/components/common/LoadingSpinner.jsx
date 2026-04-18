import { Center, Loader, Stack, Text } from '@mantine/core';

const sizeMap = { xs: 'xs', sm: 'sm', small: 'sm', medium: 'md', large: 'lg' };

const LoadingSpinner = ({ size = 'medium', className = '', inline = false, showText = true }) => {
  const loaderSize = sizeMap[size] ?? 'md';

  if (inline) {
    return (
      <span className={`inline-flex items-center ${className}`}>
        <Loader size={loaderSize} color="violet" />
      </span>
    );
  }

  return (
    <Center mih="100vh" className={className}>
      <Stack align="center" gap="sm">
        <Loader size={loaderSize} color="violet" />
        {showText && <Text size="sm" c="dimmed">Loading...</Text>}
      </Stack>
    </Center>
  );
};

export default LoadingSpinner;
