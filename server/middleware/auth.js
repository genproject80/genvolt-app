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
 * Authorization middleware - checks if user has required permission
 * @param {string|Array} requiredPermission - Permission(s) required
 * @returns {Function} Middleware function
 */
export const authorize = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const permissions = Array.isArray(requiredPermission) 
        ? requiredPermission 
        : [requiredPermission];

      // Check if user has any of the required permissions
      const userPermissions = await req.user.getPermissions();
      const hasPermission = permissions.some(perm => userPermissions.includes(perm));

      if (!hasPermission) {
        logSecurity('insufficient_permissions', {
          userId: req.user.user_id,
          email: req.user.email,
          required: permissions,
          userPermissions,
          ip: req.ip,
          path: req.path
        });

        return res.status(403).json({
          error: 'Access forbidden',
          message: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: permissions
        });
      }

      logger.debug('User authorized', {
        userId: req.user.user_id,
        email: req.user.email,
        permissions: permissions,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('Authorization middleware error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR'
      });
    }
  };
};

/**
 * Role-based authorization middleware
 * @param {string|Array} requiredRoles - Role(s) required
 * @returns {Function} Middleware function
 */
export const requireRole = (requiredRoles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
      const userRole = req.user.role_name || '';

      if (!roles.includes(userRole)) {
        logSecurity('insufficient_role', {
          userId: req.user.user_id,
          email: req.user.email,
          userRole,
          requiredRoles: roles,
          ip: req.ip,
          path: req.path
        });

        return res.status(403).json({
          error: 'Access forbidden',
          message: 'Insufficient role permissions',
          code: 'INSUFFICIENT_ROLE',
          required: roles,
          current: userRole
        });
      }

      logger.debug('Role check passed', {
        userId: req.user.user_id,
        email: req.user.email,
        role: userRole,
        path: req.path
      });

      next();
    } catch (error) {
      logger.error('Role authorization error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Role authorization failed',
        code: 'ROLE_AUTH_ERROR'
      });
    }
  };
};

/**
 * Client-based authorization - ensures user belongs to specified client
 * @param {string} clientIdParam - Request parameter name containing client ID
 * @returns {Function} Middleware function
 */
export const requireSameClient = (clientIdParam = 'clientId') => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Access denied',
          message: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const requestedClientId = parseInt(req.params[clientIdParam] || req.body.client_id || req.query.client_id);
      const userClientId = req.user.client_id;

      if (requestedClientId && requestedClientId !== userClientId) {
        logSecurity('client_access_violation', {
          userId: req.user.user_id,
          email: req.user.email,
          userClientId,
          requestedClientId,
          ip: req.ip,
          path: req.path
        });

        return res.status(403).json({
          error: 'Access forbidden',
          message: 'Cannot access resources from different client',
          code: 'INVALID_CLIENT_ACCESS'
        });
      }

      next();
    } catch (error) {
      logger.error('Client authorization error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Client authorization failed',
        code: 'CLIENT_AUTH_ERROR'
      });
    }
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