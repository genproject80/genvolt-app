import { connectDB } from '../config/database.js';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

/**
 * Check for motor run instances in the database
 */
async function checkMotorRuns() {
  try {
    console.log('🔍 Checking database for motor run instances...\n');

    const pool = await connectDB();

    // Query 1: Motor runs in last 24 hours
    console.log('=== MOTOR RUNS IN LAST 24 HOURS ===');
    const last24HoursQuery = `
      SELECT
        Device_ID,
        COUNT(*) as Motor_Run_Count,
        MIN(CreatedAt) as First_Run,
        MAX(CreatedAt) as Last_Run
      FROM iot_data_sick
      WHERE CreatedAt >= DATEADD(hour, -24, GETDATE())
        AND Number_of_Wheels_Detected > Number_of_Wheels_Configured
        AND Train_Passed = 1
      GROUP BY Device_ID
      ORDER BY Motor_Run_Count DESC
    `;

    const last24Result = await pool.request().query(last24HoursQuery);

    if (last24Result.recordset.length > 0) {
      console.log(`Found ${last24Result.recordset.length} devices with motor runs in last 24 hours:\n`);
      last24Result.recordset.forEach(row => {
        console.log(`Device: ${row.Device_ID}`);
        console.log(`  Count: ${row.Motor_Run_Count}`);
        console.log(`  First Run: ${row.First_Run}`);
        console.log(`  Last Run: ${row.Last_Run}`);
        console.log('');
      });
    } else {
      console.log('❌ No motor runs found in last 24 hours\n');
    }

    // Query 2: Motor runs in last 7 days (grouped by 24-hour windows)
    console.log('\n=== MOTOR RUNS IN LAST 7 DAYS (by 24-hour windows) ===');
    const last7DaysQuery = `
      SELECT
        Device_ID,
        CAST(CreatedAt AS DATE) as Run_Date,
        COUNT(*) as Motor_Run_Count,
        MIN(CreatedAt) as First_Run,
        MAX(CreatedAt) as Last_Run
      FROM iot_data_sick
      WHERE CreatedAt >= DATEADD(day, -7, GETDATE())
        AND Number_of_Wheels_Detected > Number_of_Wheels_Configured
        AND Train_Passed = 1
      GROUP BY Device_ID, CAST(CreatedAt AS DATE)
      ORDER BY Run_Date DESC, Motor_Run_Count DESC
    `;

    const last7DaysResult = await pool.request().query(last7DaysQuery);

    if (last7DaysResult.recordset.length > 0) {
      console.log(`Found ${last7DaysResult.recordset.length} device-day combinations with motor runs:\n`);
      last7DaysResult.recordset.slice(0, 20).forEach(row => {
        console.log(`Date: ${row.Run_Date.toISOString().split('T')[0]} | Device: ${row.Device_ID} | Count: ${row.Motor_Run_Count}`);
      });
      if (last7DaysResult.recordset.length > 20) {
        console.log(`\n... and ${last7DaysResult.recordset.length - 20} more entries`);
      }
    } else {
      console.log('❌ No motor runs found in last 7 days\n');
    }

    // Query 3: All-time motor runs summary
    console.log('\n=== ALL-TIME MOTOR RUNS SUMMARY ===');
    const allTimeQuery = `
      SELECT
        Device_ID,
        COUNT(*) as Total_Motor_Runs,
        MIN(CreatedAt) as First_Ever_Run,
        MAX(CreatedAt) as Last_Ever_Run
      FROM iot_data_sick
      WHERE Number_of_Wheels_Detected > Number_of_Wheels_Configured
        AND Train_Passed = 1
      GROUP BY Device_ID
      ORDER BY Total_Motor_Runs DESC
    `;

    const allTimeResult = await pool.request().query(allTimeQuery);

    if (allTimeResult.recordset.length > 0) {
      console.log(`Found ${allTimeResult.recordset.length} devices with motor runs all-time:\n`);
      console.log('Top 10 devices by total motor runs:\n');
      allTimeResult.recordset.slice(0, 10).forEach((row, index) => {
        console.log(`${index + 1}. Device: ${row.Device_ID}`);
        console.log(`   Total Runs: ${row.Total_Motor_Runs}`);
        console.log(`   First Run: ${row.First_Ever_Run}`);
        console.log(`   Last Run: ${row.Last_Ever_Run}`);
        console.log('');
      });
    } else {
      console.log('❌ No motor runs found in entire database\n');
    }

    // Query 4: Sample records that match the criteria
    console.log('\n=== SAMPLE RECORDS (showing actual data that meets criteria) ===');
    const sampleQuery = `
      SELECT TOP 10
        Entry_ID,
        Device_ID,
        CreatedAt,
        Number_of_Wheels_Configured,
        Number_of_Wheels_Detected,
        Train_Passed
      FROM iot_data_sick
      WHERE Number_of_Wheels_Detected > Number_of_Wheels_Configured
        AND Train_Passed = 1
      ORDER BY CreatedAt DESC
    `;

    const sampleResult = await pool.request().query(sampleQuery);

    if (sampleResult.recordset.length > 0) {
      console.log('Latest 10 records that meet motor run criteria:\n');
      sampleResult.recordset.forEach(row => {
        console.log(`Entry: ${row.Entry_ID} | Device: ${row.Device_ID} | Time: ${row.CreatedAt}`);
        console.log(`  Wheels - Configured: ${row.Number_of_Wheels_Configured}, Detected: ${row.Number_of_Wheels_Detected}, Train Passed: ${row.Train_Passed}`);
        console.log('');
      });
    } else {
      console.log('❌ No records found that meet the motor run criteria\n');
    }

    // Query 5: Data distribution check
    console.log('\n=== DATA DISTRIBUTION CHECK ===');
    const distributionQuery = `
      SELECT
        COUNT(*) as Total_Records,
        COUNT(DISTINCT Device_ID) as Unique_Devices,
        SUM(CASE WHEN Number_of_Wheels_Detected > Number_of_Wheels_Configured THEN 1 ELSE 0 END) as Wheels_Exceeded_Count,
        SUM(CASE WHEN Train_Passed = 1 THEN 1 ELSE 0 END) as Train_Passed_Count,
        SUM(CASE WHEN Number_of_Wheels_Detected > Number_of_Wheels_Configured AND Train_Passed = 1 THEN 1 ELSE 0 END) as Motor_Run_Criteria_Met,
        MIN(CreatedAt) as Earliest_Record,
        MAX(CreatedAt) as Latest_Record
      FROM iot_data_sick
    `;

    const distResult = await pool.request().query(distributionQuery);
    const dist = distResult.recordset[0];

    console.log(`Total Records: ${dist.Total_Records}`);
    console.log(`Unique Devices: ${dist.Unique_Devices}`);
    console.log(`Records where Wheels Detected > Configured: ${dist.Wheels_Exceeded_Count} (${((dist.Wheels_Exceeded_Count / dist.Total_Records) * 100).toFixed(2)}%)`);
    console.log(`Records where Train Passed = 1: ${dist.Train_Passed_Count} (${((dist.Train_Passed_Count / dist.Total_Records) * 100).toFixed(2)}%)`);
    console.log(`Records meeting BOTH criteria: ${dist.Motor_Run_Criteria_Met} (${((dist.Motor_Run_Criteria_Met / dist.Total_Records) * 100).toFixed(2)}%)`);
    console.log(`Date Range: ${dist.Earliest_Record} to ${dist.Latest_Record}`);

    console.log('\n✅ Analysis complete!');

  } catch (error) {
    console.error('❌ Error checking motor runs:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the check
checkMotorRuns();
