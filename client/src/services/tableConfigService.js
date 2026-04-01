import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('isAuthenticated');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const tableConfigService = {
  /** Get all configurations (active + inactive). */
  async getAllConfigs() {
    const response = await api.get('/table-config');
    return response.data;
  },

  /** Get a single configuration by ID. */
  async getConfigById(configId) {
    const response = await api.get(`/table-config/${configId}`);
    return response.data;
  },

  /** Create a new table configuration. */
  async createConfig(data) {
    const response = await api.post('/table-config', data);
    return response.data;
  },

  /** Update an existing configuration. */
  async updateConfig(configId, data) {
    const response = await api.put(`/table-config/${configId}`, data);
    return response.data;
  },

  /** Delete a configuration. */
  async deleteConfig(configId) {
    const response = await api.delete(`/table-config/${configId}`);
    return response.data;
  },

  /** Toggle is_active for a configuration. */
  async toggleConfig(configId) {
    const response = await api.patch(`/table-config/${configId}/toggle`);
    return response.data;
  },

  /** Get available columns from a database table via introspection. */
  async getAvailableColumns(tableName) {
    const response = await api.get(`/table-config/introspect/${tableName}`);
    return response.data;
  },
};

export default tableConfigService;
