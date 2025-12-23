import { bytesToHex, hexToBytes } from './hex';

async function deriveAesKeyFromAddress(address: string): Promise<CryptoKey> {
  const addressBytes = hexToBytes(address);
  const digest = await crypto.subtle.digest('SHA-256', addressBytes);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptMessage(sharedKeyAddress: string, plaintext: string): Promise<`0x${string}`> {
  const key = await deriveAesKeyFromAddress(sharedKeyAddress);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const ctBytes = new Uint8Array(ciphertext);

  const combined = new Uint8Array(iv.length + ctBytes.length);
  combined.set(iv, 0);
  combined.set(ctBytes, iv.length);
  return bytesToHex(combined);
}

export async function decryptMessage(sharedKeyAddress: string, payloadHex: string): Promise<string> {
  const key = await deriveAesKeyFromAddress(sharedKeyAddress);
  const combined = hexToBytes(payloadHex);
  if (combined.length < 13) throw new Error('Encrypted payload too short');

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

