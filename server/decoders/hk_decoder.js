/**
 * HK Decoder — P3 Logic (SICK sensor, event-based)
 * Model: HK
 * Logic ID: 1
 *
 * Decodes a 32-byte (64 hex char) payload split into 8 blocks of 4 bytes.
 *
 * Block layout:
 *   Block 1 (bytes  0-3):  Event type + signal strength (nibbles), motor ON time, motor OFF time, wheel threshold
 *   Block 2 (bytes  4-7):  GPS integer parts — latitude (LE uint16), longitude (LE uint16)
 *   Block 3 (bytes  8-11): Latitude decimal (uint32 BE)
 *   Block 4 (bytes 12-15): Longitude decimal (uint32 BE)
 *   Block 5 (bytes 16-19): Wheels detected (uint16 BE), average current mA (uint16 BE)
 *   Block 6 (bytes 20-23): Min current mA (uint16 BE), max current mA (uint16 BE)
 *   Block 7 (bytes 24-27): Binary flags (byte), reserved (byte), battery voltage mV (uint16 BE)
 *   Block 8 (bytes 28-31): Debug value (uint32 BE)
 */

const EVENT_TYPE_DESCRIPTIONS = {
  0: 'Event_Idle',
  1: 'Event_Power_ON',
  2: 'Event_Train_Pass_Normal',
  3: 'Event_Train_Pass',
  4: 'Event_Low_Battery',
  5: 'Event_Heartbit',
  6: 'Event_Invalid',
};

const TRAIN_PASSED_FLAG_MASK = 0x80; // bit 7
const MOTOR_ON_FLAG_MASK     = 0x40; // bit 6

export function decodeHK(buf) {
  if (buf.length < 32) {
    return { logic_id: 1, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  }

  // Block 1
  const byte0         = buf.readUInt8(0);
  const eventType     = (byte0 >> 4) & 0x0F;
  const signalStrength = byte0 & 0x0F;
  const motorOnTimeSec  = buf.readUInt8(1);
  const motorOffTimeMin = buf.readUInt8(2);
  const wheelThreshold  = buf.readUInt8(3);

  // Block 2 — GPS integers with byte-swap (little-endian)
  const latitudeInteger  = buf.readUInt16LE(4);
  const longitudeInteger = buf.readUInt16LE(6);

  // Block 3 & 4 — GPS decimal parts
  const latitudeDecimal  = buf.readUInt32BE(8);
  const longitudeDecimal = buf.readUInt32BE(12);

  const latitude  = parseFloat(`${latitudeInteger}.${latitudeDecimal}`);
  const longitude = parseFloat(`${longitudeInteger}.${longitudeDecimal}`);

  // Block 5
  const numberOfWheelsDetected   = buf.readUInt16BE(16);
  const motorCurrentAverageMa    = buf.readUInt16BE(18);

  // Block 6
  const motorCurrentMinMa = buf.readUInt16BE(20);
  const motorCurrentMaxMa = buf.readUInt16BE(22);

  // Block 7
  const flagsByte        = buf.readUInt8(24);
  const trainPassedFlag  = (flagsByte & TRAIN_PASSED_FLAG_MASK) ? 1 : 0;
  const motorOnFlag      = (flagsByte & MOTOR_ON_FLAG_MASK)     ? 1 : 0;
  const batteryVoltageMv = buf.readUInt16BE(26);

  // Block 8
  const debugValue = buf.readUInt32BE(28);

  return {
    logic_id:                   1,
    Event_Type:                 eventType,
    Event_Type_Description:     EVENT_TYPE_DESCRIPTIONS[eventType] ?? 'Unknown',
    Signal_Strength:            signalStrength,
    Motor_ON_Time_sec:          motorOnTimeSec,
    Motor_OFF_Time_min:         motorOffTimeMin,
    Wheel_Threshold:            wheelThreshold,
    Latitude:                   latitude,
    Longitude:                  longitude,
    Number_of_Wheels_Detected:  numberOfWheelsDetected,
    Motor_Current_Average_mA:   motorCurrentAverageMa,
    Motor_Current_Min_mA:       motorCurrentMinMa,
    Motor_Current_Max_mA:       motorCurrentMaxMa,
    Train_Passed_Flag:          trainPassedFlag,
    Motor_ON_Flag:              motorOnFlag,
    Battery_Voltage_mV:         batteryVoltageMv,
    Debug_Value:                debugValue,
    raw_hex:                    buf.toString('hex'),
  };
}
