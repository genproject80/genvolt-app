import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

/**
 * JWT Utility functions for token management
 */

// Lazy load environment variables
const getJWTConfig = () => {
  const JWT_SECRET = process.env.JWT_SECRET;
  const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
  const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
  const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

  if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
    logger.error('JWT secrets not configured. Please set JWT_SECRET and JWT_REFRESH_SECRET in environment variables.');
    throw new Error('JWT configuration missing');
  }

  return {
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN
  };
};

/**
 * Generate access token
 * @param {Object} payload - Token payload (user data)
 * @returns {string} JWT access token
 */
export const generateAccessToken = (payload) => {
  try {
    const { JWT_SECRET, JWT_EXPIRES_IN } = getJWTConfig();
    
    const tokenPayload = {
      user_id: payload.user_id,
      email: payload.email,
      user_name: payload.user_name,
      role_id: payload.role_id,
      client_id: payload.client_id,
      type: 'access'
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'genvolt-api',
      audience: 'genvolt-client',
      subject: String(payload.user_id)
    });

    logger.debug('Access token generated', {
      userId: payload.user_id,
      expiresIn: JWT_EXPIRES_IN
    });

    return token;
  } catch (error) {
    logger.error('Error generating access token:', error);
    throw new Error('Token generation failed');
  }
};

/**
 * Generate refresh token
 * @param {Object} payload - Token payload (minimal user data)
 * @returns {string} JWT refresh token
 */
export const generateRefreshToken = (payload) => {
  try {
    const { JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRES_IN } = getJWTConfig();
    
    const tokenPayload = {
      user_id: payload.user_id,
      email: payload.email,
      type: 'refresh'
    };

    const token = jwt.sign(tokenPayload, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
      issuer: 'genvolt-api',
      audience: 'genvolt-client',
      subject: String(payload.user_id)
    });

    logger.debug('Refresh token generated', {
      userId: payload.user_id,
      expiresIn: JWT_REFRESH_EXPIRES_IN
    });

    return token;
  } catch (error) {
    logger.error('Error generating refresh token:', error);
    throw new Error('Refresh token generation failed');
  }
};

/**
 * Generate both access and refresh tokens
 * @param {Object} payload - User data for token payload
 * @returns {Object} Object containing both tokens and expiration info
 */
export const generateTokenPair = (payload) => {
  try {
    const { JWT_EXPIRES_IN } = getJWTConfig();
    
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    return {
      accessToken,
      refreshToken,
      expiresIn: convertTimeToSeconds(JWT_EXPIRES_IN),
      tokenType: 'Bearer'
    };
  } catch (error) {
    logger.error('Error generating token pair:', error);
    throw new Error('Token pair generation failed');
  }
};

/**
 * Verify access token
 * @param {string} token - JWT access token
 * @returns {Object} Decoded token payload
 */
export const verifyAccessToken = (token) => {
  try {
    const { JWT_SECRET } = getJWTConfig();
    
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'genvolt-api',
      audience: 'genvolt-client'
    });

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.debug('Access token expired', { token: token.substring(0, 20) + '...' });
      throw new Error('Token expired');
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid access token provided', { 
        error: error.message,
        token: token.substring(0, 20) + '...'
      });
      throw new Error('Invalid token');
    } else if (error.name === 'NotBeforeError') {
      logger.warn('Access token used before valid', { token: token.substring(0, 20) + '...' });
      throw new Error('Token not active');
    } else {
      logger.error('Access token verification error:', error);
      throw new Error('Token verification failed');
    }
  }
};

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
  try {
    const { JWT_REFRESH_SECRET } = getJWTConfig();
    
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: 'genvolt-api',
      audience: 'genvolt-client'
    });

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      logger.debug('Refresh token expired', { token: token.substring(0, 20) + '...' });
      throw new Error('Refresh token expired');
    } else if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid refresh token provided', { 
        error: error.message,
        token: token.substring(0, 20) + '...'
      });
      throw new Error('Invalid refresh token');
    } else {
      logger.error('Refresh token verification error:', error);
      throw new Error('Refresh token verification failed');
    }
  }
};

/**
 * Decode token without verification (for expired token inspection)
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload (without verification)
 */
export const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    logger.error('Token decode error:', error);
    throw new Error('Token decode failed');
  }
};

/**
 * Check if token is expired
 * @param {string} token - JWT token
 * @returns {boolean} True if token is expired
 */
export const isTokenExpired = (token) => {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    return true; // Treat invalid tokens as expired
  }
};

/**
 * Get token expiration time
 * @param {string} token - JWT token
 * @returns {Date|null} Expiration date or null if invalid
 */
export const getTokenExpiration = (token) => {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    
    return new Date(decoded.exp * 1000);
  } catch (error) {
    return null;
  }
};

/**
 * Get time until token expiration
 * @param {string} token - JWT token
 * @returns {number} Seconds until expiration, or 0 if expired/invalid
 */
export const getTimeUntilExpiration = (token) => {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
      return 0;
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    const timeUntilExp = decoded.exp - currentTime;
    
    return Math.max(0, timeUntilExp);
  } catch (error) {
    return 0;
  }
};

/**
 * Check if token needs refresh (expires within threshold)
 * @param {string} token - JWT access token
 * @param {number} threshold - Threshold in seconds (default: 300 = 5 minutes)
 * @returns {boolean} True if token needs refresh
 */
export const needsRefresh = (token, threshold = 300) => {
  try {
    const timeUntilExp = getTimeUntilExpiration(token);
    return timeUntilExp > 0 && timeUntilExp <= threshold;
  } catch (error) {
    return true; // If we can't determine, assume it needs refresh
  }
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null
 */
export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Convert time string to seconds
 * @param {string} timeStr - Time string (e.g., '15m', '7d', '1h')
 * @returns {number} Time in seconds
 */
const convertTimeToSeconds = (timeStr) => {
  const unit = timeStr.slice(-1);
  const value = parseInt(timeStr.slice(0, -1));

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    case 'w': return value * 604800;
    default: return 900; // Default 15 minutes
  }
};

/**
 * Create JWT cookie options
 * @param {boolean} isRefreshToken - Whether this is for refresh token
 * @returns {Object} Cookie options
 */
export const getJWTCookieOptions = (isRefreshToken = false) => {
  const { JWT_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN } = getJWTConfig();
  
  const maxAge = isRefreshToken 
    ? convertTimeToSeconds(JWT_REFRESH_EXPIRES_IN) * 1000 
    : convertTimeToSeconds(JWT_EXPIRES_IN) * 1000;

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge,
    path: '/'
  };
};

/**
 * Blacklist token (in production, this would use Redis or database)
 * @param {string} token - Token to blacklist
 * @param {Date} expiresAt - When token expires
 */
export const blacklistToken = async (token, expiresAt) => {
  // In production, implement with Redis or database
  // For now, we'll just log it
  logger.info('Token blacklisted', {
    tokenId: token.substring(0, 20) + '...',
    expiresAt: expiresAt.toISOString()
  });
  
  // TODO: Implement actual blacklisting mechanism
  // await redis.setex(`blacklist:${token}`, expiresAt, 'blacklisted');
};

/**
 * Check if token is blacklisted
 * @param {string} token - Token to check
 * @returns {boolean} True if blacklisted
 */
export const isTokenBlacklisted = async (token) => {
  // In production, check Redis or database
  // For now, return false
  
  // TODO: Implement actual blacklist checking
  // return await redis.exists(`blacklist:${token}`);
  return false;
};

export default {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  isTokenExpired,
  getTokenExpiration,
  getTimeUntilExpiration,
  needsRefresh,
  extractTokenFromHeader,
  getJWTCookieOptions,
  blacklistToken,
  isTokenBlacklisted
};