/**
 * LogicId 3 — GPS / Location payload
 * Byte offsets are placeholders — update with actual firmware spec.
 * Example field1: "320c140a4a0016000006f6f5000d1e5d0025000000000000800033300000000e"
 */
export function decodeLogic3(buf) {
  if (buf.length < 13) return { logic_id: 3, error: 'Buffer too short', raw_hex: buf.toString('hex') };
  return {
    logic_id:   3,
    latitude:   parseFloat((buf.readInt32BE(0) / 1e6).toFixed(6)),   // bytes 0-3: lat × 1e6
    longitude:  parseFloat((buf.readInt32BE(4) / 1e6).toFixed(6)),   // bytes 4-7: lng × 1e6
    altitude_m: buf.readUInt16BE(8),                                  // bytes 8-9: altitude in metres
    speed_kmh:  buf.readUInt16BE(10),                                 // bytes 10-11: speed km/h
    satellites: buf.readUInt8(12),                                    // byte 12: satellite count
    raw_hex:    buf.toString('hex'),
  };
}
