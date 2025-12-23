import React, { createContext, useState, useContext, useCallback } from 'react';
import { useAuth } from './AuthContext';

const DeviceDetailContext = createContext({});

export const useDeviceDetail = () => {
  const context = useContext(DeviceDetailContext);
  if (!context) {
    throw new Error('useDeviceDetail must be used within a DeviceDetailProvider');
  }
  return context;
};

export const DeviceDetailProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  // Device detail state
  const [deviceDetail, setDeviceDetail] = useState(null);
  const [deviceHistory, setDeviceHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);
  const [historyError, setHistoryError] = useState(null);

  // History filters state
  const [historyFilters, setHistoryFilters] = useState({
    timeRange: 'all',
    status: 'all',
    search: '',
    date: ''
  });

  // History pagination state
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  });

  // Base API URL - use relative path when VITE_API_URL is empty (for Vite proxy)
  const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api';

  // Helper function to make authenticated API calls
  const makeAuthenticatedRequest = async (url, options = {}) => {
    try {
      const token = localStorage.getItem('accessToken');

      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText || 'An error occurred' };
        }
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      return responseData;
    } catch (error) {
      console.error('API request failed:', error);
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        throw new Error('Unable to connect to server. Please check if the server is running on port 5001.');
      }
      throw error;
    }
  };

  // Fetch device details
  const fetchDeviceDetail = useCallback(async (deviceId) => {
    if (!isAuthenticated || !deviceId) {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await makeAuthenticatedRequest(`/device-details/${deviceId}`);
      setDeviceDetail(response.data);
      return response.data;
    } catch (err) {
      console.error('Error fetching device details:', err);
      setError(err.message);
      setDeviceDetail(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch device history
  const fetchDeviceHistory = useCallback(async (deviceId, options = {}) => {
    if (!isAuthenticated || !deviceId) return;

    const {
      timeRange = historyFilters.timeRange,
      status = historyFilters.status,
      search = historyFilters.search,
      date = historyFilters.date,
      page = historyPagination.page,
      limit = historyPagination.limit,
      sortField = 'timestamp',
      sortOrder = 'DESC'
    } = options;

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      console.log('Fetching device history with params:', {
        timeRange,
        status,
        search,
        date,
        page,
        limit,
        sortField,
        sortOrder
      });

      const params = new URLSearchParams({
        timeRange,
        status,
        search,
        date,
        page: page.toString(),
        limit: limit.toString(),
        sortField,
        sortOrder
      });

      console.log('API URL:', `/device-details/${deviceId}/history?${params}`);

      const response = await makeAuthenticatedRequest(`/device-details/${deviceId}/history?${params}`);

      setDeviceHistory(response.data || []);
      setHistoryPagination(response.meta || {});

      return response;
    } catch (err) {
      console.error('Error fetching device history:', err);
      setHistoryError(err.message);
      setDeviceHistory([]);
      throw err;
    } finally {
      setHistoryLoading(false);
    }
  }, [isAuthenticated, historyFilters, historyPagination.page, historyPagination.limit]);

  // Update history filters
  const updateHistoryFilters = useCallback((newFilters) => {
    setHistoryFilters(prev => ({
      ...prev,
      ...newFilters
    }));
    // Reset pagination when filters change
    setHistoryPagination(prev => ({
      ...prev,
      page: 1
    }));
  }, []);

  // Clear all data
  const clearDeviceDetail = useCallback(() => {
    setDeviceDetail(null);
    setDeviceHistory([]);
    setError(null);
    setHistoryError(null);
    setHistoryFilters({
      timeRange: 'all',
      status: 'all',
      search: '',
      date: ''
    });
    setHistoryPagination({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false
    });
  }, []);

  // Reset pagination
  const resetHistoryPagination = useCallback(() => {
    setHistoryPagination(prev => ({
      ...prev,
      page: 1
    }));
  }, []);

  // Navigate to next/previous page
  const navigateHistoryPage = useCallback((direction) => {
    setHistoryPagination(prev => {
      const newPage = direction === 'next' ? prev.page + 1 : prev.page - 1;
      if (newPage < 1 || newPage > prev.totalPages) return prev;

      return {
        ...prev,
        page: newPage
      };
    });
  }, []);

  // Format device data for display
  const formatDeviceData = useCallback((rawData) => {
    if (!rawData) return null;

    return {
      ...rawData,
      device_information: {
        ...rawData.device_information,
        record_time: rawData.device_information.record_time
          ? new Date(rawData.device_information.record_time).toLocaleString()
          : 'N/A'
      },
      operational_status: {
        ...rawData.operational_status,
        runtime_formatted: rawData.operational_status.runtime
          ? `${Math.floor(rawData.operational_status.runtime / 60)}h ${rawData.operational_status.runtime % 60}m`
          : 'N/A'
      },
      electrical_parameters: {
        ...rawData.electrical_parameters,
        hv_output_voltage_formatted: rawData.electrical_parameters.hv_output_voltage
          ? `${rawData.electrical_parameters.hv_output_voltage} kV`
          : '0 kV',
        hv_output_current_formatted: rawData.electrical_parameters.hv_output_current
          ? `${rawData.electrical_parameters.hv_output_current} mA`
          : '0 mA'
      }
    };
  }, []);

  // Format history data for display
  const formatHistoryData = useCallback((rawData) => {
    if (!Array.isArray(rawData)) return [];

    return rawData.map(item => ({
      ...item,
      timestamp_formatted: item.timestamp
        ? new Date(item.timestamp).toLocaleString()
        : 'N/A',
      runtime_formatted: item.runtime
        ? `${item.runtime} min`
        : 'N/A',
      hv_output_voltage_formatted: item.hv_output_voltage
        ? `${item.hv_output_voltage} kV`
        : '0 kV',
      hv_output_current_formatted: item.hv_output_current
        ? `${item.hv_output_current} mA`
        : '0 mA'
    }));
  }, []);

  const value = {
    // State
    deviceDetail: formatDeviceData(deviceDetail),
    deviceHistory: formatHistoryData(deviceHistory),
    loading,
    historyLoading,
    error,
    historyError,
    historyFilters,
    historyPagination,

    // Actions
    fetchDeviceDetail,
    fetchDeviceHistory,
    updateHistoryFilters,
    clearDeviceDetail,
    resetHistoryPagination,
    navigateHistoryPage,

    // Utilities
    formatDeviceData,
    formatHistoryData
  };

  return (
    <DeviceDetailContext.Provider value={value}>
      {children}
    </DeviceDetailContext.Provider>
  );
};