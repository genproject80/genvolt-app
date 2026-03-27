import { executeQuery, sql } from '../config/database.js';
import { logger } from '../utils/logger.js';

export class PaymentTransaction {
  constructor(data) {
    this.transaction_id       = data.transaction_id;
    this.subscription_id      = data.subscription_id;
    this.client_id            = data.client_id;
    this.razorpay_order_id    = data.razorpay_order_id;
    this.razorpay_payment_id  = data.razorpay_payment_id;
    this.razorpay_signature   = data.razorpay_signature;
    this.amount               = data.amount;
    this.currency             = data.currency;
    this.status               = data.status;
    this.payment_mode         = data.payment_mode;
    this.failure_reason       = data.failure_reason;
    this.invoice_number       = data.invoice_number;
    this.created_at           = data.created_at;
    this.updated_at           = data.updated_at;
  }

  toJSON() {
    return {
      transaction_id:      this.transaction_id,
      subscription_id:     this.subscription_id,
      client_id:           this.client_id,
      razorpay_order_id:   this.razorpay_order_id,
      razorpay_payment_id: this.razorpay_payment_id,
      amount:              parseFloat(this.amount),
      currency:            this.currency,
      status:              this.status,
      payment_mode:        this.payment_mode,
      failure_reason:      this.failure_reason,
      invoice_number:      this.invoice_number,
      created_at:          this.created_at,
    };
  }

  // ------------------------------------------------------------------
  // create — insert a PENDING transaction when order is created
  // ------------------------------------------------------------------
  static async create({ subscription_id, client_id, razorpay_order_id, amount, currency = 'INR' }) {
    try {
      // Auto-generate invoice number: INV-YYYY-NNNNNN
      const year = new Date().getFullYear();
      const countResult = await executeQuery(
        `SELECT COUNT(*) AS cnt FROM PaymentTransactions WHERE YEAR(created_at) = @year`,
        { year: { value: year, type: sql.Int } }
      );
      const seq = String(countResult.recordset[0].cnt + 1).padStart(6, '0');
      const invoiceNumber = `INV-${year}-${seq}`;

      const result = await executeQuery(
        `INSERT INTO PaymentTransactions
           (subscription_id, client_id, razorpay_order_id, amount, currency, status, invoice_number)
         OUTPUT INSERTED.transaction_id
         VALUES (@subId, @clientId, @orderId, @amount, @currency, 'PENDING', @invoice)`,
        {
          subId:    { value: subscription_id,    type: sql.Int },
          clientId: { value: client_id,           type: sql.Int },
          orderId:  { value: razorpay_order_id,   type: sql.NVarChar },
          amount:   { value: amount,              type: sql.Decimal },
          currency: { value: currency,            type: sql.NVarChar },
          invoice:  { value: invoiceNumber,       type: sql.NVarChar },
        }
      );
      const newId = result.recordset[0].transaction_id;
      return await PaymentTransaction.findById(newId);
    } catch (error) {
      logger.error('PaymentTransaction.create error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findById
  // ------------------------------------------------------------------
  static async findById(transactionId) {
    try {
      const result = await executeQuery(
        `SELECT * FROM PaymentTransactions WHERE transaction_id = @id`,
        { id: { value: transactionId, type: sql.Int } }
      );
      if (result.recordset.length === 0) return null;
      return new PaymentTransaction(result.recordset[0]);
    } catch (error) {
      logger.error('PaymentTransaction.findById error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findByOrderId
  // ------------------------------------------------------------------
  static async findByOrderId(orderId) {
    try {
      const result = await executeQuery(
        `SELECT * FROM PaymentTransactions WHERE razorpay_order_id = @orderId`,
        { orderId: { value: orderId, type: sql.NVarChar } }
      );
      if (result.recordset.length === 0) return null;
      return new PaymentTransaction(result.recordset[0]);
    } catch (error) {
      logger.error('PaymentTransaction.findByOrderId error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // markCompleted — called after successful payment verification
  // ------------------------------------------------------------------
  static async markCompleted(orderId, paymentId, signature, paymentMode = null) {
    try {
      await executeQuery(
        `UPDATE PaymentTransactions
         SET status               = 'COMPLETED',
             razorpay_payment_id  = @paymentId,
             razorpay_signature   = @signature,
             payment_mode         = @mode,
             updated_at           = GETUTCDATE()
         WHERE razorpay_order_id = @orderId`,
        {
          orderId:   { value: orderId,      type: sql.NVarChar },
          paymentId: { value: paymentId,    type: sql.NVarChar },
          signature: { value: signature,    type: sql.NVarChar },
          mode:      { value: paymentMode,  type: sql.NVarChar },
        }
      );
    } catch (error) {
      logger.error('PaymentTransaction.markCompleted error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // markFailed
  // ------------------------------------------------------------------
  static async markFailed(orderId, reason = '') {
    try {
      await executeQuery(
        `UPDATE PaymentTransactions
         SET status         = 'FAILED',
             failure_reason = @reason,
             updated_at     = GETUTCDATE()
         WHERE razorpay_order_id = @orderId`,
        {
          orderId: { value: orderId, type: sql.NVarChar },
          reason:  { value: reason,  type: sql.NVarChar },
        }
      );
    } catch (error) {
      logger.error('PaymentTransaction.markFailed error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // getByClientId — paginated payment history for a client
  // ------------------------------------------------------------------
  static async getByClientId(clientId, { page = 1, limit = 20 } = {}) {
    try {
      const offset = (page - 1) * limit;

      const countResult = await executeQuery(
        `SELECT COUNT(*) AS total FROM PaymentTransactions WHERE client_id = @clientId`,
        { clientId: { value: clientId, type: sql.Int } }
      );

      const result = await executeQuery(
        `SELECT * FROM PaymentTransactions
         WHERE client_id = @clientId
         ORDER BY created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        {
          clientId: { value: clientId, type: sql.Int },
          offset:   { value: offset,   type: sql.Int },
          limit:    { value: limit,     type: sql.Int },
        }
      );

      return {
        data:       result.recordset.map(r => new PaymentTransaction(r)),
        total:      countResult.recordset[0].total,
        page,
        limit,
        totalPages: Math.ceil(countResult.recordset[0].total / limit),
      };
    } catch (error) {
      logger.error('PaymentTransaction.getByClientId error:', error);
      throw error;
    }
  }
}
