/**
 * HY Decoder — P4 Logic (HyPure device telemetry)
 * Model: HY
 * Logic ID: 2
 *
 * Decodes a 28-byte (56 hex char) payload split into 7 chunks of 4 bytes.
 *
 * Chunk layout:
 *   Chunk 1 (bytes  0-3):  Status flags (byte), fault flags (byte), signal strength (byte), unused (byte)
 *   Chunk 2 (bytes  4-7):  kV value, mA value, kV minimum, mA minimum (1 byte each)
 *   Chunk 3 (bytes  8-11): Temperature °C (uint16 BE), pressure barG (uint16 BE)
 *   Chunk 4 (bytes 12-15): Motor runtime in minutes (uint32 BE)
 *   Chunk 5 (bytes 16-19): Total runtime in minutes (uint32 BE)
 *   Chunk 6 (bytes 20-23): Device runtime in minutes (uint32 BE)
 *   Chunk 7 (bytes 24-27): Debug value (uint32 BE)
 *
 * Status flags (byte 0, bit 7→0): Oil_Level, Limit_Switch, Spark, Motor_Trip, Buzzer, HVS, Motor_Reverse, Motor_Forward
 * Fault flags  (byte 1, bit 7→0): Oil_Level_2, Tank_Pressure, Motor_Trip_Fault, Moisture_Contamination,
 *                                  HVS_OFF, Change_Collector, Pump_Suction, Drain_Period_Over
 */

const STATUS_FLAG_NAMES = [
  'Oil_Level', 'Limit_Switch', 'Spark', 'Motor_Trip',
  'Buzzer', 'HVS', 'Motor_Reverse', 'Motor_Forward',
];

const FAULT_FLAG_NAMES = [
  'Oil_Level_2', 'Tank_Pressure', 'Motor_Trip_Fault', 'Moisture_Contamination',
  'HVS_OFF', 'Change_Collector', 'Pump_Suction', 'Drain_Period_Over',
];

function extractFlags(byteVal, names) {
  const flags = {};
  for (let i = 0; i < 8; i++) {
    flags[names[i]] = (byteVal >> (7 - i)) & 1;
  }
  return flags;
}

export function decodeHY(buf) {
  if (buf.length < 28) {
    return { logic_id: 2, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  }

  // Chunk 1 — flags and signal
  const statusFlags  = extractFlags(buf.readUInt8(0), STATUS_FLAG_NAMES);
  const faultFlags   = extractFlags(buf.readUInt8(1), FAULT_FLAG_NAMES);
  const signalStrength = buf.readUInt8(2);
  // byte 3: unused

  // Chunk 2 — electrical readings (1 byte each)
  const kvValue   = buf.readUInt8(4);
  const maValue   = buf.readUInt8(5);
  const kvMinimum = buf.readUInt8(6);
  const maMinimum = buf.readUInt8(7);

  // Chunk 3 — temperature and pressure
  const temperature = buf.readUInt16BE(8);
  const pressure    = buf.readUInt16BE(10);

  // Chunks 4-7 — runtime counters and debug
  const motorRuntimeMin  = buf.readUInt32BE(12);
  const totalRuntimeMin  = buf.readUInt32BE(16);
  const deviceRuntimeMin = buf.readUInt32BE(20);
  const debugValue       = buf.readUInt32BE(24);

  return {
    logic_id: 2,
    ...statusFlags,
    ...faultFlags,
    Signal_Strength:      signalStrength,
    kV_Value:             kvValue,
    mA_Value:             maValue,
    kV_Minimum:           kvMinimum,
    mA_Minimum:           maMinimum,
    Temperature:          temperature,
    Pressure:             pressure,
    Motor_Runtime_Min:    motorRuntimeMin,
    Total_Runtime_Min:    totalRuntimeMin,
    Device_Runtime_Min:   deviceRuntimeMin,
    Debug_Value:          debugValue,
    raw_hex:              buf.toString('hex'),
  };
}
