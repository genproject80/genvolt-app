import axios from 'axios';
import { JWTUtils } from '../utils/jwtBrowser';
import { PasswordEncryption } from '../utils/encryptionBrowser';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: 'http://localhost:5001/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for cookies (refresh tokens)
});

// Request interceptor to add auth token
api.interceptors.request.use(
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

// Response interceptor to handle auth errors and rate limiting
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle rate limiting
    if (error.response?.status === 429) {
      console.warn('Rate limit exceeded. Please wait before making more requests.');
      const retryAfter = error.response.headers['retry-after'] || 60;
      const errorMessage = `Too many requests. Please wait ${retryAfter} seconds before trying again.`;
      return Promise.reject(new Error(errorMessage));
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Try to refresh token
        const { refreshToken } = JWTUtils.getStoredTokens();
        if (refreshToken && !JWTUtils.isTokenExpired(refreshToken)) {
          const newTokens = await authService.refreshAccessToken();
          if (newTokens?.accessToken) {
            originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
            return api(originalRequest);
          }
        }
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
      }

      // If refresh fails, clear tokens and redirect to login
      JWTUtils.clearTokens();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

// Cache to prevent multiple simultaneous validation calls
let validationPromise = null;
let lastValidationTime = 0;
const VALIDATION_CACHE_TIME = 5000; // 5 seconds

export const authService = {
  async login(email, password, rememberMe = false) {
    try {
      // Validate input
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      // Real API call to backend
      const response = await api.post('/auth/login', {
        email,
        password,
        remember_me: rememberMe
      });

      const { data } = response.data;
      const { user, accessToken } = data;
      
      // Store tokens securely (refresh token is in httpOnly cookie)
      JWTUtils.storeTokens(accessToken, null, rememberMe);
      
      // Transform user data to match frontend format
      const userData = {
        id: user.user_id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role_name || 'user',
        avatar: null
      };

      return {
        success: true,
        message: 'Login successful',
        user: userData,
        accessToken: accessToken,
        expiresIn: data.expiresIn,
        tokenType: data.tokenType
      };
      
    } catch (error) {
      // Clear any existing tokens on login failure
      JWTUtils.clearTokens();
      
      if (error.response) {
        const errorMessage = error.response.data?.message || 
                           error.response.data?.error || 
                           'Login failed';
        throw new Error(errorMessage);
      } else if (error.request) {
        throw new Error('Network error. Please check your connection and ensure the backend server is running.');
      } else {
        throw new Error(error.message || 'Login failed');
      }
    }
  },

  async register(userData) {
    try {
      // Validate required fields
      if (!userData.email || !userData.password || !userData.name) {
        throw new Error('Email, password, and name are required');
      }

      // Validate password strength
      const passwordValidation = PasswordEncryption.validatePasswordStrength(userData.password);
      if (!passwordValidation.isValid) {
        throw new Error(`Weak password: ${passwordValidation.suggestions.join(', ')}`);
      }

      // Hash password before sending to server
      const hashedPassword = await PasswordEncryption.hashPassword(userData.password);

      const registrationData = {
        ...userData,
        password: hashedPassword
      };

      // Real API call (uncomment when backend is ready)
      /*
      const response = await api.post('/auth/register', registrationData);
      
      const { user, accessToken, refreshToken } = response.data;
      JWTUtils.storeTokens(accessToken, refreshToken);
      
      return response.data;
      */

      // For demo purposes, simulate successful registration
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      throw new Error('Registration endpoint not implemented yet. Please use demo accounts.');
      
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.message || 'Registration failed');
      } else if (error.request) {
        throw new Error('Network error. Please check your connection.');
      } else {
        throw new Error(error.message || 'Registration failed');
      }
    }
  },

  async validateToken(token) {
    try {
      if (!token) {
        throw new Error('Token is required');
      }

      // Check if we have a recent validation in progress or recently completed
      const now = Date.now();
      if (validationPromise && (now - lastValidationTime) < VALIDATION_CACHE_TIME) {
        return await validationPromise;
      }

      // Create new validation promise
      validationPromise = this._performValidation(token);
      lastValidationTime = now;

      const result = await validationPromise;

      // Clear the promise after successful completion
      setTimeout(() => {
        validationPromise = null;
      }, VALIDATION_CACHE_TIME);

      return result;
    } catch (error) {
      // Clear promise on error
      validationPromise = null;
      // Clear invalid tokens
      JWTUtils.clearTokens();
      throw new Error(error.message || 'Token validation failed');
    }
  },

  async _performValidation(token) {
    // Real API call to validate token
    const response = await api.get('/auth/validate', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const { data } = response.data;
    const { user } = data;

    // Transform user data to match frontend format
    return {
      id: user.user_id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role_name || 'user',
      avatar: null
    };
  },

  async logout() {
    try {
      // Inform server about logout to invalidate token
      await api.post('/auth/logout');
      
      // Clear all stored tokens
      JWTUtils.clearTokens();
      
      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      console.error('Logout error:', error);
      // Even if server logout fails, we can still clear local state
      JWTUtils.clearTokens();
      return {
        success: true,
        message: 'Logged out successfully'
      };
    }
  },

  async refreshAccessToken() {
    try {
      // Real API call to refresh token (refresh token sent via httpOnly cookie)
      const response = await api.post('/auth/refresh');
      
      const { data } = response.data;
      const { accessToken } = data;
      
      // Store the new access token (refresh token is updated via cookie)
      JWTUtils.storeTokens(accessToken, null);
      
      return {
        accessToken: accessToken,
        expiresIn: data.expiresIn,
        tokenType: data.tokenType
      };
      
    } catch (error) {
      // Clear tokens if refresh fails
      JWTUtils.clearTokens();
      throw new Error(error.message || 'Token refresh failed');
    }
  },

  async updateProfile(profileData) {
    try {
      const response = await api.put('/auth/profile', profileData);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.message || 'Profile update failed');
      } else {
        throw new Error('Network error. Please check your connection.');
      }
    }
  },

  async changePassword(currentPassword, newPassword) {
    try {
      // Validate new password strength
      const passwordValidation = PasswordEncryption.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`Weak password: ${passwordValidation.suggestions.join(', ')}`);
      }

      // Hash new password
      const hashedNewPassword = await PasswordEncryption.hashPassword(newPassword);

      const response = await api.put('/auth/change-password', {
        currentPassword,
        newPassword: hashedNewPassword,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data.message || 'Password change failed');
      } else {
        throw new Error('Network error. Please check your connection.');
      }
    }
  },

  /**
   * Get current user from stored token
   * @returns {Object|null} Current user data or null if not authenticated
   */
  getCurrentUser() {
    try {
      const { accessToken, isAuthenticated } = JWTUtils.getStoredTokens();
      
      if (!isAuthenticated || !accessToken) {
        return null;
      }

      if (JWTUtils.isTokenExpired(accessToken)) {
        JWTUtils.clearTokens();
        return null;
      }

      const decoded = JWTUtils.decodeToken(accessToken);
      return {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        avatar: decoded.avatar || null
      };
    } catch (error) {
      console.error('Failed to get current user:', error);
      JWTUtils.clearTokens();
      return null;
    }
  },

  /**
   * Check if user is currently authenticated
   * @returns {boolean} True if user is authenticated
   */
  isAuthenticated() {
    try {
      const { accessToken, isAuthenticated } = JWTUtils.getStoredTokens();
      
      if (!isAuthenticated || !accessToken) {
        return false;
      }

      return !JWTUtils.isTokenExpired(accessToken);
    } catch (error) {
      console.error('Authentication check failed:', error);
      return false;
    }
  },

  /**
   * Get token information
   * @returns {Object} Token information
   */
  getTokenInfo() {
    try {
      const { accessToken } = JWTUtils.getStoredTokens();

      if (!accessToken) {
        return null;
      }

      const decoded = JWTUtils.decodeToken(accessToken);
      const expirationDate = JWTUtils.getTokenExpiration(accessToken);
      const needsRefresh = JWTUtils.needsRefresh(accessToken);

      return {
        isValid: !JWTUtils.isTokenExpired(accessToken),
        expiresAt: expirationDate,
        needsRefresh,
        tokenType: decoded.type || 'access'
      };
    } catch (error) {
      console.error('Failed to get token info:', error);
      return null;
    }
  },

  /**
   * Get current user permissions
   * @returns {Promise<Object>} User permissions response
   */
  async getUserPermissions() {
    try {
      const response = await api.get('/auth/permissions');
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(error.response.data?.message || 'Failed to fetch user permissions');
      } else if (error.request) {
        throw new Error('Network error. Please check your connection.');
      } else {
        throw new Error(error.message || 'Failed to fetch user permissions');
      }
    }
  }
};

export default authService;