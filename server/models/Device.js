import { executeQuery, sql } from '../config/database.js';
import { logger, logDB } from '../utils/logger.js';
import { Client } from './Client.js';

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

    // Include joined data from client table
    this.client_name = deviceData.client_name;
    this.client_email = deviceData.client_email;
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
          d.TransactionTableID, d.TransactionTableName, d.field_id,
          d.Model, d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name,
          c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE d.id = @id
      `;

      const result = await executeQuery(query, { id });

      if (result.recordset.length === 0) {
        return null;
      }

      return new Device(result.recordset[0]);
    } catch (error) {
      logger.error('Error finding device by ID:', error);
      throw error;
    }
  }

  /**
   * Find device by device_id
   * @param {string} deviceId - Device ID (unique identifier)
   * @returns {Promise<Device|null>} Device object or null if not found
   */
  static async findByDeviceId(deviceId) {
    try {
      const query = `
        SELECT
          d.id, d.device_id, d.channel_id, d.api_key, d.conversionLogic_ld,
          d.TransactionTableID, d.TransactionTableName, d.field_id,
          d.Model, d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name,
          c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE d.device_id = @deviceId
      `;

      const result = await executeQuery(query, { deviceId });

      if (result.recordset.length === 0) {
        return null;
      }

      return new Device(result.recordset[0]);
    } catch (error) {
      logger.error('Error finding device by device_id:', error);
      throw error;
    }
  }

  /**
   * Check if device_id is unique
   * @param {string} deviceId - Device ID to check
   * @param {number|null} excludeId - ID to exclude from check (for updates)
   * @returns {Promise<boolean>} True if device_id exists
   */
  static async checkDeviceIdExists(deviceId, excludeId = null) {
    try {
      const params = { deviceId };
      let query = 'SELECT COUNT(*) as count FROM device WHERE device_id = @deviceId';

      if (excludeId) {
        query += ' AND id != @excludeId';
        params.excludeId = excludeId;
      }

      const result = await executeQuery(query, params);
      return result.recordset[0].count > 0;
    } catch (error) {
      logger.error('Error checking device_id uniqueness:', error);
      throw error;
    }
  }

  /**
   * Find devices by client ID
   * @param {number} clientId - Client ID
   * @param {Object} options - Query options (pagination, sorting)
   * @returns {Promise<Device[]>} Array of devices
   */
  static async findByClientId(clientId, options = {}) {
    try {
      const { page = 1, limit = 10, sortBy = 'onboarding_date', sortOrder = 'desc' } = options;
      const offset = (page - 1) * limit;

      // Validate sort field
      const allowedSortFields = ['id', 'device_id', 'Model', 'machin_id', 'onboarding_date'];
      const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'onboarding_date';
      const validSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const query = `
        SELECT
          d.id, d.device_id, d.channel_id, d.api_key, d.conversionLogic_ld,
          d.TransactionTableID, d.TransactionTableName, d.field_id,
          d.Model, d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name,
          c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE d.client_id = @clientId
        ORDER BY d.${validSortBy} ${validSortOrder}
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `;

      const result = await executeQuery(query, { clientId, offset, limit });
      return result.recordset.map(row => new Device(row));
    } catch (error) {
      logger.error('Error finding devices by client ID:', error);
      throw error;
    }
  }

  /**
   * Find all devices with filtering and pagination
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Query options (pagination, sorting)
   * @returns {Promise<Object>} Paginated devices with metadata
   */
  static async findAll(filters = {}, options = {}) {
    try {
      const { page = 1, limit = 10, sortBy = 'onboarding_date', sortOrder = 'desc' } = options;
      const offset = (page - 1) * limit;
      const conditions = [];
      const params = { offset, limit };

      // Build WHERE clause
      if (filters.client_id) {
        conditions.push('d.client_id = @client_id');
        params.client_id = filters.client_id;
      } else if (filters.client_ids && Array.isArray(filters.client_ids) && filters.client_ids.length > 0) {
        // Support for multiple client IDs (hierarchical filtering)
        const clientIdPlaceholders = filters.client_ids.map((_, index) => `@client_id_${index}`).join(', ');
        conditions.push(`d.client_id IN (${clientIdPlaceholders})`);
        filters.client_ids.forEach((clientId, index) => {
          params[`client_id_${index}`] = clientId;
        });
      }

      if (filters.Model) {
        conditions.push('d.Model = @Model');
        params.Model = filters.Model;
      }

      if (filters.search) {
        conditions.push(`(
          d.device_id LIKE @search OR
          d.Model LIKE @search OR
          d.machin_id LIKE @search OR
          c.name LIKE @search
        )`);
        params.search = `%${filters.search}%`;
      }

      if (filters.startDate && filters.endDate) {
        conditions.push('d.onboarding_date BETWEEN @startDate AND @endDate');
        params.startDate = filters.startDate;
        params.endDate = filters.endDate;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Validate sort field and order
      const allowedSortFields = ['id', 'device_id', 'Model', 'machin_id', 'onboarding_date', 'client_name'];
      const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'onboarding_date';
      const validSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        ${whereClause}
      `;

      const countResult = await executeQuery(countQuery, params);
      const total = countResult.recordset[0].total;

      // Get paginated results
      const sortField = validSortBy === 'client_name' ? 'c.name' : `d.${validSortBy}`;

      const dataQuery = `
        SELECT
          d.id, d.device_id, d.channel_id, d.api_key, d.conversionLogic_ld,
          d.TransactionTableID, d.TransactionTableName, d.field_id,
          d.Model, d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name,
          c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        ${whereClause}
        ORDER BY ${sortField} ${validSortOrder}
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;

      const dataResult = await executeQuery(dataQuery, params);
      const devices = dataResult.recordset.map(row => new Device(row));

      const totalPages = Math.ceil(total / limit);

      return {
        data: devices,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        filters,
        sortBy: validSortBy,
        sortOrder: validSortOrder
      };

    } catch (error) {
      logger.error('Error finding devices', { error: error.message, filters });
      throw new Error('Failed to fetch devices');
    }
  }

  /**
   * Create a new device
   * @param {Object} deviceData - Device data object
   * @returns {Promise<Device>} Created device object
   */
  static async create(deviceData) {
    try {
      const query = `
        INSERT INTO device (
          device_id, channel_id, api_key, conversionLogic_ld,
          TransactionTableID, TransactionTableName, field_id,
          Model, machin_id, client_id, onboarding_date
        )
        OUTPUT INSERTED.*
        VALUES (
          @device_id, @channel_id, @api_key, @conversionLogic_ld,
          @TransactionTableID, @TransactionTableName, @field_id,
          @Model, @machin_id, @client_id, @onboarding_date
        )
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

      const result = await executeQuery(query, params);

      if (result.recordset.length === 0) {
        throw new Error('Failed to create device');
      }

      // Fetch complete device with joined data
      return await Device.findById(result.recordset[0].id);
    } catch (error) {
      logger.error('Error creating device:', error);
      throw error;
    }
  }

  /**
   * Update device information
   * @param {number} id - Device ID to update
   * @param {Object} updateData - Data to update
   * @returns {Promise<Device>} Updated device object
   */
  static async update(id, updateData) {
    try {
      const setClauses = [];
      const params = { id };

      // Build dynamic UPDATE query based on provided data
      const allowedFields = [
        'device_id', 'channel_id', 'api_key', 'conversionLogic_ld',
        'TransactionTableID', 'TransactionTableName', 'field_id',
        'Model', 'machin_id', 'client_id', 'onboarding_date'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          setClauses.push(`${field} = @${field}`);
          params[field] = updateData[field];
        }
      });

      if (setClauses.length === 0) {
        throw new Error('No fields to update');
      }

      const query = `
        UPDATE device
        SET ${setClauses.join(', ')}
        WHERE id = @id
      `;

      const result = await executeQuery(query, params);

      if (result.rowsAffected[0] === 0) {
        throw new Error('Device not found or not updated');
      }

      // Fetch updated device with joined data
      return await Device.findById(id);
    } catch (error) {
      logger.error('Error updating device:', error);
      throw error;
    }
  }

  /**
   * Delete device
   * @param {number} id - Device ID to delete
   * @returns {Promise<boolean>} True if successful
   */
  static async delete(id) {
    try {
      const query = 'DELETE FROM device WHERE id = @id';
      const result = await executeQuery(query, { id });
      return result.rowsAffected[0] > 0;
    } catch (error) {
      logger.error('Error deleting device:', error);
      throw error;
    }
  }

  /**
   * Get device statistics
   * @param {number|Array|null} clientIds - Filter by client ID(s) (null for all clients, number for single client, array for multiple)
   * @returns {Promise<Object>} Device statistics
   */
  static async getStatistics(clientIds = null) {
    try {
      const params = {};
      let clientFilter = '';

      if (clientIds) {
        if (Array.isArray(clientIds) && clientIds.length > 0) {
          // Multiple client IDs (hierarchical filtering)
          const clientIdPlaceholders = clientIds.map((_, index) => `@client_id_${index}`).join(', ');
          clientFilter = `WHERE d.client_id IN (${clientIdPlaceholders})`;
          clientIds.forEach((clientId, index) => {
            params[`client_id_${index}`] = clientId;
          });
        } else if (typeof clientIds === 'number') {
          // Single client ID
          clientFilter = 'WHERE d.client_id = @client_id';
          params.client_id = clientIds;
        }
      }

      const statsQuery = `
        SELECT
          COUNT(*) as total_devices,
          COUNT(DISTINCT d.client_id) as active_clients,
          COUNT(DISTINCT d.Model) as unique_models,
          COUNT(CASE WHEN d.onboarding_date >= DATEADD(day, -30, GETDATE()) THEN 1 END) as recent_onboardings
        FROM device d
        ${clientFilter}
      `;

      const statsResult = await executeQuery(statsQuery, params);
      const stats = statsResult.recordset[0];

      // Get model breakdown
      const modelQuery = `
        SELECT
          d.Model,
          COUNT(*) as device_count
        FROM device d
        ${clientFilter}
        GROUP BY d.Model
        ORDER BY device_count DESC
      `;

      const modelResult = await executeQuery(modelQuery, params);
      const modelBreakdown = modelResult.recordset;

      // Get client breakdown (if not filtered by client)
      let clientBreakdown = [];
      if (!clientIds) {
        const clientQuery = `
          SELECT
            c.name as client_name,
            COUNT(d.id) as device_count
          FROM client c
          LEFT JOIN device d ON c.client_id = d.client_id
          GROUP BY c.client_id, c.name
          HAVING COUNT(d.id) > 0
          ORDER BY device_count DESC
        `;

        const clientResult = await executeQuery(clientQuery, {});
        clientBreakdown = clientResult.recordset;
      }

      return {
        summary: stats,
        modelBreakdown,
        clientBreakdown
      };

    } catch (error) {
      logger.error('Error getting device statistics', { error: error.message, clientIds });
      throw new Error('Failed to get device statistics');
    }
  }

  /**
   * Get devices by model
   * @param {string} model - Device model
   * @param {number|null} clientId - Filter by client ID
   * @returns {Promise<Device[]>} Array of devices
   */
  static async getDevicesByModel(model, clientId = null) {
    try {
      const params = { model };
      const clientFilter = clientId ? 'AND d.client_id = @clientId' : '';

      if (clientId) {
        params.clientId = clientId;
      }

      const query = `
        SELECT
          d.id, d.device_id, d.channel_id, d.api_key, d.conversionLogic_ld,
          d.TransactionTableID, d.TransactionTableName, d.field_id,
          d.Model, d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name,
          c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE d.Model = @model ${clientFilter}
        ORDER BY d.onboarding_date DESC
      `;

      const result = await executeQuery(query, params);
      return result.recordset.map(row => new Device(row));
    } catch (error) {
      logger.error('Error getting devices by model:', error);
      throw error;
    }
  }

  /**
   * Get devices by date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {number|null} clientId - Filter by client ID
   * @returns {Promise<Device[]>} Array of devices
   */
  static async getDevicesByDateRange(startDate, endDate, clientId = null) {
    try {
      const params = { startDate, endDate };
      const clientFilter = clientId ? 'AND d.client_id = @clientId' : '';

      if (clientId) {
        params.clientId = clientId;
      }

      const query = `
        SELECT
          d.id, d.device_id, d.channel_id, d.api_key, d.conversionLogic_ld,
          d.TransactionTableID, d.TransactionTableName, d.field_id,
          d.Model, d.machin_id, d.client_id, d.onboarding_date,
          c.name as client_name,
          c.email as client_email
        FROM device d
        LEFT JOIN client c ON d.client_id = c.client_id
        WHERE d.onboarding_date BETWEEN @startDate AND @endDate ${clientFilter}
        ORDER BY d.onboarding_date DESC
      `;

      const result = await executeQuery(query, params);
      return result.recordset.map(row => new Device(row));
    } catch (error) {
      logger.error('Error getting devices by date range:', error);
      throw error;
    }
  }

  /**
   * Create a client_device record (for initial assignment or transfer)
   * @param {number} sellerId - Seller/source client ID
   * @param {number} buyerId - Buyer/target client ID
   * @param {number} deviceId - Device primary key ID
   * @returns {Promise<Object>} Created record
   */
  static async createClientDeviceRecord(sellerId, buyerId, deviceId) {
    try {
      const query = `
        INSERT INTO client_device (seller_id, buyer_id, device_id, transfer_date)
        OUTPUT INSERTED.*
        VALUES (@sellerId, @buyerId, @deviceId, GETUTCDATE())
      `;

      const result = await executeQuery(query, {
        sellerId,
        buyerId,
        deviceId
      });

      logger.info('client_device record created:', result.recordset[0]);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error creating client_device record:', error);
      throw error;
    }
  }

  /**
   * Create missing transfer history chain for hierarchical transfers
   * @param {number} deviceId - Device primary key ID
   * @param {number} sellerId - Current owner client ID
   * @param {number} buyerId - Target client ID
   * @returns {Promise<Array>} Array of created transfer records
   */
  static async createMissingTransferChain(deviceId, sellerId, buyerId) {
    try {
      logger.info('Creating missing transfer history chain:', { deviceId, sellerId, buyerId });

      // Get the hierarchy path from seller to buyer
      const hierarchyPath = await Client.getHierarchyPath(sellerId, buyerId);

      if (!hierarchyPath || hierarchyPath.length < 2) {
        logger.info('No intermediate transfers needed - direct relationship or no path');
        return [];
      }

      logger.info('Hierarchy path found:', hierarchyPath);

      // Check which transfers already exist
      const existingTransfersQuery = `
        SELECT seller_id, buyer_id
        FROM client_device
        WHERE device_id = @deviceId
      `;
      const existingResult = await executeQuery(existingTransfersQuery, { deviceId });
      const existingTransfers = new Set(
        existingResult.recordset.map(t => `${t.seller_id}-${t.buyer_id}`)
      );

      logger.info('Existing transfers:', Array.from(existingTransfers));

      // Create missing transfer records for each step in the chain
      // Records are created sequentially with slight delays to ensure proper chronological order
      const createdRecords = [];
      for (let i = 0; i < hierarchyPath.length - 1; i++) {
        const currentSeller = hierarchyPath[i];
        const currentBuyer = hierarchyPath[i + 1];
        const transferKey = `${currentSeller}-${currentBuyer}`;

        if (!existingTransfers.has(transferKey)) {
          logger.info(`Creating missing transfer record ${i + 1}/${hierarchyPath.length - 1}: ${currentSeller} → ${currentBuyer}`);

          const record = await Device.createClientDeviceRecord(
            currentSeller,
            currentBuyer,
            deviceId
          );
          createdRecords.push(record);
          existingTransfers.add(transferKey);

          // Add a 10ms delay between records to ensure proper chronological ordering
          // This ensures transfer_date values are distinct and maintain hierarchy order
          if (i < hierarchyPath.length - 2) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        } else {
          logger.info(`Transfer record already exists: ${currentSeller} → ${currentBuyer}`);
        }
      }

      logger.info(`Created ${createdRecords.length} missing transfer records`);
      return createdRecords;
    } catch (error) {
      logger.error('Error creating missing transfer chain:', error);
      throw error;
    }
  }

  /**
   * Transfer device to another client
   * @param {number} deviceId - Device ID
   * @param {number} sellerId - Current client ID
   * @param {number} buyerId - Target client ID
   * @param {string} machineId - Machine ID (optional)
   * @param {string} userRole - User role performing the transfer (optional)
   * @param {number} userClientId - User's client ID (optional)
   * @returns {Promise<Object>} Transfer result
   */
  static async transferDevice(deviceId, sellerId, buyerId, machineId = null, userRole = null, userClientId = null) {
    try {
      logger.info('Transfer device request:', { deviceId, sellerId, buyerId, machineId, userRole, userClientId });

      // Check if sellerId is null - if device has no current owner, we can't create transfer record
      if (!sellerId) {
        logger.warn('Device has no current owner (client_id is null). Assigning to buyer without transfer record.');

        // Just update device client_id without creating transfer record
        const updateQuery = `
          UPDATE device
          SET client_id = @buyerId
          WHERE id = @deviceId
        `;

        await executeQuery(updateQuery, { buyerId, deviceId });

        return {
          transfer: null,
          device: await Device.findById(deviceId)
        };
      }

      // Check if target is a descendant (will be used later for chain creation)
      const isTargetDescendant = await Client.isDescendant(sellerId, buyerId);
      logger.info('Is target descendant of current owner?', isTargetDescendant);

      // Check if there's an existing client_device record for this device
      // IMPORTANT: Get existing records BEFORE creating any new ones
      const existingRecordQuery = `
        SELECT TOP 1 *
        FROM client_device
        WHERE device_id = @deviceId
        ORDER BY transfer_date DESC
      `;

      const existingResult = await executeQuery(existingRecordQuery, { deviceId });

      let transferRecord;

      if (existingResult.recordset.length > 0) {
        // Record exists - check the transfer history
        const existingRecord = existingResult.recordset[0];

        logger.info('Existing client_device record found:', existingRecord);
        logger.info('Comparison values - existingRecord.buyer_id:', existingRecord.buyer_id, 'type:', typeof existingRecord.buyer_id);
        logger.info('Comparison values - sellerId:', sellerId, 'type:', typeof sellerId);

        // Check if the current owner (sellerId) is the buyer in the most recent record
        // Use == instead of === to handle number vs string comparison
        if (existingRecord.buyer_id == sellerId) {
          // Current owner is the buyer in the latest record
          // This means they received the device but haven't transferred it further yet
          // Rule 1: Device can be transferred to siblings (same level) or descendants
          logger.info('Current owner is the buyer in latest record. Device has NOT been transferred further down yet.');
          logger.info('Seller in record:', existingRecord.seller_id, 'Current owner (buyer):', sellerId, 'Target:', buyerId);

          // Rule 1 applies to ALL users (including SYSTEM_ADMIN and SUPER_ADMIN)
          // Allow transfer to descendants OR siblings (same parent)
          logger.info('Applying Rule 1: Checking if target is descendant OR sibling...');

          // Check if target is a descendant of current owner
          const isTargetDescendantCheck = await Client.isDescendant(sellerId, buyerId);
          logger.info('Is target descendant of current owner?', isTargetDescendantCheck);

          if (isTargetDescendantCheck) {
            // Transferring DOWN the hierarchy - create transfer chain
            logger.info('Target is a descendant. Transfer allowed (down hierarchy). Creating transfer chain...');

            // Create the complete transfer chain
            await Device.createMissingTransferChain(deviceId, sellerId, buyerId);

            // Fetch the latest record after chain creation
            const latestRecordQuery = `
              SELECT TOP 1 *
              FROM client_device
              WHERE device_id = @deviceId
              ORDER BY transfer_date DESC
            `;
            const latestResult = await executeQuery(latestRecordQuery, { deviceId });
            transferRecord = latestResult.recordset[0];
          } else {
            // Not a descendant - check if it's a sibling (same parent)
            const currentOwner = await Client.findById(sellerId);
            const targetClient = await Client.findById(buyerId);

            logger.info('Current owner parent_id:', currentOwner.parent_id);
            logger.info('Target client parent_id:', targetClient.parent_id);

            if (currentOwner.parent_id && currentOwner.parent_id === targetClient.parent_id) {
              // Same parent - siblings allowed (Rule 1)
              // Transferring to SIBLING (same level) - UPDATE existing entry
              logger.info('Target is a sibling (same parent). Transfer allowed (same level). Updating existing client_device entry.');

              const updateRecordQuery = `
                UPDATE client_device
                SET buyer_id = @buyerId, transfer_date = GETUTCDATE()
                OUTPUT INSERTED.*
                WHERE id = @recordId
              `;

              logger.info('About to execute UPDATE query with params:', {
                buyerId: buyerId,
                buyerId_type: typeof buyerId,
                recordId: existingRecord.id,
                recordId_type: typeof existingRecord.id
              });

              const updateResult = await executeQuery(updateRecordQuery, {
                buyerId,
                recordId: existingRecord.id
              });

              logger.info('UPDATE query result:', updateResult);
              logger.info('Rows affected by UPDATE:', updateResult.rowsAffected);

              if (updateResult.recordset && updateResult.recordset.length > 0) {
                transferRecord = updateResult.recordset[0];
                logger.info('Updated client_device record:', transferRecord);
              } else {
                logger.error('UPDATE query returned no records!');
                throw new Error('Failed to update client_device record');
              }
            } else {
              // Different parents - not allowed
              logger.error('Transfer blocked: Target is neither a descendant nor a sibling');
              logger.error('Current owner (sellerId):', sellerId, 'Target (buyerId):', buyerId);
              const error = new Error('Device can only be transferred to descendant clients or sibling clients at the same level');
              error.code = 'INVALID_HIERARCHY_TRANSFER';
              throw error;
            }
          }

          logger.info('Hierarchy validation passed. Transfer record created/updated.');
        } else if (existingRecord.seller_id == sellerId) {
          // Current owner is the seller in the latest record
          // This means they sold it and now the buyer has transferred it further
          // The seller can no longer transfer it
          logger.error('Device already transferred down hierarchy by buyer. Seller cannot transfer again.');
          logger.error('Latest record - seller:', existingRecord.seller_id, 'buyer:', existingRecord.buyer_id, 'Current seller:', sellerId);
          const error = new Error('This Device can not be transferred to another client since its already been assigned to another client');
          error.code = 'DEVICE_ALREADY_TRANSFERRED';
          throw error;
        } else {
          // Current owner is neither seller nor buyer in the latest record
          // This means the device has been transferred down the hierarchy already
          // Rule 2: Device can ONLY be transferred further down, NOT to siblings or up
          logger.info('Device has been transferred down the hierarchy (current owner is neither seller nor buyer in latest record).');
          logger.info('Latest record - Seller:', existingRecord.seller_id, 'Buyer:', existingRecord.buyer_id, 'Current owner:', sellerId, 'Target:', buyerId);

          // Rule 2 applies to ALL users (including SYSTEM_ADMIN and SUPER_ADMIN)
          // Device has been transferred down hierarchy - ONLY allow further down transfers
          // NO siblings, NO up transfers
          logger.info('Applying Rule 2: Device already transferred down. Checking if target is descendant of current owner (ONLY down allowed)...');

          const isTargetDescendantCheck2 = await Client.isDescendant(sellerId, buyerId);
          logger.info('Is target descendant of current owner?', isTargetDescendantCheck2);

          if (!isTargetDescendantCheck2) {
            logger.error('Transfer blocked: Device has been transferred down the hierarchy. Can only transfer to descendants, not siblings or up.');
            logger.error('Current owner (sellerId):', sellerId, 'Target (buyerId):', buyerId);
            const error = new Error('Device has been transferred down the hierarchy and can only be transferred to descendant clients, not siblings or parent levels');
            error.code = 'INVALID_HIERARCHY_TRANSFER';
            throw error;
          }

          logger.info('Hierarchy validation passed. Target is a descendant.');

          // Target is descendant - create transfer chain
          logger.info('Creating transfer chain for down-hierarchy transfer...');
          await Device.createMissingTransferChain(deviceId, sellerId, buyerId);

          // Fetch the latest record after chain creation
          const latestRecordQuery = `
            SELECT TOP 1 *
            FROM client_device
            WHERE device_id = @deviceId
            ORDER BY transfer_date DESC
          `;
          const latestResult = await executeQuery(latestRecordQuery, { deviceId });
          transferRecord = latestResult.recordset[0];
        }
      } else {
        // No existing record - this is the first transfer
        if (isTargetDescendant) {
          logger.info('No existing client_device record. Creating transfer chain for descendant transfer.');
          // Create the complete transfer chain
          await Device.createMissingTransferChain(deviceId, sellerId, buyerId);

          // Fetch the latest record from the chain
          const latestRecordQuery = `
            SELECT TOP 1 *
            FROM client_device
            WHERE device_id = @deviceId
            ORDER BY transfer_date DESC
          `;
          const latestResult = await executeQuery(latestRecordQuery, { deviceId });
          transferRecord = latestResult.recordset[0];
        } else {
          // Not a descendant - create direct transfer (e.g., sibling transfer, first transfer to non-descendant)
          logger.info('No existing client_device record. Creating new record for non-descendant transfer.');
          transferRecord = await Device.createClientDeviceRecord(sellerId, buyerId, deviceId);
        }
      }

      // Update device client_id and machine_id
      let updateQuery;
      let updateParams;

      if (machineId) {
        updateQuery = `
          UPDATE device
          SET client_id = @buyerId, machin_id = @machineId
          WHERE id = @deviceId
        `;
        updateParams = { buyerId, machineId, deviceId };
        logger.info('Updating device client_id and machin_id:', { buyerId, machineId });
      } else {
        updateQuery = `
          UPDATE device
          SET client_id = @buyerId
          WHERE id = @deviceId
        `;
        updateParams = { buyerId, deviceId };
        logger.info('Updating device client_id only:', buyerId);
      }

      await executeQuery(updateQuery, updateParams);

      logger.info('Device updated successfully');

      // Verify the update in client_device table
      const verifyQuery = `
        SELECT TOP 1 *
        FROM client_device
        WHERE device_id = @deviceId
        ORDER BY transfer_date DESC
      `;
      const verifyResult = await executeQuery(verifyQuery, { deviceId });
      logger.info('Verification: Current client_device record after transfer:', verifyResult.recordset[0]);

      return {
        transfer: transferRecord,
        device: await Device.findById(deviceId)
      };
    } catch (error) {
      logger.error('Error transferring device:', error);
      logger.error('Transfer params:', { deviceId, sellerId, buyerId });
      throw error;
    }
  }

  /**
   * Get device transfer history
   * @param {number} deviceId - Device ID
   * @returns {Promise<Array>} Transfer history (ordered from oldest to newest)
   */
  static async getTransferHistory(deviceId) {
    try {
      const query = `
        SELECT
          cd.id,
          cd.transfer_date,
          seller.name as seller_name,
          buyer.name as buyer_name,
          cd.seller_id,
          cd.buyer_id
        FROM client_device cd
        INNER JOIN client seller ON cd.seller_id = seller.client_id
        INNER JOIN client buyer ON cd.buyer_id = buyer.client_id
        WHERE cd.device_id = @deviceId
        ORDER BY cd.transfer_date ASC
      `;

      const result = await executeQuery(query, { deviceId });
      return result.recordset;
    } catch (error) {
      logger.error('Error getting device transfer history:', error);
      throw error;
    }
  }

  /**
   * Convert device object to JSON
   * @returns {Object} Device object
   */
  toJSON() {
    return {
      id: this.id,
      device_id: this.device_id,
      channel_id: this.channel_id,
      api_key: this.api_key,
      conversionLogic_ld: this.conversionLogic_ld,
      TransactionTableID: this.TransactionTableID,
      TransactionTableName: this.TransactionTableName,
      field_id: this.field_id,
      Model: this.Model,
      machin_id: this.machin_id,
      client_id: this.client_id,
      onboarding_date: this.onboarding_date,
      client_name: this.client_name,
      client_email: this.client_email
    };
  }
}

export default Device;
