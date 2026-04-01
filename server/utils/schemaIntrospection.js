import { executeQuery } from '../config/database.js';
import { logger } from './logger.js';

/**
 * Retrieve column definitions for a given SQL Server table via INFORMATION_SCHEMA.
 * @param {string} tableName - The database table name (no schema prefix)
 * @returns {Promise<Object[]>} Array of column descriptors
 */
export const getTableColumns = async (tableName) => {
  try {
    const query = `
      SELECT
        COLUMN_NAME        AS column_name,
        DATA_TYPE          AS data_type,
        IS_NULLABLE        AS is_nullable,
        CHARACTER_MAXIMUM_LENGTH AS max_length,
        ORDINAL_POSITION   AS ordinal_position
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
      ORDER BY ORDINAL_POSITION
    `;
    const result = await executeQuery(query, { tableName });
    return result.recordset;
  } catch (error) {
    logger.error('schemaIntrospection.getTableColumns error:', error);
    throw error;
  }
};

/**
 * Check whether a table exists in the database.
 * @param {string} tableName
 * @returns {Promise<boolean>}
 */
export const tableExists = async (tableName) => {
  try {
    const query = `
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = @tableName
    `;
    const result = await executeQuery(query, { tableName });
    return result.recordset[0].cnt > 0;
  } catch (error) {
    logger.error('schemaIntrospection.tableExists error:', error);
    throw error;
  }
};

/**
 * Map SQL Server data types to our simplified column types.
 * @param {string} sqlType
 * @returns {string}
 */
export const mapSqlType = (sqlType) => {
  const type = sqlType.toLowerCase();
  if (['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'real', 'money'].includes(type)) {
    return 'number';
  }
  if (['datetime', 'datetime2', 'smalldatetime', 'date', 'time', 'datetimeoffset'].includes(type)) {
    return 'datetime';
  }
  if (['bit'].includes(type)) {
    return 'boolean';
  }
  if (['nvarchar', 'ntext', 'nchar'].includes(type) && sqlType.toLowerCase() !== 'nvarchar(max)') {
    return 'string';
  }
  // Large text/json fields
  if (type === 'nvarchar' || type === 'text' || type === 'ntext') {
    return 'json';
  }
  return 'string';
};

export default { getTableColumns, tableExists, mapSqlType };