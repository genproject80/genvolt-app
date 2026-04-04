import { executeQuery, sql } from '../config/database.js';
import { logger } from '../utils/logger.js';

export class ClientDiscount {
  constructor(data) {
    this.discount_id       = data.discount_id;
    this.client_id         = data.client_id;
    this.discount_type     = data.discount_type;
    this.discount_value    = data.discount_value;
    this.is_used           = data.is_used;
    this.created_by        = data.created_by;
    this.created_at        = data.created_at;
    this.applied_at        = data.applied_at;
    this.applied_to_order  = data.applied_to_order;
    // joined
    this.created_by_name   = data.created_by_name;
    this.client_name       = data.client_name;
  }

  toJSON() {
    return {
      discount_id:      this.discount_id,
      client_id:        this.client_id,
      client_name:      this.client_name,
      discount_type:    this.discount_type,
      discount_value:   parseFloat(this.discount_value),
      is_used:          !!this.is_used,
      created_by:       this.created_by,
      created_by_name:  this.created_by_name,
      created_at:       this.created_at,
      applied_at:       this.applied_at,
      applied_to_order: this.applied_to_order,
    };
  }

  // ------------------------------------------------------------------
  // getUnused — find the active (unused) discount for a client
  // ------------------------------------------------------------------
  static async getUnused(clientId) {
    try {
      const result = await executeQuery(
        `SELECT cd.*, u.first_name + ' ' + ISNULL(u.last_name, '') AS created_by_name,
                c.name AS client_name
         FROM ClientDiscounts cd
         JOIN [user] u ON cd.created_by = u.user_id
         JOIN client c ON cd.client_id  = c.client_id
         WHERE cd.client_id = @clientId AND cd.is_used = 0
         ORDER BY cd.created_at DESC`,
        { clientId: { value: clientId, type: sql.Int } }
      );
      if (result.recordset.length === 0) return null;
      return new ClientDiscount(result.recordset[0]);
    } catch (error) {
      logger.error('ClientDiscount.getUnused error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // create — add a one-time discount for a client
  // ------------------------------------------------------------------
  static async create({ client_id, discount_type, discount_value, created_by }) {
    try {
      const result = await executeQuery(
        `INSERT INTO ClientDiscounts (client_id, discount_type, discount_value, created_by)
         OUTPUT INSERTED.discount_id
         VALUES (@clientId, @type, @value, @createdBy)`,
        {
          clientId:  { value: client_id,      type: sql.Int },
          type:      { value: discount_type,   type: sql.NVarChar },
          value:     { value: parseFloat(discount_value), type: sql.Decimal(10, 2) },
          createdBy: { value: created_by,      type: sql.Int },
        }
      );
      const newId = result.recordset[0].discount_id;
      return await ClientDiscount.findById(newId);
    } catch (error) {
      logger.error('ClientDiscount.create error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findById
  // ------------------------------------------------------------------
  static async findById(discountId) {
    try {
      const result = await executeQuery(
        `SELECT cd.*, u.first_name + ' ' + ISNULL(u.last_name, '') AS created_by_name,
                c.name AS client_name
         FROM ClientDiscounts cd
         JOIN [user] u ON cd.created_by = u.user_id
         JOIN client c ON cd.client_id  = c.client_id
         WHERE cd.discount_id = @discountId`,
        { discountId: { value: discountId, type: sql.Int } }
      );
      if (result.recordset.length === 0) return null;
      return new ClientDiscount(result.recordset[0]);
    } catch (error) {
      logger.error('ClientDiscount.findById error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // markUsed — consume discount after successful payment
  // ------------------------------------------------------------------
  static async markUsed(discountId, razorpayOrderId) {
    try {
      await executeQuery(
        `UPDATE ClientDiscounts
         SET is_used = 1, applied_at = GETUTCDATE(), applied_to_order = @orderId
         WHERE discount_id = @discountId`,
        {
          discountId: { value: discountId,       type: sql.Int },
          orderId:    { value: razorpayOrderId,  type: sql.NVarChar },
        }
      );
    } catch (error) {
      logger.error('ClientDiscount.markUsed error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // getByClientId — full history (used + unused)
  // ------------------------------------------------------------------
  static async getByClientId(clientId) {
    try {
      const result = await executeQuery(
        `SELECT cd.*, u.first_name + ' ' + ISNULL(u.last_name, '') AS created_by_name,
                c.name AS client_name
         FROM ClientDiscounts cd
         JOIN [user] u ON cd.created_by = u.user_id
         JOIN client c ON cd.client_id  = c.client_id
         WHERE cd.client_id = @clientId
         ORDER BY cd.created_at DESC`,
        { clientId: { value: clientId, type: sql.Int } }
      );
      return result.recordset.map(r => new ClientDiscount(r));
    } catch (error) {
      logger.error('ClientDiscount.getByClientId error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // delete — admin removes an unused discount
  // ------------------------------------------------------------------
  static async delete(discountId) {
    try {
      const result = await executeQuery(
        `DELETE FROM ClientDiscounts
         OUTPUT DELETED.discount_id
         WHERE discount_id = @discountId AND is_used = 0`,
        { discountId: { value: discountId, type: sql.Int } }
      );
      return result.recordset.length > 0;
    } catch (error) {
      logger.error('ClientDiscount.delete error:', error);
      throw error;
    }
  }
}
