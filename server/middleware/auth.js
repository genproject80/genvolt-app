import { verifyAccessToken, extractTokenFromHeader, isTokenBlacklisted } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { logger, logSecurity } from '../utils/logger.js';

/**
 * Authentication middleware - verifies JWT token and loads user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      logSecurity('missing_auth_token', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });

      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided',
        code: 'NO_TOKEN'
      });
    }

    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      logSecurity('blacklisted_token_used', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        token: token.substring(0, 20) + '...'
      });

      return res.status(401).json({
        error: 'Access denied',
        message: 'Token is no longer valid',
        code: 'TOKEN_BLACKLISTED'
      });
    }

    // Verify token
    const decoded = verifyAccessToken(token);
    
    // Load user from database
    const user = await User.findById(decoded.user_id);
    
    if (!user) {
      logSecurity('invalid_user_token', {
        userId: decoded.user_id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });

      return res.status(401).json({
        error: 'Access denied',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.is_active) {
      logSecurity('inactive_user_access', {
        userId: user.user_id,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path
      });

      return res.status(401).json({
        error: 'Access denied',
        message: 'Account is inactive',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Add user and decoded token to request object
    req.user = user;
    req.token = token;
    req.tokenPayload = decoded;

    // Log successful authentication
    logger.debug('User authenticated', {
      userId: user.user_id,
      email: user.email,
      role: user.role_name,
      path: req.path
    });

    next();
  } catch (error) {
    logSecurity('auth_verification_failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path
    });

    if (error.message === 'Token expired') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.message === 'Invalid token') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    logger.error('Authentication middleware error:', error);
    return res.status(401).json({
      error: 'Access denied',
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return next();
    }

    // Check if token is blacklisted
    if (await isTokenBlacklisted(token)) {
      return next();
    }

    // Verify token
    const decoded = verifyAccessToken(token);
    
    // Load user from database
    const user = await User.findById(decoded.user_id);
    
    if (user && user.is_active) {
      req.user = user;
      req.token = token;
      req.tokenPayload = decoded;
    }

    next();
  } catch (error) {
    // Don't fail for optional auth - just continue without user
    logger.debug('Optional auth failed:', error.message);
    next();
  }
};

/**
 * Authorization middleware - DISABLED (removed permission checks)
 * @param {string|Array} requiredPermission - Permission(s) required
 * @returns {Function} Middleware function
 */
export const authorize = (requiredPermission) => {
  return (req, res, next) => {
    // Permission checks disabled - allow all authenticated users
    next();
  };
};

/**
 * Role-based authorization middleware - DISABLED (removed role checks)
 * @param {string|Array} requiredRoles - Role(s) required
 * @returns {Function} Middleware function
 */
export const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    // Role checks disabled - allow all authenticated users
    next();
  };
};

/**
 * Client-based authorization - DISABLED (removed client checks)
 * @param {string} clientIdParam - Request parameter name containing client ID
 * @returns {Function} Middleware function
 */
export const requireSameClient = (clientIdParam = 'clientId') => {
  return (req, res, next) => {
    // Client access checks disabled - allow all authenticated users
    next();
  };
};

/**
 * Rate limiting based on user
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Middleware function
 */
export const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    try {
      const userId = req.user ? req.user.user_id : req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Get or initialize user request data
      if (!userRequests.has(userId)) {
        userRequests.set(userId, []);
      }

      const requests = userRequests.get(userId);
      
      // Remove requests outside the current window
      const validRequests = requests.filter(timestamp => timestamp > windowStart);
      userRequests.set(userId, validRequests);

      // Check if user has exceeded the limit
      if (validRequests.length >= maxRequests) {
        logSecurity('rate_limit_exceeded', {
          userId: req.user ? req.user.user_id : null,
          ip: req.ip,
          requests: validRequests.length,
          limit: maxRequests,
          path: req.path
        });

        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${Math.ceil(windowMs / 60000)} minutes.`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      // Add current request
      validRequests.push(now);
      
      next();
    } catch (error) {
      logger.error('User rate limit error:', error);
      next(); // Don't block on rate limit errors
    }
  };
};

export default {
  authenticate,
  optionalAuth,
  authorize,
  requireRole,
  requireSameClient,
  userRateLimit
};