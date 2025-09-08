/**
 * Browser-compatible JWT utilities for demo purposes
 * Note: This is for demo only - use proper JWT libraries in production
 */

export class JWTUtils {
  // Demo secret key (in production, this would be handled server-side)
  static SECRET_KEY = 'genvolt-iot-dashboard-demo-key-2024';
  
  // Token expiration times
  static EXPIRES_IN = {
    ACCESS_TOKEN: 15 * 60 * 1000,    // 15 minutes in milliseconds
    REFRESH_TOKEN: 7 * 24 * 60 * 60 * 1000,    // 7 days in milliseconds
    REMEMBER_ME: 30 * 24 * 60 * 60 * 1000      // 30 days in milliseconds
  };

  /**
   * Create a demo JWT token (base64 encoded payload with signature simulation)
   * Note: This is NOT secure and is for demo purposes only
   */
  static generateAccessToken(payload, expiresIn = this.EXPIRES_IN.ACCESS_TOKEN) {
    try {
      const now = Date.now();
      const exp = now + expiresIn;
      
      const tokenPayload = {
        ...payload,
        type: 'access',
        iat: Math.floor(now / 1000),
        exp: Math.floor(exp / 1000),
        iss: 'genvolt-iot',
        aud: 'genvolt-dashboard'
      };

      // Demo token creation (NOT secure - for demo only)
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payloadB64 = btoa(JSON.stringify(tokenPayload));
      const signature = btoa('demo-signature-' + this.SECRET_KEY.slice(0, 10));
      
      return `${header}.${payloadB64}.${signature}`;
    } catch (error) {
      throw new Error(`Token generation failed: ${error.message}`);
    }
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(payload) {
    try {
      const now = Date.now();
      const exp = now + this.EXPIRES_IN.REFRESH_TOKEN;
      
      const tokenPayload = {
        id: payload.id,
        email: payload.email,
        type: 'refresh',
        iat: Math.floor(now / 1000),
        exp: Math.floor(exp / 1000),
        iss: 'genvolt-iot',
        aud: 'genvolt-dashboard'
      };

      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payloadB64 = btoa(JSON.stringify(tokenPayload));
      const signature = btoa('demo-refresh-' + this.SECRET_KEY.slice(0, 10));
      
      return `${header}.${payloadB64}.${signature}`;
    } catch (error) {
      throw new Error(`Refresh token generation failed: ${error.message}`);
    }
  }

  /**
   * Verify and decode JWT token (demo implementation)
   */
  static verifyToken(token) {
    try {
      if (!token) {
        throw new Error('Token is required');
      }

      const decoded = this.decodeToken(token);
      
      // Check expiration
      const currentTime = Math.floor(Date.now() / 1000);
      if (decoded.exp < currentTime) {
        throw new Error('Token has expired');
      }

      // Check issuer (demo validation)
      if (decoded.iss !== 'genvolt-iot' || decoded.aud !== 'genvolt-dashboard') {
        throw new Error('Invalid token issuer or audience');
      }
      
      return decoded;
    } catch (error) {
      if (error.message.includes('expired')) {
        throw new Error('Token has expired');
      } else {
        throw new Error(`Token verification failed: ${error.message}`);
      }
    }
  }

  /**
   * Decode JWT token without verification
   */
  static decodeToken(token) {
    try {
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token format');
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token structure');
      }

      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch (error) {
      throw new Error(`Token decode failed: ${error.message}`);
    }
  }

  /**
   * Check if token is expired
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
   * Store tokens securely in browser storage
   */
  static storeTokens(accessToken, refreshToken, rememberMe = false) {
    try {
      // Store access token in localStorage
      localStorage.setItem('accessToken', accessToken);
      
      // Store refresh token (simulate secure storage)
      if (refreshToken) {
        if (rememberMe) {
          localStorage.setItem('refreshToken', refreshToken);
          localStorage.setItem('rememberMe', 'true');
        } else {
          sessionStorage.setItem('refreshToken', refreshToken);
        }
      }
      
      // Store token metadata
      try {
        localStorage.setItem('tokenExpiry', this.getTokenExpiration(accessToken).toISOString());
      } catch (expError) {
        console.warn('Could not parse token expiration, using default:', expError.message);
        // Set a default expiration of 1 hour from now
        const defaultExpiry = new Date(Date.now() + 60 * 60 * 1000);
        localStorage.setItem('tokenExpiry', defaultExpiry.toISOString());
      }
      localStorage.setItem('isAuthenticated', 'true');
      
    } catch (error) {
      throw new Error(`Failed to store tokens: ${error.message}`);
    }
  }

  /**
   * Retrieve stored tokens
   */
  static getStoredTokens() {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken') || sessionStorage.getItem('refreshToken');
      const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
      
      return {
        accessToken,
        refreshToken,
        isAuthenticated
      };
    } catch (error) {
      console.error('Failed to retrieve tokens:', error);
      return {
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false
      };
    }
  }

  /**
   * Clear all stored tokens
   */
  static clearTokens() {
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tokenExpiry');
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('rememberMe');
      sessionStorage.removeItem('refreshToken');
    } catch (error) {
      console.error('Failed to clear tokens:', error);
    }
  }

  /**
   * Check if access token needs refresh
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
   */
  static createDemoTokens(userData) {
    try {
      const payload = {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role
      };

      const accessToken = this.generateAccessToken(payload, 60 * 60 * 1000); // 1 hour for demo
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