/**
 * LogicId 1 — Voltage / Power payload
 * Byte offsets are placeholders — update with actual firmware spec.
 */
export function decodeLogic1(buf) {
  if (buf.length < 8) return { logic_id: 1, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  return {
    logic_id:   1,
    voltage_mv: buf.readUInt16BE(0),   // bytes 0-1: voltage in millivolts
    current_ma: buf.readUInt16BE(2),   // bytes 2-3: current in milliamps
    power_mw:   buf.readUInt32BE(4),   // bytes 4-7: power in milliwatts
    raw_hex:    buf.toString('hex'),
  };
}
