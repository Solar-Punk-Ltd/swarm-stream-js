import { HEX_RADIX } from './constants';

export function parseVint(buffer: Uint8Array, offset = 0) {
  const firstByte = buffer[offset];
  let mask = 0x80;
  let lengthOfLengthDescriptor = 1;

  while (lengthOfLengthDescriptor <= 8 && !(firstByte & mask)) {
    mask >>= 1;
    lengthOfLengthDescriptor++;
  }

  if (lengthOfLengthDescriptor > 8) {
    throw new Error('Invalid VINT length');
  }

  let length = firstByte & (mask - 1);
  for (let i = 1; i < lengthOfLengthDescriptor; i++) {
    length = (length << 8) | buffer[offset + i];
  }

  const valueOffset = offset + lengthOfLengthDescriptor;
  let value = buffer[valueOffset];
  for (let i = 1; i < length; i++) {
    value = (value << 8) | buffer[valueOffset + i];
  }

  return {
    lengthOfLengthDescriptor,
    length,
    value,
  };
}

export function parseEBMLString(buffer: Uint8Array, offset = 0) {
  const { length, lengthOfLengthDescriptor } = parseVint(buffer, offset);
  const stringStartOffset = offset + lengthOfLengthDescriptor;
  const stringEndOffset = stringStartOffset + length;

  const decoder = new TextDecoder('utf-8');
  const stringValue = decoder.decode(buffer.subarray(stringStartOffset, stringEndOffset));
  return stringValue;
}

export function findHexInUint8Array(array: Uint8Array, hex: string) {
  const dataView = new DataView(array.buffer);
  const compareBytes = hex.length / 2;
  const hexInt =
    compareBytes === 3
      ? [
          parseInt(hex.substring(0, 4), HEX_RADIX), // First 16 bits
          parseInt(hex.substring(4), HEX_RADIX), // Last 8 bits
        ]
      : parseInt(hex, HEX_RADIX);

  // false -> big endian
  // Set for 16, 24, 32 bits; ignored for 8 bits
  const endianness = false;

  for (let i = 0; i <= array.length - compareBytes; i++) {
    if (
      (compareBytes === 1 && dataView.getUint8(i) === hexInt) ||
      (compareBytes === 2 && dataView.getUint16(i, endianness) === hexInt) ||
      (compareBytes === 4 && dataView.getUint32(i, endianness) === hexInt) ||
      (compareBytes === 3 &&
        dataView.getUint16(i, endianness) === (hexInt as number[])[0] &&
        dataView.getUint8(i + 2) === (hexInt as number[])[1])
    ) {
      return i;
    }
  }

  return -1;
}
