import { executeQuery, sql } from '../config/database.js';
import { logger } from '../utils/logger.js';

export class SubscriptionPlan {
  constructor(data) {
    this.plan_id                  = data.plan_id;
    this.name                     = data.name;
    this.description              = data.description;
    this.max_devices              = data.max_devices;
    this.price_monthly            = data.price_monthly;
    this.price_yearly             = data.price_yearly;
    this.grace_days               = data.grace_days;
    this.features                 = data.features;
    this.razorpay_plan_id_monthly = data.razorpay_plan_id_monthly;
    this.razorpay_plan_id_yearly  = data.razorpay_plan_id_yearly;
    this.is_active                = data.is_active;
    this.created_at               = data.created_at;
    this.updated_at               = data.updated_at;
  }

  toJSON() {
    return {
      plan_id:                  this.plan_id,
      name:                     this.name,
      description:              this.description,
      max_devices:              this.max_devices,
      price_monthly:            parseFloat(this.price_monthly),
      price_yearly:             parseFloat(this.price_yearly),
      grace_days:               this.grace_days,
      features:                 this.features ? JSON.parse(this.features) : [],
      razorpay_plan_id_monthly: this.razorpay_plan_id_monthly,
      razorpay_plan_id_yearly:  this.razorpay_plan_id_yearly,
      is_active:                this.is_active,
    };
  }

  // ------------------------------------------------------------------
  // findAll — list all active plans (public)
  // ------------------------------------------------------------------
  static async findAll() {
    try {
      const result = await executeQuery(
        `SELECT * FROM SubscriptionPlans WHERE is_active = 1 ORDER BY price_monthly ASC`
      );
      return result.recordset.map(r => new SubscriptionPlan(r));
    } catch (error) {
      logger.error('SubscriptionPlan.findAll error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findById — fetch single plan including inactive ones
  // ------------------------------------------------------------------
  static async findById(planId) {
    try {
      const result = await executeQuery(
        `SELECT * FROM SubscriptionPlans WHERE plan_id = @planId`,
        { planId: { value: planId, type: sql.Int } }
      );
      if (result.recordset.length === 0) return null;
      return new SubscriptionPlan(result.recordset[0]);
    } catch (error) {
      logger.error('SubscriptionPlan.findById error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findAllAdmin — list all plans including inactive ones (admin use)
  // ------------------------------------------------------------------
  static async findAllAdmin() {
    try {
      const result = await executeQuery(
        `SELECT * FROM SubscriptionPlans ORDER BY is_active DESC, price_monthly ASC`
      );
      return result.recordset.map(r => new SubscriptionPlan(r));
    } catch (error) {
      logger.error('SubscriptionPlan.findAllAdmin error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // create — insert a new plan row
  // ------------------------------------------------------------------
  static async create(data, createdByUserId) {
    try {
      const features = Array.isArray(data.features)
        ? JSON.stringify(data.features)
        : (data.features || '[]');

      const result = await executeQuery(
        `INSERT INTO SubscriptionPlans
           (name, description, max_devices, price_monthly, price_yearly,
            grace_days, features, razorpay_plan_id_monthly, razorpay_plan_id_yearly,
            is_active, updated_by)
         OUTPUT INSERTED.plan_id
         VALUES (@name, @desc, @maxDev, @priceM, @priceY,
                 @grace, @features, @rzpM, @rzpY, 1, @updatedBy)`,
        {
          name:      { value: data.name,                                    type: sql.NVarChar },
          desc:      { value: data.description || '',                       type: sql.NVarChar },
          maxDev:    { value: data.max_devices ?? -1,                       type: sql.Int },
          priceM:    { value: parseFloat(data.price_monthly),               type: sql.Decimal(10, 2) },
          priceY:    { value: parseFloat(data.price_yearly),                type: sql.Decimal(10, 2) },
          grace:     { value: data.grace_days ?? 7,                         type: sql.Int },
          features:  { value: features,                                     type: sql.NVarChar(sql.MAX) },
          rzpM:      { value: data.razorpay_plan_id_monthly || null,        type: sql.NVarChar },
          rzpY:      { value: data.razorpay_plan_id_yearly  || null,        type: sql.NVarChar },
          updatedBy: { value: createdByUserId || null,                      type: sql.Int },
        }
      );
      const newId = result.recordset[0].plan_id;
      return await SubscriptionPlan.findById(newId);
    } catch (error) {
      logger.error('SubscriptionPlan.create error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // update — update all editable fields (admin)
  // ------------------------------------------------------------------
  static async update(planId, data, updatedByUserId) {
    try {
      const fields = [];
      const params = { planId: { value: planId, type: sql.Int } };

      if (data.name !== undefined) {
        fields.push('name = @name');
        params.name = { value: data.name, type: sql.NVarChar };
      }
      if (data.description !== undefined) {
        fields.push('description = @desc');
        params.desc = { value: data.description, type: sql.NVarChar };
      }
      if (data.max_devices !== undefined) {
        fields.push('max_devices = @maxDev');
        params.maxDev = { value: data.max_devices, type: sql.Int };
      }
      if (data.price_monthly !== undefined) {
        fields.push('price_monthly = @priceM');
        params.priceM = { value: parseFloat(data.price_monthly), type: sql.Decimal(10, 2) };
      }
      if (data.price_yearly !== undefined) {
        fields.push('price_yearly = @priceY');
        params.priceY = { value: parseFloat(data.price_yearly), type: sql.Decimal(10, 2) };
      }
      if (data.grace_days !== undefined) {
        fields.push('grace_days = @grace');
        params.grace = { value: data.grace_days, type: sql.Int };
      }
      if (data.features !== undefined) {
        const featuresStr = Array.isArray(data.features)
          ? JSON.stringify(data.features)
          : data.features;
        fields.push('features = @features');
        params.features = { value: featuresStr, type: sql.NVarChar(sql.MAX) };
      }
      if (data.razorpay_plan_id_monthly !== undefined) {
        fields.push('razorpay_plan_id_monthly = @rzpM');
        params.rzpM = { value: data.razorpay_plan_id_monthly, type: sql.NVarChar };
      }
      if (data.razorpay_plan_id_yearly !== undefined) {
        fields.push('razorpay_plan_id_yearly = @rzpY');
        params.rzpY = { value: data.razorpay_plan_id_yearly, type: sql.NVarChar };
      }
      if (data.is_active !== undefined) {
        fields.push('is_active = @isActive');
        params.isActive = { value: data.is_active ? 1 : 0, type: sql.Bit };
      }

      if (fields.length === 0) return await SubscriptionPlan.findById(planId);

      fields.push('updated_at = GETUTCDATE()');
      if (updatedByUserId) {
        fields.push('updated_by = @updatedBy');
        params.updatedBy = { value: updatedByUserId, type: sql.Int };
      }

      await executeQuery(
        `UPDATE SubscriptionPlans SET ${fields.join(', ')} WHERE plan_id = @planId`,
        params
      );
      return await SubscriptionPlan.findById(planId);
    } catch (error) {
      logger.error('SubscriptionPlan.update error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // deactivate — soft delete (is_active = 0)
  // ------------------------------------------------------------------
  static async deactivate(planId, adminUserId) {
    try {
      await executeQuery(
        `UPDATE SubscriptionPlans
         SET is_active = 0, updated_at = GETUTCDATE(), updated_by = @updatedBy
         WHERE plan_id = @planId`,
        {
          planId:    { value: planId,      type: sql.Int },
          updatedBy: { value: adminUserId, type: sql.Int },
        }
      );
      return await SubscriptionPlan.findById(planId);
    } catch (error) {
      logger.error('SubscriptionPlan.deactivate error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // hasActiveSubscriptions — check before hard delete
  // ------------------------------------------------------------------
  static async hasActiveSubscriptions(planId) {
    try {
      const result = await executeQuery(
        `SELECT COUNT(*) AS cnt
         FROM ClientSubscriptions
         WHERE plan_id = @planId AND status IN ('ACTIVE', 'GRACE', 'PENDING')`,
        { planId: { value: planId, type: sql.Int } }
      );
      return result.recordset[0].cnt > 0;
    } catch (error) {
      logger.error('SubscriptionPlan.hasActiveSubscriptions error:', error);
      throw error;
    }
  }
}
