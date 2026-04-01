import { decodeLogic1 } from './logicId1.js';
import { decodeLogic2 } from './logicId2.js';
import { decodeLogic3 } from './logicId3.js';
import { decodeLogic4 } from './logicId4.js';
import { decodeLogic5 } from './logicId5.js';
import { decodeLogic6 } from './logicId6.js';
import { decodeLogic7 } from './logicId7.js';
import { decodeLogic8 } from './logicId8.js';

const DECODERS = {
  1: decodeLogic1,  // GV-M1     — energy meter v1 (voltage, current, power)
  2: decodeLogic2,  // GV-ENV1   — environment (temperature, humidity, pressure)
  3: decodeLogic3,  // GV-GPS1   — GPS tracker (lat, lng, altitude, speed, satellites)
  4: decodeLogic4,  // GV-M2     — energy meter v2 (+ power_factor)
  5: decodeLogic5,  // GV-PRO1   — energy + environment combined
  6: decodeLogic6,  // GV-FLT1   — energy + GPS combined
  7: decodeLogic7,  // EV-M1     — EV charger (energy + session energy_wh)
  8: decodeLogic8,  // GV-ULTRA1 — all sensors combined
};

// Expected payload byte sizes per logicId — used to resolve logicId from model when
// the device does not include it in the telemetry message.
export const DECODER_BYTE_SIZES = {
  1: 8,   // voltage_mv(2) current_ma(2) power_mw(4)
  2: 8,   // temp×100(2s) humidity×100(2u) pressure_pa(4u)
  3: 13,  // lat(4s) lng(4s) alt(2u) spd(2u) sats(1u)
  4: 10,  // voltage_mv(2) current_ma(2) power_mw(4) pf×100(2u)
  5: 16,  // energy(8) + env(8)
  6: 21,  // energy(8) + GPS(13)
  7: 12,  // voltage_mv(2) current_ma(2) power_mw(4) energy_wh(4u)
  8: 29,  // energy(8) + env(8) + GPS(13)
};

/**
 * Resolve which logicId(s) from allowedIds match the given hex payload by byte size.
 * Returns an array of matching logicIds (usually exactly one).
 *
 * @param {number[]} allowedIds - logicIds permitted for this device's model
 * @param {string}   hexField   - hex-encoded payload from the device
 * @returns {number[]}
 */
export function resolveLogicIds(allowedIds, hexField) {
  if (!hexField) return [];
  const byteLen = hexField.length / 2;
  return allowedIds.filter(id => DECODER_BYTE_SIZES[id] === byteLen);
}

/**
 * Decode a hex-encoded telemetry field using the registered decoder for logicId.
 * @param {number} logicId
 * @param {string} hexField - hex string from device payload
 * @returns {object|null} decoded fields, or null if hexField is empty
 */
export function decode(logicId, hexField) {
  const decoder = DECODERS[logicId];
  if (!decoder) throw new Error(`No decoder registered for logicId=${logicId}`);
  if (!hexField) return null;
  const buf = Buffer.from(hexField, 'hex');
  return decoder(buf);
}

/**
 * Register a new decoder at runtime (for extension without modifying this file).
 */
export function registerDecoder(logicId, decoderFn) {
  DECODERS[logicId] = decoderFn;
}
