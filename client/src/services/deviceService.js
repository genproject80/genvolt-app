import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api`,
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
  async (error) => {
    if (error.response?.status === 401) {
      // Token might be expired, redirect to login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('isAuthenticated');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * Device Service - API calls for device management
 */
export const deviceService = {
  /**
   * Get all devices with filtering and pagination
   * @param {Object} options - Query options (page, limit, search, filters, sorting)
   * @returns {Promise<Object>} Response with devices data
   */
  async getAllDevices(options = {}) {
    try {
      const response = await api.get('/devices', { params: options });
      return response.data;
    } catch (error) {
      console.error('🔧 DeviceService: Failed to fetch devices:', error);
      throw error;
    }
  },

  /**
   * Get device by ID
   * @param {number} deviceId - Device ID
   * @returns {Promise<Object>} Response with device data
   */
  async getDeviceById(deviceId) {
    try {
      const response = await api.get(`/devices/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error(`🔧 DeviceService: Failed to fetch device ${deviceId}:`, error);
      throw error;
    }
  },

  /**
   * Create new device
   * @param {Object} deviceData - Device data
   * @returns {Promise<Object>} Response with created device
   */
  async createDevice(deviceData) {
    try {
      const response = await api.post('/devices', deviceData);
      return response.data;
    } catch (error) {
      console.error('🔧 DeviceService: Failed to create device:', error);
      throw error;
    }
  },

  /**
   * Update device
   * @param {number} deviceId - Device ID
   * @param {Object} deviceData - Updated device data
   * @returns {Promise<Object>} Response with updated device
   */
  async updateDevice(deviceId, deviceData) {
    try {
      const response = await api.put(`/devices/${deviceId}`, deviceData);
      return response.data;
    } catch (error) {
      console.error(`🔧 DeviceService: Failed to update device ${deviceId}:`, error);
      throw error;
    }
  },

  /**
   * Delete device
   * @param {number} deviceId - Device ID
   * @returns {Promise<Object>} Response confirming deletion
   */
  async deleteDevice(deviceId) {
    try {
      const response = await api.delete(`/devices/${deviceId}`);
      return response.data;
    } catch (error) {
      console.error(`🔧 DeviceService: Failed to delete device ${deviceId}:`, error);
      throw error;
    }
  },

  /**
   * Get device statistics
   * @returns {Promise<Object>} Response with device statistics
   */
  async getDeviceStats() {
    try {
      const response = await api.get('/devices/stats');
      return response.data;
    } catch (error) {
      console.error('📊 DeviceService: Failed to fetch device statistics:', error);
      throw error;
    }
  },

  /**
   * Transfer device to another client
   * @param {number} deviceId - Device ID
   * @param {number} targetClientId - Target client ID
   * @param {string} machineId - Machine ID
   * @returns {Promise<Object>} Response with transfer confirmation
   */
  async transferDevice(deviceId, targetClientId, machineId) {
    try {
      // Build request body - only include machin_id if it has a value
      const requestBody = {
        target_client_id: targetClientId
      };

      // Only add machin_id if it's provided and not null/empty
      if (machineId && machineId.trim()) {
        requestBody.machin_id = machineId;
      }

      const response = await api.post(`/devices/${deviceId}/transfer`, requestBody);
      return response.data;
    } catch (error) {
      console.error(`🔧 DeviceService: Failed to transfer device ${deviceId}:`, error);
      throw error;
    }
  },

  /**
   * Get device transfer history
   * @param {number} deviceId - Device ID
   * @returns {Promise<Object>} Response with transfer history
   */
  async getDeviceTransferHistory(deviceId) {
    try {
      const response = await api.get(`/devices/${deviceId}/history`);
      return response.data;
    } catch (error) {
      console.error(`🔧 DeviceService: Failed to fetch transfer history for device ${deviceId}:`, error);
      throw error;
    }
  }
};

export default deviceService;
