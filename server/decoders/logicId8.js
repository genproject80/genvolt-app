/**
 * LogicId 8 — GenVolt Ultra v1 (GV-ULTRA1)
 * All-in-one payload: energy + environment + GPS in a single frame.
 *
 * Payload: 29 bytes
 *   bytes 0–1  : voltage_mv     UInt16BE  millivolts
 *   bytes 2–3  : current_ma     UInt16BE  milliamps
 *   bytes 4–7  : power_mw       UInt32BE  milliwatts
 *   bytes 8–9  : temperature_c  Int16BE   × 100  (e.g. 2350 → 23.50 °C)
 *   bytes 10–11: humidity_pct   UInt16BE  × 100  (e.g. 6000 → 60.00 %)
 *   bytes 12–15: pressure_hpa   UInt32BE  pascals
 *   bytes 16–19: latitude       Int32BE   × 1e6
 *   bytes 20–23: longitude      Int32BE   × 1e6
 *   bytes 24–25: altitude_m     UInt16BE  metres
 *   bytes 26–27: speed_kmh      UInt16BE  km/h
 *   byte  28   : satellites     UInt8     count
 */
export function decodeLogic8(buf) {
  if (buf.length < 29) return { logic_id: 8, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  return {
    logic_id:      8,
    voltage_mv:    buf.readUInt16BE(0),
    current_ma:    buf.readUInt16BE(2),
    power_mw:      buf.readUInt32BE(4),
    temperature_c: parseFloat((buf.readInt16BE(8)   / 100).toFixed(2)),
    humidity_pct:  parseFloat((buf.readUInt16BE(10) / 100).toFixed(2)),
    pressure_hpa:  buf.readUInt32BE(12),
    latitude:      parseFloat((buf.readInt32BE(16)  / 1e6).toFixed(6)),
    longitude:     parseFloat((buf.readInt32BE(20)  / 1e6).toFixed(6)),
    altitude_m:    buf.readUInt16BE(24),
    speed_kmh:     buf.readUInt16BE(26),
    satellites:    buf.readUInt8(28),
    raw_hex:       buf.toString('hex'),
  };
}
