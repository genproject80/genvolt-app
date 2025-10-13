import React, { createContext, useContext, useState, useCallback } from 'react';
import { deviceService } from '../services/deviceService.js';

const DeviceContext = createContext({});

export const useDevice = () => {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within a DeviceProvider');
  }
  return context;
};

export const DeviceProvider = ({ children }) => {
  const [devices, setDevices] = useState([]);
  const [deviceStats, setDeviceStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false
  });

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getAllDevices = useCallback(async (options = {}) => {
    try {
      console.log('🔧 DeviceContext: Fetching devices with options:', options);
      setLoading(true);
      setError(null);

      const response = await deviceService.getAllDevices(options);

      if (response.success) {
        console.log('🔧 DeviceContext: Devices fetched successfully:', response.data.data?.length, 'devices');
        setDevices(response.data.data || []);
        setPagination(response.data.pagination || {});
        return response;
      } else {
        throw new Error(response.message || 'Failed to fetch devices');
      }
    } catch (err) {
      setError(err.message);
      console.error('🔧 DeviceContext: Failed to fetch devices:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getDeviceById = useCallback(async (deviceId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await deviceService.getDeviceById(deviceId);

      if (response.success) {
        return response.data.device;
      } else {
        throw new Error(response.message || 'Failed to fetch device');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch device:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createDevice = useCallback(async (deviceData) => {
    try {
      setLoading(true);
      setError(null);

      const response = await deviceService.createDevice(deviceData);

      if (response.success) {
        // Add the new device to the existing list
        setDevices(prevDevices => [response.data.device, ...prevDevices]);
        return response.data.device;
      } else {
        throw new Error(response.message || 'Failed to create device');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to create device';
      setError(errorMessage);
      console.error('Failed to create device:', err);

      const errorToThrow = new Error(errorMessage);
      errorToThrow.response = err.response;
      throw errorToThrow;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateDevice = useCallback(async (deviceId, deviceData) => {
    try {
      setLoading(true);
      setError(null);

      const response = await deviceService.updateDevice(deviceId, deviceData);

      if (response.success) {
        // Update devices list with updated device
        setDevices(prevDevices =>
          prevDevices.map(device =>
            device.id === deviceId ? { ...device, ...response.data.device } : device
          )
        );
        return response.data.device;
      } else {
        throw new Error(response.message || 'Failed to update device');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update device';
      setError(errorMessage);
      console.error('Failed to update device:', err);

      const errorToThrow = new Error(errorMessage);
      errorToThrow.response = err.response;
      throw errorToThrow;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteDevice = useCallback(async (deviceId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await deviceService.deleteDevice(deviceId);

      if (response.success) {
        // Remove device from list
        setDevices(prevDevices =>
          prevDevices.filter(device => device.id !== deviceId)
        );
        return response;
      } else {
        throw new Error(response.message || 'Failed to delete device');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to delete device:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const transferDevice = useCallback(async (deviceId, targetClientId, machineId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await deviceService.transferDevice(deviceId, targetClientId, machineId);

      if (response.success) {
        // Update device in list with new client info
        setDevices(prevDevices =>
          prevDevices.map(device =>
            device.id === deviceId ? { ...device, ...response.data.device } : device
          )
        );
        return response;
      } else {
        throw new Error(response.message || 'Failed to transfer device');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to transfer device';
      setError(errorMessage);
      console.error('Failed to transfer device:', err);

      const errorToThrow = new Error(errorMessage);
      errorToThrow.response = err.response;
      throw errorToThrow;
    } finally {
      setLoading(false);
    }
  }, []);

  const getDeviceTransferHistory = useCallback(async (deviceId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await deviceService.getDeviceTransferHistory(deviceId);

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch transfer history');
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch transfer history:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getDeviceStats = useCallback(async () => {
    try {
      console.log('📊 DeviceContext: Fetching device statistics...');
      setError(null);

      const response = await deviceService.getDeviceStats();

      if (response.success) {
        console.log('📊 DeviceContext: Device statistics fetched successfully');
        setDeviceStats(response.data);
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch device statistics');
      }
    } catch (err) {
      setError(err.message);
      console.error('📊 DeviceContext: Failed to fetch device statistics:', err);
      throw err;
    }
  }, []);

  const value = {
    // State
    devices,
    deviceStats,
    loading,
    error,
    pagination,

    // Actions
    getAllDevices,
    getDeviceById,
    createDevice,
    updateDevice,
    deleteDevice,
    transferDevice,
    getDeviceTransferHistory,
    getDeviceStats,
    clearError
  };

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
};

export default DeviceContext;
