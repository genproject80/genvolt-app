import React, { useState } from 'react';
import Modal from '../common/Modal';
import { deviceService } from '../../services/deviceService';
import { CogIcon, KeyIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * DeviceConfigModal — 2-tab modal for ACTIVE devices:
 *   Tab 1: Push motor/wheel config update via MQTT config_update
 *   Tab 2: Rotate MQTT credentials with confirmation
 */
const DeviceConfigModal = ({ isOpen, onClose, device, onSuccess }) => {
  const [activeTab, setActiveTab] = useState('config');
  const [configLoading, setConfigLoading] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Config fields
  const [motorOnTime, setMotorOnTime] = useState('');
  const [motorOffTime, setMotorOffTime] = useState('');
  const [wheelThreshold, setWheelThreshold] = useState('');

  // Rotate credentials
  const [rotateConfirmed, setRotateConfirmed] = useState(false);

  const reset = () => {
    setError('');
    setSuccess('');
    setMotorOnTime('');
    setMotorOffTime('');
    setWheelThreshold('');
    setRotateConfirmed(false);
    setActiveTab('config');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTabChange = (tab) => {
    setError('');
    setSuccess('');
    setActiveTab(tab);
  };

  const handlePushConfig = async () => {
    if (!motorOnTime && !motorOffTime && !wheelThreshold) {
      setError('Enter at least one configuration value.');
      return;
    }
    const config = {};
    if (motorOnTime)    config.Motor_ON_Time_sec   = Number(motorOnTime);
    if (motorOffTime)   config.Motor_OFF_Time_min  = Number(motorOffTime);
    if (wheelThreshold) config.Wheel_Threshold     = Number(wheelThreshold);

    try {
      setError('');
      setSuccess('');
      setConfigLoading(true);
      await deviceService.pushDeviceConfig(device.device_id, config);
      setSuccess('Config update sent to device successfully.');
      setMotorOnTime('');
      setMotorOffTime('');
      setWheelThreshold('');
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to push config');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleRotateCredentials = async () => {
    if (!rotateConfirmed) {
      setError('Please confirm credential rotation before proceeding.');
      return;
    }
    try {
      setError('');
      setSuccess('');
      setRotateLoading(true);
      await deviceService.rotateDeviceCredentials(device.device_id);
      setSuccess('Credentials rotated. New credentials sent to device.');
      setRotateConfirmed(false);
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to rotate credentials');
    } finally {
      setRotateLoading(false);
    }
  };

  if (!device) return null;

  const isLoading = configLoading || rotateLoading;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Device Configuration" size="md">
      <div className="space-y-4">
        {/* Device info */}
        <div className="text-sm text-gray-600">
          <span className="font-medium text-gray-800">{device.device_id}</span>
          {device.imei && <span className="ml-2 text-gray-400">IMEI: {device.imei}</span>}
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => handleTabChange('config')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'config'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <CogIcon className="w-4 h-4" />
            Config Update
          </button>
          <button
            onClick={() => handleTabChange('credentials')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'credentials'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <KeyIcon className="w-4 h-4" />
            Rotate Credentials
          </button>
        </div>

        {/* Config Update tab */}
        {activeTab === 'config' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Values are sent to the device via MQTT config topic. Leave blank to omit a field.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motor ON Time (seconds)
              </label>
              <input
                type="number"
                min="0"
                value={motorOnTime}
                onChange={(e) => setMotorOnTime(e.target.value)}
                placeholder="e.g. 30"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Motor OFF Time (minutes)
              </label>
              <input
                type="number"
                min="0"
                value={motorOffTime}
                onChange={(e) => setMotorOffTime(e.target.value)}
                placeholder="e.g. 5"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Wheel Threshold
              </label>
              <input
                type="number"
                min="0"
                value={wheelThreshold}
                onChange={(e) => setWheelThreshold(e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        )}

        {/* Rotate Credentials tab */}
        {activeTab === 'credentials' && (
          <div className="space-y-3">
            <div className="flex items-start space-x-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">This will rotate MQTT credentials</p>
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-amber-700">
                  <li>A new password is generated and saved to the database</li>
                  <li>The new credentials are sent to the device via the config topic</li>
                  <li>The device will disconnect and reconnect with the new password</li>
                  <li>There may be a brief interruption in data transmission</li>
                </ul>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rotateConfirmed}
                onChange={(e) => setRotateConfirmed(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">
                I understand the impact and confirm credential rotation
              </span>
            </label>
          </div>
        )}

        {/* Feedback messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Close
          </button>
          {activeTab === 'config' && (
            <button
              type="button"
              onClick={handlePushConfig}
              disabled={configLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {configLoading && <LoadingSpinner size="sm" inline className="mr-2" />}
              Send Config
            </button>
          )}
          {activeTab === 'credentials' && (
            <button
              type="button"
              onClick={handleRotateCredentials}
              disabled={rotateLoading || !rotateConfirmed}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {rotateLoading && <LoadingSpinner size="sm" inline className="mr-2" />}
              Rotate Credentials
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default DeviceConfigModal;
