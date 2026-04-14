/**
 * HK Decoder — P3 Logic (SICK sensor, event-based)
 * Model: HK
 * Logic ID: 1
 *
 * Decodes a 32-byte (64 hex char) payload split into 8 blocks of 4 bytes.
 *
 * Block layout:
 *   Block 1 (bytes  0-3):  Event type + signal strength (nibbles), motor ON time, wheel threshold
 *   Block 2 (bytes  4-7):  IMSI part 1 (uint32 BE)
 *   Block 3 (bytes  8-11): IMSI part 2 (uint32 BE)
 *   Block 4 (bytes 12-15): Unused
 *   Block 5 (bytes 16-19): Wheels detected (uint16 BE), average current mA (uint16 BE)
 *   Block 6 (bytes 20-23): Min current mA (uint16 BE), max current mA (uint16 BE)
 *   Block 7 (bytes 24-27): Motor OFF time min (uint16 BE), battery voltage mV (uint16 BE)
 *   Block 8 (bytes 28-31): Debug value (uint32 BE)
 */

const EVENT_TYPE_DESCRIPTIONS = {
  0: 'Event_Idle',
  1: 'Event_Power_ON',
  2: 'Event_Train_Passed_Motor_ON',
  3: 'Event_Train_Passed_Motor_OFF',
  4: 'Event_Low_Battery',
  5: 'Event_Heartbit',
  6: 'Event_config_cloud',
  7: 'Event_config_HMI',
  8: 'Event_DevicePauseUnpause',
  9: 'Event_DeviceAct',
};

export function decodeHK(buf) {
  if (buf.length < 32) {
    return { logic_id: 1, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  }

  // Block 1
  const byte0          = buf.readUInt8(0);
  const eventType      = (byte0 >> 4) & 0x0F;
  const signalStrength = byte0 & 0x0F;
  const motorOnTimeSec = buf.readUInt8(1);
  const wheelThreshold = buf.readUInt8(3);

  // Blocks 2 & 3 — IMSI
  const imsiPart1 = buf.readUInt32BE(4).toString();
  const imsiPart2 = buf.readUInt32BE(8).toString();
  const imsi      = imsiPart1 + imsiPart2;

  // Block 4 — Unused

  // Block 5
  const numberOfWheelsDetected = buf.readUInt16BE(16);
  const motorCurrentAverageMa  = buf.readUInt16BE(18);

  // Block 6
  const motorCurrentMinMa = buf.readUInt16BE(20);
  const motorCurrentMaxMa = buf.readUInt16BE(22);

  // Block 7
  const motorOffTimeMin  = buf.readUInt16BE(24);
  const batteryVoltageMv = buf.readUInt16BE(26);

  // Block 8
  const debugValue = buf.readUInt32BE(28);

  return {
    logic_id:                   1,
    Event_Type:                 eventType,
    Event_Type_Description:     EVENT_TYPE_DESCRIPTIONS[eventType] ?? 'Unknown',
    Signal_Strength:            signalStrength,
    Motor_ON_Time_sec:          motorOnTimeSec,
    Wheel_Threshold:            wheelThreshold,
    IMSI:                       imsi,
    Number_of_Wheels_Detected:  numberOfWheelsDetected,
    Motor_Current_Average_mA:   motorCurrentAverageMa,
    Motor_Current_Min_mA:       motorCurrentMinMa,
    Motor_Current_Max_mA:       motorCurrentMaxMa,
    Motor_OFF_Time_min:         motorOffTimeMin,
    Battery_Voltage_mV:         batteryVoltageMv,
    Debug_Value:                debugValue,
    raw_hex:                    buf.toString('hex'),
  };
}