import { encryptData, decryptData } from './crypto';

export interface SyncPayload {
  transactions: unknown[];
  categories: unknown[];
  accounts?: unknown[];
  debts: unknown[];
  reminderSettings: unknown;
  timestamp: number;
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
