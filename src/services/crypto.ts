/**
 * Client-Side Military-Grade Encryption Service (AES-GCM 256-bit + PBKDF2)
 * Ensures user's financial privacy with zero-knowledge encryption.
 */

// Helper to convert ArrayBuffer to Base64
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Derive AES-GCM key from user passphrase using PBKDF2
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedPackage {
  v: number; // version
  s: string; // salt base64
  i: string; // iv base64
  c: string; // ciphertext base64
}

/**
 * Encrypt arbitrary object / text with passphrase
 */
export async function encryptData(data: unknown, passphrase: string): Promise<string> {
  if (!passphrase) {
    throw new Error('Kata sandi enkripsi wajib diisi');
  }

  const plainText = typeof data === 'string' ? data : JSON.stringify(data);
  const enc = new TextEncoder();
  const encodedPlain = enc.encode(plainText);

  // Generate 16 bytes salt & 12 bytes IV
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const key = await deriveKey(passphrase, salt);

  const cipherBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encodedPlain
  );

  const pack: EncryptedPackage = {
    v: 1,
    s: bufferToBase64(salt.buffer),
    i: bufferToBase64(iv.buffer),
    c: bufferToBase64(cipherBuffer),
  };

  return JSON.stringify(pack);
}

/**
 * Decrypt encrypted package with passphrase
 */
export async function decryptData<T = unknown>(encryptedJson: string, passphrase: string): Promise<T> {
  if (!passphrase) {
    throw new Error('Kata sandi enkripsi wajib diisi');
  }

  let pack: EncryptedPackage;
  try {
    pack = JSON.parse(encryptedJson);
    if (!pack.s || !pack.i || !pack.c) {
      throw new Error('Format data enkripsi tidak valid');
    }
  } catch {
    throw new Error('Data enkripsi rusak atau tidak valid');
  }

  const salt = new Uint8Array(base64ToBuffer(pack.s));
  const iv = new Uint8Array(base64ToBuffer(pack.i));
  const cipherBuffer = base64ToBuffer(pack.c);

  const key = await deriveKey(passphrase, salt);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      cipherBuffer
    );

    const dec = new TextDecoder();
    const plainText = dec.decode(decryptedBuffer);

    try {
      return JSON.parse(plainText) as T;
    } catch {
      return plainText as unknown as T;
    }
  } catch {
    throw new Error('Kata sandi salah atau integritas data telah dimodifikasi');
  }
}

/**
 * Generate a friendly Vault ID (e.g. DN-7839-4412)
 */
export function generateVaultId(): string {
  const part1 = Math.floor(1000 + Math.random() * 9000);
  const part2 = Math.floor(1000 + Math.random() * 9000);
  return `DN-${part1}-${part2}`;
}

/**
 * SHA-256 quick hash for verifying passphrase without saving plaintext
 */
export async function hashPassphrase(passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', enc.encode(passphrase));
  return bufferToBase64(hashBuffer);
}
