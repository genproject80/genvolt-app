import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: 'http://localhost:5001/api/clients',
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

export const clientService = {
  /**
   * Get all clients with pagination and filters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} API response with clients and pagination
   */
  async getAllClients(options = {}) {
    try {
      const {
        includeInactive = false,
        limit = 50,
        page = 1,
        ...otherOptions
      } = options;

      const params = {
        includeInactive,
        limit,
        page,
        ...otherOptions
      };

      const response = await api.get('/', { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get client by ID
   * @param {number} clientId - Client ID
   * @returns {Promise<Object>} API response with client data
   */
  async getClientById(clientId) {
    try {
      const response = await api.get(`/${clientId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get client hierarchy for dropdown
   * @param {number} excludeClientId - Client ID to exclude from results
   * @returns {Promise<Object>} API response with client hierarchy
   */
  async getClientHierarchy(excludeClientId = null) {
    try {
      const params = excludeClientId ? { excludeClientId } : {};
      const response = await api.get('/hierarchy', { params });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get descendant clients (children hierarchy) for current user's client
   * @returns {Promise<Object>} API response with descendant clients
   */
  async getDescendantClients() {
    try {
      const response = await api.get('/descendants');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Create a new client
   * @param {Object} clientData - Client data to create
   * @returns {Promise<Object>} API response with created client
   */
  async createClient(clientData) {
    try {
      // Clean and validate data before sending
      const cleanedData = this.cleanClientData(clientData);
      const response = await api.post('/', cleanedData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Update an existing client
   * @param {number} clientId - Client ID
   * @param {Object} clientData - Updated client data
   * @returns {Promise<Object>} API response with updated client
   */
  async updateClient(clientId, clientData) {
    try {
      const cleanedData = this.cleanClientData(clientData);
      const response = await api.put(`/${clientId}`, cleanedData);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Delete a client (soft delete)
   * @param {number} clientId - Client ID
   * @returns {Promise<Object>} API response confirming deletion
   */
  async deleteClient(clientId) {
    try {
      const response = await api.delete(`/${clientId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Get client statistics
   * @returns {Promise<Object>} API response with client statistics
   */
  async getClientStats() {
    try {
      const response = await api.get('/stats');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Check if email is available
   * @param {string} email - Email to check
   * @param {number} excludeClientId - Client ID to exclude from check (for updates)
   * @returns {Promise<Object>} API response with availability status
   */
  async checkEmailAvailability(email, excludeClientId = null) {
    try {
      const data = { email };
      if (excludeClientId) {
        data.excludeClientId = excludeClientId;
      }
      
      const response = await api.post('/check-email', data);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  },

  /**
   * Clean and validate client data before sending to API
   * @param {Object} clientData - Raw client data
   * @returns {Object} Cleaned client data
   */
  cleanClientData(clientData) {
    const cleaned = {};

    // Required fields
    if (clientData.name) {
      cleaned.name = clientData.name.trim();
    }
    if (clientData.email) {
      cleaned.email = clientData.email.toLowerCase().trim();
    }

    // Optional fields - only include if they have values
    if (clientData.phone && clientData.phone.trim()) {
      cleaned.phone = clientData.phone.trim();
    }
    if (clientData.Address && clientData.Address.trim()) {
      cleaned.Address = clientData.Address.trim();
    }
    if (clientData.contact_person && clientData.contact_person.trim()) {
      cleaned.contact_person = clientData.contact_person.trim();
    }
    if (clientData.thinkspeak_subscription_info && clientData.thinkspeak_subscription_info.trim()) {
      cleaned.thinkspeak_subscription_info = clientData.thinkspeak_subscription_info.trim();
    }
    if (clientData.city && clientData.city.trim()) {
      cleaned.city = clientData.city.trim();
    }
    if (clientData.state && clientData.state.trim()) {
      cleaned.state = clientData.state.trim();
    }

    // Parent client ID
    if (clientData.parent_id && clientData.parent_id !== '') {
      cleaned.parent_id = parseInt(clientData.parent_id);
    }

    // Active status
    if (clientData.is_active !== undefined) {
      cleaned.is_active = Boolean(clientData.is_active);
    }

    return cleaned;
  },

  /**
   * Handle API errors and convert them to user-friendly messages
   * @param {Error} error - API error
   * @returns {Error} Formatted error
   */
  handleError(error) {
    let message = 'An unexpected error occurred';
    let code = 'UNKNOWN_ERROR';

    if (error.response) {
      // The request was made and the server responded with a status code
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          message = data.message || 'Invalid request data';
          code = 'VALIDATION_ERROR';
          break;
        case 401:
          message = 'You are not authorized to perform this action';
          code = 'UNAUTHORIZED';
          break;
        case 403:
          message = 'You do not have permission to perform this action';
          code = 'FORBIDDEN';
          break;
        case 404:
          message = 'Client not found';
          code = 'NOT_FOUND';
          break;
        case 409:
          message = data.message || 'Client already exists';
          code = 'CONFLICT';
          break;
        case 422:
          message = data.message || 'Validation failed';
          code = 'VALIDATION_ERROR';
          break;
        case 500:
          message = 'Server error. Please try again later.';
          code = 'SERVER_ERROR';
          break;
        default:
          message = data.message || 'Request failed';
          code = 'REQUEST_ERROR';
      }

      // Include validation errors if available
      if (data.errors && Array.isArray(data.errors)) {
        const validationErrors = {};
        data.errors.forEach(err => {
          if (err.path || err.param) {
            validationErrors[err.path || err.param] = err.msg || err.message;
          }
        });
        
        const formattedError = new Error(message);
        formattedError.code = code;
        formattedError.status = status;
        formattedError.validationErrors = validationErrors;
        return formattedError;
      }
    } else if (error.request) {
      // The request was made but no response was received
      message = 'Network error. Please check your connection and try again.';
      code = 'NETWORK_ERROR';
    } else {
      // Something happened in setting up the request
      message = error.message || message;
      code = 'REQUEST_SETUP_ERROR';
    }

    const formattedError = new Error(message);
    formattedError.code = code;
    formattedError.originalError = error;
    return formattedError;
  }
};

export default clientService;