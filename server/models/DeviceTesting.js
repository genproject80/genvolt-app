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

      const dataQuery = `
        SELECT ${selectParts.join(', ')}
        FROM ${safeTable}
        ${whereClause}
        ORDER BY Entry_ID DESC
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
   * @param {string} tableName
   * @returns {Promise<Object>}
   */
  static async getTableStats(tableName) {
    try {
      const safeTable = DeviceTesting.#safeName(tableName);
      const query = `
        SELECT
          COUNT(*)                                          AS total_records,
          COUNT(DISTINCT Device_ID)                         AS unique_devices,
          MIN(${utcToIstSql('CreatedAt')})                  AS oldest_record,
          MAX(${utcToIstSql('CreatedAt')})                  AS latest_record
        FROM ${safeTable}
      `;
      const result = await executeQuery(query);
      return result.recordset[0];
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

      const query = `
        SELECT TOP ${maxRows} ${selectParts.join(', ')}
        FROM ${safeTable}
        ${whereClause}
        ORDER BY Entry_ID DESC
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
   * Returns one row per Device_ID with columns H00..H23 (IST hour counts).
   * @param {string}  tableName
   * @param {string}  [istDate]  - e.g. '2024-01-15'. If omitted, uses all data.
   * @returns {Promise<Object[]>}
   */
  static async getHourlyDashboard(tableName, istDate) {
    try {
      const safeTable = DeviceTesting.#safeName(tableName);

      const hours = Array.from({ length: 24 }, (_, i) => i);
      const pivotCols = hours.map((h) => `[${h}]`).join(', ');
      const pivotAlias = hours.map((h) => `ISNULL([${h}], 0) AS H${String(h).padStart(2, '0')}`).join(', ');

      let dateFilter = '';
      const params = {};
      if (istDate) {
        // Filter on the IST date (convert back to UTC for the WHERE clause)
        dateFilter = `AND CreatedAt >= DATEADD(MINUTE, -${IST_OFFSET}, CAST(@istDate + ' 00:00:00' AS DATETIME))
                      AND CreatedAt <  DATEADD(MINUTE, -${IST_OFFSET}, CAST(@istDate + ' 23:59:59' AS DATETIME))`;
        params.istDate = istDate;
      }

      const query = `
        WITH HourlyCounts AS (
          SELECT
            Device_ID,
            DATEPART(HOUR, DATEADD(MINUTE, ${IST_OFFSET}, CreatedAt)) AS hour_ist,
            COUNT(*) AS cnt
          FROM ${safeTable}
          WHERE Device_ID IS NOT NULL ${dateFilter}
          GROUP BY Device_ID, DATEPART(HOUR, DATEADD(MINUTE, ${IST_OFFSET}, CreatedAt))
        )
        SELECT Device_ID, ${pivotAlias}
        FROM HourlyCounts
        PIVOT (
          SUM(cnt) FOR hour_ist IN (${pivotCols})
        ) AS pvt
        ORDER BY Device_ID
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