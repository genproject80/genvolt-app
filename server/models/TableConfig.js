import { executeQuery } from '../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * TableConfig Model - Manages DeviceTesting_TableConfig table
 */
export class TableConfig {
  constructor(data) {
    this.config_id = data.config_id;
    this.table_key = data.table_key;
    this.table_name = data.table_name;
    this.display_name = data.display_name;
    this.is_active = data.is_active;
    this.icon_name = data.icon_name;
    this.is_exportable = data.is_exportable;
    this.sort_order = data.sort_order;
    this.column_config = typeof data.column_config === 'string'
      ? JSON.parse(data.column_config)
      : (data.column_config || []);
    this.created_at = data.created_at;
    this.created_by = data.created_by;
    this.updated_at = data.updated_at;
    this.updated_by = data.updated_by;
  }

  /**
   * Get all active table configurations ordered by sort_order
   */
  static async getAllActive() {
    try {
      const result = await executeQuery(`
        SELECT * FROM DeviceTesting_TableConfig
        WHERE is_active = 1
        ORDER BY sort_order ASC, display_name ASC
      `);
      return result.recordset.map((r) => new TableConfig(r));
    } catch (error) {
      logger.error('TableConfig.getAllActive error:', error);
      throw error;
    }
  }

  /**
   * Get all configurations (active + inactive) for admin UI
   */
  static async getAll() {
    try {
      const result = await executeQuery(`
        SELECT * FROM DeviceTesting_TableConfig
        ORDER BY sort_order ASC, display_name ASC
      `);
      return result.recordset.map((r) => new TableConfig(r));
    } catch (error) {
      logger.error('TableConfig.getAll error:', error);
      throw error;
    }
  }

  /**
   * Get a single configuration by config_id
   */
  static async getById(configId) {
    try {
      const result = await executeQuery(
        'SELECT * FROM DeviceTesting_TableConfig WHERE config_id = @configId',
        { configId }
      );
      if (!result.recordset.length) return null;
      return new TableConfig(result.recordset[0]);
    } catch (error) {
      logger.error('TableConfig.getById error:', error);
      throw error;
    }
  }

  /**
   * Get a single configuration by table_key
   */
  static async getByKey(tableKey) {
    try {
      const result = await executeQuery(
        'SELECT * FROM DeviceTesting_TableConfig WHERE table_key = @tableKey',
        { tableKey }
      );
      if (!result.recordset.length) return null;
      return new TableConfig(result.recordset[0]);
    } catch (error) {
      logger.error('TableConfig.getByKey error:', error);
      throw error;
    }
  }

  /**
   * Create a new table configuration
   */
  static async create({ table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config, created_by }) {
    try {
      const columnConfigJson = JSON.stringify(column_config || []);
      const result = await executeQuery(`
        INSERT INTO DeviceTesting_TableConfig
          (table_key, table_name, display_name, icon_name, is_exportable, sort_order, column_config, created_at, created_by)
        OUTPUT INSERTED.*
        VALUES
          (@table_key, @table_name, @display_name, @icon_name, @is_exportable, @sort_order, @column_config, GETDATE(), @created_by)
      `, {
        table_key,
        table_name,
        display_name,
        icon_name: icon_name || 'DocumentTextIcon',
        is_exportable: is_exportable !== false ? 1 : 0,
        sort_order: sort_order || 0,
        column_config: columnConfigJson,
        created_by: created_by || null
      });
      return new TableConfig(result.recordset[0]);
    } catch (error) {
      logger.error('TableConfig.create error:', error);
      throw error;
    }
  }

  /**
   * Update an existing table configuration
   */
  static async update(configId, { table_name, display_name, icon_name, is_exportable, sort_order, column_config, updated_by }) {
    try {
      const columnConfigJson = JSON.stringify(column_config || []);
      const result = await executeQuery(`
        UPDATE DeviceTesting_TableConfig
        SET
          table_name    = @table_name,
          display_name  = @display_name,
          icon_name     = @icon_name,
          is_exportable = @is_exportable,
          sort_order    = @sort_order,
          column_config = @column_config,
          updated_at    = GETDATE(),
          updated_by    = @updated_by
        OUTPUT INSERTED.*
        WHERE config_id = @configId
      `, {
        configId,
        table_name,
        display_name,
        icon_name: icon_name || 'DocumentTextIcon',
        is_exportable: is_exportable !== false ? 1 : 0,
        sort_order: sort_order || 0,
        column_config: columnConfigJson,
        updated_by: updated_by || null
      });
      if (!result.recordset.length) return null;
      return new TableConfig(result.recordset[0]);
    } catch (error) {
      logger.error('TableConfig.update error:', error);
      throw error;
    }
  }

  /**
   * Delete a configuration by config_id
   */
  static async delete(configId) {
    try {
      const result = await executeQuery(
        'DELETE FROM DeviceTesting_TableConfig OUTPUT DELETED.config_id WHERE config_id = @configId',
        { configId }
      );
      return result.recordset.length > 0;
    } catch (error) {
      logger.error('TableConfig.delete error:', error);
      throw error;
    }
  }

  /**
   * Toggle the is_active flag for a configuration
   */
  static async toggleActive(configId, updatedBy) {
    try {
      const result = await executeQuery(`
        UPDATE DeviceTesting_TableConfig
        SET
          is_active  = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
          updated_at = GETDATE(),
          updated_by = @updatedBy
        OUTPUT INSERTED.*
        WHERE config_id = @configId
      `, { configId, updatedBy: updatedBy || null });
      if (!result.recordset.length) return null;
      return new TableConfig(result.recordset[0]);
    } catch (error) {
      logger.error('TableConfig.toggleActive error:', error);
      throw error;
    }
  }
}

export default TableConfig;