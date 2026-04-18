import { useState, useEffect } from 'react';
import { TextInput, PasswordInput, Checkbox, Button, Group, Stack, Alert, SimpleGrid } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import SearchableSelect from '../common/SearchableSelect';
import Modal from '../common/Modal';
import { useUser } from '../../context/UserContext';
import { useAuth } from '../../context/AuthContext';
import { roleService } from '../../services/roleService';
import { clientService } from '../../services/clientService';

const INITIAL_FORM = (currentUser) => ({
  first_name: '',
  last_name: '',
  email: '',
  user_name: '',
  password: '!Ktest123',
  role_id: '',
  role_name: '',
  client_id: currentUser?.role_name === 'CLIENT_ADMIN' ? currentUser.client_id : '',
  is_active: true,
});

const AddUserModal = ({ isOpen, onClose, onSuccess }) => {
  const { createUser, loading } = useUser();
  const { user: currentUser } = useAuth();

  const [formData, setFormData] = useState(() => INITIAL_FORM(currentUser));
  const [errors, setErrors] = useState({});
  const [roles, setRoles] = useState([]);
  const [clients, setClients] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (isOpen) loadRolesAndClients();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && currentUser?.role_name === 'CLIENT_ADMIN' && roles.length > 0) {
      const clientUserRole = roles.find(r => r.role_name === 'CLIENT_USER');
      if (clientUserRole && !formData.role_id) {
        setFormData(prev => ({ ...prev, role_id: clientUserRole.role_id, role_name: 'CLIENT_USER' }));
      }
    }
  }, [isOpen, roles, currentUser?.role_name]);

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
      else setErrors({ submit: 'Failed to load roles data' });

      if (clientsRes?.success) setClients(extractArray(clientsRes, 'clients'));
      else setErrors({ submit: 'Failed to load clients data' });
    } catch {
      setErrors({ submit: 'Failed to load form data. Please try again.' });
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
    if (!formData.password.trim()) e.password = 'Password is required';
    if (!formData.role_id) e.role_id = 'Role is required';
    if (!formData.client_id) e.client_id = 'Client is required';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      await createUser({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        user_name: formData.user_name,
        password: formData.password,
        role_id: parseInt(formData.role_id),
        client_id: formData.client_id ? parseInt(formData.client_id) : null,
        is_active: formData.is_active,
      });
      setFormData(INITIAL_FORM(currentUser));
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to create user';
      if (error.response?.data?.details) {
        const fieldErrors = {};
        error.response.data.details.forEach(d => { if (d.path) fieldErrors[d.path] = d.msg || d.message; });
        if (Object.keys(fieldErrors).length) { setErrors({ ...fieldErrors, submit: msg }); return; }
      }
      if (msg.includes('email already exists')) setErrors({ email: 'A user with this email already exists', submit: msg });
      else if (msg.includes('username already exists')) setErrors({ user_name: 'A user with this username already exists', submit: msg });
      else setErrors({ submit: msg });
    }
  };

  const handleClose = () => {
    setFormData(INITIAL_FORM(currentUser));
    setErrors({});
    onClose();
  };

  const isDisabled = loading || loadingData;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New User" size="md">
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
            error={errors.email} disabled={isDisabled} />

          <TextInput label="Username" required value={formData.user_name}
            onChange={(e) => setField('user_name', e.target.value)}
            error={errors.user_name} disabled={isDisabled} />

          <PasswordInput label="Temporary Password" required placeholder="Enter temporary password"
            value={formData.password}
            onChange={(e) => setField('password', e.target.value)}
            error={errors.password} disabled={isDisabled} />

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
            color="violet" disabled={isDisabled} />

          <Group justify="flex-end" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Button variant="default" onClick={handleClose} disabled={isDisabled}>Cancel</Button>
            <Button type="submit" color="violet" loading={loading} disabled={isDisabled}>Create User</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default AddUserModal;
