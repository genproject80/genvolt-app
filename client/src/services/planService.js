import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/subscription-plans`;

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

export const getAllPlans = async () => {
  try {
    const res = await api.get('/');
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const createPlan = async (data) => {
  try {
    const res = await api.post('/', data);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const updatePlan = async (id, data) => {
  try {
    const res = await api.put(`/${id}`, data);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const deactivatePlan = async (id) => {
  try {
    const res = await api.delete(`/${id}`);
    return res.data;
  } catch (err) { handleError(err); }
};
