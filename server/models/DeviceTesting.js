import { executeQuery } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { utcToIstSql } from '../utils/timezoneConverter.js';

const IST_OFFSET = 330; // minutes

/**
 * DeviceTesting Model - Dynamic data queries for IoT tables
 */
export class DeviceTesting {
  /**
   * Validate that a table/column name contains only safe characters.
   * Prevents SQL injection via dynamic identifiers.
   */
  static #safeName(name) {
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error(`Invalid identifier: "${name}"`);
    }
    return name;
  }

  /**
   * Fetch paginated rows from any configured IoT table.
   * @param {string}   tableName     - Actual DB table name
   * @param {Object[]} columns       - Column definitions from TableConfig
   * @param {Object}   options
   * @param {number}   options.page
   * @param {number}   options.limit
   * @param {string}   [options.search]
   * @returns {Promise<{rows: Object[], total: number}>}
   */
  static async getTableData(tableName, columns, { page = 1, limit = 100, search } = {}) {
    try {
      const safeTable = DeviceTesting.#safeName(tableName);
      const offset = (page - 1) * limit;

      // Build SELECT list – convert UTC datetime columns to IST
      const selectParts = columns.map((col) => {
        const safeField = DeviceTesting.#safeName(col.field);
        if (col.format === 'utc_to_ist' && col.type === 'datetime') {
          return `${utcToIstSql(safeField)} AS ${safeField}`;
        }
        return safeField;
      });

      // Searchable columns
      const searchableFields = columns
        .filter((c) => c.searchable)
        .map((c) => DeviceTesting.#safeName(c.field));

      const params = {};
      let whereClause = '';
      if (search && searchableFields.length > 0) {
        const conditions = searchableFields
          .map((f, i) => {
            params[`search${i}`] = `%${search}%`;
            return `CAST(${f} AS NVARCHAR(MAX)) LIKE @search${i}`;
          })
          .join(' OR ');
        whereClause = `WHERE ${conditions}`;
      }

      const countQuery = `SELECT COUNT(*) AS total FROM ${safeTable} ${whereClause}`;
      const countResult = await executeQuery(countQuery, params);
      const total = countResult.recordset[0].total;

      const sortCol = DeviceTesting.#safeName(columns[0].field);
      const dataQuery = `
        SELECT ${selectParts.join(', ')}
        FROM ${safeTable}
        ${whereClause}
        ORDER BY ${sortCol} DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY
      `;
      const dataResult = await executeQuery(dataQuery, params);

      return { rows: dataResult.recordset, total };
    } catch (error) {
      logger.error('DeviceTesting.getTableData error:', error);
      throw error;
    }
  }

  /**
   * Fetch statistics for a table.
   * @param {string}   tableName
   * @param {Object[]} columns - Column definitions from TableConfig
   * @returns {Promise<Object>}
   */
  static async getTableStats(tableName, columns = []) {
    try {
      const safeTable = DeviceTesting.#safeName(tableName);

      // Derive datetime and device columns from config; fall back gracefully
      const datetimeCol = columns.find((c) => c.type === 'datetime');
      const deviceCol   = columns.find((c) => /device/i.test(c.field));

      const timestampSelect = datetimeCol
        ? `MIN(${utcToIstSql(DeviceTesting.#safeName(datetimeCol.field))}) AS oldest_record,
           MAX(${utcToIstSql(DeviceTesting.#safeName(datetimeCol.field))}) AS latest_record,`
        : `NULL AS oldest_record, NULL AS latest_record,`;

      const deviceSelect = deviceCol
        ? `COUNT(DISTINCT ${DeviceTesting.#safeName(deviceCol.field)}) AS unique_devices,`
        : `NULL AS unique_devices,`;

      const query = `
        SELECT
          COUNT(*) AS total_records,
          ${deviceSelect}
          ${timestampSelect}
          1 AS _placeholder
        FROM ${safeTable}
      `;
      const result = await executeQuery(query);
      const row = result.recordset[0];
      // Remove the placeholder helper column
      const { _placeholder, ...stats } = row;
      return stats;
    } catch (error) {
      logger.error('DeviceTesting.getTableStats error:', error);
      throw error;
    }
  }

  /**
   * Fetch up to maxRows rows for CSV export, optionally filtered by search.
   */
  static async getExportData(tableName, columns, { search, maxRows = 10000 } = {}) {
    try {
      const safeTable = DeviceTesting.#safeName(tableName);

      const selectParts = columns.map((col) => {
        const safeField = DeviceTesting.#safeName(col.field);
        if (col.format === 'utc_to_ist' && col.type === 'datetime') {
          return `${utcToIstSql(safeField)} AS ${safeField}`;
        }
        return safeField;
      });

      const searchableFields = columns
        .filter((c) => c.searchable)
        .map((c) => DeviceTesting.#safeName(c.field));

      const params = {};
      let whereClause = '';
      if (search && searchableFields.length > 0) {
        const conditions = searchableFields
          .map((f, i) => {
            params[`search${i}`] = `%${search}%`;
            return `CAST(${f} AS NVARCHAR(MAX)) LIKE @search${i}`;
          })
          .join(' OR ');
        whereClause = `WHERE ${conditions}`;
      }

      const sortCol = DeviceTesting.#safeName(columns[0].field);
      const query = `
        SELECT TOP ${maxRows} ${selectParts.join(', ')}
        FROM ${safeTable}
        ${whereClause}
        ORDER BY ${sortCol} DESC
      `;
      const result = await executeQuery(query, params);
      return result.recordset;
    } catch (error) {
      logger.error('DeviceTesting.getExportData error:', error);
      throw error;
    }
  }

  /**
   * Hourly heatmap via SQL PIVOT.
   * Returns one row per device column with columns H00..H23 (IST hour counts).
   * @param {string}   tableName
   * @param {string}   [istDate]  - e.g. '2024-01-15'. If omitted, uses all data.
   * @param {Object[]} [columns]  - Column definitions from TableConfig
   * @returns {Promise<Object[]>}
   */
  static async getHourlyDashboard(tableName, istDate, columns = []) {
    try {
      const safeTable = DeviceTesting.#safeName(tableName);

      const datetimeCol = columns.find((c) => c.type === 'datetime');
      const deviceCol   = columns.find((c) => /device/i.test(c.field));

      if (!datetimeCol) throw new Error(`No datetime column found in config for table "${tableName}"`);
      if (!deviceCol)   throw new Error(`No device column found in config for table "${tableName}"`);

      const tsField     = DeviceTesting.#safeName(datetimeCol.field);
      const deviceField = DeviceTesting.#safeName(deviceCol.field);

      const hours = Array.from({ length: 24 }, (_, i) => i);
      const pivotCols  = hours.map((h) => `[${h}]`).join(', ');
      const pivotAlias = hours.map((h) => `ISNULL([${h}], 0) AS H${String(h).padStart(2, '0')}`).join(', ');

      let dateFilter = '';
      const params = {};
      if (istDate) {
        dateFilter = `AND ${tsField} >= DATEADD(MINUTE, -${IST_OFFSET}, CAST(@istDate + ' 00:00:00' AS DATETIME))
                      AND ${tsField} <  DATEADD(MINUTE, -${IST_OFFSET}, CAST(@istDate + ' 23:59:59' AS DATETIME))`;
        params.istDate = istDate;
      }

      const query = `
        WITH HourlyCounts AS (
          SELECT
            ${deviceField},
            DATEPART(HOUR, DATEADD(MINUTE, ${IST_OFFSET}, ${tsField})) AS hour_ist,
            COUNT(*) AS cnt
          FROM ${safeTable}
          WHERE ${deviceField} IS NOT NULL ${dateFilter}
          GROUP BY ${deviceField}, DATEPART(HOUR, DATEADD(MINUTE, ${IST_OFFSET}, ${tsField}))
        )
        SELECT ${deviceField} AS device_id, ${pivotAlias}
        FROM HourlyCounts
        PIVOT (
          SUM(cnt) FOR hour_ist IN (${pivotCols})
        ) AS pvt
        ORDER BY ${deviceField}
      `;
      const result = await executeQuery(query, params);
      return result.recordset;
    } catch (error) {
      logger.error('DeviceTesting.getHourlyDashboard error:', error);
      throw error;
    }
  }
}

export default DeviceTesting;