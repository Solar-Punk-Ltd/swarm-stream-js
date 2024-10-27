import { HEX_RADIX } from './constants';

export function incrementHexString(hexString: string, i = 1n) {
  const num = BigInt('0x' + hexString);
  return (num + i).toString(HEX_RADIX).padStart(HEX_RADIX, '0');
}

export function decrementHexString(hexString: string, i = 1n) {
  const num = BigInt('0x' + hexString);
  return (num - i).toString(HEX_RADIX).padStart(HEX_RADIX, '0');
}

export function divideDecimalByHex(decimal: number, hexString: string) {
  const hexAsDecimal = parseInt(hexString, HEX_RADIX);
  const result = decimal / hexAsDecimal;
  return result;
}
