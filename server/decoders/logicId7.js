/**
 * LogicId 7 — EV Charger Meter v1 (EV-M1)
 * EV charging station — energy fields plus a session energy counter.
 *
 * Payload: 12 bytes
 *   bytes 0–1  : voltage_mv   UInt16BE  millivolts
 *   bytes 2–3  : current_ma   UInt16BE  milliamps
 *   bytes 4–7  : power_mw     UInt32BE  milliwatts
 *   bytes 8–11 : energy_wh    UInt32BE  watt-hours consumed in current charging session
 */
export function decodeLogic7(buf) {
  if (buf.length < 12) return { logic_id: 7, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  return {
    logic_id:   7,
    voltage_mv: buf.readUInt16BE(0),
    current_ma: buf.readUInt16BE(2),
    power_mw:   buf.readUInt32BE(4),
    energy_wh:  buf.readUInt32BE(8),
    raw_hex:    buf.toString('hex'),
  };
}
