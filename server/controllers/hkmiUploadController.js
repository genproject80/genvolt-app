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

    // Find the header row (look for row containing device or machine)
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const row = allRows[i];
      const rowString = JSON.stringify(row).toLowerCase();
      if (rowString.includes('device') && rowString.includes('machine')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new ValidationError('Could not find header row with device and machine columns');
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

    // Validate required columns - STRICT MATCH ONLY
    const requiredColumns = ['device_id', 'machine_id', 'grease_left', 'last_service_date'];
    const firstRow = data[0];
    const fileColumns = Object.keys(firstRow);

    const missingColumns = requiredColumns.filter(col => !fileColumns.includes(col));

    if (missingColumns.length > 0) {
      throw new ValidationError(`Missing required columns: ${missingColumns.join(', ')}. The file must have EXACTLY these column names: device_id, machine_id, grease_left, last_service_date`);
    }

    // Process each row
    const successfulRows = [];
    const rejectedRows = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = headerRowIndex + i + 2; // Account for header row location and Excel starting at 1
      const rejectionReasons = [];

      // Extract values using exact column names
      const deviceId = row.device_id ? String(row.device_id).trim() : null;
      const machineId = row.machine_id ? String(row.machine_id).trim() : null;
      const greaseLeft = row.grease_left;
      const lastServiceDate = row.last_service_date;

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
        WHERE device_id = @deviceId AND machine_id = @machineId
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
      let parsedDate = null;
      if (!lastServiceDate || lastServiceDate === '') {
        rejectionReasons.push('last_service_date is empty');
      } else {
        // Try to parse the date - handle multiple formats
        parsedDate = parseDate(lastServiceDate);
        if (!parsedDate) {
          rejectionReasons.push('last_service_date is not a valid date');
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
          const updateQuery = `
            UPDATE cloud_dashboard_hkmi
            SET
              grease_left = @greaseLeft,
              last_service_date = @lastServiceDate,
              updated_at = GETDATE()
            WHERE machine_id = @machineId
          `;

          await pool.request()
            .input('greaseLeft', sql.Decimal(10, 3), greaseLeftNumber)
            .input('lastServiceDate', sql.Date, parsedDate)
            .input('machineId', sql.VarChar, machineId)
            .query(updateQuery);

          successfulRows.push({
            row_number: rowNumber,
            device_id: deviceId,
            machine_id: machineId,
            grease_left: greaseLeftNumber,
            last_service_date: parsedDate
          });
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
 * Helper function to parse dates in multiple formats
 */
function parseDate(dateString) {
  if (!dateString) return null;

  // Try direct Date parsing first
  let date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try parsing common date formats
  const formats = [
    // DD/MM/YYYY or DD-MM-YYYY
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/,
    // MM/DD/YYYY or MM-DD-YYYY
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/,
    // YYYY/MM/DD or YYYY-MM-DD
    /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/
  ];

  for (let format of formats) {
    const match = String(dateString).match(format);
    if (match) {
      // Try different interpretations
      const interpretations = [
        new Date(match[3], match[2] - 1, match[1]), // DD/MM/YYYY
        new Date(match[3], match[1] - 1, match[2]), // MM/DD/YYYY
        new Date(match[1], match[2] - 1, match[3])  // YYYY/MM/DD
      ];

      for (let interpretation of interpretations) {
        if (!isNaN(interpretation.getTime())) {
          return interpretation;
        }
      }
    }
  }

  // Try Excel serial date number
  const excelDate = parseFloat(dateString);
  if (!isNaN(excelDate) && excelDate > 0) {
    // Excel dates are days since 1900-01-01
    const date = new Date((excelDate - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}
