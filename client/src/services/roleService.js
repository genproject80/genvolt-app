import axios from 'axios';
import { JWTUtils } from '../utils/jwtBrowser';

// Configure axios instance
const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/roles`,
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
 * Role Service - Handles all role-related API calls
 */
export const roleService = {
  /**
   * Get all roles with pagination and search
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} API response
   */
  async getAllRoles(params = {}) {
    try {
      const response = await apiClient.get('/', { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get role by ID
   * @param {number} roleId - Role ID
   * @returns {Promise<Object>} API response
   */
  async getRoleById(roleId) {
    try {
      const response = await apiClient.get(`/${roleId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Create new role
   * @param {Object} roleData - Role data
   * @returns {Promise<Object>} API response
   */
  async createRole(roleData) {
    try {
      const response = await apiClient.post('/', roleData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Update role
   * @param {number} roleId - Role ID
   * @param {Object} roleData - Role data to update
   * @returns {Promise<Object>} API response
   */
  async updateRole(roleId, roleData) {
    try {
      const response = await apiClient.put(`/${roleId}`, roleData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Delete role
   * @param {number} roleId - Role ID
   * @returns {Promise<Object>} API response
   */
  async deleteRole(roleId) {
    try {
      const response = await apiClient.delete(`/${roleId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get role permissions
   * @param {number} roleId - Role ID
   * @returns {Promise<Object>} API response
   */
  async getRolePermissions(roleId) {
    try {
      const response = await apiClient.get(`/${roleId}/permissions`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Update role permissions
   * @param {number} roleId - Role ID
   * @param {number[]} permissionIds - Array of permission IDs
   * @returns {Promise<Object>} API response
   */
  async updateRolePermissions(roleId, permissionIds) {
    try {
      const response = await apiClient.put(`/${roleId}/permissions`, {
        permission_ids: permissionIds
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get users assigned to role
   * @param {number} roleId - Role ID
   * @returns {Promise<Object>} API response
   */
  async getRoleUsers(roleId) {
    try {
      const response = await apiClient.get(`/${roleId}/users`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get role statistics
   * @returns {Promise<Object>} API response
   */
  async getRoleStats() {
    try {
      const response = await apiClient.get('/stats');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Check role name availability
   * @param {string} roleName - Role name to check
   * @param {number} excludeId - Role ID to exclude from check
   * @returns {Promise<Object>} API response
   */
  async checkRoleNameAvailability(roleName, excludeId = null) {
    try {
      const params = excludeId ? { exclude_id: excludeId } : {};
      const response = await apiClient.get(`/check-name/${encodeURIComponent(roleName)}`, { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get permission matrix for all roles
   * @returns {Promise<Object>} API response
   */
  async getPermissionMatrix() {
    try {
      const response = await apiClient.get('/permission-matrix');
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

export default roleService;