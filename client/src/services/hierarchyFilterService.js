import axios from 'axios';
import { JWTUtils } from '../utils/jwtBrowser';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const { accessToken } = JWTUtils.getStoredTokens();
    if (accessToken && !JWTUtils.isTokenExpired(accessToken)) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { refreshToken } = JWTUtils.getStoredTokens();
        if (refreshToken) {
          const response = await api.post('/auth/refresh', { refreshToken });
          const { accessToken } = response.data;
          JWTUtils.storeTokens({ accessToken, refreshToken });
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        JWTUtils.clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export const hierarchyFilterService = {
  /**
   * Get unique Overall Managers (SDEN values)
   */
  async getOverallManagers() {
    try {
      const response = await api.get('/hierarchy-filters/sden');
      return {
        success: true,
        data: response.data.data || [],
        message: response.data.message
      };
    } catch (error) {
      console.error('Error fetching Overall Managers:', error);
      return {
        success: false,
        data: [],
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get unique Level 2 Managers (DEN values)
   * @param {string} sden - Optional parent filter
   */
  async getLevel2Managers(sden = null) {
    try {
      const params = sden ? { sden } : {};
      const response = await api.get('/hierarchy-filters/den', { params });
      return {
        success: true,
        data: response.data.data || [],
        message: response.data.message,
        filtersApplied: response.data.filters_applied || {}
      };
    } catch (error) {
      console.error('Error fetching Level 2 Managers:', error);
      return {
        success: false,
        data: [],
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get unique Level 3 Managers (AEN values)
   * @param {string} sden - Optional parent filter
   * @param {string} den - Optional parent filter
   */
  async getLevel3Managers(sden = null, den = null) {
    try {
      const params = {};
      if (sden) params.sden = sden;
      if (den) params.den = den;

      const response = await api.get('/hierarchy-filters/aen', { params });
      return {
        success: true,
        data: response.data.data || [],
        message: response.data.message,
        filtersApplied: response.data.filters_applied || {}
      };
    } catch (error) {
      console.error('Error fetching Level 3 Managers:', error);
      return {
        success: false,
        data: [],
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get unique Level 4 Managers (SSE values)
   * @param {string} sden - Optional parent filter
   * @param {string} den - Optional parent filter
   * @param {string} aen - Optional parent filter
   */
  async getLevel4Managers(sden = null, den = null, aen = null) {
    try {
      const params = {};
      if (sden) params.sden = sden;
      if (den) params.den = den;
      if (aen) params.aen = aen;

      const response = await api.get('/hierarchy-filters/sse', { params });
      return {
        success: true,
        data: response.data.data || [],
        message: response.data.message,
        filtersApplied: response.data.filters_applied || {}
      };
    } catch (error) {
      console.error('Error fetching Level 4 Managers:', error);
      return {
        success: false,
        data: [],
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get filtered device IDs based on hierarchy filters
   * @param {Object} filters - Hierarchy filter object
   */
  async getFilteredDevices(filters = {}) {
    try {
      const params = {};
      if (filters.sden) params.sden = filters.sden;
      if (filters.den) params.den = filters.den;
      if (filters.aen) params.aen = filters.aen;
      if (filters.sse) params.sse = filters.sse;
      if (filters.machineId) params.machineId = filters.machineId;

      const response = await api.get('/hierarchy-filters/devices', { params });
      return {
        success: true,
        data: response.data.data || {},
        message: response.data.message
      };
    } catch (error) {
      console.error('Error fetching filtered devices:', error);
      return {
        success: false,
        data: { device_ids: [], devices: [], total_devices: 0 },
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Apply combined filters and get device IDs
   * @param {Object} filters - Hierarchy filter object
   */
  async applyHierarchyFilters(filters = {}) {
    try {
      const response = await api.post('/hierarchy-filters/apply', filters);
      return {
        success: true,
        data: response.data.data || {},
        message: response.data.message
      };
    } catch (error) {
      console.error('Error applying hierarchy filters:', error);
      return {
        success: false,
        data: { device_ids: [], devices: [], total_devices: 0 },
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get machine ID suggestions for autocomplete
   * @param {string} searchTerm - Search term for machine IDs
   * @param {Object} filters - Optional parent filters to narrow results
   */
  async getMachineSuggestions(searchTerm, filters = {}) {
    try {
      if (!searchTerm || searchTerm.length < 2) {
        return {
          success: true,
          data: [],
          message: 'Search term too short'
        };
      }

      const params = { q: searchTerm };
      if (filters.sden) params.sden = filters.sden;
      if (filters.den) params.den = filters.den;
      if (filters.aen) params.aen = filters.aen;
      if (filters.sse) params.sse = filters.sse;

      const response = await api.get('/hierarchy-filters/machine-suggestions', { params });
      return {
        success: true,
        data: response.data.data || [],
        message: response.data.message
      };
    } catch (error) {
      console.error('Error fetching machine suggestions:', error);
      return {
        success: false,
        data: [],
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get all filter options in a single call
   * @param {Object} currentFilters - Current filter state to determine cascading options
   */
  async getAllFilterOptions(currentFilters = {}) {
    try {
      const [sdenResult, denResult, aenResult, sseResult] = await Promise.all([
        this.getOverallManagers(),
        this.getLevel2Managers(currentFilters.sden),
        this.getLevel3Managers(currentFilters.sden, currentFilters.den),
        this.getLevel4Managers(currentFilters.sden, currentFilters.den, currentFilters.aen)
      ]);

      return {
        success: true,
        data: {
          sden: sdenResult.success ? sdenResult.data : [],
          den: denResult.success ? denResult.data : [],
          aen: aenResult.success ? aenResult.data : [],
          sse: sseResult.success ? sseResult.data : []
        },
        errors: {
          sden: !sdenResult.success ? sdenResult.error : null,
          den: !denResult.success ? denResult.error : null,
          aen: !aenResult.success ? aenResult.error : null,
          sse: !sseResult.success ? sseResult.error : null
        }
      };
    } catch (error) {
      console.error('Error fetching all filter options:', error);
      return {
        success: false,
        data: { sden: [], den: [], aen: [], sse: [] },
        error: error.message
      };
    }
  },

  /**
   * Clear filter cache (if implementing caching in the future)
   */
  clearCache() {
    // Placeholder for future caching implementation
    console.log('Filter cache cleared');
  }
};