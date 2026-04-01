import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api`,
  timeout: 30000,
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

export const deviceTestingService = {
  /**
   * Get list of active table configurations.
   */
  async getAvailableTables() {
    const response = await api.get('/device-testing/tables');
    return response.data;
  },

  /**
   * Get paginated rows for a table.
   * @param {string} tableKey
   * @param {Object} params - { page, limit, search }
   */
  async getTableData(tableKey, params = {}) {
    const response = await api.get(`/device-testing/${tableKey}`, { params });
    return response.data;
  },

  /**
   * Get statistics for a table.
   * @param {string} tableKey
   */
  async getTableStats(tableKey) {
    const response = await api.get(`/device-testing/${tableKey}/stats`);
    return response.data;
  },

  /**
   * Trigger a browser CSV download for the table.
   * @param {string} tableKey
   * @param {Object} params - { search }
   */
  async exportTableData(tableKey, params = {}) {
    const response = await api.get(`/device-testing/${tableKey}/export`, {
      params,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const contentDisposition = response.headers['content-disposition'] || '';
    const match = contentDisposition.match(/filename="([^"]+)"/);
    link.download = match ? match[1] : `${tableKey}_export.csv`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Get 24-hour heatmap data.
   * @param {string} tableKey
   * @param {string} [date] - YYYY-MM-DD in IST
   */
  async getHourlyDashboard(tableKey, date) {
    const params = { tableKey };
    if (date) params.date = date;
    const response = await api.get('/device-testing/dashboard/hourly', { params });
    return response.data;
  },
};

export default deviceTestingService;
