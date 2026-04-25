import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/audit-logs`;

const api = axios.create({ baseURL: API_BASE, timeout: 15000, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const handleError = (error) => {
  if (error.response?.data) throw error.response.data;
  throw error;
};

export const getAuditLogs = async (params = {}) => {
  try {
    const res = await api.get('/', { params });
    return res.data;
  } catch (err) { handleError(err); }
};

export const getAuditLogStats = async (params = {}) => {
  try {
    const res = await api.get('/stats', { params });
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const getActivityTypes = async () => {
  try {
    const res = await api.get('/activity-types');
    return res.data.data;
  } catch (err) { handleError(err); }
};
