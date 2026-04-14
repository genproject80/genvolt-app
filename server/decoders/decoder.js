import { decodeHK } from './hk_decoder.js';
import { decodeHY } from './hy_decoder.js';

const DECODERS = {
  1: decodeHK,  // HK — P3 SICK sensor (logicId 1, 32 bytes)
  2: decodeHY,  // HY — P4 HyPure telemetry (logicId 2, 28 bytes)
};

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
