import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const DashboardContext = createContext({});

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};

export const DashboardProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();

  // Dashboard state
  const [dashboards, setDashboards] = useState([]);
  const [activeDashboard, setActiveDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Hierarchy filters state
  const [hierarchyFilters, setHierarchyFilters] = useState({
    sden: null,
    den: null,
    aen: null,
    sse: null,
    machineId: null
  });

  // Filter options state
  const [filterOptions, setFilterOptions] = useState({
    sden: [],
    den: [],
    aen: [],
    sse: []
  });

  // Filtered devices state
  const [filteredDevices, setFilteredDevices] = useState([]);
  const [filteredDeviceIds, setFilteredDeviceIds] = useState([]);

  // IoT data state
  const [iotData, setIotData] = useState([]);
  const [iotDataLoading, setIotDataLoading] = useState(false);
  const [iotDataError, setIotDataError] = useState(null);
  const [iotDataPagination, setIotDataPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false
  });

  // Statistics state
  const [statistics, setStatistics] = useState(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);

  // Base API URL
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

  // Helper function to make authenticated API calls
  const makeAuthenticatedRequest = async (url, options = {}) => {
    try {
      const token = localStorage.getItem('accessToken');

      console.log('Making request to:', `${API_BASE}${url}`);
      console.log('Token available:', !!token);

      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...options.headers,
        },
      });

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Error response:', errorText);

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { message: errorText || 'An error occurred' };
        }

        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const responseData = await response.json();
      console.log('Response data:', responseData);
      return responseData;
    } catch (error) {
      console.error('API request failed:', error);
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        throw new Error('Unable to connect to server. Please check if the server is running on port 5001.');
      }
      throw error;
    }
  };

  // Fetch user dashboards
  const fetchDashboards = useCallback(async () => {
    if (!isAuthenticated) return;

    setLoading(true);
    setError(null);

    try {
      const response = await makeAuthenticatedRequest('/dashboards');
      setDashboards(response.data || []);

      // Set default active dashboard if none is selected
      if (!activeDashboard && response.data?.length > 0) {
        setActiveDashboard(response.data[0]);
      }
    } catch (err) {
      console.error('Error fetching dashboards:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, activeDashboard]);

  // Fetch hierarchy filter options
  const fetchFilterOptions = useCallback(async (filterType, parentFilters = {}) => {
    try {
      let url = `/hierarchy-filters/${filterType}`;
      const params = new URLSearchParams();

      // Add active dashboard ID to filter by dashboard's client
      if (activeDashboard?.id) {
        params.append('dashboard_id', activeDashboard.id);
      }

      Object.entries(parentFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await makeAuthenticatedRequest(url);
      return response.data || [];
    } catch (err) {
      console.error(`Error fetching ${filterType} options:`, err);
      return [];
    }
  }, [activeDashboard?.id]);

  // Update filter options based on current selections
  const updateFilterOptions = useCallback(async () => {
    try {
      // Always fetch SDEN options
      const sdenOptions = await fetchFilterOptions('sden');

      // Fetch DEN options based on SDEN selection
      const denOptions = hierarchyFilters.sden
        ? await fetchFilterOptions('den', { sden: hierarchyFilters.sden })
        : await fetchFilterOptions('den');

      // Fetch AEN options based on SDEN and DEN selections
      const aenOptions = await fetchFilterOptions('aen', {
        sden: hierarchyFilters.sden,
        den: hierarchyFilters.den
      });

      // Fetch SSE options based on all parent selections
      const sseOptions = await fetchFilterOptions('sse', {
        sden: hierarchyFilters.sden,
        den: hierarchyFilters.den,
        aen: hierarchyFilters.aen
      });

      setFilterOptions({
        sden: sdenOptions,
        den: denOptions,
        aen: aenOptions,
        sse: sseOptions
      });
    } catch (err) {
      console.error('Error updating filter options:', err);
    }
  }, [hierarchyFilters, fetchFilterOptions]);

  // Apply hierarchy filters and get matching devices
  const applyFilters = useCallback(async (filters = hierarchyFilters) => {
    try {
      const requestBody = { ...filters };

      // Add dashboard ID to filter by dashboard's client
      if (activeDashboard?.id) {
        requestBody.dashboard_id = activeDashboard.id;
      }

      const response = await makeAuthenticatedRequest('/hierarchy-filters/apply', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      setFilteredDevices(response.data.devices || []);
      setFilteredDeviceIds(response.data.device_ids || []);

      return response.data;
    } catch (err) {
      console.error('Error applying filters:', err);
      setFilteredDevices([]);
      setFilteredDeviceIds([]);
      throw err;
    }
  }, [hierarchyFilters, activeDashboard?.id]);

  // Fetch IoT data with current filters
  const fetchIoTData = useCallback(async (options = {}) => {
    const {
      page = iotDataPagination.page,
      limit = iotDataPagination.limit,
      search = '',
      sortField = 'Timestamp',
      sortOrder = 'DESC'
    } = options;

    setIotDataLoading(true);
    setIotDataError(null);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sort_field: sortField,
        sort_order: sortOrder
      });

      if (filteredDeviceIds.length > 0) {
        params.append('device_ids', JSON.stringify(filteredDeviceIds));
      }

      if (search) {
        params.append('search', search);
      }

      const response = await makeAuthenticatedRequest(`/iot-data/sick?${params}`);

      setIotData(response.data || []);
      setIotDataPagination(response.meta || {});

      return response;
    } catch (err) {
      console.error('Error fetching IoT data:', err);
      setIotDataError(err.message);
      throw err;
    } finally {
      setIotDataLoading(false);
    }
  }, [filteredDeviceIds, iotDataPagination.page, iotDataPagination.limit]);

  // Fetch statistics for current filters
  const fetchStatistics = useCallback(async () => {
    if (filteredDeviceIds.length === 0) {
      setStatistics(null);
      return;
    }

    setStatisticsLoading(true);

    try {
      const params = new URLSearchParams({
        device_ids: JSON.stringify(filteredDeviceIds)
      });

      const response = await makeAuthenticatedRequest(`/iot-data/sick/stats?${params}`);
      setStatistics(response.data || null);

      return response.data;
    } catch (err) {
      console.error('Error fetching statistics:', err);
      setStatistics(null);
    } finally {
      setStatisticsLoading(false);
    }
  }, [filteredDeviceIds]);

  // Export IoT data
  const exportIoTData = useCallback(async (format = 'json', options = {}) => {
    try {
      const params = new URLSearchParams({
        format,
        limit: options.limit || '10000'
      });

      if (filteredDeviceIds.length > 0) {
        params.append('device_ids', JSON.stringify(filteredDeviceIds));
      }

      if (options.search) {
        params.append('search', options.search);
      }

      const response = await makeAuthenticatedRequest(`/iot-data/sick/export?${params}`);
      return response;
    } catch (err) {
      console.error('Error exporting IoT data:', err);
      throw err;
    }
  }, [filteredDeviceIds]);

  // Update hierarchy filters
  const updateHierarchyFilters = useCallback((newFilters) => {
    setHierarchyFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setHierarchyFilters({
      sden: null,
      den: null,
      aen: null,
      sse: null,
      machineId: null
    });
    setFilteredDevices([]);
    setFilteredDeviceIds([]);
  }, []);

  // Reset IoT data pagination
  const resetPagination = useCallback(() => {
    setIotDataPagination(prev => ({
      ...prev,
      page: 1
    }));
  }, []);

  // Initialize dashboard data when user changes or becomes authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchDashboards();
    }
  }, [isAuthenticated, user, fetchDashboards]);

  // Reset filters and data when active dashboard changes
  useEffect(() => {
    if (activeDashboard) {
      // Clear all filters
      setHierarchyFilters({
        sden: null,
        den: null,
        aen: null,
        sse: null,
        machineId: null
      });

      // Clear all data
      setFilteredDevices([]);
      setFilteredDeviceIds([]);
      setIotData([]);
      setStatistics(null);

      // Reset pagination
      setIotDataPagination(prev => ({
        ...prev,
        page: 1
      }));
    }
  }, [activeDashboard?.id]);

  // Load filter options when dashboard changes or filters change
  useEffect(() => {
    if (isAuthenticated && activeDashboard) {
      updateFilterOptions();
    }
  }, [hierarchyFilters.sden, hierarchyFilters.den, hierarchyFilters.aen, isAuthenticated, activeDashboard]);

  // Auto-fetch IoT data when filters or pagination changes
  useEffect(() => {
    if (isAuthenticated && activeDashboard && (filteredDeviceIds.length > 0 || Object.values(hierarchyFilters).some(Boolean))) {
      fetchIoTData();
    } else if (!activeDashboard) {
      // Clear data when no dashboard is selected
      setIotData([]);
      setFilteredDevices([]);
      setFilteredDeviceIds([]);
      setStatistics(null);
    }
  }, [filteredDeviceIds, iotDataPagination.page, iotDataPagination.limit, isAuthenticated, activeDashboard]);

  // Auto-fetch statistics when filtered devices change
  useEffect(() => {
    if (isAuthenticated && activeDashboard && filteredDeviceIds.length > 0) {
      fetchStatistics();
    } else if (!activeDashboard) {
      setStatistics(null);
    }
  }, [filteredDeviceIds, isAuthenticated, activeDashboard, fetchStatistics]);

  const value = {
    // Dashboard state
    dashboards,
    activeDashboard,
    setActiveDashboard,
    loading,
    error,

    // Hierarchy filters
    hierarchyFilters,
    filterOptions,
    filteredDevices,
    filteredDeviceIds,
    updateHierarchyFilters,
    clearFilters,
    applyFilters,

    // IoT data
    iotData,
    iotDataLoading,
    iotDataError,
    iotDataPagination,
    fetchIoTData,
    resetPagination,

    // Statistics
    statistics,
    statisticsLoading,
    fetchStatistics,

    // Actions
    fetchDashboards,
    updateFilterOptions,
    exportIoTData
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};