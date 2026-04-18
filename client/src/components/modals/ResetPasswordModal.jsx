import { useState } from 'react';
import { PasswordInput, Button, Group, Stack, Alert, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import Modal from '../common/Modal';
import { userService } from '../../services/userService';

const ResetPasswordModal = ({ isOpen, onClose, user, onSuccess }) => {
  const [formData, setFormData] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.newPassword) newErrors.newPassword = 'New password is required';
    else if (formData.newPassword.length < 6) newErrors.newPassword = 'Password must be at least 6 characters';
    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm the password';
    else if (formData.newPassword !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      setLoading(true);
      await userService.resetUserPassword(user.user_id, formData.newPassword);
      setFormData({ newPassword: '', confirmPassword: '' });
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to reset password';
      setErrors({ submit: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ newPassword: '', confirmPassword: '' });
    setErrors({});
    onClose();
  };

  if (!user) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Reset Password — ${user.first_name} ${user.last_name}`} size="sm">
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {errors.submit && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">{errors.submit}</Alert>
          )}

          <Alert color="blue" variant="light">
            Resetting password for: <Text span fw={500}>{user.email}</Text>
          </Alert>

          <PasswordInput
            label="New Password"
            required
            placeholder="Enter new password"
            value={formData.newPassword}
            onChange={handleChange('newPassword')}
            error={errors.newPassword}
            disabled={loading}
          />

          <PasswordInput
            label="Confirm Password"
            required
            placeholder="Confirm new password"
            value={formData.confirmPassword}
            onChange={handleChange('confirmPassword')}
            error={errors.confirmPassword}
            disabled={loading}
          />

          <Group justify="flex-end" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Button variant="default" onClick={handleClose} disabled={loading}>Cancel</Button>
            <Button type="submit" color="violet" loading={loading}>Update Password</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default ResetPasswordModal;
