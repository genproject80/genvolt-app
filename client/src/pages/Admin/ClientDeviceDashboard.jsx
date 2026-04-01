import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  NoSymbolIcon,
  ArrowPathIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  CogIcon,
} from '@heroicons/react/24/outline';
import { useDevice } from '../../context/DeviceContext';
import { useDevicePermissions } from '../../hooks/useDevicePermissions';
import { clientService } from '../../services/clientService';
import { deviceService } from '../../services/deviceService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ActivateDeviceModal from '../../components/modals/ActivateDeviceModal';
import DeactivateDeviceModal from '../../components/modals/DeactivateDeviceModal';
import DeviceConfigModal from '../../components/modals/DeviceConfigModal';

const STATUS_STYLES = {
  ACTIVE:   'bg-green-100 text-green-800',
  PENDING:  'bg-yellow-100 text-yellow-800',
  INACTIVE: 'bg-red-100 text-red-800',
};

const ClientDeviceDashboard = () => {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const { reactivateDevice } = useDevice();
  const { canOnboardDevice, canEditDevice, canPauseResume } = useDevicePermissions();

  const [client, setClient] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // deviceId of in-progress action
  const [error, setError] = useState('');

  // Modal state
  const [activateDevice, setActivateDevice]     = useState(null);
  const [deactivateDevice, setDeactivateDevice] = useState(null);
  const [configDevice, setConfigDevice]         = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [clientRes, devicesRes] = await Promise.all([
        clientService.getClientById(clientId),
        deviceService.getAllDevices({ client_id: clientId, limit: 200 }),
      ]);
      if (clientRes?.success || clientRes?.data) {
        setClient(clientRes.data || clientRes);
      }
      const list = devicesRes?.data?.devices || devicesRes?.devices || devicesRes?.data || [];
      setDevices(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReactivate = async (device) => {
    try {
      setActionLoading(device.device_id);
      await reactivateDevice(device.device_id);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Reactivation failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (device) => {
    try {
      setActionLoading(device.device_id);
      await deviceService.pauseDevice(device.device_id);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Pause failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (device) => {
    try {
      setActionLoading(device.device_id);
      await deviceService.resumeDevice(device.device_id);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Resume failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Stats derived from devices list
  const stats = {
    total:    devices.length,
    active:   devices.filter(d => d.activation_status === 'ACTIVE').length,
    pending:  devices.filter(d => d.activation_status === 'PENDING').length,
    inactive: devices.filter(d => d.activation_status === 'INACTIVE').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {client?.name || `Client ${clientId}`} — Devices
          </h1>
          <p className="text-sm text-gray-500">Manage device lifecycle and configuration</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-gray-800' },
          { label: 'Active',   value: stats.active,   color: 'text-green-700' },
          { label: 'Pending',  value: stats.pending,  color: 'text-yellow-700' },
          { label: 'Inactive', value: stats.inactive, color: 'text-red-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Device table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Device ID', 'IMEI', 'Type', 'Status', 'Data', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No devices found for this client.
                  </td>
                </tr>
              ) : devices.map(device => {
                const isBusy = actionLoading === device.device_id;
                const isActive   = device.activation_status === 'ACTIVE';
                const isPending  = device.activation_status === 'PENDING';
                const isInactive = device.activation_status === 'INACTIVE';
                const isPaused   = device.data_enabled === false || device.data_enabled === 0;

                return (
                  <tr key={device.device_id || device.imei} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {device.device_id || <span className="text-gray-400 italic">unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {device.imei || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {device.device_type || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[device.activation_status] || 'bg-gray-100 text-gray-600'}`}>
                        {device.activation_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {isActive
                        ? (isPaused
                          ? <span className="text-orange-600 font-medium">Paused</span>
                          : <span className="text-green-600 font-medium">Enabled</span>)
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isBusy && <LoadingSpinner size="sm" inline />}

                        {/* Activate (PENDING) */}
                        {isPending && canOnboardDevice && (
                          <button
                            onClick={() => setActivateDevice(device)}
                            disabled={isBusy}
                            className="p-1.5 rounded text-green-600 hover:bg-green-50 disabled:opacity-40"
                            title="Activate"
                          >
                            <CheckCircleIcon className="w-4 h-4" />
                          </button>
                        )}

                        {/* Deactivate (ACTIVE) */}
                        {isActive && canEditDevice && (
                          <button
                            onClick={() => setDeactivateDevice(device)}
                            disabled={isBusy}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-40"
                            title="Deactivate"
                          >
                            <NoSymbolIcon className="w-4 h-4" />
                          </button>
                        )}

                        {/* Reactivate (INACTIVE) */}
                        {isInactive && canOnboardDevice && (
                          <button
                            onClick={() => handleReactivate(device)}
                            disabled={isBusy}
                            className="p-1.5 rounded text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                            title="Reactivate"
                          >
                            <ArrowPathIcon className="w-4 h-4" />
                          </button>
                        )}

                        {/* Pause / Resume (ACTIVE) */}
                        {isActive && canPauseResume && (
                          isPaused ? (
                            <button
                              onClick={() => handleResume(device)}
                              disabled={isBusy}
                              className="p-1.5 rounded text-green-600 hover:bg-green-50 disabled:opacity-40"
                              title="Resume Data"
                            >
                              <PlayCircleIcon className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePause(device)}
                              disabled={isBusy}
                              className="p-1.5 rounded text-orange-600 hover:bg-orange-50 disabled:opacity-40"
                              title="Pause Data"
                            >
                              <PauseCircleIcon className="w-4 h-4" />
                            </button>
                          )
                        )}

                        {/* Config / Credentials (ACTIVE) */}
                        {isActive && canEditDevice && (
                          <button
                            onClick={() => setConfigDevice(device)}
                            disabled={isBusy}
                            className="p-1.5 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                            title="Config & Credentials"
                          >
                            <CogIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <ActivateDeviceModal
        isOpen={!!activateDevice}
        onClose={() => setActivateDevice(null)}
        device={activateDevice}
        fixedClientId={clientId}
        onSuccess={loadData}
      />
      <DeactivateDeviceModal
        isOpen={!!deactivateDevice}
        onClose={() => setDeactivateDevice(null)}
        device={deactivateDevice}
        onSuccess={loadData}
      />
      <DeviceConfigModal
        isOpen={!!configDevice}
        onClose={() => setConfigDevice(null)}
        device={configDevice}
        onSuccess={loadData}
      />
    </div>
  );
};

export default ClientDeviceDashboard;
