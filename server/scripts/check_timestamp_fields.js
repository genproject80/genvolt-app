import { connectDB } from '../config/database.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkTimestampFields() {
  try {

    const pool = await connectDB();

    // Get column information
    const columnsQuery = `
      SELECT TOP 1 *
      FROM iot_data_sick
      ORDER BY Entry_ID DESC
    `;

    const result = await pool.request().query(columnsQuery);

    if (result.recordset.length > 0) {
      const record = result.recordset[0];

      // Show all fields
      Object.keys(record).forEach(key => {
        const value = record[key];
        const type = typeof value;
      });

      // Check for date/time related fields
      const dateFields = Object.keys(record).filter(key =>
        key.toLowerCase().includes('time') ||
        key.toLowerCase().includes('date') ||
        key.toLowerCase().includes('created') ||
        key.toLowerCase().includes('inserted')
      );

      if (dateFields.length > 0) {
        dateFields.forEach(field => {
        });
      }
    }

    // Check if CreatedAt or InsertedAt have valid dates
    const dateCheckQuery = `
      SELECT
        COUNT(*) as Total_Records,
        SUM(CASE WHEN Timestamp IS NOT NULL THEN 1 ELSE 0 END) as Timestamp_NotNull,
        SUM(CASE WHEN CreatedAt IS NOT NULL THEN 1 ELSE 0 END) as CreatedAt_NotNull,
        SUM(CASE WHEN InsertedAt IS NOT NULL THEN 1 ELSE 0 END) as InsertedAt_NotNull,
        MIN(CreatedAt) as Min_CreatedAt,
        MAX(CreatedAt) as Max_CreatedAt,
        MIN(InsertedAt) as Min_InsertedAt,
        MAX(InsertedAt) as Max_InsertedAt
      FROM iot_data_sick
    `;

    const dateCheckResult = await pool.request().query(dateCheckQuery);
    const stats = dateCheckResult.recordset[0];



  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkTimestampFields();
