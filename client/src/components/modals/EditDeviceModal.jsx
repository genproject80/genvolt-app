import { useState, useEffect } from 'react';
import { TextInput, Button, Group, Stack, Alert } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import SearchableSelect from '../common/SearchableSelect';
import Modal from '../common/Modal';
import { useDevice } from '../../context/DeviceContext';
import { clientService } from '../../services/clientService';
import { getActiveInventory } from '../../services/inventoryService';

const EditDeviceModal = ({ isOpen, onClose, device, onSuccess }) => {
  const { updateDevice, loading } = useDevice();

  const [formData, setFormData] = useState({ device_id: '', model_number: '', imei: '', machin_id: '', client_id: '' });
  const [errors, setErrors] = useState({});
  const [clients, setClients] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    if (isOpen) loadFormData();
  }, [isOpen]);

  useEffect(() => {
    if (device && isOpen) {
      setFormData({
        device_id: device.device_id || '',
        model_number: device.model_number || '',
        imei: device.imei || '',
        machin_id: device.machin_id || '',
        client_id: device.client_id || '',
      });
    }
  }, [device, isOpen]);

  const loadFormData = async () => {
    setLoadingData(true);
    try {
      const [clientsRes, inventoryItems] = await Promise.all([
        clientService.getDescendantClients(),
        getActiveInventory(),
      ]);
      setInventory(inventoryItems || []);
      if (clientsRes?.success) {
        const data = clientsRes.data?.clients || clientsRes.data?.data || clientsRes.clients || (Array.isArray(clientsRes.data) ? clientsRes.data : []);
        setClients(data);
      } else {
        setErrors({ submit: 'Failed to load clients data' });
      }
    } catch {
      setErrors({ submit: 'Failed to load form data. Please try again.' });
    } finally {
      setLoadingData(false);
    }
  };

  const setField = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validateForm = () => {
    const e = {};
    if (!formData.device_id.trim()) e.device_id = 'Device ID is required';
    else if (formData.device_id.length < 3) e.device_id = 'Device ID must be at least 3 characters';
    if (!formData.model_number) e.model_number = 'Model number is required';
    if (!formData.imei.trim()) e.imei = 'IMEI is required';
    else if (!/^\d{15,17}$/.test(formData.imei.trim())) e.imei = 'IMEI must be 15–17 digits';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    try {
      await updateDevice(device.id, {
        device_id: formData.device_id,
        model_number: formData.model_number,
        imei: formData.imei,
        machin_id: formData.machin_id || null,
        client_id: formData.client_id ? parseInt(formData.client_id) : null,
      });
      setErrors({});
      onSuccess?.();
      onClose();
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message || 'Failed to update device';
      if (error.response?.data?.details) {
        const fieldErrors = {};
        error.response.data.details.forEach(d => { if (d.path) fieldErrors[d.path] = d.msg || d.message; });
        if (Object.keys(fieldErrors).length) { setErrors({ ...fieldErrors, submit: msg }); return; }
      }
      if (msg.includes('device_id already exists')) setErrors({ device_id: 'A device with this ID already exists', submit: msg });
      else setErrors({ submit: msg });
    }
  };

  const handleClose = () => {
    setFormData({ device_id: '', model_number: '', imei: '', machin_id: '', client_id: '' });
    setErrors({});
    onClose();
  };

  if (!device) return null;

  const isDisabled = loading || loadingData;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Edit Device" size="md">
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {errors.submit && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">{errors.submit}</Alert>
          )}

          <TextInput label="Device ID" required placeholder="Enter unique device ID"
            value={formData.device_id}
            onChange={(e) => setField('device_id', e.target.value)}
            error={errors.device_id} disabled={isDisabled} />

          <div>
            <SearchableSelect
              label="Model Number *"
              options={inventory.map(item => ({
                value: item.model_number,
                label: item.model_number + (item.display_name ? ` — ${item.display_name}` : ''),
              }))}
              value={formData.model_number}
              onChange={(v) => setField('model_number', v || '')}
              placeholder="Select model number"
              disabled={isDisabled}
            />
            {errors.model_number && <p style={{ color: 'var(--mantine-color-red-6)', fontSize: 12, marginTop: 4 }}>{errors.model_number}</p>}
          </div>

          <TextInput label="IMEI" required placeholder="Enter 15–17 digit IMEI" maxLength={17}
            value={formData.imei}
            onChange={(e) => setField('imei', e.target.value)}
            error={errors.imei} disabled={isDisabled} />

          <TextInput label="Machine ID" placeholder="Enter machine ID (optional)"
            value={formData.machin_id}
            onChange={(e) => setField('machin_id', e.target.value)}
            error={errors.machin_id} disabled={isDisabled} />

          <div>
            <SearchableSelect
              label="Client"
              options={clients.map(c => ({ value: String(c.client_id), label: c.name }))}
              value={formData.client_id ? String(formData.client_id) : ''}
              onChange={(v) => setField('client_id', v || '')}
              placeholder="No client assigned"
              disabled={isDisabled}
            />
            {errors.client_id && <p style={{ color: 'var(--mantine-color-red-6)', fontSize: 12, marginTop: 4 }}>{errors.client_id}</p>}
          </div>

          <Group justify="flex-end" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
            <Button variant="default" onClick={handleClose} disabled={isDisabled}>Cancel</Button>
            <Button type="submit" color="violet" loading={loading} disabled={isDisabled}>Update Device</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};

export default EditDeviceModal;
