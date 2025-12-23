export function strip0x(hex: string) {
  return hex.startsWith('0x') ? hex.slice(2) : hex;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = strip0x(hex);
  if (normalized.length % 2 !== 0) throw new Error('Invalid hex length');
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

