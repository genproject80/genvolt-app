import axios from 'axios';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/inventory`;

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

// All entries including inactive — admin only
export const getAllInventory = async () => {
  try {
    const res = await api.get('/');
    return res.data.data;
  } catch (err) { handleError(err); }
};

// Active entries only — for device form dropdowns
export const getActiveInventory = async () => {
  try {
    const res = await api.get('/active');
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const getInventoryByModelNumber = async (modelNumber) => {
  try {
    const res = await api.get(`/${modelNumber}`);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const createInventory = async (data) => {
  try {
    const res = await api.post('/', data);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const updateInventory = async (modelNumber, data) => {
  try {
    const res = await api.put(`/${modelNumber}`, data);
    return res.data.data;
  } catch (err) { handleError(err); }
};

export const deactivateInventory = async (modelNumber) => {
  try {
    const res = await api.delete(`/${modelNumber}`);
    return res.data;
  } catch (err) { handleError(err); }
};
