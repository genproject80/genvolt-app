import { User } from '../models/User.js';
import { generateTokenPair, verifyRefreshToken, getJWTCookieOptions, blacklistToken, getTokenExpiration } from '../utils/jwt.js';
import { logger, logAuth, logSecurity } from '../utils/logger.js';
import { asyncHandler, ValidationError, AuthenticationError, ConflictError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';

/**
 * Register a new user
 * POST /api/auth/register
 */
export const register = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { 
    client_id, 
    first_name, 
    last_name, 
    email, 
    ph_no, 
    password, 
    user_name, 
    role_id 
  } = req.body;

  // Check if user already exists
  const existingUserByEmail = await User.findByEmail(email);
  if (existingUserByEmail) {
    throw new ConflictError('User with this email already exists');
  }

  const existingUserByUsername = await User.findByUsername(user_name);
  if (existingUserByUsername) {
    throw new ConflictError('User with this username already exists');
  }

  // Create new user
  const userData = {
    client_id,
    first_name,
    last_name,
    email,
    ph_no,
    password, // Will be hashed in User.create()
    user_name,
    role_id: role_id || 2, // Default to regular user role
    created_by_user_id: req.user ? req.user.user_id : null // If admin is creating user
  };

  const user = await User.create(userData);

  // Generate tokens
  const tokenPair = generateTokenPair(user.toPublic());

  // Store refresh token as httpOnly cookie
  const refreshCookieOptions = getJWTCookieOptions(true);
  res.cookie('refreshToken', tokenPair.refreshToken, refreshCookieOptions);

  // Log registration
  logAuth('user_registered', {
    userId: user.user_id,
    email: user.email,
    clientId: user.client_id,
    ip: req.ip
  });

  // Create audit log
  await createAuditLog({
    user_id: user.user_id,
    activity_type: 'AUTHENTICATION',
    action: 'USER_REGISTERED',
    message: 'New user account created',
    target_type: 'USER',
    target_id: user.user_id,
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: {
      user: user.toPublic(),
      accessToken: tokenPair.accessToken,
      expiresIn: tokenPair.expiresIn,
      tokenType: tokenPair.tokenType
    }
  });
});

/**
 * Login user
 * POST /api/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { email, password, remember_me = false } = req.body;
  const ipAddress = req.ip;
  const userAgent = req.get('User-Agent');

  // Find user by email or username
  let user = await User.findByEmail(email);
  if (!user) {
    user = await User.findByUsername(email); // Allow login with username
  }

  if (!user) {
    logSecurity('login_failed_user_not_found', {
      email,
      ip: ipAddress,
      userAgent
    });

    throw new AuthenticationError('Invalid email or password');
  }

  // Check if user is active
  if (!user.is_active) {
    logSecurity('login_failed_inactive_user', {
      userId: user.user_id,
      email: user.email,
      ip: ipAddress,
      userAgent
    });

    throw new AuthenticationError('Account is inactive. Please contact administrator.');
  }

  // Verify password
  const isPasswordValid = await user.verifyPassword(password);
  if (!isPasswordValid) {
    logSecurity('login_failed_invalid_password', {
      userId: user.user_id,
      email: user.email,
      ip: ipAddress,
      userAgent
    });

    throw new AuthenticationError('Invalid email or password');
  }

  // Generate tokens
  const tokenPair = generateTokenPair(user.toPublic());

  // Store refresh token as httpOnly cookie
  const refreshCookieOptions = getJWTCookieOptions(true);
  if (remember_me) {
    refreshCookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
  }
  res.cookie('refreshToken', tokenPair.refreshToken, refreshCookieOptions);

  // Log successful login
  logAuth('user_login_success', {
    userId: user.user_id,
    email: user.email,
    clientId: user.client_id,
    ip: ipAddress,
    rememberMe: remember_me
  });

  // Create audit log
  await createAuditLog({
    user_id: user.user_id,
    activity_type: 'AUTHENTICATION',
    action: 'USER_LOGIN',
    message: 'User logged in successfully',
    target_type: 'USER',
    target_id: user.user_id,
    details: JSON.stringify({ remember_me }),
    ip_address: ipAddress,
    user_agent: userAgent
  });

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: user.toPublic(),
      accessToken: tokenPair.accessToken,
      expiresIn: tokenPair.expiresIn,
      tokenType: tokenPair.tokenType
    }
  });
});

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const refreshTokenFromCookie = req.cookies.refreshToken;
  const refreshTokenFromBody = req.body.refreshToken;
  
  const refreshTokenValue = refreshTokenFromCookie || refreshTokenFromBody;

  if (!refreshTokenValue) {
    throw new AuthenticationError('Refresh token not provided');
  }

  try {
    // Verify refresh token
    const decoded = verifyRefreshToken(refreshTokenValue);

    // Find user
    const user = await User.findById(decoded.user_id);
    if (!user || !user.is_active) {
      throw new AuthenticationError('User not found or inactive');
    }

    // Generate new access token
    const tokenPair = generateTokenPair(user.toPublic());

    // Update refresh token cookie
    const refreshCookieOptions = getJWTCookieOptions(true);
    res.cookie('refreshToken', tokenPair.refreshToken, refreshCookieOptions);

    logger.debug('Token refreshed', {
      userId: user.user_id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: tokenPair.accessToken,
        expiresIn: tokenPair.expiresIn,
        tokenType: tokenPair.tokenType
      }
    });

  } catch (error) {
    logSecurity('token_refresh_failed', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Clear invalid refresh token
    res.clearCookie('refreshToken');
    throw new AuthenticationError('Invalid or expired refresh token');
  }
});

/**
 * Logout user
 * POST /api/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  const user = req.user;
  const token = req.token;

  try {
    // Blacklist current access token
    if (token) {
      const tokenExpiration = getTokenExpiration(token);
      await blacklistToken(token, tokenExpiration);
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    // Log logout
    logAuth('user_logout', {
      userId: user.user_id,
      email: user.email,
      ip: req.ip
    });

    // Create audit log
    await createAuditLog({
      user_id: user.user_id,
      activity_type: 'AUTHENTICATION',
      action: 'USER_LOGOUT',
      message: 'User logged out',
      target_type: 'USER',
      target_id: user.user_id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    logger.error('Logout error:', error);
    // Still clear cookies and return success even if blacklisting fails
    res.clearCookie('refreshToken');
    
    res.json({
      success: true,
      message: 'Logout completed'
    });
  }
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = req.user;

  // Get user permissions
  const permissions = await user.getPermissions();

  res.json({
    success: true,
    data: {
      user: {
        ...user.toPublic(),
        permissions
      }
    }
  });
});

/**
 * Update current user profile
 * PUT /api/auth/me
 */
export const updateMe = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const user = req.user;
  const allowedUpdates = ['first_name', 'last_name', 'ph_no'];
  const updates = {};

  // Filter allowed updates
  allowedUpdates.forEach(field => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  if (Object.keys(updates).length === 0) {
    throw new ValidationError('No valid fields provided for update');
  }

  // Update user
  const updatedUser = await User.update(user.user_id, updates, user.user_id);

  // Log profile update
  logAuth('profile_updated', {
    userId: user.user_id,
    email: user.email,
    updates: Object.keys(updates),
    ip: req.ip
  });

  // Create audit log
  await createAuditLog({
    user_id: user.user_id,
    activity_type: 'USER_MANAGEMENT',
    action: 'PROFILE_UPDATED',
    message: 'User profile updated',
    target_type: 'USER',
    target_id: user.user_id,
    details: JSON.stringify(updates),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: updatedUser.toPublic()
    }
  });
});

/**
 * Change password
 * PUT /api/auth/change-password
 */
export const changePassword = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { currentPassword, newPassword } = req.body;
  const user = req.user;

  // Verify current password
  const isCurrentPasswordValid = await user.verifyPassword(currentPassword);
  if (!isCurrentPasswordValid) {
    logSecurity('password_change_failed_invalid_current', {
      userId: user.user_id,
      email: user.email,
      ip: req.ip
    });

    throw new AuthenticationError('Current password is incorrect');
  }

  // Check if new password is different
  const isSamePassword = await bcrypt.compare(newPassword, user.password);
  if (isSamePassword) {
    throw new ValidationError('New password must be different from current password');
  }

  // Update password
  await User.update(user.user_id, { password: newPassword }, user.user_id);

  // Log password change
  logAuth('password_changed', {
    userId: user.user_id,
    email: user.email,
    ip: req.ip
  });

  // Create audit log
  await createAuditLog({
    user_id: user.user_id,
    activity_type: 'SECURITY',
    action: 'PASSWORD_CHANGED',
    message: 'User password changed',
    target_type: 'USER',
    target_id: user.user_id,
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

/**
 * Validate token
 * GET /api/auth/validate
 */
export const validateToken = asyncHandler(async (req, res) => {
  const user = req.user;
  const tokenPayload = req.tokenPayload;

  res.json({
    success: true,
    data: {
      user: user.toPublic(),
      token: {
        type: tokenPayload.type,
        expiresAt: new Date(tokenPayload.exp * 1000).toISOString(),
        issuedAt: new Date(tokenPayload.iat * 1000).toISOString()
      }
    }
  });
});

export default {
  register,
  login,
  refreshToken,
  logout,
  getMe,
  updateMe,
  changePassword,
  validateToken
};