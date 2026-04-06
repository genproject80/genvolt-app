import {Device} from '../models/Device.js';
import {Inventory} from '../models/Inventory.js';
import {Client} from '../models/Client.js';
import {logger} from '../utils/logger.js';
import {
  asyncHandler,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '../middleware/errorHandler.js';
import {ACTIVITY_TYPES, AUDIT_ACTIONS, createAuditLog, TARGET_TYPES} from '../utils/auditLogger.js';
import {validationResult} from 'express-validator';
import sql from 'mssql';
import {getPool} from '../config/database.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mqttService from '../services/mqttService.js';
import {kickMqttClientsByUsername} from '../services/emqxMgmtService.js';
import {checkDeviceActivationEligibility} from '../services/subscriptionService.js';
import {FeatureFlag} from '../models/FeatureFlag.js';
import {
  pauseAllDevicesForClient,
  pauseDevice,
  resumeAllDevicesForClient,
  resumeDevice
} from '../services/devicePauseService.js';

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
  return await Client.isDescendant(currentUser.client_id, device.client_id);
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
    model_number,
    activation_status,
    startDate,
    endDate,
    client_id  // New parameter: filter by specific client_id
  } = req.query;

  const currentUser = req.user;

  // Build search filters with hierarchical access control
  const filters = {};

  // If client_id is provided in query, filter by that specific client
  if (client_id) {
    const selectedClientId = parseInt(client_id);

    // Verify user has access to the selected client
    if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
      // Check if selected client is the user's own client or a descendant
      const descendants = await Client.getDescendantClients(currentUser.client_id);
      const descendantIds = descendants.map(client => client.client_id);
      const accessibleClientIds = [currentUser.client_id, ...descendantIds];

      if (!accessibleClientIds.includes(selectedClientId)) {
        throw new AuthorizationError('Access denied to selected client');
      }
    }

    // Filter by the specific selected client only
    filters.client_id = selectedClientId;

    logger.info('Filtering devices for specific client:', {
      selectedClientId,
      requestedBy: currentUser.user_id
    });
  } else {
    // No specific client selected - apply default hierarchical filtering
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
  }

  if (search) {
    filters.search = search;
  }

  if (model_number) {
    filters.model_number = model_number;
  }

  if (activation_status) {
    filters.activation_status = activation_status;
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

  // Increment inventory device counter so next auto-generated ID is unique
  if (deviceData.model_number) {
    await Inventory.incrementCounter(deviceData.model_number).catch(err =>
      logger.warn('Failed to increment inventory device_counter:', err)
    );
  }

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
      model_number: device.model_number,
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
      model_number: device.model_number,
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
  getDeviceStats,
};

// =============================================================================
// DEVICE LIFECYCLE — MQTT activation flow
// =============================================================================

/**
 * GET /api/devices/pending
 * List all devices that have self-registered via the pre-activation topic
 * but have not yet been assigned to a client.
 */
export const getPendingDevices = asyncHandler(async (req, res) => {
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT
      id,
      device_id,
      imei,
      device_type,
      firmware_version,
      mac_address,
      onboarding_date,
      first_seen,
      last_seen
    FROM dbo.device
    WHERE activation_status = 'PENDING'
    ORDER BY onboarding_date DESC, last_seen DESC
  `);

  res.json({
    success: true,
    data: result.recordset,
    meta: { total: result.recordset.length },
  });
});

/**
 * POST /api/devices/:deviceId/activate
 * Assign a PENDING device to a client and activate it.
 * For devices auto-registered via pre-activation (no device_id yet), body must include device_id.
 * Body: { client_id, device_id? }
 */
export const activateDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.params; // may be a temp IMEI-based lookup key
  const { client_id, device_id: assignedDeviceId } = req.body;

  if (!client_id) throw new ValidationError('client_id is required');
  const parsedClientId = parseInt(client_id, 10);
  if (isNaN(parsedClientId) || parsedClientId < 1)
    throw new ValidationError('client_id must be a positive integer');

  const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(req.user?.role_name);
  const paymentsFlag = await FeatureFlag.findByName('payments_enabled');
  const paymentsEnabled = paymentsFlag ? !!paymentsFlag.is_enabled : false;
  if (!isAdmin && paymentsEnabled) {
    const eligibility = await checkDeviceActivationEligibility(parsedClientId);
    if (!eligibility.eligible) {
      return res.status(403).json({
        success: false,
        eligible: false,
        reason: eligibility.reason,
        subscription: eligibility.subscription,
        plan: eligibility.plan,
        message: {
          NO_SUBSCRIPTION:      'This client has no active subscription. Please subscribe to a plan first.',
          GRACE_PERIOD:         'This client\'s subscription has expired and is in the grace period. Please renew to activate new devices.',
          SUBSCRIPTION_EXPIRED: 'This client\'s subscription has expired. Please renew to activate devices.',
          PLAN_LIMIT:           `Device limit reached for the current plan (${eligibility.plan?.max_devices} devices). Please upgrade.`,
        }[eligibility.reason] || 'Activation not allowed.',
      });
    }
  }

  const pool = await getPool();

  // Check device exists and is PENDING — look up by device_id OR imei
  const check = await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .query(`
      SELECT id, device_id, activation_status, imei
      FROM dbo.device
      WHERE device_id = @deviceId OR imei = @deviceId
    `);

  if (check.recordset.length === 0) throw new NotFoundError('Device not found');
  const device = check.recordset[0];
  if (device.activation_status !== 'PENDING')
    throw new ValidationError(`Device is already ${device.activation_status}`);

  // Resolve device_id prefix from inventory model, fall back to 'GV'
  let deviceIdPrefix = 'GV';
  if (device.model_number) {
    try {
      const inventoryEntry = await Inventory.findByModelNumber(device.model_number);
      if (inventoryEntry?.device_id_prefix) deviceIdPrefix = inventoryEntry.device_id_prefix;
    } catch { /* keep default prefix on error */ }
  }

  // For pre-activation devices (no device_id yet), auto-generate one using model prefix
  const finalDeviceId = device.device_id || assignedDeviceId ||
    (deviceIdPrefix + crypto.randomBytes(4).toString('hex').toUpperCase());

  const imei = device.imei;
  if (!imei) throw new ValidationError('Device has no IMEI — cannot send activation payload');

  // Generate MQTT credentials
  const mqttPassword     = crypto.randomBytes(16).toString('hex');
  const mqttPasswordHash = await bcrypt.hash(mqttPassword, 10);

  await pool.request()
    .input('finalDeviceId',  sql.NVarChar, finalDeviceId)
    .input('lookupId',       sql.NVarChar, deviceId)
    .input('clientId',       sql.Int,      parsedClientId)
    .input('mqttPassword',   sql.NVarChar, mqttPasswordHash)
    .input('mqttPlain',      sql.NVarChar, mqttPassword)
    .input('activatedBy',    sql.Int,      req.user.user_id)
    .query(`
      UPDATE dbo.device
      SET activation_status     = 'ACTIVE',
          device_id             = @finalDeviceId,
          client_id             = @clientId,
          mqtt_password         = @mqttPassword,
          mqtt_password_plain   = @mqttPlain,
          mqtt_username         = @finalDeviceId,
          activated_at          = GETUTCDATE(),
          activated_by          = @activatedBy,
          last_seen             = GETUTCDATE()
      WHERE device_id = @lookupId OR imei = @lookupId
    `);

  // Kick any pre-activation session connected as this IMEI before publishing credentials.
  // This prevents an attacker who connected with IMEI/PRE_ACTIVATION_SECRET from receiving
  // the activation payload while the device is in PENDING state.
  await kickMqttClientsByUsername(imei);

  try {
    await mqttService.publishTelemetryConfig(imei, finalDeviceId, mqttPassword);
  } catch (mqttErr) {
    logger.error('Activation MQTT publish failed (retained msg will deliver on next connect):', mqttErr.message);
  }

  await createAuditLog({
    user_id:       req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action:        'DEVICE_ACTIVATED',
    message:       `Device ${finalDeviceId} (IMEI: ${imei}) activated for client ${parsedClientId}`,
    target_type:   'DEVICE',
    target_id:     finalDeviceId,
    details:       JSON.stringify({ client_id: parsedClientId, imei }),
  });

  res.json({
    success: true,
    message: 'Device activated successfully',
    data: { device_id: finalDeviceId, imei, client_id: parsedClientId, activation_status: 'ACTIVE' },
  });
});

/**
 * POST /api/devices/:deviceId/deactivate
 * Deactivate an ACTIVE device. Sends a deactivation notice via MQTT first.
 * Body: { reason? }
 */
export const deactivateDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { reason = 'admin_action' } = req.body;

  const pool = await getPool();

  const check = await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .query(`SELECT client_id, activation_status FROM device WHERE device_id = @deviceId`);

  if (check.recordset.length === 0) throw new NotFoundError('Device not found');
  if (check.recordset[0].activation_status !== 'ACTIVE') {
    throw new ValidationError(`Device is not ACTIVE (current: ${check.recordset[0].activation_status})`);
  }

  const { imei } = check.recordset[0];

  // Notify device before cutting access
  if (imei) {
    try {
      await mqttService.publishDeactivationNotice(imei, reason);
    } catch (mqttErr) {
      logger.error('Deactivation notice MQTT publish failed:', mqttErr.message);
    }
  }

  await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .input('deactivatedBy', sql.Int, req.user.user_id)
    .query(`
      UPDATE dbo.device
      SET activation_status   = 'INACTIVE',
          deactivated_at      = GETUTCDATE(),
          deactivated_by      = @deactivatedBy,
          mqtt_password       = NULL,
          mqtt_password_plain = NULL
      WHERE device_id = @deviceId
    `);

  await createAuditLog({
    user_id: req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action: 'DEVICE_DEACTIVATE',
    message: `Device ${deviceId} deactivated`,
    target_type: 'DEVICE',
    target_id: deviceId,
    details: JSON.stringify({ reason }),
  });

  res.json({ success: true, message: 'Device deactivated successfully' });
});

/**
 * POST /api/devices/:deviceId/reactivate
 * Re-activate an INACTIVE device (generates fresh credentials).
 * Body: { initial_config? }
 */
export const reactivateDevice = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;

  const pool = await getPool();

  const check = await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .query(`SELECT id, client_id, activation_status, imei FROM dbo.device WHERE device_id = @deviceId`);

  if (check.recordset.length === 0) throw new NotFoundError('Device not found');
  if (check.recordset[0].activation_status !== 'INACTIVE') {
    throw new ValidationError(`Device is not INACTIVE (current: ${check.recordset[0].activation_status})`);
  }

  const { imei } = check.recordset[0];
  if (!imei) throw new ValidationError('Device has no IMEI — cannot send activation payload');

  const mqttPassword     = crypto.randomBytes(16).toString('hex');
  const mqttPasswordHash = await bcrypt.hash(mqttPassword, 10);

  await pool.request()
    .input('deviceId',    sql.NVarChar, deviceId)
    .input('mqttPassword', sql.NVarChar, mqttPasswordHash)
    .input('mqttPlain',   sql.NVarChar, mqttPassword)
    .input('activatedBy', sql.Int,      req.user.user_id)
    .query(`
      UPDATE dbo.device
      SET activation_status   = 'ACTIVE',
          mqtt_password       = @mqttPassword,
          mqtt_password_plain = @mqttPlain,
          mqtt_username       = device_id,
          activated_at        = GETUTCDATE(),
          activated_by        = @activatedBy,
          deactivated_at      = NULL,
          deactivated_by      = NULL
      WHERE device_id = @deviceId
    `);

  try {
    await mqttService.publishTelemetryConfig(imei, deviceId, mqttPassword);
  } catch (mqttErr) {
    logger.error('Reactivation MQTT publish failed:', mqttErr.message);
  }

  await createAuditLog({
    user_id: req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action: 'DEVICE_REACTIVATE',
    message: `Device ${deviceId} reactivated`,
    target_type: 'DEVICE',
    target_id: deviceId,
    details: JSON.stringify({ config }),
  });

  res.json({ success: true, message: 'Device reactivated successfully' });
});

// ---------------------------------------------------------------------------
// POST /api/devices/:deviceId/pause
// Pause a single device (CLIENT or admin initiated)
// Body: { reason? }
// ---------------------------------------------------------------------------
export const pauseDeviceHandler = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { reason = '' } = req.body;
  const currentUser = req.user;

  const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name);
  const pausedBy = isAdmin ? 'ADMIN' : 'CLIENT';

  await pauseDevice(deviceId, pausedBy, reason);

  await createAuditLog({
    user_id:       currentUser.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action:        'DEVICE_PAUSE',
    message:       `Device ${deviceId} paused by ${pausedBy}`,
    target_type:   'DEVICE',
    target_id:     deviceId,
    details:       JSON.stringify({ reason, pausedBy }),
  });

  res.json({ success: true, message: `Device ${deviceId} paused` });
});

// ---------------------------------------------------------------------------
// POST /api/devices/:deviceId/resume
// Resume a paused device
// ---------------------------------------------------------------------------
export const resumeDeviceHandler = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const currentUser = req.user;

  const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name);
  const actorRole = isAdmin ? 'ADMIN' : 'CLIENT';

  await resumeDevice(deviceId, actorRole);

  await createAuditLog({
    user_id:       currentUser.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action:        'DEVICE_RESUME',
    message:       `Device ${deviceId} resumed`,
    target_type:   'DEVICE',
    target_id:     deviceId,
  });

  res.json({ success: true, message: `Device ${deviceId} resumed` });
});

// ---------------------------------------------------------------------------
// POST /api/devices/pause-all
// Pause all ACTIVE devices for a client
// Body: { client_id, reason? }
// ---------------------------------------------------------------------------
export const pauseAllDevicesHandler = asyncHandler(async (req, res) => {
  const { client_id, reason = '' } = req.body;
  const currentUser = req.user;

  if (!client_id) throw new ValidationError('client_id is required');

  const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name);
  const pausedBy = isAdmin ? 'ADMIN' : 'CLIENT';

  // Non-admin can only pause their own client
  if (!isAdmin && currentUser.client_id !== parseInt(client_id)) {
    throw new AuthorizationError('Access denied');
  }

  const count = await pauseAllDevicesForClient(parseInt(client_id), pausedBy, reason);

  res.json({ success: true, message: `${count} device(s) paused for client ${client_id}`, count });
});

// ---------------------------------------------------------------------------
// POST /api/devices/resume-all
// Resume all (CLIENT-paused) devices for a client
// Body: { client_id }
// ---------------------------------------------------------------------------
export const resumeAllDevicesHandler = asyncHandler(async (req, res) => {
  const { client_id } = req.body;
  const currentUser = req.user;

  if (!client_id) throw new ValidationError('client_id is required');

  const isAdmin = ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name);
  const actorRole = isAdmin ? 'ADMIN' : 'CLIENT';

  if (!isAdmin && currentUser.client_id !== parseInt(client_id)) {
    throw new AuthorizationError('Access denied');
  }

  const count = await resumeAllDevicesForClient(parseInt(client_id), actorRole);

  res.json({ success: true, message: `${count} device(s) resumed for client ${client_id}`, count });
});

// ---------------------------------------------------------------------------
// POST /api/devices/:deviceId/config-push
// Push a config_update payload to an ACTIVE device via MQTT.
// Body: { Motor_ON_Time_sec?, Motor_OFF_Time_min?, Wheel_Threshold?, ...any config fields }
// ---------------------------------------------------------------------------
export const pushDeviceConfig = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const config = req.body;

  if (!config || Object.keys(config).length === 0)
    throw new ValidationError('Request body must contain at least one config field');

  const pool = await getPool();
  const result = await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .query(`SELECT device_id, client_id, activation_status, imei FROM dbo.device WHERE device_id = @deviceId`);

  if (result.recordset.length === 0) throw new NotFoundError('Device not found');
  const device = result.recordset[0];

  if (device.activation_status !== 'ACTIVE')
    throw new ValidationError(`Device is not ACTIVE (current: ${device.activation_status})`);
  if (!device.imei)
    throw new ValidationError('Device has no IMEI registered');
  if (!await canAccessDevice(req.user, device))
    throw new AuthorizationError('Access denied');

  await mqttService.pushConfigUpdate(device.imei, config);

  await createAuditLog({
    user_id:       req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action:        'DEVICE_CONFIG_PUSH',
    message:       `Config pushed to device ${deviceId}`,
    target_type:   'DEVICE',
    target_id:     deviceId,
    details:       JSON.stringify(config),
  });

  res.json({ success: true, message: 'Config pushed to device', device_id: deviceId, config });
});

// ---------------------------------------------------------------------------
// POST /api/devices/:deviceId/rotate-credentials
// Generate new MQTT credentials and send telemetryConfig to the device.
// Invalidates old credentials immediately (DB update).
// ---------------------------------------------------------------------------
export const rotateDeviceCredentials = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;

  const pool = await getPool();
  const result = await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .query(`SELECT device_id, client_id, activation_status, imei FROM dbo.device WHERE device_id = @deviceId`);

  if (result.recordset.length === 0) throw new NotFoundError('Device not found');
  const device = result.recordset[0];

  if (device.activation_status !== 'ACTIVE')
    throw new ValidationError('Device must be ACTIVE to rotate credentials');
  if (!device.imei)
    throw new ValidationError('Device has no IMEI registered');
  if (!await canAccessDevice(req.user, device))
    throw new AuthorizationError('Access denied');

  const newPassword     = crypto.randomBytes(16).toString('hex');
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await pool.request()
    .input('deviceId',  sql.NVarChar, deviceId)
    .input('hash',      sql.NVarChar, newPasswordHash)
    .input('plain',     sql.NVarChar, newPassword)
    .query(`
      UPDATE dbo.device
      SET mqtt_password       = @hash,
          mqtt_password_plain = @plain
      WHERE device_id = @deviceId
    `);

  // Publish new telemetryConfig (retain: true) — device receives on reconnect
  await mqttService.publishTelemetryConfig(device.imei, deviceId, newPassword);

  await createAuditLog({
    user_id:       req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action:        'DEVICE_CREDENTIALS_ROTATE',
    message:       `MQTT credentials rotated for device ${deviceId}`,
    target_type:   'DEVICE',
    target_id:     deviceId,
  });

  res.json({ success: true, message: 'Credentials rotated — new telemetryConfig sent to device', device_id: deviceId });
});

// ---------------------------------------------------------------------------
// GET /api/devices/:deviceId/telemetry
// Paginated telemetry records for a device.
// Query: { page?, limit?, logicId? }
// ---------------------------------------------------------------------------
export const getDeviceTelemetry = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const page    = Math.max(1, parseInt(req.query.page  || '1'));
  const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit || '20')));
  const logicId = req.query.logicId ? parseInt(req.query.logicId) : null;
  const offset  = (page - 1) * limit;

  const pool = await getPool();

  // Verify access
  const devResult = await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .query(`SELECT device_id, client_id FROM dbo.device WHERE device_id = @deviceId`);
  if (devResult.recordset.length === 0) throw new NotFoundError('Device not found');
  if (!await canAccessDevice(req.user, devResult.recordset[0]))
    throw new AuthorizationError('Access denied');

  const logicFilter = logicId ? 'AND logic_id = @logicId' : '';
  const req2 = pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .input('limit',    sql.Int,      limit)
    .input('offset',   sql.Int,      offset);
  if (logicId) req2.input('logicId', sql.Int, logicId);

  const [dataResult, countResult] = await Promise.all([
    req2.query(`
      SELECT telemetry_id, device_id, imei, logic_id, decoded_data, received_at
      FROM dbo.DeviceTelemetry
      WHERE device_id = @deviceId ${logicFilter}
      ORDER BY received_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `),
    pool.request()
      .input('deviceId', sql.NVarChar, deviceId)
      .query(`SELECT COUNT(*) AS total FROM dbo.DeviceTelemetry WHERE device_id = @deviceId ${logicId ? `AND logic_id = ${logicId}` : ''}`),
  ]);

  const total = countResult.recordset[0].total;
  res.json({
    success: true,
    data: dataResult.recordset,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ---------------------------------------------------------------------------
// GET /api/devices/:deviceId/telemetry/latest
// Most recent decoded record per logicId for a device.
// ---------------------------------------------------------------------------
export const getLatestTelemetry = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;

  const pool = await getPool();
  const devResult = await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .query(`SELECT device_id, client_id FROM dbo.device WHERE device_id = @deviceId`);
  if (devResult.recordset.length === 0) throw new NotFoundError('Device not found');
  if (!await canAccessDevice(req.user, devResult.recordset[0]))
    throw new AuthorizationError('Access denied');

  const result = await pool.request()
    .input('deviceId', sql.NVarChar, deviceId)
    .query(`
      SELECT t.telemetry_id, t.logic_id, t.decoded_data, t.received_at
      FROM dbo.DeviceTelemetry t
      INNER JOIN (
        SELECT logic_id, MAX(received_at) AS max_at
        FROM dbo.DeviceTelemetry
        WHERE device_id = @deviceId
        GROUP BY logic_id
      ) latest ON t.logic_id = latest.logic_id AND t.received_at = latest.max_at
      WHERE t.device_id = @deviceId
    `);

  // Parse decoded_data JSON strings
  const data = result.recordset.map(row => ({
    ...row,
    decoded_data: row.decoded_data ? JSON.parse(row.decoded_data) : null,
  }));

  res.json({ success: true, data });
});
