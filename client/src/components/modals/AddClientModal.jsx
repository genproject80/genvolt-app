import { useState, useEffect } from 'react';
import {
  Modal, TextInput, Textarea, Checkbox, Button, Group, Stack, Alert, SimpleGrid, ScrollArea,
  ActionIcon, Text,
} from '@mantine/core';
import { IconAlertCircle, IconX } from '@tabler/icons-react';
import SearchableSelect from '../common/SearchableSelect';
import { useClient } from '../../context/ClientContext';
import { useClientPermissions } from '../../hooks/useClientPermissions';
import AccessDeniedModal from '../common/AccessDeniedModal';

const EMPTY_FORM = {
  name: '', email: '', phone: '', Address: '', contact_person: '',
  thinkspeak_subscription_info: '', city: '', state: '', parent_id: '', is_active: true,
};

const AddClientModal = ({ isOpen, onClose, onSuccess, client = null, mode = 'add' }) => {
  const { createClient, updateClient, getClientHierarchy, clientHierarchy, loading, error } = useClient();
  const { canCreateClient, canEditClient } = useClientPermissions();

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && client) {
        getClientHierarchy(client.client_id);
        setFormData({
          name: client.name || '',
          email: client.email || '',
          phone: client.phone || '',
          Address: client.Address || '',
          contact_person: client.contact_person || '',
          thinkspeak_subscription_info: client.thinkspeak_subscription_info || '',
          city: client.city || '',
          state: client.state || '',
          parent_id: client.parent_id || '',
          is_active: client.is_active !== undefined ? client.is_active : true,
        });
      } else {
        getClientHierarchy();
        setFormData(EMPTY_FORM);
      }
      setValidationErrors({});
      setSubmitError('');
    }
  }, [isOpen, mode, client]);

  const setField = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) setValidationErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Client name is required';
    else if (formData.name.length > 255) errors.name = 'Client name must be less than 255 characters';
    if (!formData.email.trim()) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Invalid email format';
    else if (formData.email.length > 255) errors.email = 'Email must be less than 255 characters';
    if (formData.phone?.trim()) {
      const clean = formData.phone.replace(/[\s\-\.\(\)]/g, '');
      if (clean.startsWith('+91')) {
        if (clean.length !== 13 || !/^\+91[6789]\d{9}$/.test(clean)) errors.phone = 'Invalid Indian phone number (+91XXXXXXXXXX)';
      } else if (clean.startsWith('91') && clean.length === 12) {
        if (!/^91[6789]\d{9}$/.test(clean)) errors.phone = 'Invalid Indian phone number';
      } else if (clean.length === 10) {
        if (!/^[6789]\d{9}$/.test(clean)) errors.phone = 'Invalid Indian mobile number (must start with 6-9)';
      } else {
        errors.phone = 'Phone must be 10 digits, or 12 with 91, or 13 with +91';
      }
    }
    if (formData.Address?.length > 500) errors.Address = 'Address must be less than 500 characters';
    if (formData.contact_person?.length > 255) errors.contact_person = 'Max 255 characters';
    if (formData.city?.length > 100) errors.city = 'Max 100 characters';
    if (formData.state?.length > 100) errors.state = 'Max 100 characters';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.keys(errors).length) { setValidationErrors(errors); return; }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const clientData = { ...formData, parent_id: formData.parent_id ? parseInt(formData.parent_id) : null };
      const result = mode === 'edit' && client
        ? await updateClient(client.client_id, clientData)
        : await createClient(clientData);
      onSuccess?.(result);
      onClose();
    } catch (err) {
      if (err.validationErrors) setValidationErrors(err.validationErrors);
      else setSubmitError(err.message || `Failed to ${mode === 'edit' ? 'update' : 'create'} client`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canPerformAction = mode === 'edit' ? canEditClient : canCreateClient;

  if (!canPerformAction) {
    return (
      <AccessDeniedModal
        isOpen={isOpen}
        onClose={onClose}
        message={`You don't have permission to ${mode} clients.`}
      />
    );
  }

  const isDisabled = isSubmitting || loading;
  const errorMsg = submitError || error;

  return (
    <Modal
      opened={isOpen}
      onClose={() => !isSubmitting && onClose()}
      title={<Text fw={600}>{mode === 'edit' ? 'Edit Client' : 'Add New Client'}</Text>}
      size="xl"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {errorMsg && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">{errorMsg}</Alert>
          )}

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Client Name" required value={formData.name}
              onChange={(e) => setField('name', e.target.value)}
              error={validationErrors.name} disabled={isDisabled} />

            <TextInput label="Email" required type="email" value={formData.email}
              onChange={(e) => setField('email', e.target.value)}
              error={validationErrors.email} disabled={isDisabled} />

            <TextInput label="Phone" type="tel" value={formData.phone}
              onChange={(e) => setField('phone', e.target.value)}
              error={validationErrors.phone} disabled={isDisabled} />

            <TextInput label="Contact Person" value={formData.contact_person}
              onChange={(e) => setField('contact_person', e.target.value)}
              error={validationErrors.contact_person} disabled={isDisabled} />

            <TextInput label="City" value={formData.city}
              onChange={(e) => setField('city', e.target.value)}
              error={validationErrors.city} disabled={isDisabled} />

            <TextInput label="State" value={formData.state}
              onChange={(e) => setField('state', e.target.value)}
              error={validationErrors.state} disabled={isDisabled} />
          </SimpleGrid>

          <Textarea label="Address" rows={3} value={formData.Address}
            onChange={(e) => setField('Address', e.target.value)}
            error={validationErrors.Address} disabled={isDisabled} />

          <Textarea label="ThinkSpeak Subscription Info" rows={3} value={formData.thinkspeak_subscription_info}
            onChange={(e) => setField('thinkspeak_subscription_info', e.target.value)}
            error={validationErrors.thinkspeak_subscription_info} disabled={isDisabled} />

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <SearchableSelect
              label="Parent Client"
              options={clientHierarchy.map(c => ({ value: String(c.client_id), label: c.name }))}
              value={formData.parent_id ? String(formData.parent_id) : ''}
              onChange={(v) => setField('parent_id', v || '')}
              placeholder="Select Parent Client (Optional)"
              disabled={isDisabled}
            />
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
              <Checkbox label="Active Client" checked={formData.is_active}
                onChange={(e) => setField('is_active', e.target.checked)}
                color="violet" disabled={isDisabled} />
            </div>
          </SimpleGrid>

          <Group justify="flex-end" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Button variant="default" onClick={() => !isSubmitting && onClose()} disabled={isDisabled}>Cancel</Button>
            <Button type="submit" color="violet" loading={isSubmitting} disabled={isDisabled || !canPerformAction}>
              {mode === 'edit' ? 'Update Client' : 'Create Client'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default AddClientModal;
