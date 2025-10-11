import { executeQuery, sql } from '../config/database.js';
import { logger, logDB } from '../utils/logger.js';

/**
 * ClientDevice Model - Handles device ownership transfers between clients
 * Based on the client_device table structure from genvolt_database_scripts.sql
 */
export class ClientDevice {
  constructor(transferData) {
    this.id = transferData.id;
    this.seller_id = transferData.seller_id;
    this.buyer_id = transferData.buyer_id;
    this.device_id = transferData.device_id;
    this.transfer_date = transferData.transfer_date;

    // Additional fields from joins
    this.seller_name = transferData.seller_name;
    this.buyer_name = transferData.buyer_name;
    this.device_identifier = transferData.device_identifier;
  }

  /**
   * Create device transfer record and update device ownership
   * @param {number} sellerId - Current owner client ID
   * @param {number} buyerId - New owner client ID
   * @param {number} deviceId - Device ID to transfer
   * @returns {Promise<ClientDevice>} Transfer record
   */
  static async createTransfer(sellerId, buyerId, deviceId) {
    try {
      logDB('ClientDevice.createTransfer called with:', { sellerId, buyerId, deviceId });

      // Validate that seller != buyer (only if seller exists)
      if (sellerId && sellerId === buyerId) {
        throw new Error('Seller and buyer cannot be the same client');
      }

      // Start transaction
      const transaction = `
        BEGIN TRANSACTION;

        -- Insert transfer record
        INSERT INTO client_device (seller_id, buyer_id, device_id, transfer_date)
        VALUES (@seller_id, @buyer_id, @device_id, @transfer_date);

        DECLARE @transfer_id INT = SCOPE_IDENTITY();

        -- Update device ownership
        UPDATE device
        SET client_id = @buyer_id
        WHERE id = @device_id;

        COMMIT TRANSACTION;

        SELECT @transfer_id as id;
      `;

      const params = {
        seller_id: sellerId,
        buyer_id: buyerId,
        device_id: deviceId,
        transfer_date: new Date()
      };

      logDB('Creating device transfer', { sellerId, buyerId, deviceId });
      const result = await executeQuery(transaction, params);
      const transferId = result.recordset[0].id;

      // Return the created transfer record
      return await ClientDevice.findById(transferId);
    } catch (error) {
      logger.error('Error in ClientDevice.createTransfer:', error);
      throw error;
    }
  }

  /**
   * Find transfer record by ID
   * @param {number} id - Transfer ID
   * @returns {Promise<ClientDevice|null>} Transfer record or null
   */
  static async findById(id) {
    try {
      const query = `
        SELECT
          cd.id, cd.seller_id, cd.buyer_id, cd.device_id, cd.transfer_date,
          sc.name as seller_name,
          bc.name as buyer_name,
          d.device_id as device_identifier
        FROM client_device cd
        LEFT JOIN client sc ON cd.seller_id = sc.client_id
        INNER JOIN client bc ON cd.buyer_id = bc.client_id
        INNER JOIN device d ON cd.device_id = d.id
        WHERE cd.id = @id
      `;

      const result = await executeQuery(query, {
        id: id
      });

      if (result.recordset.length === 0) {
        return null;
      }

      return new ClientDevice(result.recordset[0]);
    } catch (error) {
      logger.error('Error in ClientDevice.findById:', error);
      throw error;
    }
  }

  /**
   * Get transfer history for a specific device
   * @param {number} deviceId - Device ID
   * @returns {Promise<ClientDevice[]>} Transfer history
   */
  static async getTransferHistory(deviceId) {
    try {
      const query = `
        SELECT
          cd.id, cd.seller_id, cd.buyer_id, cd.device_id, cd.transfer_date,
          sc.name as seller_name,
          bc.name as buyer_name,
          d.device_id as device_identifier
        FROM client_device cd
        LEFT JOIN client sc ON cd.seller_id = sc.client_id
        INNER JOIN client bc ON cd.buyer_id = bc.client_id
        INNER JOIN device d ON cd.device_id = d.id
        WHERE cd.device_id = @device_id
        ORDER BY cd.transfer_date DESC
      `;

      const result = await executeQuery(query, {
        device_id: deviceId
      });

      return result.recordset.map(row => new ClientDevice(row));
    } catch (error) {
      logger.error('Error in ClientDevice.getTransferHistory:', error);
      throw error;
    }
  }

  /**
   * Get devices transferred by or to a client
   * @param {number} clientId - Client ID
   * @param {string} type - 'sold', 'bought', or 'all'
   * @returns {Promise<ClientDevice[]>} Transfer records
   */
  static async getClientTransfers(clientId, type = 'all') {
    try {
      let whereClause = '';

      switch (type) {
        case 'sold':
          whereClause = 'WHERE cd.seller_id = @client_id';
          break;
        case 'bought':
          whereClause = 'WHERE cd.buyer_id = @client_id';
          break;
        default:
          whereClause = 'WHERE (cd.seller_id = @client_id OR cd.buyer_id = @client_id)';
      }

      const query = `
        SELECT
          cd.id, cd.seller_id, cd.buyer_id, cd.device_id, cd.transfer_date,
          sc.name as seller_name,
          bc.name as buyer_name,
          d.device_id as device_identifier
        FROM client_device cd
        LEFT JOIN client sc ON cd.seller_id = sc.client_id
        INNER JOIN client bc ON cd.buyer_id = bc.client_id
        INNER JOIN device d ON cd.device_id = d.id
        ${whereClause}
        ORDER BY cd.transfer_date DESC
      `;

      const result = await executeQuery(query, {
        client_id: clientId
      });

      return result.recordset.map(row => new ClientDevice(row));
    } catch (error) {
      logger.error('Error in ClientDevice.getClientTransfers:', error);
      throw error;
    }
  }

  /**
   * Get transfer statistics
   * @param {number} clientId - Optional client ID to filter by
   * @returns {Promise<Object>} Transfer statistics
   */
  static async getTransferStats(clientId = null) {
    try {
      let query = `
        SELECT
          COUNT(*) as totalTransfers,
          COUNT(CASE WHEN cd.transfer_date >= DATEADD(day, -30, GETDATE()) THEN 1 END) as recentTransfers,
          COUNT(DISTINCT cd.seller_id) as uniqueSellers,
          COUNT(DISTINCT cd.buyer_id) as uniqueBuyers
        FROM client_device cd
      `;

      const params = {};

      if (clientId) {
        query += ' WHERE (cd.seller_id = @client_id OR cd.buyer_id = @client_id)';
        params.client_id = clientId;
      }

      const result = await executeQuery(query, params);
      return result.recordset[0];
    } catch (error) {
      logger.error('Error in ClientDevice.getTransferStats:', error);
      throw error;
    }
  }

  /**
   * Check if a device has any transfer history
   * @param {number} deviceId - Device ID
   * @returns {Promise<boolean>} Has transfer history
   */
  static async hasTransferHistory(deviceId) {
    try {
      const query = 'SELECT COUNT(*) as count FROM client_device WHERE device_id = @device_id';
      const result = await executeQuery(query, {
        device_id: deviceId
      });

      const hasHistory = result.recordset[0].count > 0;

      logger.info('Transfer history check:', {
        deviceId,
        transferCount: result.recordset[0].count,
        hasHistory
      });

      return hasHistory;
    } catch (error) {
      logger.error('Error in ClientDevice.hasTransferHistory:', error);
      throw error;
    }
  }

  /**
   * Check if a device can be reassigned by verifying the transfer chain
   * A device can be reassigned if:
   * 1. The current buyer hasn't transferred it to another client yet
   * 2. The requesting client is the original seller or current owner
   * 3. If multiple transfers occurred (e.g., A->B->C), only the current owner (C) can reassign, not the original seller (A)
   *
   * Business Rules:
   * - Direct transfer (GenVolt -> Acme): GenVolt can reassign from Acme to TechFlow
   * - Multi-hop transfer (GenVolt -> Acme -> AC1): Only AC1 can reassign, GenVolt cannot
   *
   * @param {number} deviceId - Device ID
   * @param {number} requestingClientId - Client ID requesting the reassignment
   * @param {number} newBuyerId - New buyer client ID
   * @returns {Promise<Object>} Reassignment validation result
   */
  static async canReassignDevice(deviceId, requestingClientId, newBuyerId) {
    try {
      // Get the complete transfer history for the device
      const transferHistory = await ClientDevice.getTransferHistory(deviceId);

      if (transferHistory.length === 0) {
        return {
          canReassign: false,
          reason: 'No transfer history found for this device',
          transferHistory: []
        };
      }

      // Get the most recent transfer (current ownership)
      const mostRecentTransfer = transferHistory[0];
      const currentOwner = mostRecentTransfer.buyer_id;

      // Get the original seller from the FIRST transfer (oldest in the chain)
      const originalTransfer = transferHistory[transferHistory.length - 1];
      const originalSeller = originalTransfer.seller_id;

      logger.info('Device reassignment analysis:', {
        deviceId,
        requestingClientId,
        newBuyerId,
        currentOwner,
        originalSeller,
        transferCount: transferHistory.length
      });

      // Check if the device has gone through multiple transfers beyond the initial assignment
      // This prevents original sellers from reassigning devices that have been transferred
      // multiple times down the chain (e.g., GenVolt -> Acme -> AC1)

      // If there are more than 1 transfers, it means the device has moved beyond direct assignment
      const hasMultipleTransfers = transferHistory.length > 1;

      // Check if the current owner has already transferred the device to someone else
      // Look for any transfer where the current owner is the seller (excluding the most recent transfer)
      const subsequentTransfers = transferHistory.filter(transfer =>
        transfer.seller_id === currentOwner && transfer.id !== mostRecentTransfer.id
      );

      logger.info('Transfer chain analysis:', {
        currentOwner,
        originalSeller,
        requestingClientId,
        totalTransfers: transferHistory.length,
        hasMultipleTransfers,
        subsequentTransfers: subsequentTransfers.length,
        subsequentTransferDetails: subsequentTransfers,
        isOriginalSellerRequesting: requestingClientId === originalSeller
      });

      const hasSubsequentTransfer = subsequentTransfers.length > 0;

      // Block reassignment if current owner has already transferred to someone else
      if (hasSubsequentTransfer) {
        return {
          canReassign: false,
          reason: 'This Device cannot be transferred to another client since it has already been assigned to another client',
          transferHistory,
          currentOwner,
          originalSeller
        };
      }

      // Block original seller from reassigning if device has moved through multiple transfers
      // This prevents scenarios like GenVolt -> Acme -> AC1, then GenVolt trying to reassign to TechFlow
      if (hasMultipleTransfers && requestingClientId === originalSeller && requestingClientId !== currentOwner) {
        return {
          canReassign: false,
          reason: 'This Device cannot be reassigned by the original seller as it has moved through multiple transfers in the ownership chain',
          transferHistory,
          currentOwner,
          originalSeller
        };
      }

      // Check if the requesting client is authorized to reassign
      // Allowed scenarios:
      // 1. Original seller can reassign (handled by previous checks)
      // 2. Current owner can reassign
      // 3. Parent can redistribute between direct children (new scenario)

      const isOriginalSeller = requestingClientId === originalSeller;
      const isCurrentOwner = requestingClientId === currentOwner;

      // Check if requesting client can redistribute between their direct children
      let canRedistribute = false;
      let redistributionInfo = null;

      if (!isOriginalSeller && !isCurrentOwner) {
        // Import Client model to check relationships
        const { Client } = await import('./Client.js');

        try {
          // Check if current owner is a direct child of requesting client
          const childClients = await Client.getImmediateChildClients(requestingClientId);
          const childClientIds = childClients.map(child => child.client_id);

          const currentOwnerIsDirectChild = childClientIds.includes(currentOwner);
          const newBuyerIsDirectChild = childClientIds.includes(newBuyerId);

          // Allow redistribution if both current owner and new buyer are direct children
          if (currentOwnerIsDirectChild && newBuyerIsDirectChild) {
            canRedistribute = true;
            redistributionInfo = {
              parentClientId: requestingClientId,
              fromChildId: currentOwner,
              toChildId: newBuyerId,
              childClients: childClients.map(c => ({ id: c.client_id, name: c.name }))
            };
          }

          logger.info('Redistribution check:', {
            requestingClientId,
            currentOwner,
            newBuyerId,
            childClientIds,
            currentOwnerIsDirectChild,
            newBuyerIsDirectChild,
            canRedistribute,
            redistributionInfo
          });

        } catch (error) {
          logger.error('Error checking client relationships for redistribution:', error);
          // Continue with standard authorization if relationship check fails
        }
      }

      const isAuthorized = isOriginalSeller || isCurrentOwner || canRedistribute;

      logger.info('Authorization check:', {
        requestingClientId,
        originalSeller,
        currentOwner,
        newBuyerId,
        isOriginalSeller,
        isCurrentOwner,
        canRedistribute,
        isAuthorized,
        redistributionInfo
      });

      if (!isAuthorized) {
        return {
          canReassign: false,
          reason: 'Only the original seller, current owner, or parent client can reassign this device',
          transferHistory,
          currentOwner,
          originalSeller
        };
      }

      // Check if trying to assign to the same client
      if (newBuyerId === currentOwner) {
        return {
          canReassign: false,
          reason: 'Device is already assigned to this client',
          transferHistory,
          currentOwner,
          originalSeller
        };
      }

      return {
        canReassign: true,
        reason: 'Device can be reassigned',
        transferHistory,
        currentOwner,
        originalSeller,
        mostRecentTransferId: mostRecentTransfer.id,
        isRedistribution: canRedistribute,
        redistributionInfo
      };

    } catch (error) {
      logger.error('Error in ClientDevice.canReassignDevice:', error);
      throw error;
    }
  }

  /**
   * Update an existing transfer record (for reassignment)
   * @param {number} transferId - Transfer ID to update
   * @param {number} newBuyerId - New buyer client ID
   * @returns {Promise<ClientDevice>} Updated transfer record
   */
  static async updateTransfer(transferId, newBuyerId) {
    try {
      logDB('ClientDevice.updateTransfer called with:', { transferId, newBuyerId });

      // First, verify the transfer record exists
      const existsQuery = 'SELECT id, seller_id, buyer_id, device_id FROM client_device WHERE id = @transfer_id';
      const existsResult = await executeQuery(existsQuery, { transfer_id: transferId });

      if (existsResult.recordset.length === 0) {
        throw new Error(`Transfer record with ID ${transferId} not found`);
      }

      logger.info('Transfer record found:', existsResult.recordset[0]);

      // Prepare parameters for the updates
      const params = {
        transfer_id: transferId,
        new_buyer_id: newBuyerId,
        transfer_date: new Date()
      };

      // First, let's check the current state before update
      const beforeQuery = `
        SELECT cd.id, cd.buyer_id, cd.device_id, d.client_id as device_client_id
        FROM client_device cd
        INNER JOIN device d ON cd.device_id = d.id
        WHERE cd.id = @transfer_id
      `;

      const beforeResult = await executeQuery(beforeQuery, { transfer_id: transferId });
      if (beforeResult.recordset.length > 0) {
        logger.info('Transfer state before update:', beforeResult.recordset[0]);
      }

      // Step 1: Update client_device table first
      const updateClientDeviceQuery = `
        UPDATE client_device
        SET buyer_id = @new_buyer_id, transfer_date = @transfer_date
        WHERE id = @transfer_id;
        SELECT @@ROWCOUNT as rows_affected;
      `;

      logger.info('💾 Step 1: Updating client_device table', {
        sql: updateClientDeviceQuery,
        params: params
      });
      const clientDeviceResult = await executeQuery(updateClientDeviceQuery, params);
      const clientDeviceRowsAffected = clientDeviceResult.recordset[0].rows_affected;

      logger.info('client_device update result:', {
        rowsAffected: clientDeviceRowsAffected,
        expectedRows: 1,
        success: clientDeviceRowsAffected === 1
      });

      if (clientDeviceRowsAffected === 0) {
        // Let's see what records exist for debugging
        const debugQuery = 'SELECT * FROM client_device WHERE device_id = @device_id';
        const debugResult = await executeQuery(debugQuery, { device_id: existsResult.recordset[0].device_id });

        logger.error('❌ client_device update failed. Debug info:', {
          transferIdAttempted: transferId,
          deviceId: existsResult.recordset[0].device_id,
          allRecordsForDevice: debugResult.recordset
        });

        throw new Error(`Failed to update client_device table. Transfer ID ${transferId} not found or no changes made.`);
      }

      // Verify the update actually worked
      const verifyUpdateQuery = 'SELECT * FROM client_device WHERE id = @transfer_id';
      const verifyUpdateResult = await executeQuery(verifyUpdateQuery, { transfer_id: transferId });

      logger.info('✅ client_device update verification:', {
        recordAfterUpdate: verifyUpdateResult.recordset[0],
        buyerIdUpdated: verifyUpdateResult.recordset[0].buyer_id === newBuyerId
      });

      // Step 2: Get device_id and update device table
      const getDeviceIdQuery = 'SELECT device_id FROM client_device WHERE id = @transfer_id';
      const deviceIdResult = await executeQuery(getDeviceIdQuery, { transfer_id: transferId });
      const deviceId = deviceIdResult.recordset[0].device_id;

      const updateDeviceQuery = `
        UPDATE device
        SET client_id = @new_buyer_id
        WHERE id = @device_id;
        SELECT @@ROWCOUNT as rows_affected;
      `;

      logger.info('Step 2: Updating device table', { deviceId });
      const deviceResult = await executeQuery(updateDeviceQuery, {
        new_buyer_id: newBuyerId,
        device_id: deviceId
      });
      const deviceRowsAffected = deviceResult.recordset[0].rows_affected;

      logger.info('device update result:', {
        deviceId,
        rowsAffected: deviceRowsAffected,
        expectedRows: 1,
        success: deviceRowsAffected === 1
      });

      if (deviceRowsAffected === 0) {
        throw new Error(`Failed to update device table. Device ID ${deviceId} not found.`);
      }

      logger.info('✅ Both updates completed successfully', {
        clientDeviceRowsAffected,
        deviceRowsAffected,
        transferId,
        newBuyerId
      });

      // Check the state after update
      const afterResult = await executeQuery(beforeQuery, { transfer_id: transferId });
      if (afterResult.recordset.length > 0) {
        logger.info('Transfer state after update:', afterResult.recordset[0]);
      }

      // Return the updated transfer record
      return await ClientDevice.findById(transferId);
    } catch (error) {
      logger.error('Error in ClientDevice.updateTransfer:', error);
      throw error;
    }
  }

  /**
   * Validate transfer data
   * @param {Object} data - Transfer data
   * @returns {Object} Validation result
   */
  static validateTransferData(data) {
    const errors = {};

    // For assignments, seller_id can be null
    if (data.seller_id !== null && (typeof data.seller_id !== 'number' || data.seller_id < 1)) {
      errors.seller_id = 'Valid seller ID is required when transferring from existing owner';
    }

    if (!data.buyer_id || typeof data.buyer_id !== 'number' || data.buyer_id < 1) {
      errors.buyer_id = 'Valid buyer ID is required';
    }

    if (!data.device_id || typeof data.device_id !== 'number' || data.device_id < 1) {
      errors.device_id = 'Valid device ID is required';
    }

    if (data.seller_id && data.buyer_id && data.seller_id === data.buyer_id) {
      errors.transfer = 'Seller and buyer cannot be the same client';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }

  /**
   * Convert to public representation
   * @returns {Object} Public transfer data
   */
  toPublic() {
    return {
      id: this.id,
      seller_id: this.seller_id,
      seller_name: this.seller_name,
      buyer_id: this.buyer_id,
      buyer_name: this.buyer_name,
      device_id: this.device_id,
      device_identifier: this.device_identifier,
      transfer_date: this.transfer_date
    };
  }
}