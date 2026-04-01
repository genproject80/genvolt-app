/**
 * CSV export utility
 * Converts an array of objects to a properly-escaped CSV string.
 */

/**
 * Escape a single cell value for CSV
 * @param {*} value
 * @returns {string}
 */
const escapeCell = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Wrap in quotes if the value contains a comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Convert an array of row objects to a CSV string.
 * @param {Object[]} rows    - Array of data rows
 * @param {Object[]} columns - Column definitions: [{field, header}]
 * @returns {string} CSV content
 */
export const toCsv = (rows, columns) => {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.field])).join(',')
  );
  return [header, ...lines].join('\r\n');
};

/**
 * Send a CSV file response.
 * @param {Object} res        - Express response object
 * @param {string} csvContent - CSV string
 * @param {string} filename   - Filename without extension
 */
export const sendCsvResponse = (res, csvContent, filename) => {
  const sanitizedName = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizedName}.csv"`);
  res.send('\uFEFF' + csvContent); // BOM for Excel UTF-8 compatibility
};

export default { toCsv, sendCsvResponse };