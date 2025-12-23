import axios from 'axios';
import { JWTUtils } from '../utils/jwtBrowser';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  timeout: 60000,
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
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      JWTUtils.clearTokens();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const hkmiTableService = {
  /**
   * Get HKMI table data with pagination
   * @param {Object} params - Query parameters (page, limit, search, sort_field, sort_order)
   * @returns {Promise} - API response
   */
  getHKMITableData: async (params = {}) => {
    try {
      const response = await api.get('/hkmi-table', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching HKMI table data:', error);
      throw error;
    }
  },

  /**
   * Upload HKMI configuration file (Excel or CSV)
   * @param {File} file - File to upload
   * @returns {Promise} - API response with successful and rejected rows
   */
  uploadHKMIFile: async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post('/hkmi-table/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error uploading HKMI file:', error);
      throw error;
    }
  }
};

export default hkmiTableService;
