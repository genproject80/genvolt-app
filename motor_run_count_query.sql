-- Query to show Motor Run Count with Motor_OFF_Time_min cooldown logic
-- This matches the logic used in the HKMI and Railway dashboards

-- Get all devices with their motor run counts (respecting cooldown)
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
  -- Get all unique devices
  SELECT DISTINCT Device_ID
  FROM iot_data_sick
  WHERE CreatedAt >= DATEADD(hour, -24, GETDATE())
) d
-- Get latest Motor_OFF_Time_min for each device
LEFT JOIN (
  SELECT
    iot.Device_ID,
    iot.Motor_OFF_Time_min
  FROM iot_data_sick iot
  INNER JOIN (
    SELECT Device_ID, MAX(CreatedAt) as MaxCreatedAt
    FROM iot_data_sick
    GROUP BY Device_ID
  ) latest ON iot.Device_ID = latest.Device_ID AND iot.CreatedAt = latest.MaxCreatedAt
) latest_data ON d.Device_ID = latest_data.Device_ID
-- Get HKMI metadata
LEFT JOIN (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) as rn
  FROM cloud_dashboard_hkmi
) hkmi ON d.Device_ID = hkmi.device_id AND hkmi.rn = 1
-- Calculate motor runs with cooldown logic
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
        WHEN run_number = 1 THEN 1  -- First run always valid
        WHEN Minutes_Since_Last_Run >= Motor_OFF_Time_min THEN 1  -- Cooldown elapsed
        WHEN Minutes_Since_Last_Run IS NULL THEN 1  -- Safety check
        ELSE 0  -- Rejected due to cooldown
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
  WHERE is_valid_run = 1  -- Only count valid runs
  GROUP BY Device_ID
) motor_runs ON d.Device_ID = motor_runs.Device_ID
ORDER BY motor_runs.Motor_Run_Count_Last_24Hrs DESC, d.Device_ID;


-- ============================================================================
-- DETAILED VIEW: See individual train passes with cooldown validation
-- ============================================================================

SELECT
  Device_ID,
  CreatedAt,
  Motor_OFF_Time_min,
  Minutes_Since_Last_Run,
  run_number,
  CASE
    WHEN run_number = 1 THEN 'VALID - First run'
    WHEN Minutes_Since_Last_Run >= Motor_OFF_Time_min THEN 'VALID - Cooldown elapsed (' + CAST(Minutes_Since_Last_Run as VARCHAR) + ' min >= ' + CAST(Motor_OFF_Time_min as VARCHAR) + ' min)'
    WHEN Minutes_Since_Last_Run IS NULL THEN 'VALID - No previous run'
    ELSE 'REJECTED - Cooldown not elapsed (' + CAST(Minutes_Since_Last_Run as VARCHAR) + ' min < ' + CAST(Motor_OFF_Time_min as VARCHAR) + ' min)'
  END as Validation_Status,
  CASE
    WHEN run_number = 1 THEN 1
    WHEN Minutes_Since_Last_Run >= Motor_OFF_Time_min THEN 1
    WHEN Minutes_Since_Last_Run IS NULL THEN 1
    ELSE 0
  END as Counted
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
ORDER BY Device_ID, CreatedAt;


-- ============================================================================
-- SUMMARY BY DEVICE: Shows total passes vs valid runs
-- ============================================================================

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
