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
  // update — update Razorpay plan IDs or pricing
  // ------------------------------------------------------------------
  static async update(planId, data) {
    try {
      const fields = [];
      const params = { planId: { value: planId, type: sql.Int } };

      if (data.razorpay_plan_id_monthly !== undefined) {
        fields.push('razorpay_plan_id_monthly = @rzpMonthly');
        params.rzpMonthly = { value: data.razorpay_plan_id_monthly, type: sql.NVarChar };
      }
      if (data.razorpay_plan_id_yearly !== undefined) {
        fields.push('razorpay_plan_id_yearly = @rzpYearly');
        params.rzpYearly = { value: data.razorpay_plan_id_yearly, type: sql.NVarChar };
      }
      if (data.is_active !== undefined) {
        fields.push('is_active = @isActive');
        params.isActive = { value: data.is_active ? 1 : 0, type: sql.Bit };
      }

      if (fields.length === 0) return await SubscriptionPlan.findById(planId);

      fields.push('updated_at = GETUTCDATE()');
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
}
