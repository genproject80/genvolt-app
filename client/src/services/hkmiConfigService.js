import axios from 'axios';
import { JWTUtils } from '../utils/jwtBrowser';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const { accessToken } = JWTUtils.getStoredTokens();
  if (accessToken && !JWTUtils.isTokenExpired(accessToken)) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      JWTUtils.clearTokens();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

const hkmiConfigService = {
  /** Fetch all HKMI devices visible to the current user */
  fetchHkmiDevices: async () => {
    const response = await api.get('/hkmi-config/devices');
    return response.data;
  },

  /** Fetch latest config values for a specific device */
  fetchDeviceLatestConfig: async (deviceId) => {
    const response = await api.get(`/hkmi-config/device/${deviceId}/latest`);
    return response.data;
  },

  /** Publish new config to a device via MQTT */
  publishDeviceConfig: async (deviceId, config) => {
    const response = await api.post(`/hkmi-config/device/${deviceId}/publish`, config);
    return response.data;
  },
};

export default hkmiConfigService;