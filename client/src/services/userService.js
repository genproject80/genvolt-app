import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/users` : '/api/users',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for cookies (refresh tokens)
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
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
  (response) => {
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      // Token might be expired, redirect to login
      localStorage.removeItem('accessToken');
      localStorage.removeItem('isAuthenticated');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const userService = {
  /**
   * Get all users with pagination and filters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} API response with users and pagination
   */
  async getAllUsers(options = {}) {
    try {
      const { page = 1, limit = 10, search = '', sortBy = 'created_at', sortOrder = 'desc' } = options;

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder
      });

      if (search) {
        params.append('search', search);
      }

      const response = await api.get(`/?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  /**
   * Get user by ID
   * @param {number} userId - User ID
   * @returns {Promise<Object>} API response with user data
   */
  async getUserById(userId) {
    try {
      const response = await api.get(`/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      throw error;
    }
  },

  /**
   * Create new user
   * @param {Object} userData - User data object
   * @returns {Promise<Object>} API response with created user
   */
  async createUser(userData) {
    console.log("in createUser", userData)
    try {
      const response = await api.post('/', userData);
      return response.data;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  /**
   * Update user
   * @param {number} userId - User ID
   * @param {Object} userData - Updated user data
   * @returns {Promise<Object>} API response with updated user
   */
  async updateUser(userId, userData) {
    console.log(userData)
    try {
      const response = await api.put(`/${userId}`, userData);
      return response.data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  },

  /**
   * Delete user (soft delete)
   * @param {number} userId - User ID
   * @returns {Promise<Object>} API response
   */
  async deleteUser(userId) {
    try {
      const response = await api.delete(`/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  },

  /**
   * Update user status (activate/deactivate)
   * @param {number} userId - User ID
   * @param {boolean} isActive - New active status
   * @returns {Promise<Object>} API response
   */
  async updateUserStatus(userId, isActive) {
    try {
      const response = await api.patch(`/${userId}/status`, { is_active: isActive });
      return response.data;
    } catch (error) {
      console.error('Error updating user status:', error);
      throw error;
    }
  },

  /**
   * Reset user password
   * @param {number} userId - User ID
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} API response
   */
  async resetUserPassword(userId, newPassword) {
    try {
      const response = await api.post(`/${userId}/reset-password`, { newPassword });
      return response.data;
    } catch (error) {
      console.error('Error resetting user password:', error);
      throw error;
    }
  },

  /**
   * Get user statistics with caching
   * @returns {Promise<Object>} API response with user statistics
   */
  async getUserStats() {
    try {
      // Check cache first
      const cacheKey = 'userStats';
      const cachedData = this._getCachedData(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      const response = await api.get('/stats');

      // Cache the response for 5 minutes
      this._setCachedData(cacheKey, response.data, 5 * 60 * 1000);

      return response.data;
    } catch (error) {
      console.error('Error fetching user statistics:', error);
      throw error;
    }
  },

  /**
   * Simple in-memory cache for API responses
   */
  _cache: new Map(),

  _getCachedData(key) {
    const cached = this._cache.get(key);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }
    // Remove expired cache
    if (cached) {
      this._cache.delete(key);
    }
    return null;
  },

  _setCachedData(key, data, ttlMs) {
    this._cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    });
  }
};

export default userService;