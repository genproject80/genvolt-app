import { executeQuery, sql } from '../config/database.js';
import { logger, logDB } from '../utils/logger.js';

/**
 * Client Model - Handles all client-related database operations
 * Based on the client table structure from database_model.md
 */
export class Client {
  constructor(clientData) {
    this.client_id = clientData.client_id;
    this.parent_id = clientData.parent_id;
    this.name = clientData.name;
    this.email = clientData.email;
    this.phone = clientData.phone;
    this.Address = clientData.Address;
    this.contact_person = clientData.contact_person;
    this.thingspeak_subscription_info = clientData.thingspeak_subscription_info;
    this.city = clientData.city;
    this.state = clientData.state;
    this.is_active = clientData.is_active;
    this.created_by_user_id = clientData.created_by_user_id;
    this.created_at = clientData.created_at;
    this.updated_at = clientData.updated_at;
    this.updated_by_user_id = clientData.updated_by_user_id;
  }

  /**
   * Find all clients
   * @param {Object} options - Query options (includeInactive, limit, offset)
   * @returns {Promise<Client[]>} Array of client objects
   */
  static async findAll(options = {}) {
    try {
      const { includeInactive = false, limit, offset } = options;
      
      let query = `
        SELECT 
          c.client_id, c.parent_id, c.name, c.email, c.phone, c.Address, 
          c.contact_person, c.thinkspeak_subscription_info, c.city, c.state, 
          c.is_active, c.created_by_user_id, c.created_at, c.updated_at, c.updated_by_user_id,
          pc.name as parent_client_name,
          cu.first_name + ' ' + cu.last_name as created_by_name,
          COUNT(d.id) as device_count
        FROM client c
        LEFT JOIN client pc ON c.parent_id = pc.client_id
        LEFT JOIN [user] cu ON c.created_by_user_id = cu.user_id
        LEFT JOIN device d ON c.client_id = d.client_id
      `;

      if (!includeInactive) {
        query += ` WHERE c.is_active = 1`;
      }

      query += ` GROUP BY c.client_id, c.parent_id, c.name, c.email, c.phone, c.Address, 
                          c.contact_person, c.thinkspeak_subscription_info, c.city, c.state, 
                          c.is_active, c.created_by_user_id, c.created_at, c.updated_at, c.updated_by_user_id,
                          pc.name, cu.first_name, cu.last_name`;

      query += ` ORDER BY c.created_at DESC`;

      if (limit) {
        query += ` OFFSET ${offset || 0} ROWS FETCH NEXT ${limit} ROWS ONLY`;
      }

      const result = await executeQuery(query);
      return result.recordset.map(row => new Client(row));
    } catch (error) {
      logDB('error', 'Failed to find all clients', { error: error.message });
      throw error;
    }
  }

  /**
   * Find client by ID
   * @param {number} clientId - Client ID
   * @returns {Promise<Client|null>} Client object or null if not found
   */
  static async findById(clientId) {
    try {
      const query = `
        SELECT 
          c.client_id, c.parent_id, c.name, c.email, c.phone, c.Address, 
          c.contact_person, c.thinkspeak_subscription_info, c.city, c.state, 
          c.is_active, c.created_by_user_id, c.created_at, c.updated_at, c.updated_by_user_id,
          pc.name as parent_client_name,
          cu.first_name + ' ' + cu.last_name as created_by_name
        FROM client c
        LEFT JOIN client pc ON c.parent_id = pc.client_id
        LEFT JOIN [user] cu ON c.created_by_user_id = cu.user_id
        WHERE c.client_id = @clientId
      `;

      const result = await executeQuery(query, { clientId });
      
      if (result.recordset.length === 0) {
        return null;
      }

      return new Client(result.recordset[0]);
    } catch (error) {
      logDB('error', 'Failed to find client by ID', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Find client by email
   * @param {string} email - Client email
   * @returns {Promise<Client|null>} Client object or null if not found
   */
  static async findByEmail(email) {
    try {
      const query = `
        SELECT 
          c.client_id, c.parent_id, c.name, c.email, c.phone, c.Address, 
          c.contact_person, c.thinkspeak_subscription_info, c.city, c.state, 
          c.is_active, c.created_by_user_id, c.created_at, c.updated_at, c.updated_by_user_id
        FROM client c
        WHERE c.email = @email
      `;

      const result = await executeQuery(query, { email });
      
      if (result.recordset.length === 0) {
        return null;
      }

      return new Client(result.recordset[0]);
    } catch (error) {
      logDB('error', 'Failed to find client by email', { email, error: error.message });
      throw error;
    }
  }

  /**
   * Create a new client
   * @param {Object} clientData - Client data
   * @param {number} createdByUserId - ID of user creating the client
   * @returns {Promise<Client>} Created client object
   */
  static async create(clientData, createdByUserId) {
    try {
      const query = `
        INSERT INTO client (
          parent_id, name, email, phone, Address, contact_person, 
          thinkspeak_subscription_info, city, state, is_active, created_by_user_id
        ) VALUES (
          @parent_id, @name, @email, @phone, @Address, @contact_person, 
          @thinkspeak_subscription_info, @city, @state, @is_active, @created_by_user_id
        );
        SELECT SCOPE_IDENTITY() as client_id;
      `;

      const params = {
        parent_id: clientData.parent_id || null,
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone || null,
        Address: clientData.Address || null,
        contact_person: clientData.contact_person || null,
        thinkspeak_subscription_info: clientData.thinkspeak_subscription_info || null,
        city: clientData.city || null,
        state: clientData.state || null,
        is_active: clientData.is_active !== undefined ? clientData.is_active : true,
        created_by_user_id: createdByUserId
      };

      const result = await executeQuery(query, params);
      const newClientId = result.recordset[0].client_id;

      logDB('info', 'Client created successfully', { 
        clientId: newClientId, 
        name: clientData.name,
        createdBy: createdByUserId 
      });

      return await Client.findById(newClientId);
    } catch (error) {
      logDB('error', 'Failed to create client', { clientData, error: error.message });
      throw error;
    }
  }

  /**
   * Update an existing client
   * @param {number} clientId - Client ID
   * @param {Object} clientData - Updated client data
   * @param {number} updatedByUserId - ID of user updating the client
   * @returns {Promise<Client>} Updated client object
   */
  static async update(clientId, clientData, updatedByUserId) {
    try {
      const query = `
        UPDATE client SET
          parent_id = @parent_id,
          name = @name,
          email = @email,
          phone = @phone,
          Address = @Address,
          contact_person = @contact_person,
          thinkspeak_subscription_info = @thinkspeak_subscription_info,
          city = @city,
          state = @state,
          is_active = @is_active,
          updated_at = GETUTCDATE(),
          updated_by_user_id = @updated_by_user_id
        WHERE client_id = @client_id
      `;

      const params = {
        client_id: clientId,
        parent_id: clientData.parent_id || null,
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone || null,
        Address: clientData.Address || null,
        contact_person: clientData.contact_person || null,
        thinkspeak_subscription_info: clientData.thinkspeak_subscription_info || null,
        city: clientData.city || null,
        state: clientData.state || null,
        is_active: clientData.is_active,
        updated_by_user_id: updatedByUserId
      };

      await executeQuery(query, params);

      logDB('info', 'Client updated successfully', { 
        clientId, 
        updatedBy: updatedByUserId 
      });

      return await Client.findById(clientId);
    } catch (error) {
      logDB('error', 'Failed to update client', { clientId, clientData, error: error.message });
      throw error;
    }
  }

  /**
   * Soft delete a client (set is_active to false)
   * @param {number} clientId - Client ID
   * @param {number} deletedByUserId - ID of user deleting the client
   * @returns {Promise<boolean>} Success status
   */
  static async delete(clientId, deletedByUserId) {
    try {
      const query = `
        UPDATE client SET
          is_active = 0,
          updated_at = GETUTCDATE(),
          updated_by_user_id = @deleted_by_user_id
        WHERE client_id = @client_id
      `;

      await executeQuery(query, { 
        client_id: clientId, 
        deleted_by_user_id: deletedByUserId 
      });

      logDB('info', 'Client soft deleted successfully', { 
        clientId, 
        deletedBy: deletedByUserId 
      });

      return true;
    } catch (error) {
      logDB('error', 'Failed to delete client', { clientId, error: error.message });
      throw error;
    }
  }

  /**
   * Get client hierarchy (for parent client dropdown)
   * @param {number} excludeClientId - Client ID to exclude (for edit scenarios)
   * @returns {Promise<Object[]>} Array of client objects for dropdown
   */
  static async getClientHierarchy(excludeClientId = null) {
    try {
      let query = `
        SELECT
          client_id,
          name,
          parent_id,
          (SELECT name FROM client pc WHERE pc.client_id = c.parent_id) as parent_name
        FROM client c
        WHERE is_active = 1
      `;

      if (excludeClientId) {
        query += ` AND client_id != @excludeClientId`;
      }

      query += ` ORDER BY name ASC`;

      const result = await executeQuery(query, { excludeClientId });
      return result.recordset;
    } catch (error) {
      logDB('error', 'Failed to get client hierarchy', { excludeClientId, error: error.message });
      throw error;
    }
  }

  /**
   * Get all descendant clients (children hierarchy) for a given client
   * @param {number} parentClientId - Parent client ID to get descendants for
   * @returns {Promise<Object[]>} Array of descendant client objects
   */
  static async getDescendantClients(parentClientId) {
    try {
      // Use recursive CTE to get all descendants
      const query = `
        WITH ClientHierarchy AS (
          -- Base case: direct children
          SELECT
            client_id,
            name,
            parent_id,
            email,
            1 as level
          FROM client
          WHERE parent_id = @parentClientId AND is_active = 1

          UNION ALL

          -- Recursive case: children of children
          SELECT
            c.client_id,
            c.name,
            c.parent_id,
            c.email,
            ch.level + 1 as level
          FROM client c
          INNER JOIN ClientHierarchy ch ON c.parent_id = ch.client_id
          WHERE c.is_active = 1
        )
        SELECT
          client_id,
          name,
          parent_id,
          email,
          level
        FROM ClientHierarchy
        ORDER BY level, name ASC
      `;

      const result = await executeQuery(query, { parentClientId });

      logDB('debug', 'Retrieved descendant clients', {
        parentClientId,
        count: result.recordset.length
      });

      return result.recordset;
    } catch (error) {
      logDB('error', 'Failed to get descendant clients', {
        parentClientId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if target client is a descendant of parent client
   * @param {number} parentClientId - Parent client ID
   * @param {number} targetClientId - Target client ID to check
   * @returns {Promise<boolean>} True if target is a descendant of parent
   */
  static async isDescendant(parentClientId, targetClientId) {
    try {
      const descendants = await Client.getDescendantClients(parentClientId);
      const isDescendant = descendants.some(client => client.client_id === targetClientId);

      logDB('debug', 'Checking if client is descendant', {
        parentClientId,
        targetClientId,
        isDescendant
      });

      return isDescendant;
    } catch (error) {
      logDB('error', 'Failed to check descendant relationship', {
        parentClientId,
        targetClientId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get the hierarchy path from parent client to target child client
   * @param {number} parentClientId - Starting client ID
   * @param {number} targetClientId - Target client ID
   * @returns {Promise<Array|null>} Array of client IDs representing the path from parent to target, or null if no path exists
   */
  static async getHierarchyPath(parentClientId, targetClientId) {
    try {
      // Use recursive CTE to build the path from target back to parent
      const query = `
        WITH ClientPath AS (
          -- Start with the target client
          SELECT
            client_id,
            parent_id,
            name,
            CAST(client_id AS VARCHAR(MAX)) as path,
            0 as level
          FROM client
          WHERE client_id = @targetClientId

          UNION ALL

          -- Recursively get parent clients
          SELECT
            c.client_id,
            c.parent_id,
            c.name,
            CAST(c.client_id AS VARCHAR(MAX)) + ',' + cp.path as path,
            cp.level + 1 as level
          FROM client c
          INNER JOIN ClientPath cp ON c.client_id = cp.parent_id
          WHERE c.client_id IS NOT NULL
        )
        SELECT
          client_id,
          parent_id,
          name,
          path,
          level
        FROM ClientPath
        WHERE client_id = @parentClientId
      `;

      const result = await executeQuery(query, { parentClientId, targetClientId });

      if (result.recordset.length === 0) {
        // No path found - target is not a descendant of parent
        logDB('debug', 'No hierarchy path found - target is not a descendant of parent', {
          parentClientId,
          targetClientId
        });
        return null;
      }

      const record = result.recordset[0];

      // Parse the path string into an array of client IDs
      const pathString = record.path;
      const pathIds = pathString.split(',').map(id => parseInt(id));

      // The path is already in parent-to-child order (e.g., "1,2,4,7")
      // No need to reverse

      logDB('debug', 'Retrieved hierarchy path', {
        parentClientId,
        targetClientId,
        path: pathIds
      });

      return pathIds;
    } catch (error) {
      logDB('error', 'Failed to get hierarchy path', {
        parentClientId,
        targetClientId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get client count
   * @param {Object} options - Query options
   * @returns {Promise<number>} Total count of clients
   */
  static async getCount(options = {}) {
    try {
      const { includeInactive = false } = options;
      
      let query = `SELECT COUNT(*) as total FROM client`;
      
      if (!includeInactive) {
        query += ` WHERE is_active = 1`;
      }

      const result = await executeQuery(query);
      return result.recordset[0].total;
    } catch (error) {
      logDB('error', 'Failed to get client count', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate client data before creation/update
   * @param {Object} clientData - Client data to validate
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} Validation result with isValid and errors
   */
  static validateClientData(clientData, isUpdate = false) {
    const errors = {};

    // Required field validations
    if (!clientData.name || clientData.name.trim().length === 0) {
      errors.name = 'Client name is required';
    } else if (clientData.name.length > 255) {
      errors.name = 'Client name must be less than 255 characters';
    }

    if (!clientData.email || clientData.email.trim().length === 0) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientData.email)) {
      errors.email = 'Invalid email format';
    } else if (clientData.email.length > 255) {
      errors.email = 'Email must be less than 255 characters';
    }

    // Optional field validations
    if (clientData.phone && clientData.phone.length > 20) {
      errors.phone = 'Phone number must be less than 20 characters';
    }

    if (clientData.Address && clientData.Address.length > 500) {
      errors.Address = 'Address must be less than 500 characters';
    }

    if (clientData.contact_person && clientData.contact_person.length > 255) {
      errors.contact_person = 'Contact person name must be less than 255 characters';
    }

    if (clientData.thinkspeak_subscription_info && clientData.thinkspeak_subscription_info.length > 500) {
      errors.thinkspeak_subscription_info = 'ThinkSpeak subscription info must be less than 500 characters';
    }

    if (clientData.city && clientData.city.length > 100) {
      errors.city = 'City must be less than 100 characters';
    }

    if (clientData.state && clientData.state.length > 100) {
      errors.state = 'State must be less than 100 characters';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Convert client instance to public format (remove sensitive data)
   * @returns {Object} Public client data
   */
  toPublic() {
    return {
      client_id: this.client_id,
      parent_id: this.parent_id,
      name: this.name,
      email: this.email,
      phone: this.phone,
      Address: this.Address,
      contact_person: this.contact_person,
      thinkspeak_subscription_info: this.thinkspeak_subscription_info,
      city: this.city,
      state: this.state,
      is_active: this.is_active,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

export default Client;