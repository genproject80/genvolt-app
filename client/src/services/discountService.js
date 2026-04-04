import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/discounts`;

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

export const getDiscountHistory = async (clientId) => {
  try {
    const res = await api.get(`/${clientId}`);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const getActiveDiscount = async (clientId) => {
  try {
    const res = await api.get(`/${clientId}/active`);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const createDiscount = async (data) => {
  try {
    const res = await api.post('/', data);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const deleteDiscount = async (id) => {
  try {
    const res = await api.delete(`/${id}`);
    return res.data;
  } catch (err) { handleError(err); }
};
