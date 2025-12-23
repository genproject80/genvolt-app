import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
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
      console.log('🔧 DeviceService: Fetching devices with options:', options);
      const response = await api.get('/devices', { params: options });
      console.log('🔧 DeviceService: Devices fetched successfully');
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
      console.log(`🔧 DeviceService: Fetching device ${deviceId}`);
      const response = await api.get(`/devices/${deviceId}`);
      console.log('🔧 DeviceService: Device fetched successfully');
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
      console.log('🔧 DeviceService: Creating device:', deviceData.device_id);
      const response = await api.post('/devices', deviceData);
      console.log('🔧 DeviceService: Device created successfully');
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
      console.log(`🔧 DeviceService: Updating device ${deviceId}`);
      const response = await api.put(`/devices/${deviceId}`, deviceData);
      console.log('🔧 DeviceService: Device updated successfully');
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
      console.log(`🔧 DeviceService: Deleting device ${deviceId}`);
      const response = await api.delete(`/devices/${deviceId}`);
      console.log('🔧 DeviceService: Device deleted successfully');
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
      console.log('📊 DeviceService: Fetching device statistics');
      const response = await api.get('/devices/stats');
      console.log('📊 DeviceService: Device statistics fetched successfully');
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
      console.log(`🔧 DeviceService: Transferring device ${deviceId} to client ${targetClientId} with machine ID ${machineId}`);

      // Build request body - only include machin_id if it has a value
      const requestBody = {
        target_client_id: targetClientId
      };

      // Only add machin_id if it's provided and not null/empty
      if (machineId && machineId.trim()) {
        requestBody.machin_id = machineId;
      }

      const response = await api.post(`/devices/${deviceId}/transfer`, requestBody);
      console.log('🔧 DeviceService: Device transferred successfully');
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
      console.log(`🔧 DeviceService: Fetching transfer history for device ${deviceId}`);
      const response = await api.get(`/devices/${deviceId}/history`);
      console.log('🔧 DeviceService: Transfer history fetched successfully');
      return response.data;
    } catch (error) {
      console.error(`🔧 DeviceService: Failed to fetch transfer history for device ${deviceId}:`, error);
      throw error;
    }
  }
};

export default deviceService;
