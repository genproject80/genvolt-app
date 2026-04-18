import { useState } from 'react';
import { TextInput, PasswordInput, Checkbox, Button, Stack, Text, Alert, Box, Center } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(() => localStorage.getItem('loginError') || '');
  const { login } = useAuth();

  const form = useForm({
    initialValues: { email: '', password: '', rememberMe: false },
    validate: {
      email: (v) => (!v ? 'Email is required' : !/\S+@\S+\.\S+/.test(v) ? 'Email address is invalid' : null),
      password: (v) => (!v ? 'Password is required' : v.length < 6 ? 'Password must be at least 6 characters' : null),
    },
  });

  const handleSubmit = async (values) => {
    setIsLoading(true);
    try {
      await login(values.email, values.password, values.rememberMe);
      setLoginError('');
      localStorage.removeItem('loginError');
    } catch (error) {
      const msg = error.message || 'Login failed. Please try again.';
      setLoginError(msg);
      localStorage.setItem('loginError', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <Center mb="xl">
            <Stack align="center" gap="xs">
              <Box
                style={{ width: 64, height: 64, background: 'var(--mantine-color-violet-6)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text c="white" fw={700} size="xl">IoT</Text>
              </Box>
              <Text size="xl" fw={700} c="dark">Welcome Back</Text>
              <Text size="sm" c="dimmed">Sign in to your IoT Dashboard account</Text>
            </Stack>
          </Center>

          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
              {loginError && (
                <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                  {loginError}
                </Alert>
              )}

              <TextInput
                label="Email"
                placeholder="Enter your email"
                type="email"
                {...form.getInputProps('email')}
                onChange={(e) => {
                  form.getInputProps('email').onChange(e);
                  if (loginError) { setLoginError(''); localStorage.removeItem('loginError'); }
                }}
              />

              <PasswordInput
                label="Password"
                placeholder="Enter your password"
                {...form.getInputProps('password')}
                onChange={(e) => {
                  form.getInputProps('password').onChange(e);
                  if (loginError) { setLoginError(''); localStorage.removeItem('loginError'); }
                }}
              />

              <Checkbox
                label="Remember me for 30 days"
                {...form.getInputProps('rememberMe', { type: 'checkbox' })}
              />

              <Button
                type="submit"
                color="violet"
                fullWidth
                loading={isLoading}
                mt="xs"
              >
                Sign In
              </Button>
            </Stack>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
