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
    currentPage: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  });

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const getAllDevices = useCallback(async (filters = {}) => {
    try {
      setLoading(true);
      setError(null);

      const response = await deviceService.getDevices(filters);

      if (response.success) {
        setDevices(response.data.devices);
        setPagination(response.data.pagination);
      } else {
        throw new Error(response.message || 'Failed to fetch devices');
      }
    } catch (error) {
      console.error('Error fetching devices:', error);
      let errorMessage = 'Failed to fetch devices';

      if (error.response) {
        // Server responded with error status
        errorMessage = `Server Error (${error.response.status}): ${error.response.data?.message || error.response.statusText}`;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'Network Error: Unable to connect to server. Please check if the backend server is running.';
      } else {
        // Something else happened
        errorMessage = error.message || 'Unknown error occurred';
      }

      setError(errorMessage);
      setDevices([]);
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
    } catch (error) {
      console.error('Error fetching device:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch device';
      setError(errorMessage);
      throw new Error(errorMessage);
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
        // Refresh device list after creation
        await getAllDevices();
        return response.data.device;
      } else {
        throw new Error(response.message || 'Failed to create device');
      }
    } catch (error) {
      console.error('Error creating device:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to create device';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getAllDevices]);

  const updateDevice = useCallback(async (deviceId, deviceData) => {
    try {
      setLoading(true);
      setError(null);

      const response = await deviceService.updateDevice(deviceId, deviceData);

      if (response.success) {
        // Update device in local state
        setDevices(prev => prev.map(device =>
          device.id === deviceId ? response.data.device : device
        ));
        return response.data.device;
      } else {
        throw new Error(response.message || 'Failed to update device');
      }
    } catch (error) {
      console.error('Error updating device:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update device';
      setError(errorMessage);
      throw new Error(errorMessage);
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
        // Remove device from local state
        setDevices(prev => prev.filter(device => device.id !== deviceId));
        return true;
      } else {
        throw new Error(response.message || 'Failed to delete device');
      }
    } catch (error) {
      console.error('Error deleting device:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete device';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const transferDevice = useCallback(async (deviceId, buyerId) => {
    try {
      setLoading(true);
      // Don't clear the global error state for transfer operations
      // Let the transfer modal handle its own error display

      const response = await deviceService.transferDevice(deviceId, { buyer_id: buyerId });

      if (response.success) {
        // Refresh device list to reflect ownership change
        await getAllDevices();
        return response.data.transfer;
      } else {
        throw new Error(response.message || 'Failed to transfer device');
      }
    } catch (error) {
      console.error('Error transferring device:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to transfer device';
      // Don't set global error state for transfer operations - let the modal handle it
      // setError(errorMessage);  // <- REMOVED THIS LINE
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [getAllDevices]);

  const getDeviceTransfers = useCallback(async (deviceId) => {
    try {
      setError(null);

      const response = await deviceService.getDeviceTransfers(deviceId);

      if (response.success) {
        return response.data.transfers;
      } else {
        throw new Error(response.message || 'Failed to fetch device transfers');
      }
    } catch (error) {
      console.error('Error fetching device transfers:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch device transfers';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  const getDeviceStats = useCallback(async () => {
    try {
      setError(null);

      const response = await deviceService.getDeviceStats();

      if (response.success) {
        setDeviceStats(response.data.stats);
        return response.data.stats;
      } else {
        throw new Error(response.message || 'Failed to fetch device statistics');
      }
    } catch (error) {
      console.error('Error fetching device stats:', error);
      let errorMessage = 'Failed to fetch device statistics';

      if (error.response) {
        // Server responded with error status
        errorMessage = `Server Error (${error.response.status}): ${error.response.data?.message || error.response.statusText}`;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = 'Network Error: Unable to connect to server for device statistics.';
      } else {
        // Something else happened
        errorMessage = error.message || 'Unknown error occurred while fetching device statistics';
      }

      setError(errorMessage);
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
    getDeviceTransfers,
    getDeviceStats,
    clearError
  };

  return (
    <DeviceContext.Provider value={value}>
      {children}
    </DeviceContext.Provider>
  );
};