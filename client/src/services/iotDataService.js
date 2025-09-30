import axios from 'axios';
import { JWTUtils } from '../utils/jwtBrowser';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: 'http://localhost:5001/api',
  timeout: 60000, // Longer timeout for data operations
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

export const iotDataService = {
  /**
   * Get IoT data with filtering and pagination
   * @param {Object} options - Query options
   */
  async getIoTData(options = {}) {
    try {
      const {
        deviceIds = [],
        page = 1,
        limit = 20,
        search = '',
        sortField = 'Timestamp',
        sortOrder = 'DESC'
      } = options;

      const params = {
        page: page.toString(),
        limit: limit.toString(),
        sort_field: sortField,
        sort_order: sortOrder
      };

      if (deviceIds.length > 0) {
        params.device_ids = JSON.stringify(deviceIds);
      }

      if (search) {
        params.search = search;
      }

      const response = await api.get('/iot-data/sick', { params });

      return {
        success: true,
        data: response.data.data || [],
        meta: response.data.meta || {},
        message: response.data.message
      };
    } catch (error) {
      console.error('Error fetching IoT data:', error);
      return {
        success: false,
        data: [],
        meta: {},
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Export IoT data
   * @param {Object} options - Export options
   */
  async exportIoTData(options = {}) {
    try {
      const {
        deviceIds = [],
        search = '',
        format = 'json',
        limit = 10000
      } = options;

      const params = {
        format,
        limit: limit.toString()
      };

      if (deviceIds.length > 0) {
        params.device_ids = JSON.stringify(deviceIds);
      }

      if (search) {
        params.search = search;
      }

      const response = await api.get('/iot-data/sick/export', { params });

      if (format === 'csv') {
        // For CSV format, the response should be handled as text
        return {
          success: true,
          data: response.data, // This will be CSV content as string
          format: 'csv',
          message: 'Data exported successfully'
        };
      } else {
        return {
          success: true,
          data: response.data.data || [],
          meta: response.data.meta || {},
          message: response.data.message
        };
      }
    } catch (error) {
      console.error('Error exporting IoT data:', error);
      return {
        success: false,
        data: null,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Download CSV export
   * @param {Object} options - Export options
   */
  async downloadCSVExport(options = {}) {
    try {
      const {
        deviceIds = [],
        search = '',
        limit = 10000,
        filename = null
      } = options;

      const params = {
        format: 'csv',
        limit: limit.toString()
      };

      if (deviceIds.length > 0) {
        params.device_ids = JSON.stringify(deviceIds);
      }

      if (search) {
        params.search = search;
      }

      const response = await api.get('/iot-data/sick/export', {
        params,
        responseType: 'blob' // Important for file downloads
      });

      // Create blob and download
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `iot_data_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      return {
        success: true,
        message: 'File downloaded successfully'
      };
    } catch (error) {
      console.error('Error downloading CSV export:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get aggregated statistics for filtered devices
   * @param {Array} deviceIds - Array of device IDs to get stats for
   */
  async getIoTDataStats(deviceIds = []) {
    try {
      const params = {};

      if (deviceIds.length > 0) {
        params.device_ids = JSON.stringify(deviceIds);
      }

      const response = await api.get('/iot-data/sick/stats', { params });

      return {
        success: true,
        data: response.data.data || {},
        meta: response.data.meta || {},
        message: response.data.message
      };
    } catch (error) {
      console.error('Error fetching IoT data statistics:', error);
      return {
        success: false,
        data: {},
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get real-time data updates (placeholder for future WebSocket implementation)
   * @param {Array} deviceIds - Device IDs to monitor
   * @param {Function} callback - Callback function for real-time updates
   */
  subscribeToRealTimeUpdates(deviceIds, callback) {
    // Placeholder for future WebSocket implementation
    console.log('Real-time updates subscription requested for devices:', deviceIds);

    // For now, return a mock subscription object
    return {
      unsubscribe: () => {
        console.log('Unsubscribed from real-time updates');
      }
    };
  },

  /**
   * Get device-specific data
   * @param {string} deviceId - Single device ID
   * @param {Object} options - Query options
   */
  async getDeviceData(deviceId, options = {}) {
    const deviceOptions = {
      ...options,
      deviceIds: [deviceId]
    };

    return this.getIoTData(deviceOptions);
  },

  /**
   * Get data summary for multiple devices
   * @param {Array} deviceIds - Array of device IDs
   */
  async getDevicesSummary(deviceIds = []) {
    try {
      if (deviceIds.length === 0) {
        return {
          success: true,
          data: {},
          message: 'No devices to summarize'
        };
      }

      // Get latest record for each device
      const latestDataOptions = {
        deviceIds,
        limit: deviceIds.length,
        sortField: 'Timestamp',
        sortOrder: 'DESC'
      };

      const [dataResult, statsResult] = await Promise.all([
        this.getIoTData(latestDataOptions),
        this.getIoTDataStats(deviceIds)
      ]);

      return {
        success: true,
        data: {
          latest_records: dataResult.success ? dataResult.data : [],
          statistics: statsResult.success ? statsResult.data : {}
        },
        message: 'Device summary retrieved successfully'
      };
    } catch (error) {
      console.error('Error fetching devices summary:', error);
      return {
        success: false,
        data: {},
        error: error.message
      };
    }
  },

  /**
   * Format IoT data for display
   * @param {Array} data - Raw IoT data array
   */
  formatIoTDataForDisplay(data) {
    return data.map(record => ({
      ...record,
      // Format timestamps
      CreatedAt: record.CreatedAt ? new Date(record.CreatedAt).toLocaleString() : '',
      Timestamp: record.Timestamp ? new Date(record.Timestamp).toLocaleString() : '',
      InsertedAt: record.InsertedAt ? new Date(record.InsertedAt).toLocaleString() : '',

      // Format boolean values
      Fault_Code: record.Fault_Code ? 'Yes' : 'No',
      Train_Passed: record.Train_Passed ? 'Yes' : 'No',

      // Format coordinates
      coordinates: record.Latitude && record.Longitude
        ? `${record.Latitude}, ${record.Longitude}`
        : '',

      // Format signal strength
      signal_strength_text: this.getSignalStrengthText(record.GSM_Signal_Strength),

      // Format motor times
      motor_on_display: `${record.Motor_ON_Time_sec || 0}s`,
      motor_off_display: `${record.Motor_OFF_Time_sec || 0}s`,
    }));
  },

  /**
   * Get signal strength text representation
   * @param {number} strength - Signal strength value
   */
  getSignalStrengthText(strength) {
    if (strength === null || strength === undefined) return 'Unknown';
    if (strength >= 4) return 'Excellent';
    if (strength >= 3) return 'Good';
    if (strength >= 2) return 'Fair';
    if (strength >= 1) return 'Poor';
    return 'No Signal';
  },

  /**
   * Get fault status text and color
   * @param {boolean} faultCode - Fault code boolean
   * @param {string} faultDescription - Fault description
   */
  getFaultStatus(faultCode, faultDescription) {
    if (faultCode) {
      return {
        status: 'Fault',
        color: 'red',
        description: faultDescription || 'Unknown fault'
      };
    }
    return {
      status: 'Normal',
      color: 'green',
      description: 'No faults detected'
    };
  }
};