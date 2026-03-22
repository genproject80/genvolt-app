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

    const pool = await connectDB();

    // Query 1: Motor runs in last 24 hours
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
      last24Result.recordset.forEach(row => {
      });
    } else {
    }

    // Query 2: Motor runs in last 7 days (grouped by 24-hour windows)
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
      last7DaysResult.recordset.slice(0, 20).forEach(row => {
      });
      if (last7DaysResult.recordset.length > 20) {
      }
    } else {
    }

    // Query 3: All-time motor runs summary
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
      allTimeResult.recordset.slice(0, 10).forEach((row, index) => {
      });
    } else {
    }

    // Query 4: Sample records that match the criteria
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
      sampleResult.recordset.forEach(row => {
      });
    } else {
    }

    // Query 5: Data distribution check
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



  } catch (error) {
    console.error('❌ Error checking motor runs:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

// Run the check
checkMotorRuns();
