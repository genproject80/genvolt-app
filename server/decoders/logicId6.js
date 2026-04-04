/**
 * LogicId 6 — GenVolt Fleet Tracker v1 (GV-FLT1)
 * Combined energy + GPS in a single payload.
 *
 * Payload: 21 bytes
 *   bytes 0–1  : voltage_mv   UInt16BE  millivolts
 *   bytes 2–3  : current_ma   UInt16BE  milliamps
 *   bytes 4–7  : power_mw     UInt32BE  milliwatts
 *   bytes 8–11 : latitude     Int32BE   × 1e6  (e.g. 28401234 → 28.401234°)
 *   bytes 12–15: longitude    Int32BE   × 1e6
 *   bytes 16–17: altitude_m   UInt16BE  metres
 *   bytes 18–19: speed_kmh    UInt16BE  km/h
 *   byte  20   : satellites   UInt8     count
 */
export function decodeLogic6(buf) {
  if (buf.length < 21) return { logic_id: 6, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  return {
    logic_id:   6,
    voltage_mv: buf.readUInt16BE(0),
    current_ma: buf.readUInt16BE(2),
    power_mw:   buf.readUInt32BE(4),
    latitude:   parseFloat((buf.readInt32BE(8)  / 1e6).toFixed(6)),
    longitude:  parseFloat((buf.readInt32BE(12) / 1e6).toFixed(6)),
    altitude_m: buf.readUInt16BE(16),
    speed_kmh:  buf.readUInt16BE(18),
    satellites: buf.readUInt8(20),
    raw_hex:    buf.toString('hex'),
  };
}
