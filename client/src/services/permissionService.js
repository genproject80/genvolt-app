import axios from 'axios';
import { JWTUtils } from '../utils/jwtBrowser';

// Configure axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/permissions` : '/api/permissions',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies for authentication
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
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
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Redirect to login on auth failure
      window.location.href = '/login';
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

/**
 * Permission Service - Handles all permission-related API calls (read-only)
 */
export const permissionService = {
  /**
   * Get all permissions
   * @returns {Promise<Object>} API response
   */
  async getAllPermissions() {
    try {
      const response = await apiClient.get('/');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get permissions grouped by category
   * @returns {Promise<Object>} API response
   */
  async getPermissionsByCategory() {
    try {
      const response = await apiClient.get('/categories');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get permission categories list
   * @returns {Promise<Object>} API response
   */
  async getPermissionCategories() {
    try {
      const response = await apiClient.get('/category-list');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get permission by ID
   * @param {number} permissionId - Permission ID
   * @returns {Promise<Object>} API response
   */
  async getPermissionById(permissionId) {
    try {
      const response = await apiClient.get(`/${permissionId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get roles that have a specific permission
   * @param {number} permissionId - Permission ID
   * @returns {Promise<Object>} API response
   */
  async getPermissionRoles(permissionId) {
    try {
      const response = await apiClient.get(`/${permissionId}/roles`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get permission statistics
   * @returns {Promise<Object>} API response
   */
  async getPermissionStats() {
    try {
      const response = await apiClient.get('/stats');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Check if a role has a specific permission
   * @param {number} roleId - Role ID
   * @param {string} permissionName - Permission name
   * @returns {Promise<Object>} API response
   */
  async checkRolePermission(roleId, permissionName) {
    try {
      const response = await apiClient.get('/check-role-permission', {
        params: { role_id: roleId, permission_name: permissionName }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get unassigned permissions for a role
   * @param {number} roleId - Role ID
   * @returns {Promise<Object>} API response
   */
  async getUnassignedPermissions(roleId) {
    try {
      const response = await apiClient.get(`/unassigned/${roleId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Search permissions by name
   * @param {string} query - Search query
   * @returns {Promise<Object>} API response
   */
  async searchPermissions(query) {
    try {
      const response = await apiClient.get('/search', {
        params: { query }
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Handle API errors
   * @param {Object} error - Axios error object
   * @returns {Error} Formatted error
   */
  handleError(error) {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      const message = data?.message || data?.error || `HTTP Error ${status}`;
      const apiError = new Error(message);
      apiError.status = status;
      apiError.data = data;
      return apiError;
    } else if (error.request) {
      // Request was made but no response received
      return new Error('No response from server. Please check your connection.');
    } else {
      // Something else happened
      return new Error(error.message || 'An unexpected error occurred');
    }
  }
};

export default permissionService;