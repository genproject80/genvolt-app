import { executeQuery, sql } from '../config/database.js';
import { logger, logDB } from '../utils/logger.js';

/**
 * Device Model - Handles all device-related database operations
 * Based on the device table structure from genvolt_database_scripts.sql
 */
export class Device {
  constructor(deviceData) {
    this.id = deviceData.id;
    this.device_id = deviceData.device_id;
    this.channel_id = deviceData.channel_id;
    this.api_key = deviceData.api_key;
    this.conversionLogic_ld = deviceData.conversionLogic_ld;
    this.TransactionTableID = deviceData.TransactionTableID;
    this.TransactionTableName = deviceData.TransactionTableName;
    this.field_id = deviceData.field_id;
    this.Model = deviceData.Model;
    this.machin_id = deviceData.machin_id;
    this.client_id = deviceData.client_id;
    this.onboarding_date = deviceData.onboarding_date;

    // Additional fields from joins
    this.client_name = deviceData.client_name;
    this.client_email = deviceData.client_email;
  }

  /**
   * Find all devices with client information
   * @param {Object} options - Query options (clientId, limit, offset, search, sortField, sortDirection)
   * @returns {Promise<Device[]>} Array of device objects
   */
  static async findAll(options = {}) {
    try {
      const { clientId, clientIds, limit = 50, offset = 0, search, sortField = 'onboarding_date', sortDirection = 'DESC' } = options;

      let query = `
        SELECT
          d.id, d.device_id, d.channel_id, d.api_key, d.conversionLogic_ld,
          d.TransactionTableID, d.TransactionTableName, d.field_id, d.Model,
          d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name, c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE 1=1
      `;

      const params = {};
      let paramIndex = 1;

      // Filter by client if specified
      if (clientIds && Array.isArray(clientIds) && clientIds.length > 0) {
        // Handle multiple client IDs (for hierarchical filtering)
        const clientIdParams = clientIds.map((id, index) => {
          const paramName = `param${paramIndex + index}`;
          params[paramName] = id;
          return `@${paramName}`;
        }).join(', ');

        query += ` AND d.client_id IN (${clientIdParams})`;
        paramIndex += clientIds.length;

        logDB('Filtering devices by multiple client IDs', { clientIds, paramIndex });
      } else if (clientId) {
        // Handle single client ID (backward compatibility)
        query += ` AND d.client_id = @param${paramIndex}`;
        params[`param${paramIndex}`] = clientId;
        paramIndex++;

        logDB('Filtering devices by single client ID', { clientId });
      }

      // Add search functionality
      if (search && search.trim()) {
        query += ` AND (
          d.device_id LIKE @param${paramIndex} OR
          d.Model LIKE @param${paramIndex + 1} OR
          d.machin_id LIKE @param${paramIndex + 2} OR
          c.name LIKE @param${paramIndex + 3}
        )`;
        const searchPattern = `%${search.trim()}%`;
        params[`param${paramIndex}`] = searchPattern;
        params[`param${paramIndex + 1}`] = searchPattern;
        params[`param${paramIndex + 2}`] = searchPattern;
        params[`param${paramIndex + 3}`] = searchPattern;
        paramIndex += 4;
      }

      // Add sorting
      const validSortFields = ['device_id', 'Model', 'client_name', 'onboarding_date'];
      const validSortDirection = ['ASC', 'DESC'];

      if (validSortFields.includes(sortField) && validSortDirection.includes(sortDirection.toUpperCase())) {
        const sortColumn = sortField === 'client_name' ? 'c.name' : `d.${sortField}`;
        query += ` ORDER BY ${sortColumn} ${sortDirection.toUpperCase()}`;
      } else {
        query += ` ORDER BY d.onboarding_date DESC`;
      }

      // Add pagination
      query += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
      params.offset = offset;
      params.limit = limit;

      logDB('Executing Device.findAll query', { query, paramCount: Object.keys(params).length });
      const result = await executeQuery(query, params);

      return result.recordset.map(row => new Device(row));
    } catch (error) {
      logger.error('Error in Device.findAll:', error);
      throw error;
    }
  }

  /**
   * Get count of devices for pagination
   * @param {Object} options - Filter options
   * @returns {Promise<number>} Total count
   */
  static async getCount(options = {}) {
    try {
      const { clientId, clientIds, search } = options;

      let query = `
        SELECT COUNT(*) as count
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE 1=1
      `;

      const params = {};
      let paramIndex = 1;

      // Filter by client if specified (same logic as findAll)
      if (clientIds && Array.isArray(clientIds) && clientIds.length > 0) {
        // Handle multiple client IDs (for hierarchical filtering)
        const clientIdParams = clientIds.map((id, index) => {
          const paramName = `param${paramIndex + index}`;
          params[paramName] = id;
          return `@${paramName}`;
        }).join(', ');

        query += ` AND d.client_id IN (${clientIdParams})`;
        paramIndex += clientIds.length;
      } else if (clientId) {
        // Handle single client ID (backward compatibility)
        query += ` AND d.client_id = @param${paramIndex}`;
        params[`param${paramIndex}`] = clientId;
        paramIndex++;
      }

      if (search && search.trim()) {
        query += ` AND (
          d.device_id LIKE @param${paramIndex} OR
          d.Model LIKE @param${paramIndex + 1} OR
          d.machin_id LIKE @param${paramIndex + 2} OR
          c.name LIKE @param${paramIndex + 3}
        )`;
        const searchPattern = `%${search.trim()}%`;
        params[`param${paramIndex}`] = searchPattern;
        params[`param${paramIndex + 1}`] = searchPattern;
        params[`param${paramIndex + 2}`] = searchPattern;
        params[`param${paramIndex + 3}`] = searchPattern;
      }

      const result = await executeQuery(query, params);
      return result.recordset[0].count;
    } catch (error) {
      logger.error('Error in Device.getCount:', error);
      throw error;
    }
  }

  /**
   * Find device by ID
   * @param {number} id - Device ID
   * @returns {Promise<Device|null>} Device object or null if not found
   */
  static async findById(id) {
    try {
      const query = `
        SELECT
          d.id, d.device_id, d.channel_id, d.api_key, d.conversionLogic_ld,
          d.TransactionTableID, d.TransactionTableName, d.field_id, d.Model,
          d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name, c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE d.id = @id
      `;

      const result = await executeQuery(query, {
        id: id
      });

      if (result.recordset.length === 0) {
        return null;
      }

      return new Device(result.recordset[0]);
    } catch (error) {
      logger.error('Error in Device.findById:', error);
      throw error;
    }
  }

  /**
   * Find device by device_id (unique identifier)
   * @param {string} deviceId - Unique device identifier
   * @returns {Promise<Device|null>} Device object or null if not found
   */
  static async findByDeviceId(deviceId) {
    try {
      const query = `
        SELECT
          d.id, d.device_id, d.channel_id, d.api_key, d.conversionLogic_ld,
          d.TransactionTableID, d.TransactionTableName, d.field_id, d.Model,
          d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name, c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE d.device_id = @device_id
      `;

      const result = await executeQuery(query, {
        device_id: deviceId
      });

      if (result.recordset.length === 0) {
        return null;
      }

      return new Device(result.recordset[0]);
    } catch (error) {
      logger.error('Error in Device.findByDeviceId:', error);
      throw error;
    }
  }

  /**
   * Create new device
   * @param {Object} deviceData - Device data
   * @returns {Promise<Device>} Created device object
   */
  static async create(deviceData) {
    try {
      const query = `
        INSERT INTO device (
          device_id, channel_id, api_key, conversionLogic_ld, TransactionTableID,
          TransactionTableName, field_id, Model, machin_id, client_id, onboarding_date
        ) VALUES (
          @device_id, @channel_id, @api_key, @conversionLogic_ld, @TransactionTableID,
          @TransactionTableName, @field_id, @Model, @machin_id, @client_id, @onboarding_date
        );
        SELECT SCOPE_IDENTITY() as id;
      `;

      const params = {
        device_id: deviceData.device_id,
        channel_id: deviceData.channel_id || null,
        api_key: deviceData.api_key || null,
        conversionLogic_ld: deviceData.conversionLogic_ld || null,
        TransactionTableID: deviceData.TransactionTableID || null,
        TransactionTableName: deviceData.TransactionTableName || null,
        field_id: deviceData.field_id || null,
        Model: deviceData.Model || null,
        machin_id: deviceData.machin_id || null,
        client_id: deviceData.client_id || null,
        onboarding_date: deviceData.onboarding_date || new Date()
      };

      logDB('Creating new device', { device_id: deviceData.device_id, client_id: deviceData.client_id });
      const result = await executeQuery(query, params);
      const newId = result.recordset[0].id;

      // Fetch and return the created device
      return await Device.findById(newId);
    } catch (error) {
      logger.error('Error in Device.create:', error);
      throw error;
    }
  }

  /**
   * Update device
   * @param {Object} updateData - Data to update
   * @returns {Promise<Device>} Updated device object
   */
  async update(updateData) {
    try {
      const fields = [];
      const params = {};
      let paramIndex = 1;

      // Build dynamic update query based on provided fields
      const updatableFields = [
        'device_id', 'channel_id', 'api_key', 'conversionLogic_ld', 'TransactionTableID',
        'TransactionTableName', 'field_id', 'Model', 'machin_id', 'client_id'
      ];

      updatableFields.forEach(field => {
        if (updateData.hasOwnProperty(field)) {
          fields.push(`${field} = @param${paramIndex}`);
          params[`param${paramIndex}`] = updateData[field];
          paramIndex++;
        }
      });

      if (fields.length === 0) {
        return this;
      }

      const query = `
        UPDATE device
        SET ${fields.join(', ')}
        WHERE id = @id
      `;

      params.id = this.id;

      logDB('Updating device', { id: this.id, fields: fields.length });
      await executeQuery(query, params);

      // Fetch and return updated device
      return await Device.findById(this.id);
    } catch (error) {
      logger.error('Error in Device.update:', error);
      throw error;
    }
  }

  /**
   * Delete device
   * @returns {Promise<boolean>} Success status
   */
  async delete() {
    try {
      const query = 'DELETE FROM device WHERE id = @id';

      logDB('Deleting device', { id: this.id, device_id: this.device_id });
      await executeQuery(query, {
        id: this.id
      });

      return true;
    } catch (error) {
      logger.error('Error in Device.delete:', error);
      throw error;
    }
  }

  /**
   * Get device statistics
   * @param {number} clientId - Optional client ID to filter by
   * @returns {Promise<Object>} Statistics object
   */
  static async getStats(clientId = null) {
    try {
      let query = `
        SELECT
          COUNT(*) as totalDevices,
          COUNT(DISTINCT d.client_id) as activeClients,
          COUNT(CASE WHEN d.onboarding_date >= DATEADD(day, -30, GETDATE()) THEN 1 END) as recentOnboardings,
          COUNT(CASE WHEN d.TransactionTableName IS NOT NULL THEN 1 END) as dataTables
        FROM device d
        INNER JOIN client c ON d.client_id = c.client_id
      `;

      const params = {};

      if (clientId) {
        query += ' WHERE d.client_id = @client_id';
        params.client_id = clientId;
      }

      const result = await executeQuery(query, params);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error in Device.getStats:', error);
      throw error;
    }
  }

  /**
   * Validate device data
   * @param {Object} data - Device data to validate
   * @param {boolean} isUpdate - Whether this is an update operation
   * @returns {Object} Validation result
   */
  static validateDeviceData(data, isUpdate = false) {
    const errors = {};

    // device_id is required for create, optional for update
    if (!isUpdate && (!data.device_id || !data.device_id.trim())) {
      errors.device_id = 'Device ID is required';
    } else if (data.device_id && data.device_id.length > 100) {
      errors.device_id = 'Device ID must be less than 100 characters';
    }

    // Optional field validations
    if (data.channel_id && data.channel_id.length > 100) {
      errors.channel_id = 'Channel ID must be less than 100 characters';
    }

    if (data.api_key && data.api_key.length > 255) {
      errors.api_key = 'API key must be less than 255 characters';
    }

    if (data.field_id && data.field_id.length > 100) {
      errors.field_id = 'Field ID must be less than 100 characters';
    }

    if (data.Model && data.Model.length > 100) {
      errors.Model = 'Model must be less than 100 characters';
    }

    if (data.machin_id && data.machin_id.length > 100) {
      errors.machin_id = 'Machine ID must be less than 100 characters';
    }

    if (data.TransactionTableName && data.TransactionTableName.length > 255) {
      errors.TransactionTableName = 'Transaction table name must be less than 255 characters';
    }

    if (data.TransactionTableID && (typeof data.TransactionTableID !== 'number' || data.TransactionTableID < 1)) {
      errors.TransactionTableID = 'Transaction table ID must be a positive number';
    }

    if (data.client_id && (typeof data.client_id !== 'number' || data.client_id < 1)) {
      errors.client_id = 'Client ID must be a positive number';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Convert to public representation (safe for API responses)
   * @returns {Object} Public device data
   */
  toPublic() {
    return {
      id: this.id,
      device_id: this.device_id,
      channel_id: this.channel_id,
      api_key: this.api_key ? '***' : null, // Hide API key in responses
      conversionLogic_ld: this.conversionLogic_ld,
      TransactionTableID: this.TransactionTableID,
      TransactionTableName: this.TransactionTableName,
      field_id: this.field_id,
      Model: this.Model,
      machin_id: this.machin_id,
      client_id: this.client_id,
      client_name: this.client_name,
      client_email: this.client_email,
      onboarding_date: this.onboarding_date
    };
  }
}