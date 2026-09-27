import { encryptData, decryptData } from './crypto';

export interface SyncPayload {
  transactions: unknown[];
  categories: unknown[];
  accounts?: unknown[];
  debts: unknown[];
  reminderSettings: unknown;
  timestamp: number;
}

export interface CloudSyncResponse {
  success: boolean;
  vaultId: string;
  updatedAt: number;
}

/**
 * Push encrypted app state to the Cloud Sync Vault
 */
export async function pushToCloudVault(
  vaultId: string,
  passphrase: string,
  data: SyncPayload
): Promise<{ success: boolean; updatedAt: number }> {
  if (!vaultId) throw new Error('Kode Vault belum ditentukan');
  if (!passphrase) throw new Error('Kata sandi enkripsi dibutuhkan');

  // Encrypt client-side first
  const encryptedPayload = await encryptData(data, passphrase);

  const response = await fetch(`/api/sync/${encodeURIComponent(vaultId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payload: encryptedPayload,
      updatedAt: Date.now(),
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Gagal menyinkronkan data (${response.status})`);
  }

  const result = await response.json();
  return { success: true, updatedAt: result.updatedAt };
}

/**
 * Pull and decrypt app state from the Cloud Sync Vault
 */
export async function pullFromCloudVault(
  vaultId: string,
  passphrase: string
): Promise<SyncPayload> {
  if (!vaultId) throw new Error('Kode Vault belum ditentukan');
  if (!passphrase) throw new Error('Kata sandi enkripsi dibutuhkan');

  const response = await fetch(`/api/sync/${encodeURIComponent(vaultId)}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Data Vault belum ditemukan di server. Pastikan kode Vault benar atau lakukan sinkronisasi pertama kali.');
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Gagal mengambil data dari server (${response.status})`);
  }

  const result = await response.json();
  if (!result.payload) {
    throw new Error('Data tidak ditemukan dalam respons Cloud');
  }

  // Decrypt client-side
  const decrypted = await decryptData<SyncPayload>(result.payload, passphrase);
  return decrypted;
}

/**
 * Export backup as encrypted JSON file
 */
export async function exportEncryptedBackup(
  data: SyncPayload,
  passphrase: string,
  fileName = 'diginote_backup_terenkripsi.json'
): Promise<void> {
  const encrypted = await encryptData(data, passphrase);
  const blob = new Blob([encrypted], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import backup from encrypted JSON file
 */
export async function importEncryptedBackup(
  file: File,
  passphrase: string
): Promise<SyncPayload> {
  const text = await file.text();
  const decrypted = await decryptData<SyncPayload>(text, passphrase);
  return decrypted;
}
