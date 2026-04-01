/**
 * LogicId 2 — Temperature / Environment payload
 * Byte offsets are placeholders — update with actual firmware spec.
 */
export function decodeLogic2(buf) {
  if (buf.length < 8) return { logic_id: 2, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  return {
    logic_id:       2,
    temperature_c:  parseFloat((buf.readInt16BE(0) / 100).toFixed(2)),   // bytes 0-1: temp × 100
    humidity_pct:   parseFloat((buf.readUInt16BE(2) / 100).toFixed(2)),  // bytes 2-3: humidity × 100
    pressure_hpa:   buf.readUInt32BE(4),                                  // bytes 4-7: pressure in Pa
    raw_hex:        buf.toString('hex'),
  };
}
