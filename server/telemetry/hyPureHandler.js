/**
 * hyPureHandler.js
 *
 * Handles decoding and DB insertion for HY devices (logicId 2).
 * Target table: IoT_Data_HyPure
 */

import { executeQuery, sql } from '../config/database.js';
import { decode } from '../decoders/decoder.js';
import { logger } from '../utils/logger.js';

/**
 * Decode the HY hex payload and insert a row into IoT_Data_HyPure.
 *
 * @param {string} deviceId   - device_id from telemetry payload
 * @param {string} hexField   - raw hex string (field1)
 * @param {Date}   createdAt  - timestamp from device payload (or server time)
 * @param {number} entryId    - unique bigint for this row
 */
export async function handleHyPure(deviceId, hexField, createdAt, entryId) {
  let decoded;
  try {
    decoded = decode(2, hexField);
  } catch (err) {
    logger.warn(`HyPure: decode failed for device=${deviceId}: ${err.message}`);
    throw err;
  }

  await executeQuery(
    `INSERT INTO dbo.IoT_Data_HyPure
       (Entry_ID, CreatedAt, Device_ID, HexField,
        Oil_Level, Limit_Switch, Spark, Motor_Trip, Buzzer, HVS, Motor_Reverse, Motor_Forward,
        Oil_Level_2, Tank_Pressure, Motor_Trip_Fault, Moisture_Contamination,
        HVS_OFF, Change_Collector, Pump_Suction, Drain_Period_Over,
        Signal_Strength, kV_Value, mA_Value, kV_Minimum, mA_Minimum,
        Temperature, Pressure, Motor_Runtime_Min, Total_Runtime_Min, Device_Runtime_Min,
        Debug_Value, Timestamp)
     VALUES
       (@entryId, @createdAt, @deviceId, @hexField,
        @oilLevel, @limitSwitch, @spark, @motorTrip, @buzzer, @hvs, @motorReverse, @motorForward,
        @oilLevel2, @tankPressure, @motorTripFault, @moistureContamination,
        @hvsOff, @changeCollector, @pumpSuction, @drainPeriodOver,
        @signalStrength, @kvValue, @maValue, @kvMinimum, @maMinimum,
        @temperature, @pressure, @motorRuntime, @totalRuntime, @deviceRuntime,
        @debugValue, @timestamp)`,
    {
      entryId:              { value: entryId,                    type: sql.BigInt },
      createdAt:            { value: createdAt,                  type: sql.DateTime2 },
      deviceId:             { value: deviceId,                   type: sql.NVarChar(128) },
      hexField:             { value: hexField,                   type: sql.NVarChar(500) },
      oilLevel:             { value: decoded.Oil_Level,          type: sql.Bit },
      limitSwitch:          { value: decoded.Limit_Switch,       type: sql.Bit },
      spark:                { value: decoded.Spark,              type: sql.Bit },
      motorTrip:            { value: decoded.Motor_Trip,         type: sql.Bit },
      buzzer:               { value: decoded.Buzzer,             type: sql.Bit },
      hvs:                  { value: decoded.HVS,                type: sql.Bit },
      motorReverse:         { value: decoded.Motor_Reverse,      type: sql.Bit },
      motorForward:         { value: decoded.Motor_Forward,      type: sql.Bit },
      oilLevel2:            { value: decoded.Oil_Level_2,        type: sql.Bit },
      tankPressure:         { value: decoded.Tank_Pressure,      type: sql.Bit },
      motorTripFault:       { value: decoded.Motor_Trip_Fault,   type: sql.Bit },
      moistureContamination:{ value: decoded.Moisture_Contamination, type: sql.Bit },
      hvsOff:               { value: decoded.HVS_OFF,            type: sql.Bit },
      changeCollector:      { value: decoded.Change_Collector,   type: sql.Bit },
      pumpSuction:          { value: decoded.Pump_Suction,       type: sql.Bit },
      drainPeriodOver:      { value: decoded.Drain_Period_Over,  type: sql.Bit },
      signalStrength:       { value: decoded.Signal_Strength,    type: sql.Int },
      kvValue:              { value: decoded.kV_Value,           type: sql.Int },
      maValue:              { value: decoded.mA_Value,           type: sql.Int },
      kvMinimum:            { value: decoded.kV_Minimum,         type: sql.Int },
      maMinimum:            { value: decoded.mA_Minimum,         type: sql.Int },
      temperature:          { value: decoded.Temperature,        type: sql.Int },
      pressure:             { value: decoded.Pressure,           type: sql.Int },
      motorRuntime:         { value: decoded.Motor_Runtime_Min,  type: sql.Int },
      totalRuntime:         { value: decoded.Total_Runtime_Min,  type: sql.Int },
      deviceRuntime:        { value: decoded.Device_Runtime_Min, type: sql.Int },
      debugValue:           { value: decoded.Debug_Value,        type: sql.BigInt },
      timestamp:            { value: createdAt,                  type: sql.DateTime2 },
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
    logger.warn(`HyPure: DeviceTelemetry decoded_json update failed for device=${deviceId}: ${err.message}`);
  }

  return decoded;
}
