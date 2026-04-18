import { useState, useEffect } from 'react';
import { TextInput, Checkbox, Button, Group, Stack, Alert, SimpleGrid, Paper, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import SearchableSelect from '../common/SearchableSelect';
import Modal from '../common/Modal';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { roleService } from '../../services/roleService';
import { clientService } from '../../services/clientService';

const EditUserModal = ({ isOpen, onClose, user, onSuccess }) => {
  const { updateUser, loading } = useUser();
  const { user: currentUser } = useAuth();

  const [formData, setFormData] = useState({
    first_name: '', last_name: '', email: '', user_name: '',
    ph_no: '', role_id: '', role_name: '', client_id: '', is_active: true,
  });
  const [errors, setErrors] = useState({});
  const [roles, setRoles] = useState([]);
  const [clients, setClients] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        email: user.email || '',
        user_name: user.user_name || '',
        ph_no: user.ph_no || '',
        role_id: user.role_id || '',
        role_name: user.role_name || '',
        client_id: user.client_id || '',
        is_active: user.is_active ?? true,
      });
    }
  }, [user]);

  useEffect(() => {
    if (isOpen) loadRolesAndClients();
  }, [isOpen]);

  const loadRolesAndClients = async () => {
    setLoadingData(true);
    try {
      const [rolesRes, clientsRes] = await Promise.all([
        roleService.getAllRoles({ limit: 100 }),
        clientService.getDescendantClients(),
      ]);

      const extractArray = (res, key) => {
        if (res?.data?.[key] && Array.isArray(res.data[key])) return res.data[key];
        if (res?.data?.data && Array.isArray(res.data.data)) return res.data.data;
        if (res?.[key] && Array.isArray(res[key])) return res[key];
        if (Array.isArray(res?.data)) return res.data;
        return [];
      };

      if (rolesRes?.success) setRoles(extractArray(rolesRes, 'roles'));
      if (clientsRes?.success) setClients(extractArray(clientsRes, 'clients'));
    } catch {
      setErrors({ submit: 'Failed to load form data' });
    } finally {
      setLoadingData(false);
    }
  };

  const setField = (name, value) => {
    if (name === 'role_id') {
      const role = roles.find(r => r.role_id === parseInt(value));
      setFormData(prev => ({ ...prev, role_id: value, role_name: role?.role_name || '' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const e = {};
    if (!formData.first_name.trim()) e.first_name = 'First name is required';
    if (!formData.last_name.trim()) e.last_name = 'Last name is required';
    if (!formData.email.trim()) e.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) e.email = 'Email is invalid';
    if (!formData.user_name.trim()) e.user_name = 'Username is required';
    if (!formData.role_id) e.role_id = 'Role is required';
    if (!formData.client_id) e.client_id = 'Client is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      const roleId = parseInt(formData.role_id);
      const clientId = parseInt(formData.client_id);
      if (isNaN(roleId)) throw new Error('Invalid role selected');
      if (isNaN(clientId)) throw new Error('Invalid client selected');
      await updateUser(user.user_id, {
        first_name: formData.first_name?.trim(),
        last_name: formData.last_name?.trim(),
        ph_no: formData.ph_no?.trim() || null,
        role_id: roleId,
        client_id: clientId,
        is_active: Boolean(formData.is_active),
      });
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to update user';
      setErrors({ submit: msg });
    }
  };

  const handleClose = () => { setErrors({}); onClose(); };

  if (!user) return null;

  const isDisabled = loading || loadingData;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Edit User: ${user.first_name} ${user.last_name}`} size="md">
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {errors.submit && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">{errors.submit}</Alert>
          )}

          <SimpleGrid cols={2} spacing="sm">
            <TextInput label="First Name" required value={formData.first_name}
              onChange={(e) => setField('first_name', e.target.value)}
              error={errors.first_name} disabled={isDisabled} />
            <TextInput label="Last Name" required value={formData.last_name}
              onChange={(e) => setField('last_name', e.target.value)}
              error={errors.last_name} disabled={isDisabled} />
          </SimpleGrid>

          <TextInput label="Email" required type="email" value={formData.email}
            onChange={(e) => setField('email', e.target.value)}
            error={errors.email} disabled={loading} />

          <TextInput label="Username" required value={formData.user_name}
            onChange={(e) => setField('user_name', e.target.value)}
            error={errors.user_name} disabled={loading} />

          <div>
            <SearchableSelect
              label="Role *"
              options={roles.map(r => ({ value: String(r.role_id), label: r.role_name }))}
              value={formData.role_id ? String(formData.role_id) : ''}
              onChange={(v) => setField('role_id', v || '')}
              placeholder="Select a role"
              disabled={isDisabled}
            />
            {errors.role_id && <p style={{ color: 'var(--mantine-color-red-6)', fontSize: 12, marginTop: 4 }}>{errors.role_id}</p>}
          </div>

          <div>
            <SearchableSelect
              label="Client *"
              options={clients.map(c => ({ value: String(c.client_id), label: c.name }))}
              value={formData.client_id ? String(formData.client_id) : ''}
              onChange={(v) => setField('client_id', v || '')}
              placeholder="Select a client"
              disabled={isDisabled}
            />
            {errors.client_id && <p style={{ color: 'var(--mantine-color-red-6)', fontSize: 12, marginTop: 4 }}>{errors.client_id}</p>}
          </div>

          <Checkbox label="Active User" checked={formData.is_active}
            onChange={(e) => setField('is_active', e.target.checked)}
            color="violet" disabled={loading} />

          <Paper p="sm" bg="gray.0" radius="md">
            <Text size="sm" c="dimmed">User ID: <Text span fw={500} c="dark">{user.user_id}</Text></Text>
            <Text size="sm" c="dimmed">Created: <Text span fw={500} c="dark">{user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}</Text></Text>
            {user.updated_at && (
              <Text size="sm" c="dimmed">Updated: <Text span fw={500} c="dark">{new Date(user.updated_at).toLocaleString()}</Text></Text>
            )}
          </Paper>

          <Group justify="flex-end" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Button variant="default" onClick={handleClose} disabled={loading}>Cancel</Button>
            <Button type="submit" color="violet" loading={loading} disabled={isDisabled}>Update User</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default EditUserModal;
