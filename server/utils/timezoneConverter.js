/**
 * Timezone conversion utilities for UTC to IST
 * IST = UTC + 5:30 (330 minutes)
 */

const IST_OFFSET_MINUTES = 330;

/**
 * Returns the SQL expression to convert a UTC datetime column to IST
 * @param {string} columnName - Column name (e.g. 'CreatedAt')
 * @returns {string} SQL expression string
 */
export const utcToIstSql = (columnName) =>
  `DATEADD(MINUTE, ${IST_OFFSET_MINUTES}, ${columnName})`;

/**
 * Convert a JS Date (or ISO string) from UTC to IST
 * @param {Date|string} utcDate
 * @returns {string} IST datetime string
 */
export const utcToIst = (utcDate) => {
  if (!utcDate) return null;
  const d = new Date(utcDate);
  d.setMinutes(d.getMinutes() + IST_OFFSET_MINUTES);
  return d.toISOString().replace('T', ' ').substring(0, 19);
};

/**
 * Get the SQL WHERE clause fragment for filtering by an IST date.
 * Converts the given IST date boundaries back to UTC for comparison against
 * a UTC-stored column.
 * @param {string} columnName - e.g. 'CreatedAt'
 * @param {string} istDate    - e.g. '2024-01-15'
 * @returns {string} SQL condition string (no leading AND)
 */
export const istDateFilterSql = (columnName, istDate) => {
  // IST midnight → UTC start = IST date 00:00 - 330 min = previous day 18:30 UTC
  // IST midnight end → UTC end  = IST date 24:00 - 330 min = current  day 18:30 UTC
  return `${columnName} >= DATEADD(MINUTE, -${IST_OFFSET_MINUTES}, CAST('${istDate} 00:00:00' AS DATETIME))
      AND ${columnName} <  DATEADD(MINUTE, -${IST_OFFSET_MINUTES}, CAST('${istDate} 23:59:59' AS DATETIME))`;
};

export default { utcToIstSql, utcToIst, istDateFilterSql };