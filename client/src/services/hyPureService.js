import axios from 'axios';
import { JWTUtils } from '../utils/jwtBrowser';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api`,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const { accessToken } = JWTUtils.getStoredTokens();
    if (accessToken && !JWTUtils.isTokenExpired(accessToken)) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

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
      } catch {
        JWTUtils.clearTokens();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const hyPureService = {
  /**
   * Get latest row + history for the Overview tab widgets and charts.
   * @param {{ deviceIds?: string[], historyLimit?: number }} options
   */
  async getOverview({ deviceIds = [], historyLimit = 50 } = {}) {
    try {
      const params = { history_limit: historyLimit };
      if (deviceIds.length > 0) {
        params.device_ids = JSON.stringify(deviceIds);
      }
      const response = await api.get('/hypure/overview', { params });
      return { success: true, data: response.data.data };
    } catch (error) {
      console.error('Error fetching HyPure overview:', error);
      return {
        success: false,
        data: { latest: null, history: [] },
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get the most recent row for each authorised device (for the Device Overview table).
   */
  async getDevicesLatest() {
    try {
      const response = await api.get('/hypure/devices/latest');
      return { success: true, data: response.data.data || [] };
    } catch (error) {
      console.error('Error fetching HyPure devices latest:', error);
      return {
        success: false,
        data: [],
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get paginated data for the Detailed Data table.
   * @param {{ deviceIds?: string[], page?: number, limit?: number, sortField?: string, sortOrder?: string }} options
   */
  async getData({ deviceIds = [], page = 1, limit = 20, sortField = 'CreatedAt', sortOrder = 'DESC' } = {}) {
    try {
      const params = {
        page: page.toString(),
        limit: limit.toString(),
        sort_field: sortField,
        sort_order: sortOrder
      };
      if (deviceIds.length > 0) {
        params.device_ids = JSON.stringify(deviceIds);
      }
      const response = await api.get('/hypure', { params });
      return {
        success: true,
        data: response.data.data || [],
        meta: response.data.meta || {}
      };
    } catch (error) {
      console.error('Error fetching HyPure data:', error);
      return {
        success: false,
        data: [],
        meta: {},
        error: error.response?.data?.message || error.message
      };
    }
  }
};