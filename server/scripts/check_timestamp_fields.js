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
    console.log('🔍 Checking timestamp fields in iot_data_sick table...\n');

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
      console.log('Latest record (Entry_ID: ' + record.Entry_ID + '):\n');

      // Show all fields
      Object.keys(record).forEach(key => {
        const value = record[key];
        const type = typeof value;
        console.log(`${key}: ${value} (${type})`);
      });

      // Check for date/time related fields
      console.log('\n\n=== DATE/TIME FIELDS ===');
      const dateFields = Object.keys(record).filter(key =>
        key.toLowerCase().includes('time') ||
        key.toLowerCase().includes('date') ||
        key.toLowerCase().includes('created') ||
        key.toLowerCase().includes('inserted')
      );

      if (dateFields.length > 0) {
        dateFields.forEach(field => {
          console.log(`${field}: ${record[field]}`);
        });
      }
    }

    // Check if CreatedAt or InsertedAt have valid dates
    console.log('\n\n=== CHECKING CreatedAt AND InsertedAt DISTRIBUTION ===');
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

    console.log(`Total Records: ${stats.Total_Records}`);
    console.log(`Timestamp NOT NULL: ${stats.Timestamp_NotNull}`);
    console.log(`CreatedAt NOT NULL: ${stats.CreatedAt_NotNull}`);
    console.log(`InsertedAt NOT NULL: ${stats.InsertedAt_NotNull}`);
    console.log(`CreatedAt Range: ${stats.Min_CreatedAt} to ${stats.Max_CreatedAt}`);
    console.log(`InsertedAt Range: ${stats.Min_InsertedAt} to ${stats.Max_InsertedAt}`);

    console.log('\n✅ Check complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

checkTimestampFields();
