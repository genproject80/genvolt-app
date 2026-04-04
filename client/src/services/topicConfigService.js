import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/topic-config`;

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

export const getAllTopicConfigs = async () => {
  try {
    const res = await api.get('/');
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const getClientTopicConfig = async (clientId) => {
  try {
    const res = await api.get(`/${clientId}`);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const saveClientTopicConfig = async (clientId, data) => {
  try {
    const res = await api.put(`/${clientId}`, data);
    return res.data;
  } catch (err) { handleError(err); }
};

export const resetTopicConfig = async (clientId) => {
  try {
    const res = await api.delete(`/${clientId}`);
    return res.data;
  } catch (err) { handleError(err); }
};
