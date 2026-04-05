/**
 * sickP3Handler.js
 *
 * Handles decoding and DB insertion for HK devices (logicId 1).
 * Target table: IoT_Data_Sick_P3
 */

import { executeQuery, sql } from '../config/database.js';
import { decode } from '../decoders/decoder.js';
import { logger } from '../utils/logger.js';

/**
 * Decode the HK hex payload and insert a row into IoT_Data_Sick_P3.
 *
 * @param {string} deviceId   - device_id from telemetry payload
 * @param {string} hexField   - raw hex string (field1)
 * @param {Date}   createdAt  - timestamp from device payload (or server time)
 * @param {number} entryId    - unique bigint for this row
 */
export async function handleSickP3(deviceId, hexField, createdAt, entryId) {
  let decoded;
  try {
    decoded = decode(1, hexField);
  } catch (err) {
    logger.warn(`SickP3: decode failed for device=${deviceId}: ${err.message}`);
    throw err;
  }

  await executeQuery(
    `INSERT INTO dbo.IoT_Data_Sick_P3
       (Entry_ID, CreatedAt, Device_ID, HexField,
        Event_Type, Event_Type_Description, Signal_Strength,
        Motor_ON_Time_sec, Motor_OFF_Time_min, Wheel_Threshold,
        Latitude, Longitude, Number_of_Wheels_Detected,
        Motor_Current_Average_mA, Motor_Current_Min_mA, Motor_Current_Max_mA,
        Train_Passed_Flag, Motor_ON_Flag, Battery_Voltage_mV, Debug_Value, Timestamp)
     VALUES
       (@entryId, @createdAt, @deviceId, @hexField,
        @eventType, @eventTypeDesc, @signalStrength,
        @motorOnTime, @motorOffTime, @wheelThreshold,
        @latitude, @longitude, @wheelsDetected,
        @avgCurrent, @minCurrent, @maxCurrent,
        @trainPassedFlag, @motorOnFlag, @batteryVoltage, @debugValue, @timestamp)`,
    {
      entryId:         { value: entryId,                       type: sql.BigInt },
      createdAt:       { value: createdAt,                     type: sql.DateTime2 },
      deviceId:        { value: deviceId,                      type: sql.NVarChar(128) },
      hexField:        { value: hexField,                      type: sql.NVarChar(sql.MAX) },
      eventType:       { value: decoded.Event_Type,            type: sql.Int },
      eventTypeDesc:   { value: decoded.Event_Type_Description,type: sql.NVarChar(50) },
      signalStrength:  { value: decoded.Signal_Strength,       type: sql.Int },
      motorOnTime:     { value: decoded.Motor_ON_Time_sec,     type: sql.Int },
      motorOffTime:    { value: decoded.Motor_OFF_Time_min,    type: sql.Int },
      wheelThreshold:  { value: decoded.Wheel_Threshold,       type: sql.Int },
      latitude:        { value: decoded.Latitude,              type: sql.Float },
      longitude:       { value: decoded.Longitude,             type: sql.Float },
      wheelsDetected:  { value: decoded.Number_of_Wheels_Detected, type: sql.Int },
      avgCurrent:      { value: decoded.Motor_Current_Average_mA,  type: sql.Int },
      minCurrent:      { value: decoded.Motor_Current_Min_mA,  type: sql.Int },
      maxCurrent:      { value: decoded.Motor_Current_Max_mA,  type: sql.Int },
      trainPassedFlag: { value: decoded.Train_Passed_Flag,     type: sql.Bit },
      motorOnFlag:     { value: decoded.Motor_ON_Flag,         type: sql.Bit },
      batteryVoltage:  { value: decoded.Battery_Voltage_mV,   type: sql.Int },
      debugValue:      { value: decoded.Debug_Value,           type: sql.BigInt },
      timestamp:       { value: createdAt,                     type: sql.DateTime2 },
    }
  );

  try {
    await executeQuery(
      `UPDATE dbo.DeviceTelemetry SET decoded_json = @decodedJson WHERE entry_id = @entryId`,
      {
        decodedJson: { value: JSON.stringify(decoded), type: sql.NVarChar(sql.MAX) },
        entryId:     { value: entryId,                 type: sql.BigInt },
      }
    );
  } catch (err) {
    logger.warn(`SickP3: DeviceTelemetry decoded_json update failed for device=${deviceId}: ${err.message}`);
  }

  return decoded;
}
