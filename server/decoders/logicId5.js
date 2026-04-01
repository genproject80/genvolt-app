/**
 * LogicId 5 — GenVolt Pro Multi-Sensor v1 (GV-PRO1)
 * Combined energy + environment in a single payload.
 *
 * Payload: 16 bytes
 *   bytes 0–1  : voltage_mv      UInt16BE  millivolts
 *   bytes 2–3  : current_ma      UInt16BE  milliamps
 *   bytes 4–7  : power_mw        UInt32BE  milliwatts
 *   bytes 8–9  : temperature_c   Int16BE   × 100  (e.g. 2350 → 23.50 °C)
 *   bytes 10–11: humidity_pct    UInt16BE  × 100  (e.g. 6000 → 60.00 %)
 *   bytes 12–15: pressure_hpa    UInt32BE  pascals
 */
export function decodeLogic5(buf) {
  if (buf.length < 16) return { logic_id: 5, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  return {
    logic_id:      5,
    voltage_mv:    buf.readUInt16BE(0),
    current_ma:    buf.readUInt16BE(2),
    power_mw:      buf.readUInt32BE(4),
    temperature_c: parseFloat((buf.readInt16BE(8)   / 100).toFixed(2)),
    humidity_pct:  parseFloat((buf.readUInt16BE(10) / 100).toFixed(2)),
    pressure_hpa:  buf.readUInt32BE(12),
    raw_hex:       buf.toString('hex'),
  };
}
