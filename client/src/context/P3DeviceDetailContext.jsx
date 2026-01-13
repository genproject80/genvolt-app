import React, { createContext, useState, useContext, useCallback } from 'react';
import { useAuth } from './AuthContext';

const P3DeviceDetailContext = createContext({});

export const useP3DeviceDetail = () => {
  const context = useContext(P3DeviceDetailContext);
  if (!context) {
    throw new Error('useP3DeviceDetail must be used within a P3DeviceDetailProvider');
  }
  return context;
};

export const P3DeviceDetailProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();

  // P3 Device detail state
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

// Base API URL
  const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api`;
  
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
      console.error('P3 API request failed:', error);
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        throw new Error('Unable to connect to server. Please check if the server is running on port 5001.');
      }
      throw error;
    }
  };

  // Fetch P3 device details
  const fetchDeviceDetail = useCallback(async (entryId) => {
    if (!isAuthenticated || !entryId) {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await makeAuthenticatedRequest(`/p3-device-details/${entryId}`);
      setDeviceDetail(response.data);
      return response.data;
    } catch (err) {
      console.error('Error fetching P3 device details:', err);
      setError(err.message);
      setDeviceDetail(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Fetch P3 device history
  const fetchDeviceHistory = useCallback(async (entryId, options = {}) => {
    if (!isAuthenticated || !entryId) return;

    const {
      timeRange = historyFilters.timeRange,
      status = historyFilters.status,
      search = historyFilters.search,
      date = historyFilters.date,
      page = historyPagination.page,
      limit = historyPagination.limit,
      sortField = 'CreatedAt',
      sortOrder = 'DESC'
    } = options;

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      console.log('Fetching P3 device history with params:', {
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

      console.log('P3 API URL:', `/p3-device-details/${entryId}/history?${params}`);

      const response = await makeAuthenticatedRequest(`/p3-device-details/${entryId}/history?${params}`);

      setDeviceHistory(response.data || []);
      setHistoryPagination(response.meta || {});

      return response;
    } catch (err) {
      console.error('Error fetching P3 device history:', err);
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

  // Format P3 device data for display
  const formatDeviceData = useCallback((rawData) => {
    if (!rawData) return null;

    return {
      ...rawData,
      device_information: {
        ...rawData.device_information,
        record_time: rawData.device_information?.record_time
          ? new Date(rawData.device_information.record_time).toLocaleString()
          : 'N/A'
      },
      technical_details: {
        ...rawData.technical_details,
        motor_on_time_formatted: rawData.technical_details?.motor_on_time_sec
          ? `${rawData.technical_details.motor_on_time_sec} seconds`
          : '0 seconds',
        motor_off_time_formatted: rawData.technical_details?.motor_off_time_sec
          ? `${rawData.technical_details.motor_off_time_sec} seconds`
          : '0 seconds',
        current_draw_formatted: rawData.technical_details?.current_draw_ma
          ? `${rawData.technical_details.current_draw_ma} mA`
          : '0 mA'
      }
    };
  }, []);

  // Format history data for display
  const formatHistoryData = useCallback((rawData) => {
    if (!Array.isArray(rawData)) return [];

    return rawData.map(item => ({
      ...item,
      timestamp_formatted: item.CreatedAt
        ? new Date(item.CreatedAt).toLocaleString()
        : 'N/A',
      motor_current_formatted: item.Motor_Current_Average_mA
        ? `${item.Motor_Current_Average_mA} mA`
        : '0 mA',
      battery_voltage_formatted: item.Battery_Voltage_mV
        ? `${item.Battery_Voltage_mV} mV`
        : 'N/A'
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
    <P3DeviceDetailContext.Provider value={value}>
      {children}
    </P3DeviceDetailContext.Provider>
  );
};
