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

    const clients = await Client.findAll(options);
    const totalCount = await Client.getCount(options);

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

  res.json({
    success: true,
    message: 'Client retrieved successfully',
    data: { client: client.toPublic() }
  });
});

/**
 * Get client hierarchy for dropdown
 * GET /api/clients/hierarchy
 */
export const getClientHierarchy = asyncHandler(async (req, res) => {
  const { excludeClientId } = req.query;

  try {
    const hierarchy = await Client.getClientHierarchy(
      excludeClientId ? parseInt(excludeClientId) : null
    );

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
 * Get descendant clients (children hierarchy) for current user's client
 * GET /api/clients/descendants
 */
export const getDescendantClients = asyncHandler(async (req, res) => {
  try {
    const currentUser = req.user;

    // Check if user has a client_id
    if (!currentUser.client_id) {
      // If user has no client_id (SYSTEM_ADMIN, SUPER_ADMIN), return all clients
      const allClients = await Client.findAll({ includeInactive: false });
      return res.json({
        success: true,
        message: 'All clients retrieved successfully',
        data: { clients: allClients.map(c => ({ client_id: c.client_id, name: c.name, email: c.email, parent_id: c.parent_id })) }
      });
    }

    // Get descendant clients for the user's client
    const descendants = await Client.getDescendantClients(currentUser.client_id);

    // Get user's own client to include in the list
    const userClient = await Client.findById(currentUser.client_id);

    // Combine user's client and descendants
    const clients = [
      {
        client_id: userClient.client_id,
        name: userClient.name,
        email: userClient.email,
        parent_id: userClient.parent_id,
        level: 0 // User's own client
      },
      ...descendants
    ];

    logger.info('Retrieved hierarchical clients for user', {
      userId: currentUser.user_id,
      clientId: currentUser.client_id,
      clientName: userClient.name,
      descendantCount: descendants.length,
      totalCount: clients.length
    });

    res.json({
      success: true,
      message: 'Hierarchical clients retrieved successfully',
      data: { clients }
    });
  } catch (error) {
    logger.error('Failed to get descendant clients:', error);
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
      action: 'CLIENT_CREATE',
      message: 'Created new client',
      target_type: 'CLIENT',
      target_id: newClient.client_id,
      details: JSON.stringify({
        clientName: newClient.name,
        clientEmail: newClient.email
      })
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
      action: 'CLIENT_UPDATE',
      message: 'Updated client',
      target_type: 'CLIENT',
      target_id: updatedClient.client_id,
      details: JSON.stringify({
        clientName: updatedClient.name,
        changes: clientData
      })
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
      action: 'CLIENT_DELETE',
      message: 'Deleted client',
      target_type: 'CLIENT',
      target_id: parseInt(id),
      details: JSON.stringify({
        clientName: existingClient.name
      })
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