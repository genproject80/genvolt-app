import { useState, useEffect, useCallback, useRef } from 'react';
import hkmiConfigService from '../../services/hkmiConfigService';

/** Format device for display */
const deviceLabel = (d) =>
  `${d.device_id}${d.machin_id ? ` (${d.machin_id})` : ''} — ${d.activation_status || 'UNKNOWN'}`;

const HKMIDeviceConfig = () => {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [currentConfig, setCurrentConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(true);

  // Searchable dropdown state
  const [searchText, setSearchText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered devices based on search
  const filteredDevices = devices.filter((d) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      d.device_id?.toLowerCase().includes(q) ||
      d.machin_id?.toLowerCase().includes(q) ||
      d.activation_status?.toLowerCase().includes(q)
    );
  });

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

  const handleDeviceSelect = (device) => {
    setSelectedDeviceId(device.device_id);
    setSearchText(deviceLabel(device));
    setDropdownOpen(false);
    setFormValues({ Motor_ON_Time_sec: '', Motor_OFF_Time_min: '', Wheel_Threshold: '' });
    fetchConfig(device.device_id);
  };

  const handleClearSelection = () => {
    setSelectedDeviceId('');
    setSearchText('');
    setCurrentConfig(null);
    setFormValues({ Motor_ON_Time_sec: '', Motor_OFF_Time_min: '', Wheel_Threshold: '' });
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
      {/* Searchable Device Selector */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-5 py-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select HKMI Device
        </label>
        <div className="relative max-w-md" ref={dropdownRef}>
          <div className="relative">
            <input
              type="text"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setDropdownOpen(true);
                if (selectedDeviceId) {
                  setSelectedDeviceId('');
                  setCurrentConfig(null);
                }
              }}
              onFocus={() => setDropdownOpen(true)}
              placeholder={devicesLoading ? 'Loading devices...' : 'Search by device ID, machine ID...'}
              disabled={devicesLoading}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 pl-3 pr-16 border"
            />
            <div className="absolute inset-y-0 right-0 flex items-center">
              {selectedDeviceId && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="p-1.5 text-gray-400 hover:text-gray-600"
                  title="Clear selection"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="p-1.5 pr-3 text-gray-400 hover:text-gray-600"
              >
                <svg className={`h-4 w-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {dropdownOpen && !devicesLoading && (
            <ul className="absolute z-30 mt-1 w-full max-h-60 overflow-auto rounded-md bg-white border border-gray-200 shadow-lg py-1">
              {filteredDevices.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500">No devices found</li>
              ) : (
                filteredDevices.map((d) => (
                  <li
                    key={d.id}
                    onClick={() => handleDeviceSelect(d)}
                    className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${
                      d.device_id === selectedDeviceId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'
                    }`}
                  >
                    <span className="font-medium">{d.device_id}</span>
                    {d.machin_id && <span className="text-gray-500 ml-1">({d.machin_id})</span>}
                    <span className={`ml-2 inline-block text-xs px-1.5 py-0.5 rounded ${
                      d.activation_status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {d.activation_status || 'UNKNOWN'}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
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