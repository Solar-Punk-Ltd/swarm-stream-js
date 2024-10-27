import { BrandedType, FlavoredType } from '@ethersphere/bee-js';

import { HEX_RADIX } from '../constants';

/**
 * Nominal type to represent hex strings WITHOUT '0x' prefix.
 * For example for 32 bytes hex representation you have to use 64 length.
 * TODO: Make Length mandatory: https://github.com/ethersphere/bee-js/issues/208
 */
export type HexString<Length extends number = number> = FlavoredType<
  string & {
    readonly length: Length;
  },
  'HexString'
>;

/**
 * Type for HexString with prefix.
 * The main hex type used internally should be non-prefixed HexString
 * and therefore this type should be used as least as possible.
 * Because of that it does not contain the Length property as the variables
 * should be validated and converted to HexString ASAP.
 */
export type PrefixedHexString = BrandedType<string, 'PrefixedHexString'>;

/**
 * Type guard for HexStrings.
 * Requires no 0x prefix!
 *
 * TODO: Make Length mandatory: https://github.com/ethersphere/bee-js/issues/208
 *
 * @param s string input
 * @param len expected length of the HexString
 */
export function isHexString<Length extends number = number>(s: unknown, len?: number): s is HexString<Length> {
  return typeof s === 'string' && /^[0-9a-f]+$/i.test(s) && (!len || s.length === len);
}

/**
 * Type guard for PrefixedHexStrings.
 * Does enforce presence of 0x prefix!
 *
 * @param s string input
 */
export function isPrefixedHexString(s: unknown): s is PrefixedHexString {
  return typeof s === 'string' && /^0x[0-9a-f]+$/i.test(s);
}

/**
 * Converts array of number or Uint8Array to HexString without prefix.
 *
 * @param bytes   The input array
 * @param len     The length of the non prefixed HexString
 */
export function bytesToHex<Length extends number = number>(bytes: Uint8Array, len?: Length): HexString<Length> {
  const hexByte = (n: number) => n.toString(HEX_RADIX).padStart(2, '0');
  const hex = Array.from(bytes, hexByte).join('') as HexString<Length>;

  // TODO: Make Length mandatory: https://github.com/ethersphere/bee-js/issues/208
  if (len && hex.length !== len) {
    throw new TypeError(`Resulting HexString does not have expected length ${len}: ${hex}`);
  }

  return hex;
}
