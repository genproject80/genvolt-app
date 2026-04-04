import { executeQuery, sql } from '../config/database.js';
import { logger } from '../utils/logger.js';

export class FeatureFlag {
  constructor(data) {
    this.flag_id      = data.flag_id;
    this.flag_name    = data.flag_name;
    this.display_name = data.display_name;
    this.description  = data.description;
    this.is_enabled   = data.is_enabled;
    this.updated_at   = data.updated_at;
    this.updated_by   = data.updated_by;
  }

  toJSON() {
    return {
      flag_id:      this.flag_id,
      flag_name:    this.flag_name,
      display_name: this.display_name,
      description:  this.description,
      is_enabled:   !!this.is_enabled,
      updated_at:   this.updated_at,
    };
  }

  // ------------------------------------------------------------------
  // findAll — list all flags
  // ------------------------------------------------------------------
  static async findAll() {
    try {
      const result = await executeQuery(
        `SELECT * FROM FeatureFlags ORDER BY flag_name ASC`
      );
      return result.recordset.map(r => new FeatureFlag(r));
    } catch (error) {
      logger.error('FeatureFlag.findAll error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findByName — fetch a single flag by its string key
  // ------------------------------------------------------------------
  static async findByName(flagName) {
    try {
      const result = await executeQuery(
        `SELECT * FROM FeatureFlags WHERE flag_name = @flagName`,
        { flagName: { value: flagName, type: sql.NVarChar } }
      );
      if (result.recordset.length === 0) return null;
      return new FeatureFlag(result.recordset[0]);
    } catch (error) {
      logger.error('FeatureFlag.findByName error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findById
  // ------------------------------------------------------------------
  static async findById(flagId) {
    try {
      const result = await executeQuery(
        `SELECT * FROM FeatureFlags WHERE flag_id = @flagId`,
        { flagId: { value: flagId, type: sql.Int } }
      );
      if (result.recordset.length === 0) return null;
      return new FeatureFlag(result.recordset[0]);
    } catch (error) {
      logger.error('FeatureFlag.findById error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // update — toggle is_enabled for an existing flag
  // ------------------------------------------------------------------
  static async update(flagId, isEnabled, updatedByUserId) {
    try {
      await executeQuery(
        `UPDATE FeatureFlags
         SET is_enabled = @isEnabled, updated_at = GETUTCDATE(), updated_by = @updatedBy
         WHERE flag_id = @flagId`,
        {
          flagId:    { value: flagId,              type: sql.Int  },
          isEnabled: { value: isEnabled ? 1 : 0,   type: sql.Bit  },
          updatedBy: { value: updatedByUserId || null, type: sql.Int },
        }
      );
      return await FeatureFlag.findById(flagId);
    } catch (error) {
      logger.error('FeatureFlag.update error:', error);
      throw error;
    }
  }
}
