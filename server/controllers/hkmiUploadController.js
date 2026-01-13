import sql from 'mssql';
import { getPool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { asyncHandler, ValidationError } from '../middleware/errorHandler.js';
import { createAuditLog } from '../utils/auditLogger.js';
import xlsx from 'xlsx';

/**
 * Process and validate HKMI upload data
 * POST /api/hkmi-table/upload
 */
export const uploadHKMIData = asyncHandler(async (req, res) => {
  const user = req.user;

  // Check if file was uploaded
  if (!req.file) {
    throw new ValidationError('No file uploaded');
  }

  const file = req.file;

  // Validate file type
  const allowedMimeTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  const allowedExtensions = ['.csv', '.xls', '.xlsx'];
  const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

  if (!allowedMimeTypes.includes(file.mimetype) && !allowedExtensions.includes(fileExtension)) {
    throw new ValidationError('Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.');
  }

  try {
    const pool = await getPool();

    // Parse the file
    let workbook;
    if (fileExtension === '.csv') {
      const csvData = file.buffer.toString('utf-8');
      workbook = xlsx.read(csvData, { type: 'string' });
    } else {
      workbook = xlsx.read(file.buffer, { type: 'buffer' });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Read all rows to find the actual header row
    let allRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: null });

    if (allRows.length === 0) {
      throw new ValidationError('The uploaded file is empty');
    }

    // Find the header row (look for row containing "Controller ID" or "HKM Code")
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const row = allRows[i];
      const rowString = JSON.stringify(row).toLowerCase();
      if ((rowString.includes('controller') && rowString.includes('id')) || rowString.includes('hkm code')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new ValidationError('Could not find header row with "Controller ID" or "HKM Code" columns');
    }

    // Extract headers and data
    const headers = allRows[headerRowIndex];
    const dataRows = allRows.slice(headerRowIndex + 1);

    // Convert to JSON format
    let data = dataRows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header) {
          obj[header] = row[index];
        }
      });
      return obj;
    }).filter(row => {
      // Filter out completely empty rows
      return Object.values(row).some(val => val !== null && val !== undefined && val !== '');
    });

    if (data.length === 0) {
      throw new ValidationError('The uploaded file contains no data rows');
    }

    // Define column mapping from Excel headers to database columns
    const columnMapping = {
      'Controller ID': 'device_id',
      'HKM Code': 'machine_id',
      'Division/Railway': 'div_rly',
      'Section': 'section',
      'Curve Number': 'curve_number',
      'Line': 'line',
      'DEN': 'den',
      'AEN': 'aen',
      'SSE': 'sse',
      'Last Service Date': 'last_service_date',
      'Remaining Grease (kg)': 'grease_left',
      'Last CoF Date': 'last_cof_date',
      'Last CoF Value': 'last_cof_value'
    };

    // Validate required columns from Excel
    const requiredExcelColumns = ['Controller ID', 'HKM Code', 'Remaining Grease (kg)', 'Last Service Date'];
    const firstRow = data[0];
    const fileColumns = Object.keys(firstRow);

    const missingColumns = requiredExcelColumns.filter(col => !fileColumns.includes(col));

    if (missingColumns.length > 0) {
      throw new ValidationError(`Missing required columns: ${missingColumns.join(', ')}. The file must have these column headers: ${requiredExcelColumns.join(', ')}`);
    }

    // Map Excel data to database column names
    data = data.map(row => {
      const mappedRow = {};
      Object.keys(row).forEach(excelColumn => {
        const dbColumn = columnMapping[excelColumn];
        if (dbColumn) {
          mappedRow[dbColumn] = row[excelColumn];
        }
      });
      // Add hardcoded SDEN value
      mappedRow['sden'] = 'SDEN CO';
      return mappedRow;
    });

    // Process each row
    const successfulRows = [];
    const rejectedRows = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = headerRowIndex + i + 2; // Account for header row location and Excel starting at 1
      const rejectionReasons = [];

      // Extract values using exact column names
      let deviceId = row.device_id ? String(row.device_id).trim() : null;

      // Format device_id: Add "HK" prefix and pad with zeros to make length 7
      // Example: "1" -> "HK00001", "26" -> "HK00026"
      if (deviceId && deviceId !== '') {
        // Remove any existing HK prefix if present
        deviceId = deviceId.replace(/^HK/i, '');
        // Parse as integer to remove any leading zeros, then convert back to string
        const deviceNumber = parseInt(deviceId, 10);
        if (!isNaN(deviceNumber)) {
          // Pad with zeros to make 5 digits, then add HK prefix (total length = 7)
          deviceId = 'HK' + String(deviceNumber).padStart(5, '0');
        }
      }

      const machineId = row.machine_id ? String(row.machine_id).trim() : null;
      const greaseLeft = row.grease_left;
      const lastServiceDate = row.last_service_date;

      // Extract additional fields if present
      const divRly = row.div_rly ? String(row.div_rly).trim() : null;
      const section = row.section ? String(row.section).trim() : null;
      const curveNumber = row.curve_number ? String(row.curve_number).trim() : null;
      const line = row.line ? String(row.line).trim() : null;
      const den = row.den ? String(row.den).trim() : null;
      const aen = row.aen ? String(row.aen).trim() : null;
      const sse = row.sse ? String(row.sse).trim() : null;
      const sden = row.sden; // Already set to 'SDEN CO'
      const lastCofDate = row.last_cof_date;
      const lastCofValue = row.last_cof_value;

      // Check if device_id and machine_id are provided
      if (!deviceId || deviceId === '') {
        rejectionReasons.push('device_id is empty');
      }
      if (!machineId || machineId === '') {
        rejectionReasons.push('machine_id is empty');
      }

      if (rejectionReasons.length > 0) {
        rejectedRows.push({
          row_number: rowNumber,
          device_id: deviceId,
          machine_id: machineId,
          grease_left: greaseLeft,
          last_service_date: lastServiceDate,
          reasons: rejectionReasons
        });
        continue;
      }

      // Check 1: Validate device_id exists in device table
      const deviceCheckQuery = `
        SELECT COUNT(*) as count
        FROM device
        WHERE device_id = @deviceId
      `;

      const deviceCheckResult = await pool.request()
        .input('deviceId', sql.VarChar, deviceId)
        .query(deviceCheckQuery);

      if (deviceCheckResult.recordset[0].count === 0) {
        rejectionReasons.push('device_id does not exist in device table');
      }

      // Check 2: Validate device_id and machine_id combination exists in cloud_dashboard_hkmi table
      const hkmiComboCheckQuery = `
        SELECT COUNT(*) as count
        FROM cloud_dashboard_hkmi
        WHERE RTRIM(LTRIM(device_id)) = @deviceId AND RTRIM(LTRIM(machine_id)) = @machineId
      `;

      const hkmiComboCheckResult = await pool.request()
        .input('deviceId', sql.VarChar, deviceId)
        .input('machineId', sql.VarChar, machineId)
        .query(hkmiComboCheckQuery);

      if (hkmiComboCheckResult.recordset[0].count === 0) {
        rejectionReasons.push('device_id and machine_id combination does not exist in cloud_dashboard_hkmi table');
      }

      // Check 3: Validate grease_left is a number
      const greaseLeftNumber = parseFloat(greaseLeft);
      if (isNaN(greaseLeftNumber) || greaseLeft === null || greaseLeft === '') {
        rejectionReasons.push('grease_left is not a valid number');
      }

      // Check 4: Validate last_service_date is a valid date
      let parsedServiceDate = null;
      if (!lastServiceDate || lastServiceDate === '') {
        rejectionReasons.push('last_service_date is empty');
      } else {
        // Try to parse the date - handle multiple formats
        parsedServiceDate = parseDate(lastServiceDate);
        if (!parsedServiceDate) {
          rejectionReasons.push('last_service_date is not a valid date');
        }
      }

      // Check 5: Validate last_cof_date if provided (optional field)
      let parsedCofDate = null;
      if (lastCofDate && lastCofDate !== '') {
        parsedCofDate = parseDate(lastCofDate);
        if (!parsedCofDate) {
          rejectionReasons.push('last_cof_date is not a valid date');
        }
      }

      // Check 6: Validate last_cof_value if provided (optional field)
      let cofValueNumber = null;
      if (lastCofValue !== null && lastCofValue !== '' && lastCofValue !== undefined) {
        cofValueNumber = parseFloat(lastCofValue);
        if (isNaN(cofValueNumber)) {
          rejectionReasons.push('last_cof_value is not a valid number');
        }
      }

      // If any validation failed, add to rejected rows
      if (rejectionReasons.length > 0) {
        rejectedRows.push({
          row_number: rowNumber,
          device_id: deviceId,
          machine_id: machineId,
          grease_left: greaseLeft,
          last_service_date: lastServiceDate,
          reasons: rejectionReasons
        });
      } else {
        // All validations passed, update the database
        try {
          // Convert JavaScript Date to YYYY-MM-DD string to avoid timezone issues
          const serviceDateString = `${parsedServiceDate.getFullYear()}-${String(parsedServiceDate.getMonth() + 1).padStart(2, '0')}-${String(parsedServiceDate.getDate()).padStart(2, '0')}`;

          let cofDateString = null;
          if (parsedCofDate) {
            cofDateString = `${parsedCofDate.getFullYear()}-${String(parsedCofDate.getMonth() + 1).padStart(2, '0')}-${String(parsedCofDate.getDate()).padStart(2, '0')}`;
          }

          // Build dynamic UPDATE query based on available fields
          let updateFields = [
            'grease_left = @greaseLeft',
            'last_service_date = @lastServiceDate',
            'updated_at = GETDATE()'
          ];

          const request = pool.request()
            .input('greaseLeft', sql.Decimal(10, 3), greaseLeftNumber)
            .input('lastServiceDate', sql.Date, serviceDateString)
            .input('machineId', sql.VarChar, machineId);

          // Add optional fields if they exist
          if (divRly) {
            updateFields.push('div_rly = @divRly');
            request.input('divRly', sql.VarChar, divRly);
          }
          if (section) {
            updateFields.push('section = @section');
            request.input('section', sql.VarChar, section);
          }
          if (curveNumber) {
            updateFields.push('curve_number = @curveNumber');
            request.input('curveNumber', sql.VarChar, curveNumber);
          }
          if (line) {
            updateFields.push('line = @line');
            request.input('line', sql.VarChar, line);
          }
          if (den) {
            updateFields.push('den = @den');
            request.input('den', sql.VarChar, den);
          }
          if (aen) {
            updateFields.push('aen = @aen');
            request.input('aen', sql.VarChar, aen);
          }
          if (sse) {
            updateFields.push('sse = @sse');
            request.input('sse', sql.VarChar, sse);
          }
          if (sden) {
            updateFields.push('sden = @sden');
            request.input('sden', sql.VarChar, sden);
          }
          if (cofDateString) {
            updateFields.push('last_cof_date = @lastCofDate');
            request.input('lastCofDate', sql.Date, cofDateString);
          }
          if (cofValueNumber !== null) {
            updateFields.push('last_cof_value = @lastCofValue');
            request.input('lastCofValue', sql.Decimal(10, 2), cofValueNumber);
          }

          const updateQuery = `
            UPDATE cloud_dashboard_hkmi
            SET ${updateFields.join(', ')}
            WHERE RTRIM(LTRIM(machine_id)) = @machineId
          `;

          await request.query(updateQuery);

          const successRow = {
            row_number: rowNumber,
            device_id: deviceId,
            machine_id: machineId,
            grease_left: greaseLeftNumber,
            last_service_date: serviceDateString
          };

          if (cofDateString) successRow.last_cof_date = cofDateString;
          if (cofValueNumber !== null) successRow.last_cof_value = cofValueNumber;

          successfulRows.push(successRow);
        } catch (updateError) {
          logger.error(`Error updating row ${rowNumber}:`, updateError);
          rejectedRows.push({
            row_number: rowNumber,
            device_id: deviceId,
            machine_id: machineId,
            grease_left: greaseLeft,
            last_service_date: lastServiceDate,
            reasons: [`Database update failed: ${updateError.message}`]
          });
        }
      }
    }

    // Create audit log
    await createAuditLog(user.id, 'HKMI_DATA_UPLOAD', 'Uploaded HKMI configuration data', 'hkmi_upload', null, {
      filename: file.originalname,
      total_rows: data.length,
      successful_rows: successfulRows.length,
      rejected_rows: rejectedRows.length
    });

    res.json({
      success: true,
      message: `Upload processed. ${successfulRows.length} rows updated successfully, ${rejectedRows.length} rows rejected.`,
      data: {
        total_rows: data.length,
        successful_count: successfulRows.length,
        rejected_count: rejectedRows.length,
        successful_rows: successfulRows,
        rejected_rows: rejectedRows
      }
    });

  } catch (error) {
    logger.error('Error processing HKMI upload:', error);
    throw error;
  }
});

/**
 * Helper function to parse dates in Indian format (DD-MM-YYYY)
 * Default format is always DD-MM-YYYY as per Indian standards
 */
function parseDate(dateString) {
  if (!dateString) return null;

  // Convert to string for pattern matching first
  const dateStr = String(dateString).trim();

  // Pattern 1a: DD/MM/YY or DD-MM-YY (Indian format with 2-digit year - HIGHEST PRIORITY)
  // This pattern matches formats like: 2/12/25, 08-11-25, 31/1/25, etc.
  const ddmmyyPattern = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/;
  const ddmmyyMatch = dateStr.match(ddmmyyPattern);
  if (ddmmyyMatch) {
    const day = parseInt(ddmmyyMatch[1], 10);
    const month = parseInt(ddmmyyMatch[2], 10);
    let year = parseInt(ddmmyyMatch[3], 10);

    // Convert 2-digit year to 4-digit year
    // Assume years 00-49 are 2000-2049, years 50-99 are 1950-1999
    year = year >= 50 ? 1900 + year : 2000 + year;

    // Validate day and month ranges
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      // DD-MM-YY format: day is first, month is second
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        logger.info(`Parsed date ${dateStr} as DD-MM-YY: Day=${day}, Month=${month}, Year=${year}`);
        return date;
      }
    }
  }

  // Pattern 1b: DD/MM/YYYY or DD-MM-YYYY (Indian format with 4-digit year)
  // This pattern matches formats like: 2/12/2025, 02-12-2025, 12/1/2025, etc.
  const ddmmyyyyPattern = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/;
  const ddmmyyyyMatch = dateStr.match(ddmmyyyyPattern);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10);
    const year = parseInt(ddmmyyyyMatch[3], 10);

    // Validate day and month ranges
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      // DD-MM-YYYY format: day is first, month is second
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        logger.info(`Parsed date ${dateStr} as DD-MM-YYYY: Day=${day}, Month=${month}, Year=${year}`);
        return date;
      }
    }
  }

  // Pattern 2: YYYY-MM-DD or YYYY/MM/DD (ISO format)
  const yyyymmddPattern = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/;
  const yyyymmddMatch = dateStr.match(yyyymmddPattern);
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1], 10);
    const month = parseInt(yyyymmddMatch[2], 10);
    const day = parseInt(yyyymmddMatch[3], 10);

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        logger.info(`Parsed date ${dateStr} as YYYY-MM-DD: Year=${year}, Month=${month}, Day=${day}`);
        return date;
      }
    }
  }

  // Pattern 3: DD.MM.YYYY or DD.MM.YY (European format with dots)
  const ddmmyyyyDotPattern = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/;
  const ddmmyyyyDotMatch = dateStr.match(ddmmyyyyDotPattern);
  if (ddmmyyyyDotMatch) {
    const day = parseInt(ddmmyyyyDotMatch[1], 10);
    const month = parseInt(ddmmyyyyDotMatch[2], 10);
    let year = parseInt(ddmmyyyyDotMatch[3], 10);

    // Convert 2-digit year to 4-digit year if needed
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year;
    }

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        logger.info(`Parsed date ${dateStr} as DD.MM.YYYY: Day=${day}, Month=${month}, Year=${year}`);
        return date;
      }
    }
  }

  // Pattern 4: Text dates with month names (e.g., "2-Dec-2025", "2 December 2025", "Dec 2, 2025")
  const monthNames = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'sept': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11
  };

  // Pattern 4a: DD-MMM-YYYY or DD MMM YYYY (e.g., "2-Dec-2025", "2 December 2025")
  const ddMmmYyyyPattern = /^(\d{1,2})[\s\-,]+([a-zA-Z]+)[\s\-,]+(\d{2,4})$/;
  const ddMmmYyyyMatch = dateStr.match(ddMmmYyyyPattern);
  if (ddMmmYyyyMatch) {
    const day = parseInt(ddMmmYyyyMatch[1], 10);
    const monthName = ddMmmYyyyMatch[2].toLowerCase();
    let year = parseInt(ddMmmYyyyMatch[3], 10);

    // Convert 2-digit year to 4-digit year if needed
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year;
    }

    const month = monthNames[monthName];
    if (month !== undefined && day >= 1 && day <= 31) {
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        logger.info(`Parsed date ${dateStr} as DD-MMM-YYYY: Day=${day}, Month=${monthName}, Year=${year}`);
        return date;
      }
    }
  }

  // Pattern 4b: "Tuesday, 2 December, 2025" or "2 December 2025"
  const textDatePattern = /(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*)?(\d{1,2})\s+([a-zA-Z]+),?\s+(\d{2,4})/i;
  const textDateMatch = dateStr.match(textDatePattern);
  if (textDateMatch) {
    const day = parseInt(textDateMatch[1], 10);
    const monthName = textDateMatch[2].toLowerCase();
    let year = parseInt(textDateMatch[3], 10);

    // Convert 2-digit year to 4-digit year if needed
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year;
    }

    const month = monthNames[monthName];
    if (month !== undefined && day >= 1 && day <= 31) {
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        logger.info(`Parsed date ${dateStr} as text format: Day=${day}, Month=${monthName}, Year=${year}`);
        return date;
      }
    }
  }

  // Try Excel serial date number (only if it's a pure number without slashes/dashes)
  // Excel serial numbers are typically 5-digit numbers (e.g., 44927 for 2023-01-01)
  if (/^\d+(\.\d+)?$/.test(dateStr)) {
    const excelDate = parseFloat(dateStr);
    if (!isNaN(excelDate) && excelDate > 1000 && excelDate < 100000) {
      // Excel dates are days since 1900-01-01 (with adjustment for Excel's 1900 leap year bug)
      const date = new Date((excelDate - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        logger.info(`Parsed date ${dateStr} as Excel serial number: ${excelDate}`);
        return date;
      }
    }
  }

  logger.warn(`Unable to parse date: ${dateStr}`);
  return null;
}
