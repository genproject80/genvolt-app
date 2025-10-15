import { Device } from '../models/Device.js';
import { Client } from '../models/Client.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError, NotFoundError, AuthorizationError, ConflictError } from '../middleware/errorHandler.js';
import { createAuditLog, ACTIVITY_TYPES, AUDIT_ACTIONS, TARGET_TYPES } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Helper function to check if current user can access target device
 * @param {Object} currentUser - Current authenticated user
 * @param {Object} device - Target device being accessed
 * @returns {Promise<boolean>} Whether access is allowed
 */
const canAccessDevice = async (currentUser, device) => {
  // System/Super admins can access all devices
  if (['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name)) {
    return true;
  }

  // CLIENT_ADMIN and CLIENT_USER can access devices within their client or descendant clients
  if (currentUser.client_id === device.client_id) {
    return true;
  }

  // Check if device belongs to a descendant client
  const isDescendant = await Client.isDescendant(currentUser.client_id, device.client_id);
  return isDescendant;
};

/**
 * Get all devices with hierarchical access control
 * GET /api/devices
 */
export const getDevices = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    sortBy = 'onboarding_date',
    sortOrder = 'desc',
    Model,
    startDate,
    endDate
  } = req.query;

  const currentUser = req.user;

  // Build search filters with hierarchical access control
  const filters = {};

  // Apply client-scoped filtering based on role
  if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
    // Get all descendant clients to include devices from child clients
    const descendants = await Client.getDescendantClients(currentUser.client_id);
    const descendantIds = descendants.map(client => client.client_id);

    // Include user's own client and all descendants
    filters.client_ids = [currentUser.client_id, ...descendantIds];

    logger.info('Filtering devices for hierarchical access:', {
      userClientId: currentUser.client_id,
      descendantCount: descendantIds.length,
      totalClientIds: filters.client_ids.length
    });
  }
  // SYSTEM_ADMIN and SUPER_ADMIN can see all devices (no additional filters)

  if (search) {
    filters.search = search;
  }

  if (Model) {
    filters.Model = Model;
  }

  if (startDate && endDate) {
    filters.startDate = startDate;
    filters.endDate = endDate;
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sortBy,
    sortOrder
  };

  const devices = await Device.findAll(filters, options);

  // Log device access
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DEVICE_MANAGEMENT,
    action: AUDIT_ACTIONS.DATA_ACCESSED,
    message: 'Devices list accessed',
    target_type: TARGET_TYPES.DEVICE,
    details: JSON.stringify({ page, limit, search, sortBy, sortOrder }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    data: devices
  });
});

/**
 * Get device by ID with hierarchical access control
 * GET /api/devices/:deviceId
 */
export const getDeviceById = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const currentUser = req.user;

  const device = await Device.findById(parseInt(deviceId));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check hierarchical access control
  if (!(await canAccessDevice(currentUser, device))) {
    throw new AuthorizationError('Access denied to this device');
  }

  // Log device access
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DEVICE_MANAGEMENT,
    action: AUDIT_ACTIONS.DATA_ACCESSED,
    message: `Device accessed: ${device.device_id}`,
    target_type: TARGET_TYPES.DEVICE,
    target_id: device.id,
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    data: {
      device: device.toJSON()
    }
  });
});

/**
 * Create new device with hierarchical validation
 * POST /api/devices
 */
export const createDevice = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const deviceData = req.body;
  const currentUser = req.user;

  // If no client_id is provided, assign to logged-in user's client
  if (!deviceData.client_id && currentUser.client_id) {
    deviceData.client_id = currentUser.client_id;
    logger.info('Auto-assigning device to user client:', {
      user_id: currentUser.user_id,
      client_id: currentUser.client_id
    });
  }

  // Validate client access for CLIENT_ADMIN
  if (deviceData.client_id) {
    if (currentUser.role_name === 'CLIENT_ADMIN' && deviceData.client_id !== currentUser.client_id) {
      throw new AuthorizationError('Cannot create devices for other clients');
    }
  }

  // Check if device_id already exists
  const existingDevice = await Device.findByDeviceId(deviceData.device_id);
  if (existingDevice) {
    throw new ConflictError('Device with this ID already exists');
  }

  // Create new device
  const device = await Device.create(deviceData);

  // If device is assigned to a different client than the logged-in user's client,
  // create transfer record(s) in client_device table with hierarchy chain
  if (device.client_id && currentUser.client_id && device.client_id !== currentUser.client_id) {
    logger.info('Device assigned to different client. Creating transfer history:', {
      seller_id: currentUser.client_id,
      buyer_id: device.client_id,
      device_id: device.id
    });

    // Check if target is a descendant and create the complete hierarchy chain
    const isTargetDescendant = await Client.isDescendant(currentUser.client_id, device.client_id);

    if (isTargetDescendant) {
      // Create the complete transfer chain for hierarchical assignment
      logger.info('Target client is a descendant. Creating complete transfer chain...');
      await Device.createMissingTransferChain(device.id, currentUser.client_id, device.client_id);
    } else {
      // Direct assignment to non-descendant (e.g., sibling) - create single record
      logger.info('Target client is not a descendant. Creating direct transfer record.');
      await Device.createClientDeviceRecord(
        currentUser.client_id,  // seller_id (logged-in user's client)
        device.client_id,        // buyer_id (assigned client)
        device.id                // device primary key
      );
    }
  }

  // Log device creation
  logger.info('Device created', {
    deviceId: device.id,
    device_id: device.device_id,
    createdBy: currentUser.user_id,
    clientId: device.client_id,
    userClientId: currentUser.client_id
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DEVICE_MANAGEMENT,
    action: AUDIT_ACTIONS.DEVICE_CREATED,
    message: `New device created: ${device.device_id}`,
    target_type: TARGET_TYPES.DEVICE,
    target_id: device.id,
    details: JSON.stringify({
      device_id: device.device_id,
      Model: device.Model,
      client_id: device.client_id,
      user_client_id: currentUser.client_id
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.status(201).json({
    success: true,
    message: 'Device created successfully',
    data: {
      device: device.toJSON()
    }
  });
});

/**
 * Update device with hierarchical validation
 * PUT /api/devices/:deviceId
 */
export const updateDevice = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { deviceId } = req.params;
  const updateData = req.body;
  const currentUser = req.user;

  const device = await Device.findById(parseInt(deviceId));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check hierarchical access control
  if (!(await canAccessDevice(currentUser, device))) {
    throw new AuthorizationError('Access denied to this device');
  }

  // Check if client_id is being changed - if yes, handle as transfer
  if (updateData.client_id && updateData.client_id !== device.client_id) {
    if (currentUser.role_name === 'CLIENT_ADMIN') {
      throw new AuthorizationError('Cannot transfer devices to other clients. Use transfer endpoint instead.');
    }

    // Client is being changed - use transfer logic
    logger.info('Client change detected in update. Using transfer logic.', {
      oldClientId: device.client_id,
      newClientId: updateData.client_id
    });

    // Call transfer device which handles client_device table
    await Device.transferDevice(
      device.id,
      device.client_id,
      updateData.client_id,
      null, // machineId
      currentUser.role_name,
      currentUser.client_id
    );

    // Remove client_id from updateData since transfer already handled it
    delete updateData.client_id;
  }

  // Check device_id uniqueness if being updated
  if (updateData.device_id && updateData.device_id !== device.device_id) {
    const existingDevice = await Device.checkDeviceIdExists(updateData.device_id, device.id);
    if (existingDevice) {
      throw new ConflictError('Device ID already exists');
    }
  }

  // Update device (other fields only, client_id already handled by transfer if needed)
  let updatedDevice;
  if (Object.keys(updateData).length > 0) {
    updatedDevice = await Device.update(device.id, updateData);
  } else {
    // If only client_id was changed, just fetch the updated device
    updatedDevice = await Device.findById(device.id);
  }

  // Log device update
  logger.info('Device updated', {
    deviceId: device.id,
    device_id: device.device_id,
    updatedBy: currentUser.user_id,
    updates: Object.keys(updateData)
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DEVICE_MANAGEMENT,
    action: AUDIT_ACTIONS.DEVICE_UPDATED,
    message: `Device updated: ${device.device_id}`,
    target_type: TARGET_TYPES.DEVICE,
    target_id: device.id,
    details: JSON.stringify(updateData),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Device updated successfully',
    data: {
      device: updatedDevice.toJSON()
    }
  });
});

/**
 * Delete device with hierarchical validation
 * DELETE /api/devices/:deviceId
 */
export const deleteDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const currentUser = req.user;

  const device = await Device.findById(parseInt(deviceId));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check hierarchical access control
  if (!(await canAccessDevice(currentUser, device))) {
    throw new AuthorizationError('Access denied to this device');
  }

  // Check for transfer history
  const transferHistory = await Device.getTransferHistory(device.id);
  if (transferHistory.length > 0) {
    logger.warn('Attempting to delete device with transfer history', {
      deviceId: device.id,
      device_id: device.device_id,
      transferCount: transferHistory.length
    });
  }

  // Delete device
  await Device.delete(device.id);

  // Log device deletion
  logger.info('Device deleted', {
    deviceId: device.id,
    device_id: device.device_id,
    deletedBy: currentUser.user_id,
    clientId: device.client_id
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DEVICE_MANAGEMENT,
    action: AUDIT_ACTIONS.DEVICE_DELETED,
    message: `Device deleted: ${device.device_id}`,
    target_type: TARGET_TYPES.DEVICE,
    target_id: device.id,
    details: JSON.stringify({
      device_id: device.device_id,
      Model: device.Model,
      client_id: device.client_id,
      had_transfer_history: transferHistory.length > 0
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Device deleted successfully'
  });
});

/**
 * Transfer device to another client
 * POST /api/devices/:deviceId/transfer
 */
export const transferDevice = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { deviceId } = req.params;
  const { target_client_id, machin_id } = req.body;
  const currentUser = req.user;

  const device = await Device.findById(parseInt(deviceId));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check hierarchical access control for source device
  if (!(await canAccessDevice(currentUser, device))) {
    throw new AuthorizationError('Access denied to this device');
  }

  // Verify target client exists
  const targetClient = await Client.findById(target_client_id);
  if (!targetClient) {
    throw new NotFoundError('Target client not found');
  }

  // Validate hierarchical access - users can only transfer devices that belong to their client or descendant clients
  // Permission to transfer is already checked by requirePermission('Transfer Device') middleware
  // Here we only check if the device is within the user's hierarchical scope (unless user is SYSTEM_ADMIN/SUPER_ADMIN)
  if (!['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name)) {
    logger.info('Checking hierarchical access for device transfer:', {
      userRole: currentUser.role_name,
      userClientId: currentUser.client_id,
      deviceClientId: device.client_id,
      targetClientId: target_client_id
    });

    const isOwnDevice = device.client_id === currentUser.client_id;
    const isDescendantDevice = await Client.isDescendant(currentUser.client_id, device.client_id);

    logger.info('Hierarchical check results:', {
      isOwnDevice,
      isDescendantDevice
    });

    const canTransfer = isOwnDevice || isDescendantDevice;

    if (!canTransfer) {
      logger.error('Transfer denied - device not in user hierarchy:', {
        userClientId: currentUser.client_id,
        deviceClientId: device.client_id
      });
      throw new AuthorizationError('You can only transfer devices that belong to your client or descendant clients');
    }

    logger.info('Hierarchical access granted for transfer');
  }

  // Perform transfer (includes machine_id update and hierarchy validation)
  // The Device.transferDevice method will handle the complex validation:
  // - Allow transfer to descendants if device hasn't been transferred down yet
  // - Block transfer if device has already been transferred down the hierarchy
  // Pass user role and client_id for admin override logic
  const result = await Device.transferDevice(
    device.id,
    device.client_id,
    target_client_id,
    machin_id,
    currentUser.role_name,
    currentUser.client_id
  );

  // Log device transfer
  logger.info('Device transferred', {
    deviceId: device.id,
    device_id: device.device_id,
    fromClient: device.client_id,
    toClient: target_client_id,
    transferredBy: currentUser.user_id
  });

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DEVICE_MANAGEMENT,
    action: AUDIT_ACTIONS.DEVICE_TRANSFERRED,
    message: `Device transferred: ${device.device_id} from ${device.client_name} to ${targetClient.name}`,
    target_type: TARGET_TYPES.DEVICE,
    target_id: device.id,
    details: JSON.stringify({
      device_id: device.device_id,
      from_client_id: device.client_id,
      from_client_name: device.client_name,
      to_client_id: target_client_id,
      to_client_name: targetClient.name
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Device transferred successfully',
    data: {
      transfer: result.transfer,
      device: result.device.toJSON()
    }
  });
});

/**
 * Get device transfer history
 * GET /api/devices/:deviceId/history
 */
export const getDeviceTransferHistory = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const currentUser = req.user;

  const device = await Device.findById(parseInt(deviceId));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check hierarchical access control
  if (!(await canAccessDevice(currentUser, device))) {
    throw new AuthorizationError('Access denied to this device');
  }

  const history = await Device.getTransferHistory(device.id);

  // Log access to transfer history
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DATA_ACCESS,
    action: AUDIT_ACTIONS.DATA_ACCESSED,
    message: `Device transfer history accessed: ${device.device_id}`,
    target_type: TARGET_TYPES.DEVICE,
    target_id: device.id,
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    data: {
      device_id: device.device_id,
      history
    }
  });
});

/**
 * Get device statistics with hierarchical filtering
 * GET /api/devices/stats
 */
export const getDeviceStats = asyncHandler(async (req, res) => {
  const currentUser = req.user;

  // Apply client-scoped filtering for statistics with hierarchical access
  let clientFilter = null;
  if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
    // Get all descendant clients to include stats from child clients
    const descendants = await Client.getDescendantClients(currentUser.client_id);
    const descendantIds = descendants.map(client => client.client_id);

    // Include user's own client and all descendants
    clientFilter = [currentUser.client_id, ...descendantIds];

    logger.info('Getting device statistics for hierarchical access:', {
      userClientId: currentUser.client_id,
      descendantCount: descendantIds.length,
      totalClientIds: clientFilter.length
    });
  }

  const stats = await Device.getStatistics(clientFilter);

  // Create audit log
  await createAuditLog({
    user_id: currentUser.user_id,
    activity_type: ACTIVITY_TYPES.DATA_ACCESS,
    action: AUDIT_ACTIONS.DATA_ACCESSED,
    message: 'Device statistics accessed',
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
  getDevices,
  getDeviceById,
  createDevice,
  updateDevice,
  deleteDevice,
  transferDevice,
  getDeviceTransferHistory,
  getDeviceStats
};
