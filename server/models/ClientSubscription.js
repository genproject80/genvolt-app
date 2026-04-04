import { executeQuery, sql } from '../config/database.js';
import { logger } from '../utils/logger.js';

export class ClientSubscription {
  constructor(data) {
    this.subscription_id          = data.subscription_id;
    this.client_id                = data.client_id;
    this.plan_id                  = data.plan_id;
    this.status                   = data.status;
    this.billing_cycle            = data.billing_cycle;
    this.start_date               = data.start_date;
    this.end_date                 = data.end_date;
    this.grace_end_date           = data.grace_end_date;
    this.razorpay_subscription_id = data.razorpay_subscription_id;
    this.razorpay_customer_id     = data.razorpay_customer_id;
    this.auto_renew               = data.auto_renew;
    this.cancelled_at             = data.cancelled_at;
    this.cancellation_reason      = data.cancellation_reason;
    this.created_at               = data.created_at;
    this.updated_at               = data.updated_at;
    this.created_by_user_id       = data.created_by_user_id;
    // admin assignment fields
    this.assignment_type          = data.assignment_type;
    this.assigned_by_admin_id     = data.assigned_by_admin_id;
    this.admin_notes              = data.admin_notes;

    // Joined from SubscriptionPlans
    this.plan_name                = data.plan_name;
    this.max_devices              = data.max_devices;
    this.grace_days               = data.grace_days;
    this.price_monthly            = data.price_monthly;
    this.price_yearly             = data.price_yearly;
    this.plan_features            = data.plan_features;

    // Joined from client
    this.client_name              = data.client_name;
    this.client_email             = data.client_email;
  }

  toJSON() {
    return {
      subscription_id:          this.subscription_id,
      client_id:                this.client_id,
      plan_id:                  this.plan_id,
      status:                   this.status,
      billing_cycle:            this.billing_cycle,
      start_date:               this.start_date,
      end_date:                 this.end_date,
      grace_end_date:           this.grace_end_date,
      razorpay_subscription_id: this.razorpay_subscription_id,
      razorpay_customer_id:     this.razorpay_customer_id,
      auto_renew:               this.auto_renew,
      cancelled_at:             this.cancelled_at,
      cancellation_reason:      this.cancellation_reason,
      created_at:               this.created_at,
      // admin assignment fields
      assignment_type:          this.assignment_type,
      assigned_by_admin_id:     this.assigned_by_admin_id,
      admin_notes:              this.admin_notes,
      // plan details
      plan_name:                this.plan_name,
      max_devices:              this.max_devices,
      grace_days:               this.grace_days,
      price_monthly:            this.price_monthly ? parseFloat(this.price_monthly) : null,
      price_yearly:             this.price_yearly  ? parseFloat(this.price_yearly)  : null,
      plan_features:            this.plan_features ? JSON.parse(this.plan_features) : [],
      // client details
      client_name:              this.client_name,
      client_email:             this.client_email,
    };
  }

  // ------------------------------------------------------------------
  // findByClientId — get latest non-cancelled subscription for client
  // ------------------------------------------------------------------
  static async findByClientId(clientId) {
    try {
      const result = await executeQuery(
        `SELECT TOP 1
           cs.*,
           sp.name           AS plan_name,
           sp.max_devices,
           sp.grace_days,
           sp.price_monthly,
           sp.price_yearly,
           sp.features       AS plan_features,
           c.name            AS client_name,
           c.email           AS client_email
         FROM ClientSubscriptions cs
         JOIN SubscriptionPlans sp ON cs.plan_id     = sp.plan_id
         JOIN client            c  ON cs.client_id   = c.client_id
         WHERE cs.client_id = @clientId
           AND cs.status NOT IN ('CANCELLED', 'EXPIRED')
         ORDER BY cs.created_at DESC`,
        { clientId: { value: clientId, type: sql.Int } }
      );
      if (result.recordset.length === 0) return null;
      return new ClientSubscription(result.recordset[0]);
    } catch (error) {
      logger.error('ClientSubscription.findByClientId error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findById
  // ------------------------------------------------------------------
  static async findById(subscriptionId) {
    try {
      const result = await executeQuery(
        `SELECT cs.*,
           sp.name           AS plan_name,
           sp.max_devices,
           sp.grace_days,
           sp.price_monthly,
           sp.price_yearly,
           sp.features       AS plan_features,
           c.name            AS client_name,
           c.email           AS client_email
         FROM ClientSubscriptions cs
         JOIN SubscriptionPlans sp ON cs.plan_id   = sp.plan_id
         JOIN client            c  ON cs.client_id = c.client_id
         WHERE cs.subscription_id = @subscriptionId`,
        { subscriptionId: { value: subscriptionId, type: sql.Int } }
      );
      if (result.recordset.length === 0) return null;
      return new ClientSubscription(result.recordset[0]);
    } catch (error) {
      logger.error('ClientSubscription.findById error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // create — insert a new PENDING subscription row
  // ------------------------------------------------------------------
  static async create({ client_id, plan_id, billing_cycle, razorpay_customer_id, created_by_user_id }) {
    try {
      const result = await executeQuery(
        `INSERT INTO ClientSubscriptions
           (client_id, plan_id, billing_cycle, razorpay_customer_id, created_by_user_id, status)
         OUTPUT INSERTED.subscription_id
         VALUES (@clientId, @planId, @billingCycle, @rzpCustomerId, @createdBy, 'PENDING')`,
        {
          clientId:      { value: client_id,             type: sql.Int },
          planId:        { value: plan_id,                type: sql.Int },
          billingCycle:  { value: billing_cycle,          type: sql.NVarChar },
          rzpCustomerId: { value: razorpay_customer_id || null, type: sql.NVarChar },
          createdBy:     { value: created_by_user_id || null,   type: sql.Int },
        }
      );
      const newId = result.recordset[0].subscription_id;
      return await ClientSubscription.findById(newId);
    } catch (error) {
      logger.error('ClientSubscription.create error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // activate — called after successful payment verification
  // ------------------------------------------------------------------
  static async activate(subscriptionId, { razorpay_subscription_id, billing_cycle, plan }) {
    try {
      const now = new Date();
      const endDate = new Date(now);

      if (billing_cycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      const graceDays = plan?.grace_days ?? 7;
      const graceEndDate = new Date(endDate);
      graceEndDate.setDate(graceEndDate.getDate() + graceDays);

      await executeQuery(
        `UPDATE ClientSubscriptions
         SET status                   = 'ACTIVE',
             start_date               = @startDate,
             end_date                 = @endDate,
             grace_end_date           = @graceEnd,
             razorpay_subscription_id = @rzpSubId,
             updated_at               = GETUTCDATE()
         WHERE subscription_id = @subscriptionId`,
        {
          subscriptionId: { value: subscriptionId, type: sql.Int },
          startDate:      { value: now,             type: sql.DateTime2 },
          endDate:        { value: endDate,          type: sql.DateTime2 },
          graceEnd:       { value: graceEndDate,     type: sql.DateTime2 },
          rzpSubId:       { value: razorpay_subscription_id || null, type: sql.NVarChar },
        }
      );
      return await ClientSubscription.findById(subscriptionId);
    } catch (error) {
      logger.error('ClientSubscription.activate error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // renew — extend dates when a recurring charge succeeds
  // ------------------------------------------------------------------
  static async renew(subscriptionId, billing_cycle, grace_days) {
    try {
      const sub = await ClientSubscription.findById(subscriptionId);
      const base = new Date(sub.end_date || new Date());
      const newEnd = new Date(base);

      if (billing_cycle === 'yearly') {
        newEnd.setFullYear(newEnd.getFullYear() + 1);
      } else {
        newEnd.setMonth(newEnd.getMonth() + 1);
      }

      const newGrace = new Date(newEnd);
      newGrace.setDate(newGrace.getDate() + (grace_days ?? 7));

      await executeQuery(
        `UPDATE ClientSubscriptions
         SET status         = 'ACTIVE',
             end_date       = @endDate,
             grace_end_date = @graceEnd,
             updated_at     = GETUTCDATE()
         WHERE subscription_id = @subscriptionId`,
        {
          subscriptionId: { value: subscriptionId, type: sql.Int },
          endDate:        { value: newEnd,          type: sql.DateTime2 },
          graceEnd:       { value: newGrace,        type: sql.DateTime2 },
        }
      );
      return await ClientSubscription.findById(subscriptionId);
    } catch (error) {
      logger.error('ClientSubscription.renew error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // setGrace / expire / cancel
  // ------------------------------------------------------------------
  static async setGrace(subscriptionId) {
    try {
      await executeQuery(
        `UPDATE ClientSubscriptions
         SET status = 'GRACE', updated_at = GETUTCDATE()
         WHERE subscription_id = @subscriptionId`,
        { subscriptionId: { value: subscriptionId, type: sql.Int } }
      );
    } catch (error) {
      logger.error('ClientSubscription.setGrace error:', error);
      throw error;
    }
  }

  static async expire(subscriptionId) {
    try {
      await executeQuery(
        `UPDATE ClientSubscriptions
         SET status = 'EXPIRED', updated_at = GETUTCDATE()
         WHERE subscription_id = @subscriptionId`,
        { subscriptionId: { value: subscriptionId, type: sql.Int } }
      );
    } catch (error) {
      logger.error('ClientSubscription.expire error:', error);
      throw error;
    }
  }

  static async cancel(subscriptionId, reason = '') {
    try {
      await executeQuery(
        `UPDATE ClientSubscriptions
         SET status               = 'CANCELLED',
             cancelled_at         = GETUTCDATE(),
             cancellation_reason  = @reason,
             updated_at           = GETUTCDATE()
         WHERE subscription_id = @subscriptionId`,
        {
          subscriptionId: { value: subscriptionId, type: sql.Int },
          reason:         { value: reason,          type: sql.NVarChar },
        }
      );
    } catch (error) {
      logger.error('ClientSubscription.cancel error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // getActiveDeviceCount — how many ACTIVE devices this client has
  // ------------------------------------------------------------------
  static async getActiveDeviceCount(clientId) {
    try {
      const result = await executeQuery(
        `SELECT COUNT(*) AS cnt FROM device
         WHERE client_id = @clientId AND activation_status = 'ACTIVE'`,
        { clientId: { value: clientId, type: sql.Int } }
      );
      return result.recordset[0].cnt;
    } catch (error) {
      logger.error('ClientSubscription.getActiveDeviceCount error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // getAllWithClientInfo — admin paginated view
  // ------------------------------------------------------------------
  static async getAllWithClientInfo({ page = 1, limit = 20, status, plan_id } = {}) {
    try {
      const offset = (page - 1) * limit;
      let where = '1=1';
      const params = {
        limit:  { value: limit,  type: sql.Int },
        offset: { value: offset, type: sql.Int },
      };

      if (status) {
        where += ' AND cs.status = @status';
        params.status = { value: status, type: sql.NVarChar };
      }
      if (plan_id) {
        where += ' AND cs.plan_id = @planId';
        params.planId = { value: plan_id, type: sql.Int };
      }

      const countResult = await executeQuery(
        `SELECT COUNT(*) AS total
         FROM ClientSubscriptions cs
         WHERE ${where}`,
        params
      );

      const result = await executeQuery(
        `SELECT cs.*,
           sp.name        AS plan_name,
           sp.max_devices,
           sp.grace_days,
           c.name         AS client_name,
           c.email        AS client_email
         FROM ClientSubscriptions cs
         JOIN SubscriptionPlans sp ON cs.plan_id   = sp.plan_id
         JOIN client            c  ON cs.client_id = c.client_id
         WHERE ${where}
         ORDER BY cs.created_at DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
        params
      );

      return {
        data:       result.recordset.map(r => new ClientSubscription(r)),
        total:      countResult.recordset[0].total,
        page,
        limit,
        totalPages: Math.ceil(countResult.recordset[0].total / limit),
      };
    } catch (error) {
      logger.error('ClientSubscription.getAllWithClientInfo error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findExpiredActive — ACTIVE subs past their end_date (for cron)
  // ------------------------------------------------------------------
  static async findExpiredActive() {
    try {
      const result = await executeQuery(
        `SELECT cs.*, sp.grace_days
         FROM ClientSubscriptions cs
         JOIN SubscriptionPlans sp ON cs.plan_id = sp.plan_id
         WHERE cs.status = 'ACTIVE' AND cs.end_date < GETUTCDATE()`
      );
      return result.recordset;
    } catch (error) {
      logger.error('ClientSubscription.findExpiredActive error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findExpiredGrace — GRACE subs past their grace_end_date (for cron)
  // ------------------------------------------------------------------
  static async findExpiredGrace() {
    try {
      const result = await executeQuery(
        `SELECT cs.*
         FROM ClientSubscriptions cs
         WHERE cs.status = 'GRACE' AND cs.grace_end_date < GETUTCDATE()`
      );
      return result.recordset;
    } catch (error) {
      logger.error('ClientSubscription.findExpiredGrace error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // createManual — admin creates ACTIVE subscription without Razorpay
  // ------------------------------------------------------------------
  static async createManual({ client_id, plan_id, billing_cycle, end_date, assigned_by_admin_id, assignment_type = 'MANUAL', admin_notes = '' }) {
    try {
      const plan = await import('./SubscriptionPlan.js').then(m => m.SubscriptionPlan.findById(plan_id));
      const graceDays = plan?.grace_days ?? 7;
      const endDateObj = new Date(end_date);
      const graceEnd = new Date(endDateObj);
      graceEnd.setDate(graceEnd.getDate() + graceDays);

      const result = await executeQuery(
        `INSERT INTO ClientSubscriptions
           (client_id, plan_id, billing_cycle, status, start_date, end_date,
            grace_end_date, assignment_type, assigned_by_admin_id, admin_notes, created_by_user_id)
         OUTPUT INSERTED.subscription_id
         VALUES (@clientId, @planId, @billingCycle, 'ACTIVE', GETUTCDATE(), @endDate,
                 @graceEnd, @assignType, @adminId, @notes, @adminId)`,
        {
          clientId:    { value: client_id,           type: sql.Int },
          planId:      { value: plan_id,              type: sql.Int },
          billingCycle:{ value: billing_cycle,         type: sql.NVarChar },
          endDate:     { value: endDateObj,            type: sql.DateTime2 },
          graceEnd:    { value: graceEnd,              type: sql.DateTime2 },
          assignType:  { value: assignment_type,       type: sql.NVarChar },
          adminId:     { value: assigned_by_admin_id,  type: sql.Int },
          notes:       { value: admin_notes || '',     type: sql.NVarChar },
        }
      );
      const newId = result.recordset[0].subscription_id;
      return await ClientSubscription.findById(newId);
    } catch (error) {
      logger.error('ClientSubscription.createManual error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // changePlan — update plan_id (price effective at next renewal)
  // ------------------------------------------------------------------
  static async changePlan(subscriptionId, newPlanId, adminUserId) {
    try {
      await executeQuery(
        `UPDATE ClientSubscriptions
         SET plan_id = @planId, assigned_by_admin_id = @adminId, updated_at = GETUTCDATE()
         WHERE subscription_id = @subId`,
        {
          subId:   { value: subscriptionId, type: sql.Int },
          planId:  { value: newPlanId,       type: sql.Int },
          adminId: { value: adminUserId,     type: sql.Int },
        }
      );
      return await ClientSubscription.findById(subscriptionId);
    } catch (error) {
      logger.error('ClientSubscription.changePlan error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // extendEndDate — update end_date + recalculate grace_end_date
  // ------------------------------------------------------------------
  static async extendEndDate(subscriptionId, newEndDate, adminUserId) {
    try {
      const sub = await ClientSubscription.findById(subscriptionId);
      const graceDays = sub?.grace_days ?? 7;
      const endDateObj = new Date(newEndDate);
      const graceEnd = new Date(endDateObj);
      graceEnd.setDate(graceEnd.getDate() + graceDays);

      await executeQuery(
        `UPDATE ClientSubscriptions
         SET end_date = @endDate, grace_end_date = @graceEnd,
             assigned_by_admin_id = @adminId, updated_at = GETUTCDATE()
         WHERE subscription_id = @subId`,
        {
          subId:   { value: subscriptionId, type: sql.Int },
          endDate: { value: endDateObj,      type: sql.DateTime2 },
          graceEnd:{ value: graceEnd,        type: sql.DateTime2 },
          adminId: { value: adminUserId,     type: sql.Int },
        }
      );
      return await ClientSubscription.findById(subscriptionId);
    } catch (error) {
      logger.error('ClientSubscription.extendEndDate error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // cancelActiveForClient — cancel any ACTIVE/GRACE subscription before manual assign
  // ------------------------------------------------------------------
  static async cancelActiveForClient(clientId, reason = 'Superseded by admin assignment') {
    try {
      await executeQuery(
        `UPDATE ClientSubscriptions
         SET status = 'CANCELLED', cancelled_at = GETUTCDATE(),
             cancellation_reason = @reason, updated_at = GETUTCDATE()
         WHERE client_id = @clientId AND status IN ('ACTIVE', 'GRACE', 'PENDING')`,
        {
          clientId: { value: clientId, type: sql.Int },
          reason:   { value: reason,   type: sql.NVarChar },
        }
      );
    } catch (error) {
      logger.error('ClientSubscription.cancelActiveForClient error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findByRazorpaySubscriptionId
  // ------------------------------------------------------------------
  static async findByRazorpaySubscriptionId(rzpSubId) {
    try {
      const result = await executeQuery(
        `SELECT cs.*, sp.grace_days, sp.name AS plan_name
         FROM ClientSubscriptions cs
         JOIN SubscriptionPlans sp ON cs.plan_id = sp.plan_id
         WHERE cs.razorpay_subscription_id = @rzpSubId`,
        { rzpSubId: { value: rzpSubId, type: sql.NVarChar } }
      );
      if (result.recordset.length === 0) return null;
      return new ClientSubscription(result.recordset[0]);
    } catch (error) {
      logger.error('ClientSubscription.findByRazorpaySubscriptionId error:', error);
      throw error;
    }
  }
}
