import { User } from '../models/User.js';
import { logger, logAuth, logSecurity } from '../utils/logger.js';
import { asyncHandler, ValidationError, AuthenticationError, ConflictError, NotFoundError, AuthorizationError } from '../middleware/errorHandler.js';
import { createAuditLog, ACTIVITY_TYPES, AUDIT_ACTIONS, TARGET_TYPES } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Get all users (Admin only)
 * GET /api/users
 */
export const getUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = '', sortBy = 'created_at', sortOrder = 'desc' } = req.query;
  const currentUser = req.user;

  // Build search filters
  const filters = {};
  
  // Show all users (removed permission check)

  if (search) {
    filters.search = search;
  }

  const users = await User.findAll(filters, parseInt(page), parseInt(limit), sortBy, sortOrder);

  // Log user access
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.USER_MANAGEMENT,
    action: AUDIT_ACTIONS.DATA_ACCESSED,
    message: 'Users list accessed',
    target_type: TARGET_TYPES.USER,
    details: JSON.stringify({ page, limit, search, sortBy, sortOrder }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    data: users
  });
});

/**
 * Get user by ID
 * GET /api/users/:userId
 */
export const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const currentUser = req.user;

  const user = await User.findById(parseInt(userId));
  
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Allow access to any user (removed permission check)

  // Get user permissions
  const permissions = await user.getPermissions();

  // Log user access
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.USER_MANAGEMENT,
    action: AUDIT_ACTIONS.DATA_ACCESSED,
    message: `User profile accessed: ${user.email}`,
    target_type: TARGET_TYPES.USER,
    target_id: user.user_id,
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

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
 * Create new user (Admin only)
 * POST /api/users
 */
export const createUser = asyncHandler(async (req, res) => {
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

  const currentUser = req.user;

  // Allow creating users for any client (removed permission check)

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
    password,
    user_name,
    role_id: role_id || 2, // Default to regular user role
    created_by_user_id: currentUser.user_id
  };

  const user = await User.create(userData);

  // Log user creation
  logAuth('user_created_by_admin', {
    adminUserId: currentUser.user_id,
    adminEmail: currentUser.email,
    newUserId: user.user_id,
    newUserEmail: user.email,
    clientId: user.client_id,
    ip: req.ip
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.USER_MANAGEMENT,
    action: AUDIT_ACTIONS.USER_CREATED,
    message: `New user account created: ${user.email}`,
    target_type: TARGET_TYPES.USER,
    target_id: user.user_id,
    details: JSON.stringify({ 
      email: user.email,
      user_name: user.user_name,
      role_id: user.role_id,
      client_id: user.client_id
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: {
      user: user.toPublic()
    }
  });
});

/**
 * Update user (Admin only)
 * PUT /api/users/:userId
 */
export const updateUser = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId } = req.params;
  const currentUser = req.user;

  const user = await User.findById(parseInt(userId));
  
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Allow updating any user (removed permission check)

  const allowedUpdates = ['first_name', 'last_name', 'ph_no', 'role_id', 'is_active'];
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

  // Prevent self-deactivation
  if (updates.is_active === false && user.user_id === currentUser.user_id) {
    throw new ValidationError('Cannot deactivate your own account');
  }

  // Update user
  const updatedUser = await User.update(user.user_id, updates, currentUser.user_id);

  // Log user update
  logAuth('user_updated_by_admin', {
    adminUserId: currentUser.user_id,
    adminEmail: currentUser.email,
    targetUserId: user.user_id,
    targetUserEmail: user.email,
    updates: Object.keys(updates),
    ip: req.ip
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.USER_MANAGEMENT,
    action: AUDIT_ACTIONS.USER_UPDATED,
    message: `User account updated: ${user.email}`,
    target_type: TARGET_TYPES.USER,
    target_id: user.user_id,
    details: JSON.stringify(updates),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'User updated successfully',
    data: {
      user: updatedUser.toPublic()
    }
  });
});

/**
 * Delete user (Admin only)
 * DELETE /api/users/:userId
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const currentUser = req.user;

  const user = await User.findById(parseInt(userId));
  
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Allow deleting any user (removed permission check)

  // Prevent self-deletion
  if (user.user_id === currentUser.user_id) {
    throw new ValidationError('Cannot delete your own account');
  }

  // Soft delete user by deactivating
  const updatedUser = await User.update(user.user_id, { 
    is_active: false,
    deactivated_at: new Date(),
    deactivated_by_user_id: currentUser.user_id
  }, currentUser.user_id);

  // Log user deletion
  logAuth('user_deleted_by_admin', {
    adminUserId: currentUser.user_id,
    adminEmail: currentUser.email,
    deletedUserId: user.user_id,
    deletedUserEmail: user.email,
    ip: req.ip
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.USER_MANAGEMENT,
    action: AUDIT_ACTIONS.USER_DELETED,
    message: `User account deactivated: ${user.email}`,
    target_type: TARGET_TYPES.USER,
    target_id: user.user_id,
    details: JSON.stringify({ 
      email: user.email,
      user_name: user.user_name,
      deletion_type: 'soft_delete'
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

/**
 * Activate/Deactivate user (Admin only)
 * PATCH /api/users/:userId/status
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId } = req.params;
  const { is_active } = req.body;
  const currentUser = req.user;

  const user = await User.findById(parseInt(userId));
  
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Allow updating any user's status (removed permission check)

  // Prevent self-deactivation
  if (is_active === false && user.user_id === currentUser.user_id) {
    throw new ValidationError('Cannot deactivate your own account');
  }

  // Update user status
  const updates = { 
    is_active,
    ...(is_active ? { 
      activated_at: new Date(),
      activated_by_user_id: currentUser.user_id
    } : { 
      deactivated_at: new Date(),
      deactivated_by_user_id: currentUser.user_id
    })
  };

  const updatedUser = await User.update(user.user_id, updates, currentUser.user_id);

  const action = is_active ? 'activated' : 'deactivated';
  
  // Log status change
  logAuth(`user_${action}_by_admin`, {
    adminUserId: currentUser.user_id,
    adminEmail: currentUser.email,
    targetUserId: user.user_id,
    targetUserEmail: user.email,
    newStatus: is_active,
    ip: req.ip
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.USER_MANAGEMENT,
    action: is_active ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_DEACTIVATED,
    message: `User account ${action}: ${user.email}`,
    target_type: TARGET_TYPES.USER,
    target_id: user.user_id,
    details: JSON.stringify({ 
      email: user.email,
      user_name: user.user_name,
      previous_status: user.is_active,
      new_status: is_active
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: `User ${action} successfully`,
    data: {
      user: updatedUser.toPublic()
    }
  });
});

/**
 * Reset user password (Admin only)
 * POST /api/users/:userId/reset-password
 */
export const resetUserPassword = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { userId } = req.params;
  const { newPassword } = req.body;
  const currentUser = req.user;

  const user = await User.findById(parseInt(userId));
  
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Allow resetting any user's password (removed permission check)

  // Update password
  await User.update(user.user_id, { 
    password: newPassword,
    password_reset_at: new Date(),
    password_reset_by_user_id: currentUser.user_id
  }, currentUser.user_id);

  // Log password reset
  logAuth('password_reset_by_admin', {
    adminUserId: currentUser.user_id,
    adminEmail: currentUser.email,
    targetUserId: user.user_id,
    targetUserEmail: user.email,
    ip: req.ip
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.SECURITY,
    action: AUDIT_ACTIONS.PASSWORD_CHANGED,
    message: `Password reset by admin for user: ${user.email}`,
    target_type: TARGET_TYPES.USER,
    target_id: user.user_id,
    details: JSON.stringify({ 
      email: user.email,
      user_name: user.user_name,
      reset_by: 'admin'
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
});

/**
 * Get user statistics (Admin only)
 * GET /api/users/stats
 */
export const getUserStats = asyncHandler(async (req, res) => {
  const currentUser = req.user;

  // Get user statistics for all users (removed permission check)
  const stats = await User.getStatistics(null);

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DATA_ACCESS,
    action: AUDIT_ACTIONS.DATA_ACCESSED,
    message: 'User statistics accessed',
    target_type: TARGET_TYPES.SYSTEM,
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    data: stats
  });
});

export default {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  resetUserPassword,
  getUserStats
};