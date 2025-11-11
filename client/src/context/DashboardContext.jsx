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

  // GSM signal strength filter state (independent of hierarchy filters)
  const [gsmFilter, setGsmFilter] = useState({
    enabled: false,
    avgSignalStrength: null
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
  const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api`;

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

      // Clear GSM filter when hierarchy filters are applied (mutually exclusive)
      setGsmFilter({
        enabled: false,
        avgSignalStrength: null
      });

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
      page = 1,
      limit = 20,
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

      // Pass hierarchy filters to ensure correct hierarchy matching (only if GSM filter is not active)
      if (!gsmFilter.enabled) {
        if (hierarchyFilters.sden) {
          params.append('sden', hierarchyFilters.sden);
        }
        if (hierarchyFilters.den) {
          params.append('den', hierarchyFilters.den);
        }
        if (hierarchyFilters.aen) {
          params.append('aen', hierarchyFilters.aen);
        }
        if (hierarchyFilters.sse) {
          params.append('sse', hierarchyFilters.sse);
        }
      }

      if (search) {
        params.append('search', search);
      }

      // Add GSM filter if enabled
      if (gsmFilter.enabled && gsmFilter.avgSignalStrength !== null) {
        params.append('gsm_filter', 'below_average');
        params.append('avg_gsm', gsmFilter.avgSignalStrength.toString());
      }

      const response = await makeAuthenticatedRequest(`/iot-data/sick?${params}`);

      setIotData(response.data || []);
      setIotDataPagination(response.meta || {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false
      });

      return response;
    } catch (err) {
      console.error('Error fetching IoT data:', err);
      setIotDataError(err.message);
      throw err;
    } finally {
      setIotDataLoading(false);
    }
  }, [filteredDeviceIds, hierarchyFilters, gsmFilter]);

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

  // Save user preferences
  const saveUserPreference = useCallback(async (preferenceName, preferenceValue) => {
    try {
      const requestBody = {
        preference_name: preferenceName,
        preference_value: JSON.stringify(preferenceValue),
        dashboard_id: activeDashboard?.id
      };

      const response = await makeAuthenticatedRequest('/user-preferences', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      return response;
    } catch (err) {
      console.error('Error saving user preference:', err);
      throw err;
    }
  }, [activeDashboard?.id]);

  // Load user preferences
  const loadUserPreference = useCallback(async (preferenceName) => {
    try {
      const params = new URLSearchParams({
        preference_name: preferenceName
      });

      if (activeDashboard?.id) {
        params.append('dashboard_id', activeDashboard.id);
      }

      const response = await makeAuthenticatedRequest(`/user-preferences?${params}`);

      if (response.data && response.data.preference_value) {
        try {
          return JSON.parse(response.data.preference_value);
        } catch (e) {
          return response.data.preference_value;
        }
      }

      return null;
    } catch (err) {
      console.error('Error loading user preference:', err);
      return null;
    }
  }, [activeDashboard?.id]);

  // Delete user preference
  const deleteUserPreference = useCallback(async (preferenceName) => {
    try {
      const params = new URLSearchParams({
        preference_name: preferenceName
      });

      if (activeDashboard?.id) {
        params.append('dashboard_id', activeDashboard.id);
      }

      const response = await makeAuthenticatedRequest(`/user-preferences?${params}`, {
        method: 'DELETE'
      });

      return response;
    } catch (err) {
      console.error('Error deleting user preference:', err);
      throw err;
    }
  }, [activeDashboard?.id]);

  // Update hierarchy filters
  const updateHierarchyFilters = useCallback((newFilters) => {
    setHierarchyFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  }, []);

  // Fetch all devices for the dashboard (no filters)
  const fetchAllDevices = useCallback(async () => {
    if (!activeDashboard?.id) return;

    try {
      const pool = await makeAuthenticatedRequest(`/hierarchy-filters/devices?dashboard_id=${activeDashboard.id}`);

      setFilteredDevices(pool.data?.devices || []);
      setFilteredDeviceIds(pool.data?.device_ids || []);

      return pool.data;
    } catch (err) {
      console.error('Error fetching all devices:', err);
      setFilteredDevices([]);
      setFilteredDeviceIds([]);
    }
  }, [activeDashboard?.id]);

  // Toggle GSM filter
  const toggleGsmFilter = useCallback(async () => {
    const willEnable = !gsmFilter.enabled;

    if (willEnable) {
      // Clear hierarchy filters when enabling GSM filter (mutually exclusive)
      setHierarchyFilters({
        sden: null,
        den: null,
        aen: null,
        sse: null,
        machineId: null
      });

      // Fetch all devices (no hierarchy filters)
      await fetchAllDevices();
    }

    // Get the numeric value only (in case it's a string or has "/5" appended)
    const avgValue = statistics?.overall_stats?.avg_signal_strength;
    const numericAvgValue = avgValue ? parseFloat(avgValue) : null;

    setGsmFilter(prev => ({
      ...prev,
      enabled: !prev.enabled,
      avgSignalStrength: prev.enabled ? null : numericAvgValue
    }));
  }, [statistics?.overall_stats?.avg_signal_strength, filteredDeviceIds, gsmFilter, hierarchyFilters, fetchAllDevices]);

  // Clear GSM filter
  const clearGsmFilter = useCallback(() => {
    setGsmFilter({
      enabled: false,
      avgSignalStrength: null
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(async () => {
    setHierarchyFilters({
      sden: null,
      den: null,
      aen: null,
      sse: null,
      machineId: null
    });

    setGsmFilter({
      enabled: false,
      avgSignalStrength: null
    });

    // Fetch all devices again (no filters)
    await fetchAllDevices();
  }, [fetchAllDevices]);

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
    const initializeDashboard = async () => {
      if (activeDashboard) {
        // Clear GSM filter
        setGsmFilter({
          enabled: false,
          avgSignalStrength: null
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

        // Try to load saved filter preferences
        try {
          const savedPreferences = await loadUserPreference('filter_preferences');

          console.log('Raw saved preferences from API:', savedPreferences);

          // Check if any filter values are actually set (not null/undefined/empty string)
          const hasActiveFilters = savedPreferences &&
            Object.values(savedPreferences).some(value =>
              value !== null && value !== undefined && value !== ''
            );

          console.log('Has active filters:', hasActiveFilters);

          if (hasActiveFilters) {
            console.log('Loading saved filter preferences:', savedPreferences);

            // Set the filters
            setHierarchyFilters(savedPreferences);

            // Apply the saved filters automatically
            await applyFilters(savedPreferences);
          } else {
            // No saved preferences or all values are null/empty, clear filters and fetch all devices
            console.log('No active filters found, showing all data');
            setHierarchyFilters({
              sden: null,
              den: null,
              aen: null,
              sse: null,
              machineId: null
            });

            // Fetch all devices for initial load
            await fetchAllDevices();
          }
        } catch (err) {
          console.error('Error loading preferences:', err);

          // On error, clear filters and fetch all devices
          setHierarchyFilters({
            sden: null,
            den: null,
            aen: null,
            sse: null,
            machineId: null
          });

          await fetchAllDevices();
        }
      }
    };

    initializeDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashboard?.id]);

  // Load filter options when dashboard changes or filters change
  useEffect(() => {
    if (isAuthenticated && activeDashboard) {
      updateFilterOptions();
    }
  }, [hierarchyFilters.sden, hierarchyFilters.den, hierarchyFilters.aen, isAuthenticated, activeDashboard?.id, updateFilterOptions]);

  // Auto-fetch IoT data when filtered devices change (not pagination - that's manual)
  // Skip if GSM filter is active (separate useEffect handles that)
  useEffect(() => {
    if (isAuthenticated && activeDashboard && filteredDeviceIds.length > 0 && !gsmFilter.enabled) {
      fetchIoTData({ page: 1 }); // Reset to page 1 when filters change
    } else if (!activeDashboard) {
      // Clear data when no dashboard is selected
      setIotData([]);
      setFilteredDevices([]);
      setFilteredDeviceIds([]);
      setStatistics(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredDeviceIds.length, isAuthenticated, activeDashboard?.id, gsmFilter.enabled]);

  // Refetch IoT data when GSM filter is toggled (enabled or disabled)
  // This useEffect should ONLY trigger when gsmFilter.enabled changes, not when devices change
  useEffect(() => {
    // Only fetch if we have devices loaded and authentication/dashboard are ready
    if (isAuthenticated && activeDashboard && filteredDeviceIds.length > 0) {
      fetchIoTData({ page: 1 }); // Reset to page 1 when GSM filter is toggled
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gsmFilter.enabled]); // Only depend on gsmFilter.enabled changes

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

    // GSM filter
    gsmFilter,
    toggleGsmFilter,
    clearGsmFilter,

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
    exportIoTData,

    // User preferences
    saveUserPreference,
    loadUserPreference,
    deleteUserPreference
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};