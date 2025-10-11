import { Client } from '../models/Client.js';
import { logger, logAuth, logSecurity } from '../utils/logger.js';
import { asyncHandler, ValidationError, ConflictError, NotFoundError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import { validationResult } from 'express-validator';

/**
 * Get all clients
 * GET /api/clients
 */
export const getAllClients = asyncHandler(async (req, res) => {
  const { includeInactive = false, limit, offset, page } = req.query;

  console.log('🚨 GET ALL CLIENTS ENDPOINT CALLED 🚨');
  console.log('👤 Current user details:', {
    user_id: req.user.user_id,
    client_id: req.user.client_id,
    role: req.user.role_name,
    first_name: req.user.first_name,
    last_name: req.user.last_name
  });

  logger.info('📋 Getting all clients (might be used for dropdown)', {
    currentUserId: req.user.user_id,
    currentUserClientId: req.user.client_id,
    userRole: req.user.role_name,
    includeInactive,
    endpoint: 'GET /api/clients'
  });

  try {
    // Calculate pagination
    const pageSize = limit ? parseInt(limit) : 50;
    const currentPage = page ? parseInt(page) : 1;
    const offsetValue = offset ? parseInt(offset) : (currentPage - 1) * pageSize;

    const options = {
      includeInactive: includeInactive === 'true',
      limit: pageSize,
      offset: offsetValue
    };

    let clients;
    let totalCount;

    // Apply role-based filtering for client dropdown
    if (['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(req.user.role_name)) {
      // SYSTEM_ADMIN and SUPER_ADMIN see all clients
      logger.info('🔓 SYSTEM_ADMIN/SUPER_ADMIN - showing all clients', {
        userRole: req.user.role_name,
        userId: req.user.user_id
      });
      clients = await Client.findAll(options);
      totalCount = await Client.getCount(options);
    } else if (req.user.role_name === 'CLIENT_ADMIN' && req.user.client_id) {
      // CLIENT_ADMIN sees their own client + immediate children
      logger.info('👥 CLIENT_ADMIN - showing user client and immediate children', {
        userClientId: req.user.client_id,
        userRole: req.user.role_name,
        userId: req.user.user_id
      });

      const clientsForDropdown = await Client.getClientsForDropdown(
        req.user.client_id,
        req.user.role_name,
        null
      );

      // Apply pagination to the filtered results
      const startIndex = offsetValue;
      const endIndex = offsetValue + pageSize;
      clients = clientsForDropdown.slice(startIndex, endIndex).map(clientData => new Client(clientData));
      totalCount = clientsForDropdown.length;

      logger.info('📋 Filtered client results', {
        userClientId: req.user.client_id,
        totalClients: clientsForDropdown.length,
        paginatedCount: clients.length,
        clientNames: clients.map(c => c.name)
      });
    } else {
      // Default: no clients
      logger.warn('⚠️ User has no access to clients', {
        userRole: req.user.role_name,
        userClientId: req.user.client_id,
        userId: req.user.user_id
      });
      clients = [];
      totalCount = 0;
    }

    // Create audit log
    await createAuditLog({
      user_id: req.user.user_id,
      activity_type: 'CLIENT_MANAGEMENT',
      action: 'DATA_ACCESSED',
      message: 'Clients list accessed',
      target_type: 'CLIENT',
      details: JSON.stringify({
        includeInactive: options.includeInactive,
        limit: pageSize,
        page: currentPage
      }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Clients retrieved successfully',
      data: {
        clients: clients.map(client => client.toPublic()),
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
    logger.error('Failed to get clients:', error);
    throw error;
  }
});

/**
 * Get client by ID
 * GET /api/clients/:id
 */
export const getClientById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const client = await Client.findById(parseInt(id));
  
  if (!client) {
    throw new NotFoundError('Client not found');
  }

  // Create audit log
  await createAuditLog({
    user_id: req.user.user_id,
    activity_type: 'CLIENT_MANAGEMENT',
    action: 'DATA_ACCESSED',
    message: 'Client details viewed',
    target_type: 'CLIENT',
    target_id: client.client_id,
    details: JSON.stringify({ clientName: client.name }),
    ip_address: req.ip,
    user_agent: req.get('User-Agent')
  });

  res.json({
    success: true,
    message: 'Client retrieved successfully',
    data: { client: client.toPublic() }
  });
});

/**
 * Test endpoint to debug client filtering
 * GET /api/clients/debug
 */
export const debugClients = asyncHandler(async (req, res) => {
  const currentUser = req.user;

  console.log('🔧 DEBUG CLIENTS ENDPOINT');

  // Test direct SQL query
  const { executeQuery } = await import('../config/database.js');

  const testQuery = `
    SELECT client_id, name, parent_id, is_active
    FROM client
    WHERE parent_id = @parentClientId AND is_active = 1
    ORDER BY name ASC
  `;

  const result = await executeQuery(testQuery, { parentClientId: currentUser.client_id });

  console.log(`🔍 Direct SQL test for parent_id = ${currentUser.client_id}:`);
  console.log('Results:', result.recordset);

  res.json({
    success: true,
    data: {
      userClientId: currentUser.client_id,
      queryResults: result.recordset,
      rawSQL: testQuery
    }
  });
});

/**
 * Get client hierarchy for dropdown - only immediate child clients
 * GET /api/clients/hierarchy
 */
export const getClientHierarchy = asyncHandler(async (req, res) => {
  const { excludeClientId } = req.query;
  const currentUser = req.user;

  console.log('🚨 CLIENT HIERARCHY ENDPOINT CALLED 🚨');
  console.log('👤 Current user details:', {
    user_id: currentUser.user_id,
    client_id: currentUser.client_id,
    role: currentUser.role_name,
    first_name: currentUser.first_name,
    last_name: currentUser.last_name
  });

  logger.info('🏢 Getting client hierarchy for dropdown', {
    currentUserId: currentUser.user_id,
    currentUserClientId: currentUser.client_id,
    userRole: currentUser.role_name,
    excludeClientId,
    endpoint: 'GET /api/clients/hierarchy'
  });

  try {
    let hierarchy;

    // Role-based filtering for client hierarchy dropdown
    if (['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name)) {
      // SYSTEM_ADMIN and SUPER_ADMIN see all clients
      logger.info('🔓 SYSTEM_ADMIN/SUPER_ADMIN - showing all clients', {
        userRole: currentUser.role_name,
        userId: currentUser.user_id
      });
      hierarchy = await Client.getClientHierarchy(
        excludeClientId ? parseInt(excludeClientId) : null
      );
    } else if (currentUser.role_name === 'CLIENT_ADMIN' && currentUser.client_id) {
      // CLIENT_ADMIN sees their own client + immediate children
      logger.info('👥 CLIENT_ADMIN - showing user client and immediate children', {
        userClientId: currentUser.client_id,
        userRole: currentUser.role_name,
        userId: currentUser.user_id
      });
      hierarchy = await Client.getClientsForDropdown(
        currentUser.client_id,
        currentUser.role_name,
        excludeClientId ? parseInt(excludeClientId) : null
      );
    } else {
      // Default: empty array
      logger.warn('⚠️ User has no access to client hierarchy', {
        userRole: currentUser.role_name,
        userClientId: currentUser.client_id,
        userId: currentUser.user_id
      });
      hierarchy = [];
    }

    logger.info('📋 Client hierarchy result', {
      clientCount: hierarchy.length,
      clientNames: hierarchy.map(c => c.name)
    });

    res.json({
      success: true,
      message: 'Client hierarchy retrieved successfully',
      data: { clients: hierarchy }
    });
  } catch (error) {
    logger.error('Failed to get client hierarchy:', error);
    throw error;
  }
});

/**
 * Get client hierarchy for device transfer - only immediate children for CLIENT_ADMIN
 * GET /api/clients/hierarchy-for-transfer
 */
export const getClientHierarchyForTransfer = asyncHandler(async (req, res) => {
  const { excludeClientId } = req.query;
  const currentUser = req.user;

  console.log('🚨 CLIENT HIERARCHY FOR TRANSFER ENDPOINT CALLED 🚨');
  console.log('👤 Current user details:', {
    user_id: currentUser.user_id,
    client_id: currentUser.client_id,
    role: currentUser.role_name,
    first_name: currentUser.first_name,
    last_name: currentUser.last_name
  });

  logger.info('🔄 Getting client hierarchy for device transfer', {
    currentUserId: currentUser.user_id,
    currentUserClientId: currentUser.client_id,
    userRole: currentUser.role_name,
    excludeClientId,
    endpoint: 'GET /api/clients/hierarchy-for-transfer'
  });

  try {
    let hierarchy;

    // Role-based filtering for device transfer
    if (['SYSTEM_ADMIN', 'SUPER_ADMIN'].includes(currentUser.role_name)) {
      // SYSTEM_ADMIN and SUPER_ADMIN see all clients
      logger.info('🔓 SYSTEM_ADMIN/SUPER_ADMIN - showing all clients for transfer', {
        userRole: currentUser.role_name,
        userId: currentUser.user_id
      });
      hierarchy = await Client.getClientHierarchy(
        excludeClientId ? parseInt(excludeClientId) : null
      );
    } else if (currentUser.role_name === 'CLIENT_ADMIN' && currentUser.client_id) {
      // CLIENT_ADMIN sees ONLY immediate children (not their own client)
      logger.info('👥 CLIENT_ADMIN - showing only immediate children for transfer', {
        userClientId: currentUser.client_id,
        userRole: currentUser.role_name,
        userId: currentUser.user_id
      });
      hierarchy = await Client.getImmediateChildClients(
        currentUser.client_id,
        excludeClientId ? parseInt(excludeClientId) : null
      );
    } else {
      // Default: empty array
      logger.warn('⚠️ User has no access to transfer clients', {
        userRole: currentUser.role_name,
        userClientId: currentUser.client_id,
        userId: currentUser.user_id
      });
      hierarchy = [];
    }

    logger.info('📋 Client hierarchy for transfer result', {
      clientCount: hierarchy.length,
      clientNames: hierarchy.map(c => c.name)
    });

    res.json({
      success: true,
      message: 'Client hierarchy for transfer retrieved successfully',
      data: { clients: hierarchy }
    });
  } catch (error) {
    logger.error('Failed to get client hierarchy for transfer:', error);
    throw error;
  }
});

/**
 * Create a new client
 * POST /api/clients
 */
export const createClient = asyncHandler(async (req, res) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const {
    parent_id,
    name,
    email,
    phone,
    Address,
    contact_person,
    thinkspeak_subscription_info,
    city,
    state,
    is_active
  } = req.body;

  // Validate client data
  const validation = Client.validateClientData(req.body);
  if (!validation.isValid) {
    throw new ValidationError('Client validation failed', validation.errors);
  }

  // Check if client with email already exists
  const existingClient = await Client.findByEmail(email);
  if (existingClient) {
    throw new ConflictError('Client with this email already exists');
  }

  // Validate parent client exists if provided
  if (parent_id) {
    const parentClient = await Client.findById(parent_id);
    if (!parentClient) {
      throw new ValidationError('Parent client not found');
    }
    if (!parentClient.is_active) {
      throw new ValidationError('Parent client is inactive');
    }
  }

  try {
    // Create the client
    const clientData = {
      parent_id: parent_id || null,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      Address: Address ? Address.trim() : null,
      contact_person: contact_person ? contact_person.trim() : null,
      thinkspeak_subscription_info: thinkspeak_subscription_info ? thinkspeak_subscription_info.trim() : null,
      city: city ? city.trim() : null,
      state: state ? state.trim() : null,
      is_active: is_active !== undefined ? is_active : true
    };

    const newClient = await Client.create(clientData, req.user.user_id);

    // Create audit log
    await createAuditLog({
      user_id: req.user.user_id,
      activity_type: 'CLIENT_MANAGEMENT',
      action: 'CLIENT_CREATED',
      message: 'Created new client',
      target_type: 'CLIENT',
      target_id: newClient.client_id,
      details: JSON.stringify({
        clientName: newClient.name,
        clientEmail: newClient.email
      }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    logAuth('client_created', {
      clientId: newClient.client_id,
      clientName: newClient.name,
      createdBy: req.user.user_id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      message: 'Client created successfully',
      data: { client: newClient.toPublic() }
    });
  } catch (error) {
    logger.error('Failed to create client:', error);
    throw error;
  }
});

/**
 * Update an existing client
 * PUT /api/clients/:id
 */
export const updateClient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  // Check if client exists
  const existingClient = await Client.findById(parseInt(id));
  if (!existingClient) {
    throw new NotFoundError('Client not found');
  }

  const {
    parent_id,
    name,
    email,
    phone,
    Address,
    contact_person,
    thinkspeak_subscription_info,
    city,
    state,
    is_active
  } = req.body;

  // Validate client data
  const validation = Client.validateClientData(req.body, true);
  if (!validation.isValid) {
    throw new ValidationError('Client validation failed', validation.errors);
  }

  // Check if email is already taken by another client
  if (email !== existingClient.email) {
    const clientWithEmail = await Client.findByEmail(email);
    if (clientWithEmail && clientWithEmail.client_id !== parseInt(id)) {
      throw new ConflictError('Client with this email already exists');
    }
  }

  // Validate parent client exists if provided and different from current client
  if (parent_id) {
    if (parent_id === parseInt(id)) {
      throw new ValidationError('Client cannot be its own parent');
    }
    
    const parentClient = await Client.findById(parent_id);
    if (!parentClient) {
      throw new ValidationError('Parent client not found');
    }
    if (!parentClient.is_active) {
      throw new ValidationError('Parent client is inactive');
    }
  }

  try {
    const clientData = {
      parent_id: parent_id || null,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone ? phone.trim() : null,
      Address: Address ? Address.trim() : null,
      contact_person: contact_person ? contact_person.trim() : null,
      thinkspeak_subscription_info: thinkspeak_subscription_info ? thinkspeak_subscription_info.trim() : null,
      city: city ? city.trim() : null,
      state: state ? state.trim() : null,
      is_active: is_active !== undefined ? is_active : existingClient.is_active
    };

    const updatedClient = await Client.update(parseInt(id), clientData, req.user.user_id);

    // Create audit log
    await createAuditLog({
      user_id: req.user.user_id,
      activity_type: 'CLIENT_MANAGEMENT',
      action: 'CLIENT_UPDATED',
      message: 'Updated client',
      target_type: 'CLIENT',
      target_id: updatedClient.client_id,
      details: JSON.stringify({
        clientName: updatedClient.name,
        changes: clientData
      }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    logAuth('client_updated', {
      clientId: updatedClient.client_id,
      clientName: updatedClient.name,
      updatedBy: req.user.user_id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Client updated successfully',
      data: { client: updatedClient.toPublic() }
    });
  } catch (error) {
    logger.error('Failed to update client:', error);
    throw error;
  }
});

/**
 * Delete a client (soft delete)
 * DELETE /api/clients/:id
 */
export const deleteClient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Check if client exists
  const existingClient = await Client.findById(parseInt(id));
  if (!existingClient) {
    throw new NotFoundError('Client not found');
  }

  if (!existingClient.is_active) {
    throw new ValidationError('Client is already inactive');
  }

  try {
    await Client.delete(parseInt(id), req.user.user_id);

    // Create audit log
    await createAuditLog({
      user_id: req.user.user_id,
      activity_type: 'CLIENT_MANAGEMENT',
      action: 'CLIENT_DELETED',
      message: 'Deleted client',
      target_type: 'CLIENT',
      target_id: parseInt(id),
      details: JSON.stringify({
        clientName: existingClient.name
      }),
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    logSecurity('client_deleted', {
      clientId: parseInt(id),
      clientName: existingClient.name,
      deletedBy: req.user.user_id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    logger.error('Failed to delete client:', error);
    throw error;
  }
});

/**
 * Get client statistics
 * GET /api/clients/stats
 */
export const getClientStats = asyncHandler(async (req, res) => {
  try {
    const totalClients = await Client.getCount({ includeInactive: true });
    const activeClients = await Client.getCount({ includeInactive: false });
    const inactiveClients = totalClients - activeClients;

    // Get clients with device counts
    const clientsWithDevices = await Client.findAll({ includeInactive: false });
    const totalDevices = clientsWithDevices.reduce((sum, client) => sum + (client.device_count || 0), 0);
    const avgDevicesPerClient = activeClients > 0 ? Math.round(totalDevices / activeClients) : 0;

    const stats = {
      totalClients,
      activeClients,
      inactiveClients,
      totalDevices,
      avgDevicesPerClient
    };

    // Create audit log
    await createAuditLog({
      user_id: req.user.user_id,
      activity_type: 'CLIENT_MANAGEMENT',
      action: 'DATA_ACCESSED',
      message: 'Viewed client statistics',
      target_type: 'CLIENT',
      details: JSON.stringify(stats),
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Client statistics retrieved successfully',
      data: { stats }
    });
  } catch (error) {
    logger.error('Failed to get client statistics:', error);
    throw error;
  }
});

/**
 * Check if email is available
 * POST /api/clients/check-email
 */
export const checkEmailAvailability = asyncHandler(async (req, res) => {
  const { email, excludeClientId } = req.body;

  if (!email) {
    throw new ValidationError('Email is required');
  }

  try {
    const existingClient = await Client.findByEmail(email.toLowerCase().trim());
    
    let isAvailable = !existingClient;
    
    // If we're checking for an update (excludeClientId provided), 
    // the email is available if it belongs to the same client
    if (existingClient && excludeClientId && existingClient.client_id === parseInt(excludeClientId)) {
      isAvailable = true;
    }

    res.json({
      success: true,
      data: { 
        available: isAvailable,
        message: isAvailable ? 'Email is available' : 'Email is already in use'
      }
    });
  } catch (error) {
    logger.error('Failed to check email availability:', error);
    throw error;
  }
});