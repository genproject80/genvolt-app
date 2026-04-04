import { useState, useEffect, useCallback } from 'react';
import hkmiConfigService from '../../services/hkmiConfigService';

const HKMIDeviceConfig = () => {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [currentConfig, setCurrentConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(true);

  // Form state
  const [formValues, setFormValues] = useState({
    Motor_ON_Time_sec: '',
    Motor_OFF_Time_min: '',
    Wheel_Threshold: '',
  });

  // Feedback
  const [message, setMessage] = useState(null); // { type: 'success'|'error', text: '' }
  const [publishing, setPublishing] = useState(false);

  // Load devices on mount
  useEffect(() => {
    const loadDevices = async () => {
      try {
        setDevicesLoading(true);
        const res = await hkmiConfigService.fetchHkmiDevices();
        setDevices(res.data || []);
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to load devices' });
      } finally {
        setDevicesLoading(false);
      }
    };
    loadDevices();
  }, []);

  // Fetch latest config when device changes
  const fetchConfig = useCallback(async (deviceId) => {
    if (!deviceId) {
      setCurrentConfig(null);
      return;
    }
    try {
      setConfigLoading(true);
      setMessage(null);
      const res = await hkmiConfigService.fetchDeviceLatestConfig(deviceId);
      setCurrentConfig(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load device config' });
      setCurrentConfig(null);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const handleDeviceChange = (e) => {
    const deviceId = e.target.value;
    setSelectedDeviceId(deviceId);
    setFormValues({ Motor_ON_Time_sec: '', Motor_OFF_Time_min: '', Wheel_Threshold: '' });
    fetchConfig(deviceId);
  };

  const handleRefresh = () => {
    if (selectedDeviceId) fetchConfig(selectedDeviceId);
  };

  const handleFormChange = (field, value) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handlePublish = async (e) => {
    e.preventDefault();

    const { Motor_ON_Time_sec, Motor_OFF_Time_min, Wheel_Threshold } = formValues;
    if (!Motor_ON_Time_sec || !Motor_OFF_Time_min || !Wheel_Threshold) {
      setMessage({ type: 'error', text: 'All config fields are required' });
      return;
    }

    try {
      setPublishing(true);
      setMessage(null);
      const res = await hkmiConfigService.publishDeviceConfig(selectedDeviceId, {
        Motor_ON_Time_sec: Number(Motor_ON_Time_sec),
        Motor_OFF_Time_min: Number(Motor_OFF_Time_min),
        Wheel_Threshold: Number(Wheel_Threshold),
      });
      setMessage({ type: 'success', text: res.message || 'Config published successfully' });
      setFormValues({ Motor_ON_Time_sec: '', Motor_OFF_Time_min: '', Wheel_Threshold: '' });
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Failed to publish config';
      setMessage({ type: 'error', text: errMsg });
    } finally {
      setPublishing(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-4">
      {/* Device Selector */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-4">
        <label htmlFor="device-select" className="block text-sm font-medium text-gray-700 mb-1">
          Select HKMI Device
        </label>
        <select
          id="device-select"
          value={selectedDeviceId}
          onChange={handleDeviceChange}
          disabled={devicesLoading}
          className="block w-full max-w-md rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3 border"
        >
          <option value="">
            {devicesLoading ? 'Loading devices...' : '— Select a device —'}
          </option>
          {devices.map((d) => (
            <option key={d.id} value={d.device_id}>
              {d.device_id}{d.machin_id ? ` (${d.machin_id})` : ''} — {d.activation_status || 'UNKNOWN'}
            </option>
          ))}
        </select>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Two-column layout: Current Config | Send New Config */}
      {selectedDeviceId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Current Config (left) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Current Config</h2>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={configLoading}
                className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                <svg className={`h-3.5 w-3.5 ${configLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>

            {configLoading ? (
              <div className="text-sm text-gray-500 py-4 text-center">Loading...</div>
            ) : currentConfig ? (
              <div className="space-y-3">
                <ConfigRow label="Motor ON Time (sec)" value={currentConfig.Motor_ON_Time_sec} />
                <ConfigRow label="Motor OFF Time (min)" value={currentConfig.Motor_OFF_Time_min} />
                <ConfigRow label="Wheel Threshold" value={currentConfig.Wheel_Threshold} />
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Last updated: {formatDate(currentConfig.CreatedAt)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">No config data available for this device</p>
            )}
          </div>

          {/* Send New Config (right) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Send New Config</h2>
            <form onSubmit={handlePublish} className="space-y-3">
              <ConfigInput
                label="Motor ON Time (sec)"
                value={formValues.Motor_ON_Time_sec}
                onChange={(v) => handleFormChange('Motor_ON_Time_sec', v)}
                placeholder={currentConfig?.Motor_ON_Time_sec?.toString() || ''}
              />
              <ConfigInput
                label="Motor OFF Time (min)"
                value={formValues.Motor_OFF_Time_min}
                onChange={(v) => handleFormChange('Motor_OFF_Time_min', v)}
                placeholder={currentConfig?.Motor_OFF_Time_min?.toString() || ''}
              />
              <ConfigInput
                label="Wheel Threshold"
                value={formValues.Wheel_Threshold}
                onChange={(v) => handleFormChange('Wheel_Threshold', v)}
                placeholder={currentConfig?.Wheel_Threshold?.toString() || ''}
              />
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={publishing}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {publishing ? 'Publishing...' : 'Save & Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

/** Read-only config value row */
const ConfigRow = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-600">{label}</span>
    <span className="text-sm font-medium text-gray-900">{value ?? '—'}</span>
  </div>
);

/** Editable config input */
const ConfigInput = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3 border"
      min="0"
      required
    />
  </div>
);

export default HKMIDeviceConfig;