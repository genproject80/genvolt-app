import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/feature-flags`;

const api = axios.create({ baseURL: API_BASE, timeout: 10000, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const handleError = (error) => {
  if (error.response?.data) throw error.response.data;
  throw error;
};

export const getFeatureFlags = async () => {
  try {
    const res = await api.get('/');
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const updateFeatureFlag = async (flagId, isEnabled) => {
  try {
    const res = await api.put(`/${flagId}`, { is_enabled: isEnabled });
    return res.data.data;
  } catch (err) { handleError(err); }
};
