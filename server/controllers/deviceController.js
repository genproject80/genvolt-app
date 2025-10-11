import { Device } from '../models/Device.js';
import { ClientDevice } from '../models/ClientDevice.js';
import { Client } from '../models/Client.js';
import { logger, logAuth, logSecurity } from '../utils/logger.js';
import { asyncHandler, ValidationError, ConflictError, NotFoundError, AuthorizationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';
import { executeQuery } from '../config/database.js';

/**
 * Get all devices with client-scoped filtering
 * GET /api/devices
 */
export const getAllDevices = asyncHandler(async (req, res) => {
  const { limit, offset, page, search, clientId, sortField, sortDirection } = req.query;
  const currentUser = req.user;

  try {
    // Calculate pagination
    const pageSize = limit ? parseInt(limit) : 50;
    const currentPage = page ? parseInt(page) : 1;
    const offsetValue = offset ? parseInt(offset) : (currentPage - 1) * pageSize;

    // Apply client-scoped filtering based on user role
    let filters = {
      limit: pageSize,
      offset: offsetValue,
      search,
      sortField,
      sortDirection
    };

    // CLIENT_ADMIN and CLIENT_USER can only see devices from their client and child clients
    if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
      // Get all child clients of the current user's client
      const childClients = await Client.getImmediateChildClients(currentUser.client_id);
      const childClientIds = childClients.map(child => child.client_id);

      // Include the current client ID and all child client IDs
      const allowedClientIds = [currentUser.client_id, ...childClientIds];

      logger.info('Device listing - hierarchical filtering:', {
        parentClientId: currentUser.client_id,
        childClientIds,
        allowedClientIds,
        totalChildClients: childClientIds.length
      });

      filters.clientIds = allowedClientIds; // Use clientIds (plural) instead of clientId
    } else if (clientId && ['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name)) {
      // Allow filtering by specific client for admin users
      filters.clientId = parseInt(clientId);
    }

    const devices = await Device.findAll(filters);
    const totalCount = await Device.getCount(filters);

    // Create audit log
    await createAuditLog({
      user_id: req.user.user_id,
      activity_type: 'DEVICE_MANAGEMENT',
      action: 'DATA_ACCESSED',
      message: 'Device list accessed',
      target_type: 'DEVICE',
      details: JSON.stringify({
        filters: {
          clientId: filters.clientId,
          search,
          page: currentPage
        }
      }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Devices retrieved successfully',
      data: {
        devices: devices.map(device => device.toPublic()),
        pagination: {
          currentPage,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
          hasNext: offsetValue + pageSize < totalCount,
          hasPrevious: currentPage > 1
        }
      }
    });
  } catch (error) {
    logger.error('Failed to get devices:', error);
    throw error;
  }
});

/**
 * Get device by ID
 * GET /api/devices/:id
 */
export const getDeviceById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;

  const device = await Device.findById(parseInt(id));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check access permissions - include child clients
  if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
    // Get all child clients of the current user's client
    const childClients = await Client.getImmediateChildClients(currentUser.client_id);
    const childClientIds = childClients.map(child => child.client_id);
    const allowedClientIds = [currentUser.client_id, ...childClientIds];

    logger.info('Device access check - hierarchical filtering:', {
      deviceId: device.id,
      deviceClientId: device.client_id,
      parentClientId: currentUser.client_id,
      childClientIds,
      allowedClientIds,
      hasAccess: allowedClientIds.includes(device.client_id)
    });

    if (!allowedClientIds.includes(device.client_id)) {
      throw new AuthorizationError('Access denied to this device');
    }
  }

  // Create audit log
  await createAuditLog({
    user_id: req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action: 'DATA_ACCESSED',
    message: 'Device details viewed',
    target_type: 'DEVICE',
    target_id: device.id,
    details: JSON.stringify({
      device_id: device.device_id
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Device retrieved successfully',
    data: { device: device.toPublic() }
  });
});

/**
 * Create new device
 * POST /api/devices
 */
export const createDevice = asyncHandler(async (req, res) => {
  const currentUser = req.user;
  const deviceData = req.body;

  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));
    throw new ValidationError('Validation failed', errorDetails);
  }

  // Validate device data
  const validation = Device.validateDeviceData(deviceData);
  if (!validation.isValid) {
    throw new ValidationError('Invalid device data', validation.errors);
  }

  // Check if device_id already exists
  const existingDevice = await Device.findByDeviceId(deviceData.device_id);
  if (existingDevice) {
    throw new ConflictError('Device ID already exists');
  }

  // Store original client selection for transfer logic
  const originalSelectedClientId = deviceData.client_id;

  logger.info('Device creation debug info:', {
    originalSelectedClientId,
    currentUserClientId: currentUser.client_id,
    deviceData: deviceData,
    userRole: currentUser.role_name
  });

  // Debug logging for null values
  if (!originalSelectedClientId) {
    logger.warn('originalSelectedClientId is null - client_id not provided in request body');
  }
  if (!currentUser.client_id) {
    logger.warn('currentUser.client_id is null - user may not be assigned to a client');
  }

  // Auto-assign client if not provided and user has a client_id
  if (!deviceData.client_id && currentUser.client_id) {
    deviceData.client_id = currentUser.client_id;
    logger.info('Auto-assigned device to user\'s client:', {
      deviceId: deviceData.device_id,
      userId: currentUser.user_id,
      clientId: currentUser.client_id,
      userRole: currentUser.role_name
    });
  }

  // Authorization check: SYSTEM_ADMIN can create for any client, others can only create for their own client
  if (currentUser.role_name === 'SYSTEM_ADMIN') {
    // SYSTEM_ADMIN can create devices for any client or no client
  } else if (currentUser.role_name === 'CLIENT_ADMIN') {
    // CLIENT_ADMIN can only create devices for their own client
    if (deviceData.client_id && deviceData.client_id !== currentUser.client_id) {
      throw new AuthorizationError('CLIENT_ADMIN can only create devices for their own client');
    }
  } else {
    throw new AuthorizationError('Insufficient permissions to create devices');
  }

  // Verify client exists if client_id is provided
  if (deviceData.client_id) {
    const client = await Client.findById(deviceData.client_id);
    if (!client) {
      throw new NotFoundError('Client not found');
    }
  }

  // For transfer logic: always create device with logged-in user's client first
  let initialClientId = currentUser.client_id || null;

  // Create device with onboarding date and initial client assignment
  const device = await Device.create({
    ...deviceData,
    client_id: initialClientId, // Always start with current user's client
    onboarding_date: new Date()
  });

  // Create client_device entry only when a client is explicitly selected
  logger.info('Checking if client_device entry should be created:', {
    originalSelectedClientId,
    initialClientId,
    condition: !!originalSelectedClientId
  });

  if (originalSelectedClientId) {
    logger.info('Creating client_device entry - starting transfer...');

    // Create transfer record: from logged-in user's client to selected client
    // If user has no client (e.g., SYSTEM_ADMIN), use null for seller_id
    const sellerId = initialClientId || null;
    logger.info('sellerId->',sellerId);
    logger.info('originalSelectedClientId->',originalSelectedClientId);

    // Validate that we have valid values before creating transfer
    if (!originalSelectedClientId) {
      logger.error('Cannot create transfer: originalSelectedClientId is null');
      throw new ValidationError('Client selection is required for device assignment');
    }

    // Additional validation to ensure device was created successfully
    if (!device || !device.id) {
      logger.error('Cannot create transfer: device was not created successfully');
      throw new Error('Device creation failed - cannot proceed with transfer');
    }

    logger.info('Creating transfer with validated parameters:', {
      sellerId,
      buyerId: originalSelectedClientId,
      deviceId: device.id,
      deviceDbId: device.id
    });

    // Verify the device exists in the database before creating transfer
    const verifyDevice = await Device.findById(device.id);
    if (!verifyDevice) {
      logger.error('Device verification failed - device not found in database:', {
        deviceId: device.id,
        deviceDeviceId: device.device_id
      });
      throw new Error('Device not found in database after creation');
    }

    logger.info('Device verified in database before transfer:', {
      deviceId: verifyDevice.id,
      deviceDeviceId: verifyDevice.device_id
    });

    const transfer = await ClientDevice.createTransfer(
      sellerId, // seller_id (logged-in user's client or null)
      originalSelectedClientId, // buyer_id (selected client)
      device.id // device_id
    );

    logger.info('Created client_device entry during device creation:', {
      deviceId: device.device_id,
      fromClientId: sellerId,
      toClientId: originalSelectedClientId,
      transferId: transfer.id,
      userId: currentUser.user_id,
      type: 'device_creation_transfer'
    });

    // Create audit log for the client assignment
    await createAuditLog({
      user_id: req.user.user_id,
      activity_type: 'DEVICE_MANAGEMENT',
      action: 'DEVICE_TRANSFERRED',
      message: 'Device transferred to client during creation',
      target_type: 'DEVICE',
      target_id: device.id,
      details: JSON.stringify({
        device_id: device.device_id,
        from_client_id: sellerId,
        to_client_id: originalSelectedClientId,
        transfer_id: transfer.id,
        transfer_type: 'device_creation_transfer'
      }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
  }

  // Create audit log for device creation
  await createAuditLog({
    user_id: req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action: 'DEVICE_CREATED',
    message: 'Created new device',
    target_type: 'DEVICE',
    target_id: device.id,
    details: JSON.stringify({
      device_id: device.device_id,
      client_id: device.client_id,
      model: device.Model,
      initially_assigned_to: initialClientId,
      finally_assigned_to: originalSelectedClientId || device.client_id
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  // Get updated device information after potential transfer
  const finalDevice = await Device.findById(device.id);

  res.status(201).json({
    success: true,
    message: originalSelectedClientId && originalSelectedClientId !== initialClientId
      ? 'Device created and transferred successfully'
      : 'Device created successfully',
    data: { device: finalDevice.toPublic() }
  });
});

/**
 * Update device
 * PUT /api/devices/:id
 */
export const updateDevice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const currentUser = req.user;

  logger.info('🔧 UPDATE DEVICE CALLED', {
    deviceId: id,
    updateData: updateData,
    currentUserId: currentUser.user_id,
    currentUserClientId: currentUser.client_id,
    isClientIdBeingChanged: updateData.client_id ? true : false,
    newClientId: updateData.client_id
  });

  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const device = await Device.findById(parseInt(id));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check access permissions (allow access for reassignment scenarios)
  if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
    // For client_id changes, we need to check if this is a valid reassignment scenario
    // Don't block access immediately if client_id is being changed - let the transfer logic handle it
    const isClientIdBeingChanged = updateData.client_id && updateData.client_id !== device.client_id;

    if (!isClientIdBeingChanged && device.client_id !== currentUser.client_id) {
      throw new AuthorizationError('Access denied to this device');
    }
  }

  // Validate update data
  const validation = Device.validateDeviceData(updateData, true);
  if (!validation.isValid) {
    throw new ValidationError('Invalid device data', validation.errors);
  }

  // Check for device_id uniqueness if being changed
  if (updateData.device_id && updateData.device_id !== device.device_id) {
    const existingDevice = await Device.findByDeviceId(updateData.device_id);
    if (existingDevice && existingDevice.id !== device.id) {
      throw new ConflictError('Device ID already exists');
    }
  }

  // Verify new client exists if client_id is being changed
  if (updateData.client_id && updateData.client_id !== device.client_id) {
    const client = await Client.findById(updateData.client_id);
    if (!client) {
      throw new NotFoundError('Client not found');
    }
  }

  // Check if client_id is being changed - this requires transfer logic
  if (updateData.client_id && updateData.client_id !== device.client_id) {
    logger.info('🔄 CLIENT_ID CHANGE DETECTED - Handling transfer logic', {
      oldClientId: device.client_id,
      newClientId: updateData.client_id,
      deviceId: device.id
    });

    // Check if this device has transfer history
    const hasTransferHistory = await ClientDevice.hasTransferHistory(device.id);

    if (hasTransferHistory) {
      logger.info('📋 Device has transfer history - determining transfer type');

      // Get transfer history to understand the chain
      const transferHistory = await ClientDevice.getTransferHistory(device.id);
      const mostRecentTransfer = transferHistory[0];
      const originalSeller = mostRecentTransfer.seller_id;
      const currentOwner = mostRecentTransfer.buyer_id;

      logger.info('🔍 Transfer chain analysis:', {
        originalSeller,
        currentOwner,
        requestingUserClientId: currentUser.client_id,
        newBuyerId: updateData.client_id
      });

      // Check if the requesting user is the original seller (reassignment scenario)
      const isOriginalSellerReassigning = currentUser.client_id === originalSeller;

      if (isOriginalSellerReassigning) {
        logger.info('🔄 REASSIGNMENT: Original seller reassigning device');

        // Validate reassignment is allowed
        const reassignmentCheck = await ClientDevice.canReassignDevice(
          device.id,
          currentUser.client_id,
          updateData.client_id
        );

        if (!reassignmentCheck.canReassign) {
          throw new ConflictError(reassignmentCheck.reason);
        }

        if (reassignmentCheck.isRedistribution) {
          logger.info('🔄 REDISTRIBUTION: Parent redistributing device between children');
          logger.info('📝 Updating existing transfer record (redistribution)');
        } else {
          logger.info('🔄 REASSIGNMENT: Original seller reassigning device');
          logger.info('📝 Updating existing transfer record (reassignment)');
        }

        // Update the existing transfer record
        await ClientDevice.updateTransfer(
          reassignmentCheck.mostRecentTransferId,
          updateData.client_id
        );

        logger.info('✅ Transfer record updated successfully:', {
          action: reassignmentCheck.isRedistribution ? 'redistribution' : 'reassignment',
          redistributionInfo: reassignmentCheck.redistributionInfo
        });
      } else {
        logger.info('🆕 NEW TRANSFER: Current owner transferring to new client');

        // Check if this might be a redistribution scenario first
        const redistributionCheck = await ClientDevice.canReassignDevice(
          device.id,
          currentUser.client_id,
          updateData.client_id
        );

        if (redistributionCheck.isRedistribution) {
          logger.info('🔄 REDISTRIBUTION: Parent redistributing device between children (via update)');

          // Update the existing transfer record for redistribution
          await ClientDevice.updateTransfer(
            redistributionCheck.mostRecentTransferId,
            updateData.client_id
          );

          logger.info('✅ Transfer record updated successfully (redistribution via update)');
        } else {
          // Validate current owner is authorized to transfer
          if (currentUser.client_id !== currentOwner) {
            throw new AuthorizationError('Only the current owner can transfer this device');
          }

          // Additional validation for CLIENT_ADMIN/CLIENT_USER: they can only transfer to their own client
          if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
            if (updateData.client_id !== currentUser.client_id) {
              throw new AuthorizationError('Cannot transfer device to other clients');
            }
          }

          // Validate not transferring to the same client
          if (updateData.client_id === currentOwner) {
            throw new ConflictError('Device is already assigned to this client');
          }

          // Create new transfer record (subsequent transfer in the chain)
          logger.info('📝 Creating new transfer record (subsequent transfer)');
          await ClientDevice.createTransfer(
            currentOwner, // current owner as seller
            updateData.client_id, // new client as buyer
            device.id
          );

          logger.info('✅ New transfer record created successfully (subsequent transfer)');
        }
      }
    } else {
      logger.info('📝 No transfer history - creating initial transfer record');

      // Create initial transfer record
      await ClientDevice.createTransfer(
        device.client_id, // current owner as seller
        updateData.client_id, // new owner as buyer
        device.id
      );

      logger.info('✅ Initial transfer record created successfully');
    }
  }

  // Update device
  const updatedDevice = await device.update(updateData);

  // Create audit log
  await createAuditLog({
    user_id: req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action: 'DEVICE_UPDATED',
    message: 'Updated device',
    target_type: 'DEVICE',
    target_id: device.id,
    details: JSON.stringify({
      device_id: device.device_id,
      changes: updateData
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Device updated successfully',
    data: { device: updatedDevice.toPublic() }
  });
});

/**
 * Delete device
 * DELETE /api/devices/:id
 */
export const deleteDevice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;

  const device = await Device.findById(parseInt(id));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check access permissions
  if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
    if (device.client_id !== currentUser.client_id) {
      throw new AuthorizationError('Access denied to this device');
    }
  }

  // Check if device has transfer history
  const hasTransfers = await ClientDevice.hasTransferHistory(device.id);
  if (hasTransfers) {
    throw new ConflictError('Cannot delete device with transfer history');
  }

  // Delete device
  await device.delete();

  // Create audit log
  await createAuditLog({
    user_id: req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action: 'DEVICE_DELETED',
    message: 'Deleted device',
    target_type: 'DEVICE',
    target_id: device.id,
    details: JSON.stringify({
      device_id: device.device_id,
      client_id: device.client_id
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
 * Transfer device ownership
 * POST /api/devices/:id/transfer
 */
export const transferDevice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { buyer_id } = req.body;
  const currentUser = req.user;

  logger.info('🚀 TRANSFER DEVICE CALLED', {
    deviceId: id,
    buyerId: buyer_id,
    currentUserId: currentUser.user_id,
    currentUserClientId: currentUser.client_id
  });

  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const device = await Device.findById(parseInt(id));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Handle unassigned devices - treat as assignment rather than transfer
  const isAssignment = !device.client_id;

  // Check transfer permissions (only device owner or admin)
  // For CLIENT_ADMIN/CLIENT_USER, allow if they own the device OR if this might be a reassignment scenario
  // The detailed reassignment validation will be handled later in the logic
  if (!isAssignment && (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER')) {
    const ownsDevice = device.client_id === currentUser.client_id;

    if (!ownsDevice) {
      // Check if this could be a reassignment scenario - we'll validate properly later
      // For now, let's check if device has transfer history and user might be original seller
      const hasTransferHistory = await ClientDevice.hasTransferHistory(device.id);

      if (!hasTransferHistory) {
        // No transfer history and user doesn't own device = not allowed
        throw new AuthorizationError('Can only transfer devices you own');
      }

      // If there's transfer history, let the detailed reassignment logic handle validation
      logger.info('Device has transfer history - allowing request to proceed to reassignment validation');
    }
  }

  // Parse and validate buyer_id first
  const parsedBuyerId = parseInt(buyer_id);
  if (isNaN(parsedBuyerId) || parsedBuyerId < 1) {
    throw new ValidationError('Invalid buyer ID provided');
  }

  // Validate buyer client exists
  const buyerClient = await Client.findById(parsedBuyerId);
  if (!buyerClient) {
    throw new NotFoundError('Buyer client not found');
  }

  // Check if this is a reassignment of an already transferred device
  logger.info('Checking transfer history for device:', {
    deviceInternalId: device.id,
    devicePublicId: device.device_id,
    currentClientId: device.client_id
  });

  const hasTransferHistory = await ClientDevice.hasTransferHistory(device.id);
  let transfer;

  logger.info('🔍 TRANSFER HISTORY CHECK RESULT', {
    deviceId: device.id,
    hasTransferHistory,
    pathToTake: hasTransferHistory ? 'REASSIGNMENT' : 'REGULAR_TRANSFER'
  });

  if (hasTransferHistory) {
    logger.info('Device has transfer history - checking transfer eligibility', {
      deviceId: device.id,
      requestingUserClientId: currentUser.client_id,
      targetBuyerId: parsedBuyerId
    });

    // Get transfer details to determine the correct action
    const transferCheck = await ClientDevice.canReassignDevice(device.id, currentUser.client_id, parsedBuyerId);

    logger.info('Transfer details:', {
      currentOwner: transferCheck.currentOwner,
      originalSeller: transferCheck.originalSeller,
      transferHistory: transferCheck.transferHistory.map(t => ({
        sellerId: t.seller_id,
        buyerId: t.buyer_id,
        transferDate: t.transfer_date
      }))
    });

    const { currentOwner, originalSeller } = transferCheck;

    // Check if the requesting user is the original seller (reassignment scenario)
    const isOriginalSellerReassigning = currentUser.client_id === originalSeller;

    if (isOriginalSellerReassigning) {
      logger.info('🔄 REASSIGNMENT: Original seller reassigning device');

      // Validate reassignment is allowed
      const reassignmentCheck = await ClientDevice.canReassignDevice(
        device.id,
        currentUser.client_id,
        parsedBuyerId
      );

      if (!reassignmentCheck.canReassign) {
        logger.error('Reassignment blocked:', reassignmentCheck.reason);
        throw new ConflictError(reassignmentCheck.reason);
      }

      logger.info('📝 UPDATING EXISTING TRANSFER RECORD:', {
        transferId: reassignmentCheck.mostRecentTransferId,
        newBuyerId: parsedBuyerId,
        originalSeller,
        currentOwner
      });

      // Update existing transfer record for reassignment
      transfer = await ClientDevice.updateTransfer(reassignmentCheck.mostRecentTransferId, parsedBuyerId);

      logger.info('✅ Transfer record updated successfully (reassignment):', {
        transferId: transfer.id,
        newBuyerId: transfer.buyer_id,
        action: 'reassignment'
      });

    } else {
      // Check if this is a redistribution scenario (parent redistributing between children)
      const redistributionCheck = await ClientDevice.canReassignDevice(
        device.id,
        currentUser.client_id,
        parsedBuyerId
      );

      if (!redistributionCheck.canReassign) {
        logger.error('Transfer blocked:', redistributionCheck.reason);
        throw new ConflictError(redistributionCheck.reason);
      }

      if (redistributionCheck.isRedistribution) {
        logger.info('🔄 REDISTRIBUTION: Parent redistributing device between children');
        logger.info('📝 UPDATING EXISTING TRANSFER RECORD FOR REDISTRIBUTION:', {
          transferId: redistributionCheck.mostRecentTransferId,
          newBuyerId: parsedBuyerId,
          redistributionInfo: redistributionCheck.redistributionInfo
        });

        // Update existing transfer record for redistribution
        transfer = await ClientDevice.updateTransfer(redistributionCheck.mostRecentTransferId, parsedBuyerId);

        logger.info('✅ Transfer record updated successfully (redistribution):', {
          transferId: transfer.id,
          newBuyerId: transfer.buyer_id,
          action: 'redistribution',
          redistributionInfo: redistributionCheck.redistributionInfo
        });

      } else {
        logger.info('🆕 NEW TRANSFER: Current owner transferring to new client');

        // Verify the current user can transfer this device (only if not a reassignment or redistribution scenario)
        if (currentUser.client_id !== currentOwner) {
          throw new ConflictError('Only the current device owner can transfer this device');
        }

        // Create new transfer record (subsequent transfer in the chain)
        logger.info('📝 CREATING NEW TRANSFER RECORD:', {
          sellerId: currentOwner,
          buyerId: parsedBuyerId,
          deviceId: device.id,
          action: 'subsequent_transfer'
        });

        transfer = await ClientDevice.createTransfer(currentOwner, parsedBuyerId, device.id);

        logger.info('✅ New transfer record created successfully:', {
          transferId: transfer.id,
          sellerId: currentOwner,
          buyerId: parsedBuyerId,
          action: 'subsequent_transfer'
        });
      }
    }

  } else {
    // No transfer history - this is a regular assignment/transfer
    logger.info('❌ REGULAR TRANSFER PATH: No transfer history - creating new transfer record');

    // Validate transfer data - for assignments, seller_id is null
    const transferData = {
      seller_id: device.client_id || null,
      buyer_id: parsedBuyerId,
      device_id: device.id
    };

    logger.info('Transfer data before validation:', {
      transferData,
      deviceInfo: {
        id: device.id,
        client_id: device.client_id,
        device_id: device.device_id
      },
      parsedBuyerId,
      originalBuyerId: buyer_id
    });

    const validation = ClientDevice.validateTransferData(transferData);
    if (!validation.isValid) {
      logger.error('Transfer validation failed:', {
        transferData,
        validationErrors: validation.errors
      });
      throw new ValidationError('Invalid transfer data', validation.errors);
    }

    // Create new transfer record and update device ownership
    logger.info('Attempting to create transfer record:', {
      sellerId: device.client_id || null,
      buyerId: parsedBuyerId,
      deviceId: device.id
    });

    transfer = await ClientDevice.createTransfer(device.client_id || null, parsedBuyerId, device.id);

    logger.info('Transfer record created successfully:', {
      transferId: transfer.id,
      deviceId: device.device_id,
      action: 'new_transfer'
    });
  }

  // Create audit log
  let isReassignment = false;
  let isRedistribution = false;
  let transferType = 'transfer';

  if (hasTransferHistory) {
    const transferInfo = await ClientDevice.canReassignDevice(device.id, currentUser.client_id, parsedBuyerId);
    isReassignment = currentUser.client_id === transferInfo.originalSeller;
    isRedistribution = transferInfo.isRedistribution || false;

    if (isReassignment) {
      transferType = 'reassignment';
    } else if (isRedistribution) {
      transferType = 'redistribution';
    } else {
      transferType = 'subsequent_transfer';
    }
  }

  let auditMessage = 'Transferred device ownership';
  if (isReassignment) {
    auditMessage = 'Reassigned device ownership';
  } else if (isRedistribution) {
    auditMessage = 'Redistributed device between child clients';
  } else if (hasTransferHistory) {
    auditMessage = 'Created new transfer in ownership chain';
  }

  await createAuditLog({
    user_id: req.user.user_id,
    activity_type: 'DEVICE_MANAGEMENT',
    action: 'DEVICE_TRANSFERRED',
    message: auditMessage,
    target_type: 'DEVICE',
    target_id: device.id,
    details: JSON.stringify({
      device_id: device.device_id,
      from_client_id: device.client_id,
      to_client_id: parsedBuyerId,
      transfer_id: transfer.id,
      transfer_type: transferType,
      isAssignment: isAssignment,
      isReassignment: isReassignment,
      isRedistribution: isRedistribution,
      isNewTransferInChain: hasTransferHistory && !isReassignment && !isRedistribution
    }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  let responseMessage = 'Device transferred successfully';
  if (isReassignment) {
    responseMessage = 'Device reassigned successfully';
  } else if (isRedistribution) {
    responseMessage = 'Device redistributed successfully between child clients';
  } else if (hasTransferHistory) {
    responseMessage = 'Device transferred successfully (new transfer record created)';
  }

  res.json({
    success: true,
    message: responseMessage,
    data: {
      transfer: transfer.toPublic(),
      action: transferType
    }
  });
});

/**
 * Get device transfer history
 * GET /api/devices/:id/transfers
 */
export const getDeviceTransfers = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;

  const device = await Device.findById(parseInt(id));

  if (!device) {
    throw new NotFoundError('Device not found');
  }

  // Check access permissions
  if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
    if (device.client_id !== currentUser.client_id) {
      throw new AuthorizationError('Access denied to this device');
    }
  }

  const transfers = await ClientDevice.getTransferHistory(device.id);

  res.json({
    success: true,
    message: 'Device transfer history retrieved successfully',
    data: { transfers: transfers.map(transfer => transfer.toPublic()) }
  });
});

/**
 * Get device statistics
 * GET /api/devices/stats
 */
export const getDeviceStats = asyncHandler(async (req, res) => {
  const currentUser = req.user;

  let clientId = null;
  if (currentUser.role_name === 'CLIENT_ADMIN' || currentUser.role_name === 'CLIENT_USER') {
    clientId = currentUser.client_id;
  }

  const stats = await Device.getStats(clientId);

  res.json({
    success: true,
    message: 'Device statistics retrieved successfully',
    data: { stats }
  });
});