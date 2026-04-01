/**
 * LogicId 4 — GenVolt Meter v2 (GV-M2)
 * Energy meter v2 — same core fields as logicId 1 with an additional power_factor field.
 *
 * Payload: 10 bytes
 *   bytes 0–1  : voltage_mv     UInt16BE  millivolts
 *   bytes 2–3  : current_ma     UInt16BE  milliamps
 *   bytes 4–7  : power_mw       UInt32BE  milliwatts
 *   bytes 8–9  : power_factor   UInt16BE  × 100  (e.g. 9500 → 0.95)
 */
export function decodeLogic4(buf) {
  if (buf.length < 10) return { logic_id: 4, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  return {
    logic_id:     4,
    voltage_mv:   buf.readUInt16BE(0),
    current_ma:   buf.readUInt16BE(2),
    power_mw:     buf.readUInt32BE(4),
    power_factor: parseFloat((buf.readUInt16BE(8) / 100).toFixed(2)),
    raw_hex:      buf.toString('hex'),
  };
}
