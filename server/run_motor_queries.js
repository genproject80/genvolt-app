import { getDB } from './config/database.js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

async function runQueries() {
  try {
    const pool = await getDB();

    console.log('='.repeat(80));
    console.log('QUERY 1: DASHBOARD VIEW - Motor Run Count Summary');
    console.log('='.repeat(80));

    const query1 = `
SELECT
  d.Device_ID,
  hkmi.machine_id,
  hkmi.sden,
  hkmi.den,
  hkmi.aen,
  latest_data.Motor_OFF_Time_min,
  ISNULL(motor_runs.Motor_Run_Count_Last_24Hrs, 0) as Motor_Run_Count_Last_24Hrs,
  motor_runs.Total_Train_Passes as Total_Train_Passes_Last_24Hrs,
  motor_runs.Filtered_Runs as Valid_Runs_After_Cooldown,
  motor_runs.Rejected_Runs as Rejected_Runs_Due_To_Cooldown
FROM (
  SELECT DISTINCT Device_ID
  FROM iot_data_sick
  WHERE CreatedAt >= DATEADD(hour, -24, GETDATE())
) d
LEFT JOIN (
  SELECT
    Device_ID,
    Motor_OFF_Time_min
  FROM iot_data_sick iot
  INNER JOIN (
    SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
    FROM iot_data_sick
    GROUP BY Device_ID
  ) latest ON iot.Device_ID = latest.Device_ID AND iot.CreatedAt = latest.MaxCreatedAt
) latest_data ON d.Device_ID = latest_data.Device_ID
LEFT JOIN (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
  FROM cloud_dashboard_hkmi
) hkmi ON d.Device_ID = hkmi.device_id AND hkmi.rn = 1
LEFT JOIN (
  SELECT
    Device_ID,
    COUNT(*) as Motor_Run_Count_Last_24Hrs,
    SUM(CASE WHEN is_valid_run = 1 THEN 1 ELSE 0 END) as Filtered_Runs,
    SUM(CASE WHEN is_valid_run = 0 THEN 1 ELSE 0 END) as Rejected_Runs,
    MAX(total_passes) as Total_Train_Passes
  FROM (
    SELECT
      Device_ID,
      CreatedAt,
      Motor_OFF_Time_min,
      Minutes_Since_Last_Run,
      run_number,
      CASE
        WHEN run_number = 1 THEN 1
        WHEN Minutes_Since_Last_Run >= Motor_OFF_Time_min THEN 1
        WHEN Minutes_Since_Last_Run IS NULL THEN 1
        ELSE 0
      END as is_valid_run,
      COUNT(*) OVER (PARTITION BY Device_ID) as total_passes
    FROM (
      SELECT
        Device_ID,
        CreatedAt,
        Motor_OFF_Time_min,
        DATEDIFF(MINUTE,
          LAG(CreatedAt) OVER (PARTITION BY Device_ID ORDER BY CreatedAt),
          CreatedAt
        ) as Minutes_Since_Last_Run,
        ROW_NUMBER() OVER (PARTITION BY Device_ID ORDER BY CreatedAt) as run_number
      FROM iot_data_sick
      WHERE CreatedAt >= DATEADD(hour, -24, GETDATE())
        AND Number_of_Wheels_Detected > Number_of_Wheels_Configured
        AND Train_Passed = 1
    ) runs_with_gaps
  ) runs_with_validation
  WHERE is_valid_run = 1
  GROUP BY Device_ID
) motor_runs ON d.Device_ID = motor_runs.Device_ID
ORDER BY motor_runs.Motor_Run_Count_Last_24Hrs DESC, d.Device_ID;
`;

    const result1 = await pool.request().query(query1);
    console.table(result1.recordset);

    console.log('\n' + '='.repeat(80));
    console.log('QUERY 3: SUMMARY BY DEVICE');
    console.log('='.repeat(80));

    const query3 = `
SELECT
  Device_ID,
  COUNT(*) as Total_Train_Passes,
  SUM(CASE
    WHEN run_number = 1 THEN 1
    WHEN Minutes_Since_Last_Run >= Motor_OFF_Time_min THEN 1
    WHEN Minutes_Since_Last_Run IS NULL THEN 1
    ELSE 0
  END) as Valid_Motor_Runs,
  COUNT(*) - SUM(CASE
    WHEN run_number = 1 THEN 1
    WHEN Minutes_Since_Last_Run >= Motor_OFF_Time_min THEN 1
    WHEN Minutes_Since_Last_Run IS NULL THEN 1
    ELSE 0
  END) as Rejected_Runs,
  MIN(Motor_OFF_Time_min) as Min_Cooldown,
  MAX(Motor_OFF_Time_min) as Max_Cooldown,
  CAST(ROUND(
    100.0 * SUM(CASE
      WHEN run_number = 1 THEN 1
      WHEN Minutes_Since_Last_Run >= Motor_OFF_Time_min THEN 1
      WHEN Minutes_Since_Last_Run IS NULL THEN 1
      ELSE 0
    END) / COUNT(*), 2
  ) as DECIMAL(5,2)) as Valid_Run_Percentage
FROM (
  SELECT
    Device_ID,
    CreatedAt,
    Motor_OFF_Time_min,
    DATEDIFF(MINUTE,
      LAG(CreatedAt) OVER (PARTITION BY Device_ID ORDER BY CreatedAt),
      CreatedAt
    ) as Minutes_Since_Last_Run,
    ROW_NUMBER() OVER (PARTITION BY Device_ID ORDER BY CreatedAt) as run_number
  FROM iot_data_sick
  WHERE CreatedAt >= DATEADD(hour, -24, GETDATE())
    AND Number_of_Wheels_Detected > Number_of_Wheels_Configured
    AND Train_Passed = 1
) runs_with_gaps
GROUP BY Device_ID
ORDER BY Valid_Motor_Runs DESC;
`;

    const result3 = await pool.request().query(query3);
    console.table(result3.recordset);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

runQueries();
