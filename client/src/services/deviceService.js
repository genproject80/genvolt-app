import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: 'http://localhost:5001/api/devices',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for cookies (refresh tokens)
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
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
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 errors - token expired
    if (error.response?.status === 401) {
      // Clear tokens and redirect to login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }

    // Handle 403 errors - insufficient permissions
    if (error.response?.status === 403) {
      console.error('Access denied:', error.response.data.message);
    }

    return Promise.reject(error);
  }
);

export const deviceService = {
  /**
   * Get all devices with filtering and pagination
   * @param {Object} filters - Filter options
   * @returns {Promise} API response
   */
  async getDevices(filters = {}) {
    try {
      const response = await api.get('/', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error fetching devices:', error);
      throw error;
    }
  },

  /**
   * Get device by ID
   * @param {number} deviceId - Device ID
   * @returns {Promise} API response
   */
  async getDeviceById(deviceId) {
    try {
      const response = await api.get(`/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching device:', error);
      throw error;
    }
  },

  /**
   * Create new device
   * @param {Object} deviceData - Device data
   * @returns {Promise} API response
   */
  async createDevice(deviceData) {
    try {
      const response = await api.post('/', deviceData);
      return response.data;
    } catch (error) {
      console.error('Error creating device:', error);
      throw error;
    }
  },

  /**
   * Update existing device
   * @param {number} deviceId - Device ID
   * @param {Object} deviceData - Updated device data
   * @returns {Promise} API response
   */
  async updateDevice(deviceId, deviceData) {
    try {
      const response = await api.put(`/${deviceId}`, deviceData);
      return response.data;
    } catch (error) {
      console.error('Error updating device:', error);
      throw error;
    }
  },

  /**
   * Delete device
   * @param {number} deviceId - Device ID
   * @returns {Promise} API response
   */
  async deleteDevice(deviceId) {
    try {
      const response = await api.delete(`/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting device:', error);
      throw error;
    }
  },

  /**
   * Transfer device ownership
   * @param {number} deviceId - Device ID
   * @param {Object} transferData - Transfer data containing buyer_id
   * @returns {Promise} API response
   */
  async transferDevice(deviceId, transferData) {
    try {
      const response = await api.post(`/${deviceId}/transfer`, transferData);
      return response.data;
    } catch (error) {
      console.error('Error transferring device:', error);
      throw error;
    }
  },

  /**
   * Get device transfer history
   * @param {number} deviceId - Device ID
   * @returns {Promise} API response
   */
  async getDeviceTransfers(deviceId) {
    try {
      const response = await api.get(`/${deviceId}/transfers`);
      return response.data;
    } catch (error) {
      console.error('Error fetching device transfers:', error);
      throw error;
    }
  },

  /**
   * Get device statistics
   * @returns {Promise} API response
   */
  async getDeviceStats() {
    try {
      const response = await api.get('/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching device statistics:', error);
      throw error;
    }
  }
};