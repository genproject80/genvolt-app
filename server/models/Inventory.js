import { executeQuery, sql } from '../config/database.js';
import { logger } from '../utils/logger.js';

export class Inventory {
  constructor(data) {
    this.model_number      = data.model_number;
    this.display_name      = data.display_name;
    this.device_id_prefix  = data.device_id_prefix;
    this.decoder_logic_ids = data.decoder_logic_ids;  // stored as JSON string e.g. '[1,3]'
    this.description       = data.description;
    this.is_active         = data.is_active;
    this.created_at        = data.created_at;
    this.updated_at        = data.updated_at;
  }

  // Returns decoder_logic_ids as a parsed number array
  get decoderLogicIdsArray() {
    try {
      return JSON.parse(this.decoder_logic_ids || '[]');
    } catch {
      return [];
    }
  }

  toJSON() {
    return {
      model_number:      this.model_number,
      display_name:      this.display_name,
      device_id_prefix:  this.device_id_prefix,
      decoder_logic_ids: this.decoderLogicIdsArray,
      description:       this.description,
      is_active:         Boolean(this.is_active),
      created_at:        this.created_at,
      updated_at:        this.updated_at,
    };
  }

  // ------------------------------------------------------------------
  // findAll — all entries including inactive (admin view)
  // ------------------------------------------------------------------
  static async findAll() {
    try {
      const result = await executeQuery(
        `SELECT * FROM dbo.inventory ORDER BY is_active DESC, model_number ASC`
      );
      return result.recordset.map(r => new Inventory(r));
    } catch (error) {
      logger.error('Inventory.findAll error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findAllActive — only active entries (for dropdowns)
  // ------------------------------------------------------------------
  static async findAllActive() {
    try {
      const result = await executeQuery(
        `SELECT * FROM dbo.inventory WHERE is_active = 1 ORDER BY model_number ASC`
      );
      return result.recordset.map(r => new Inventory(r));
    } catch (error) {
      logger.error('Inventory.findAllActive error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // findByModelNumber — single entry lookup
  // ------------------------------------------------------------------
  static async findByModelNumber(modelNumber) {
    try {
      const result = await executeQuery(
        `SELECT * FROM dbo.inventory WHERE model_number = @modelNumber`,
        { modelNumber: { value: modelNumber, type: sql.NVarChar(50) } }
      );
      if (result.recordset.length === 0) return null;
      return new Inventory(result.recordset[0]);
    } catch (error) {
      logger.error('Inventory.findByModelNumber error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // create — insert a new inventory entry
  // ------------------------------------------------------------------
  static async create(data) {
    try {
      const logicIds = Array.isArray(data.decoder_logic_ids)
        ? JSON.stringify(data.decoder_logic_ids)
        : (data.decoder_logic_ids || '[]');

      await executeQuery(
        `INSERT INTO dbo.inventory
           (model_number, display_name, device_id_prefix, decoder_logic_ids, description, is_active)
         VALUES
           (@modelNumber, @displayName, @prefix, @logicIds, @description, 1)`,
        {
          modelNumber:  { value: data.model_number,                   type: sql.NVarChar(50) },
          displayName:  { value: data.display_name,                   type: sql.NVarChar(100) },
          prefix:       { value: data.device_id_prefix,               type: sql.NVarChar(20) },
          logicIds:     { value: logicIds,                            type: sql.NVarChar(200) },
          description:  { value: data.description || null,            type: sql.NVarChar(500) },
        }
      );
      return await Inventory.findByModelNumber(data.model_number);
    } catch (error) {
      logger.error('Inventory.create error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // update — update editable fields
  // ------------------------------------------------------------------
  static async update(modelNumber, data) {
    try {
      const fields = [];
      const params = { modelNumber: { value: modelNumber, type: sql.NVarChar(50) } };

      if (data.display_name !== undefined) {
        fields.push('display_name = @displayName');
        params.displayName = { value: data.display_name, type: sql.NVarChar(100) };
      }
      if (data.device_id_prefix !== undefined) {
        fields.push('device_id_prefix = @prefix');
        params.prefix = { value: data.device_id_prefix, type: sql.NVarChar(20) };
      }
      if (data.decoder_logic_ids !== undefined) {
        const ids = Array.isArray(data.decoder_logic_ids)
          ? JSON.stringify(data.decoder_logic_ids)
          : data.decoder_logic_ids;
        fields.push('decoder_logic_ids = @logicIds');
        params.logicIds = { value: ids, type: sql.NVarChar(200) };
      }
      if (data.description !== undefined) {
        fields.push('description = @description');
        params.description = { value: data.description || null, type: sql.NVarChar(500) };
      }
      if (data.is_active !== undefined) {
        fields.push('is_active = @isActive');
        params.isActive = { value: data.is_active ? 1 : 0, type: sql.Bit };
      }

      if (fields.length === 0) return await Inventory.findByModelNumber(modelNumber);

      fields.push('updated_at = GETUTCDATE()');

      await executeQuery(
        `UPDATE dbo.inventory SET ${fields.join(', ')} WHERE model_number = @modelNumber`,
        params
      );
      return await Inventory.findByModelNumber(modelNumber);
    } catch (error) {
      logger.error('Inventory.update error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // deactivate — soft delete (is_active = 0)
  // ------------------------------------------------------------------
  static async deactivate(modelNumber) {
    try {
      await executeQuery(
        `UPDATE dbo.inventory
         SET is_active = 0, updated_at = GETUTCDATE()
         WHERE model_number = @modelNumber`,
        { modelNumber: { value: modelNumber, type: sql.NVarChar(50) } }
      );
      return await Inventory.findByModelNumber(modelNumber);
    } catch (error) {
      logger.error('Inventory.deactivate error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // hasDevices — check whether any devices reference this model
  // ------------------------------------------------------------------
  static async hasDevices(modelNumber) {
    try {
      const result = await executeQuery(
        `SELECT COUNT(*) AS cnt FROM dbo.device WHERE model_number = @modelNumber`,
        { modelNumber: { value: modelNumber, type: sql.NVarChar(50) } }
      );
      return result.recordset[0].cnt > 0;
    } catch (error) {
      logger.error('Inventory.hasDevices error:', error);
      throw error;
    }
  }
}
