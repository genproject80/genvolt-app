import jwt from 'jsonwebtoken';
import Cookies from 'js-cookie';

/**
 * JWT utilities for token management
 */
export class JWTUtils {
  
  // Secret key for JWT signing (in production, use environment variable)
  static SECRET_KEY = process.env.REACT_APP_JWT_SECRET || 'genvolt-iot-dashboard-secret-key-2024';
  
  // Token expiration times
  static EXPIRES_IN = {
    ACCESS_TOKEN: '15m',    // 15 minutes
    REFRESH_TOKEN: '7d',    // 7 days
    REMEMBER_ME: '30d'      // 30 days
  };

  /**
   * Generate JWT access token
   * @param {Object} payload - User data to encode
   * @param {string} expiresIn - Token expiration time
   * @returns {string} JWT token
   */
  static generateAccessToken(payload, expiresIn = this.EXPIRES_IN.ACCESS_TOKEN) {
    try {
      const token = jwt.sign(
        {
          ...payload,
          type: 'access',
          iat: Math.floor(Date.now() / 1000)
        },
        this.SECRET_KEY,
        { 
          expiresIn,
          issuer: 'genvolt-iot',
          audience: 'genvolt-dashboard'
        }
      );
      
      return token;
    } catch (error) {
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  /**
   * Generate JWT refresh token
   * @param {Object} payload - User data to encode
   * @returns {string} JWT refresh token
   */
  static generateRefreshToken(payload) {
    try {
      const token = jwt.sign(
        {
          id: payload.id,
          email: payload.email,
          type: 'refresh',
          iat: Math.floor(Date.now() / 1000)
        },
        this.SECRET_KEY,
        { 
          expiresIn: this.EXPIRES_IN.REFRESH_TOKEN,
          issuer: 'genvolt-iot',
          audience: 'genvolt-dashboard'
        }
      );
      
      return token;
    } catch (error) {
      throw new Error(`Refresh token generation failed: ${error.message}`);
    }
  }

  /**
   * Verify and decode JWT token
   * @param {string} token - JWT token to verify
   * @returns {Object} Decoded token payload
   */
  static verifyToken(token) {
    try {
      if (!token) {
        throw new Error('Token is required');
      }

      const decoded = jwt.verify(token, this.SECRET_KEY, {
        issuer: 'genvolt-iot',
        audience: 'genvolt-dashboard'
      });
      
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Token not active yet');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Decode JWT token without verification (for expired token data)
   * @param {string} token - JWT token to decode
   * @returns {Object} Decoded token payload
   */
  static decodeToken(token) {
    try {
      if (!token) {
        throw new Error('Token is required');
      }

      const decoded = jwt.decode(token);
      if (!decoded) {
        throw new Error('Invalid token format');
      }
      
      return decoded;
    } catch (error) {
      throw new Error(`Token decode failed: ${error.message}`);
    }
  }

  /**
   * Check if token is expired
   * @param {string} token - JWT token to check
   * @returns {boolean} True if token is expired
   */
  static isTokenExpired(token) {
    try {
      const decoded = this.decodeToken(token);
      const currentTime = Math.floor(Date.now() / 1000);
      
      return decoded.exp < currentTime;
    } catch (error) {
      return true; // Treat invalid tokens as expired
    }
  }

  /**
   * Get token expiration time
   * @param {string} token - JWT token
   * @returns {Date} Expiration date
   */
  static getTokenExpiration(token) {
    try {
      const decoded = this.decodeToken(token);
      return new Date(decoded.exp * 1000);
    } catch (error) {
      throw new Error(`Failed to get token expiration: ${error.message}`);
    }
  }

  /**
   * Store tokens securely
   * @param {string} accessToken - JWT access token
   * @param {string} refreshToken - JWT refresh token
   * @param {boolean} rememberMe - Whether to persist tokens
   */
  static storeTokens(accessToken, refreshToken, rememberMe = false) {
    try {
      const cookieOptions = {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'strict',
        expires: rememberMe ? 30 : undefined // 30 days if remember me
      };

      // Store access token in memory/localStorage for immediate use
      localStorage.setItem('accessToken', accessToken);
      
      // Store refresh token in secure httpOnly cookie (simulated with js-cookie for demo)
      Cookies.set('refreshToken', refreshToken, cookieOptions);
      
      // Store token metadata
      localStorage.setItem('tokenExpiry', this.getTokenExpiration(accessToken).toISOString());
      localStorage.setItem('isAuthenticated', 'true');
      
    } catch (error) {
      throw new Error(`Failed to store tokens: ${error.message}`);
    }
  }

  /**
   * Retrieve stored tokens
   * @returns {Object} Object containing access and refresh tokens
   */
  static getStoredTokens() {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = Cookies.get('refreshToken');
      
      return {
        accessToken,
        refreshToken,
        isAuthenticated: localStorage.getItem('isAuthenticated') === 'true'
      };
    } catch (error) {
      throw new Error(`Failed to retrieve tokens: ${error.message}`);
    }
  }

  /**
   * Clear all stored tokens
   */
  static clearTokens() {
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('tokenExpiry');
      localStorage.removeItem('isAuthenticated');
      Cookies.remove('refreshToken');
    } catch (error) {
      console.error('Failed to clear tokens:', error.message);
    }
  }

  /**
   * Check if access token needs refresh
   * @param {string} token - Access token to check
   * @returns {boolean} True if token needs refresh
   */
  static needsRefresh(token) {
    try {
      if (!token) return true;
      
      const decoded = this.decodeToken(token);
      const currentTime = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = decoded.exp - currentTime;
      
      // Refresh if token expires in less than 5 minutes
      return timeUntilExpiry < 300;
    } catch (error) {
      return true;
    }
  }

  /**
   * Create demo JWT tokens for testing
   * @param {Object} userData - User data
   * @returns {Object} Demo tokens
   */
  static createDemoTokens(userData) {
    try {
      const payload = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role
      };

      const accessToken = this.generateAccessToken(payload, '1h'); // 1 hour for demo
      const refreshToken = this.generateRefreshToken(payload);

      return {
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour in seconds
        tokenType: 'Bearer'
      };
    } catch (error) {
      throw new Error(`Failed to create demo tokens: ${error.message}`);
    }
  }
}

export default JWTUtils;