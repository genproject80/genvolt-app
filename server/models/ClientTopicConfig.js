import { executeQuery, sql } from '../config/database.js';
import { logger } from '../utils/logger.js';

const DEFAULTS = {
  topic_prefix:     'cloudsynk',
  telemetry_suffix: 'telemetry',
  config_suffix:    'config',
  device_type_overrides: null,
};

export class ClientTopicConfig {
  constructor(data) {
    this.config_id              = data.config_id;
    this.client_id              = data.client_id;
    this.topic_prefix           = data.topic_prefix           ?? DEFAULTS.topic_prefix;
    this.telemetry_suffix       = data.telemetry_suffix       ?? DEFAULTS.telemetry_suffix;
    this.config_suffix          = data.config_suffix          ?? DEFAULTS.config_suffix;
    this.device_type_overrides  = data.device_type_overrides  ?? null;
    this.created_by             = data.created_by;
    this.created_at             = data.created_at;
    this.updated_at             = data.updated_at;
    this.updated_by             = data.updated_by;
    // joined
    this.client_name            = data.client_name;
  }

  toJSON() {
    return {
      config_id:             this.config_id,
      client_id:             this.client_id,
      client_name:           this.client_name,
      topic_prefix:          this.topic_prefix,
      telemetry_suffix:      this.telemetry_suffix,
      config_suffix:         this.config_suffix,
      device_type_overrides: this.device_type_overrides
        ? (typeof this.device_type_overrides === 'string'
            ? JSON.parse(this.device_type_overrides)
            : this.device_type_overrides)
        : {},
      created_at: this.created_at,
      updated_at: this.updated_at,
      is_default: !this.config_id,
    };
  }

  // ------------------------------------------------------------------
  // getDefault — returns a virtual default object (no DB row)
  // ------------------------------------------------------------------
  static getDefault(clientId) {
    return new ClientTopicConfig({ ...DEFAULTS, client_id: clientId });
  }

  // ------------------------------------------------------------------
  // findByClientId — returns config or null (caller uses getDefault)
  // ------------------------------------------------------------------
  static async findByClientId(clientId) {
    try {
      const result = await executeQuery(
        `SELECT tc.*, c.name AS client_name
         FROM ClientTopicConfig tc
         JOIN client c ON tc.client_id = c.client_id
         WHERE tc.client_id = @clientId`,
        { clientId: { value: clientId, type: sql.Int } }
      );
      if (result.recordset.length === 0) return null;
      return new ClientTopicConfig(result.recordset[0]);
    } catch (error) {
      logger.error('ClientTopicConfig.findByClientId error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // getAll — all configured clients (admin view)
  // ------------------------------------------------------------------
  static async getAll() {
    try {
      const result = await executeQuery(
        `SELECT tc.*, c.name AS client_name
         FROM ClientTopicConfig tc
         JOIN client c ON tc.client_id = c.client_id
         ORDER BY c.name ASC`
      );
      return result.recordset.map(r => new ClientTopicConfig(r));
    } catch (error) {
      logger.error('ClientTopicConfig.getAll error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // upsert — create or update config for a client
  // ------------------------------------------------------------------
  static async upsert(clientId, data, adminUserId) {
    try {
      const overrides = data.device_type_overrides
        ? (typeof data.device_type_overrides === 'object'
            ? JSON.stringify(data.device_type_overrides)
            : data.device_type_overrides)
        : null;

      const existing = await ClientTopicConfig.findByClientId(clientId);

      if (existing) {
        await executeQuery(
          `UPDATE ClientTopicConfig
           SET topic_prefix = @prefix, telemetry_suffix = @telSuffix,
               config_suffix = @cfgSuffix, device_type_overrides = @overrides,
               updated_at = GETUTCDATE(), updated_by = @updatedBy
           WHERE client_id = @clientId`,
          {
            clientId:   { value: clientId,                          type: sql.Int },
            prefix:     { value: data.topic_prefix,                 type: sql.NVarChar },
            telSuffix:  { value: data.telemetry_suffix,             type: sql.NVarChar },
            cfgSuffix:  { value: data.config_suffix,                type: sql.NVarChar },
            overrides:  { value: overrides,                         type: sql.NVarChar(sql.MAX) },
            updatedBy:  { value: adminUserId,                       type: sql.Int },
          }
        );
      } else {
        await executeQuery(
          `INSERT INTO ClientTopicConfig
             (client_id, topic_prefix, telemetry_suffix, config_suffix,
              device_type_overrides, created_by, updated_by)
           VALUES (@clientId, @prefix, @telSuffix, @cfgSuffix, @overrides, @createdBy, @createdBy)`,
          {
            clientId:  { value: clientId,            type: sql.Int },
            prefix:    { value: data.topic_prefix,   type: sql.NVarChar },
            telSuffix: { value: data.telemetry_suffix, type: sql.NVarChar },
            cfgSuffix: { value: data.config_suffix,  type: sql.NVarChar },
            overrides: { value: overrides,            type: sql.NVarChar(sql.MAX) },
            createdBy: { value: adminUserId,          type: sql.Int },
          }
        );
      }

      return await ClientTopicConfig.findByClientId(clientId);
    } catch (error) {
      logger.error('ClientTopicConfig.upsert error:', error);
      throw error;
    }
  }

  // ------------------------------------------------------------------
  // deleteByClientId — reset to defaults
  // ------------------------------------------------------------------
  static async deleteByClientId(clientId) {
    try {
      await executeQuery(
        `DELETE FROM ClientTopicConfig WHERE client_id = @clientId`,
        { clientId: { value: clientId, type: sql.Int } }
      );
    } catch (error) {
      logger.error('ClientTopicConfig.deleteByClientId error:', error);
      throw error;
    }
  }
}
