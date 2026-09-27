/**
 * Frasa sandi vault disimpan di memori + sessionStorage + localStorage (per akun).
 * Catatan keamanan: data terdekripsi juga di-cache di localStorage perangkat ini,
 * sehingga asumsi keamanannya setara — siapa memegang perangkat bisa membaca data
 * lokal. Server tetap hanya menyimpan ciphertext.
 */

let memoryKey: { uid: string; passphrase: string } | null = null;

function sessionKey(uid: string) {
  return `diginote_${uid}_vault_key`;
}

function localKey(uid: string) {
  return `diginote_${uid}_vault_key_persist`;
}

function seenKey(uid: string) {
  return `diginote_${uid}_vault_seen`;
}

export function setVaultPassphrase(uid: string, passphrase: string) {
  memoryKey = { uid, passphrase };
  try {
    sessionStorage.setItem(sessionKey(uid), passphrase);
    localStorage.setItem(localKey(uid), passphrase);
  } catch (e) {
    console.error(e);
  }
}

export function getVaultPassphrase(uid: string): string | null {
  if (memoryKey && memoryKey.uid === uid) return memoryKey.passphrase;
  try {
    const stored = sessionStorage.getItem(sessionKey(uid)) || localStorage.getItem(localKey(uid));
    if (stored) {
      memoryKey = { uid, passphrase: stored };
      try {
        sessionStorage.setItem(sessionKey(uid), stored);
      } catch {
        /* abaikan */
      }
      return stored;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

export function clearVaultPassphrase(uid?: string) {
  if (!uid || (memoryKey && memoryKey.uid === uid)) memoryKey = null;
  try {
    if (uid) {
      sessionStorage.removeItem(sessionKey(uid));
      localStorage.removeItem(localKey(uid));
    } else {
      const sessionKeys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.endsWith('_vault_key')) sessionKeys.push(k);
      }
      sessionKeys.forEach(k => sessionStorage.removeItem(k));
      const localKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.endsWith('_vault_key_persist')) localKeys.push(k);
      }
      localKeys.forEach(k => localStorage.removeItem(k));
    }
  } catch (e) {
    console.error(e);
  }
}

/** updatedAt remote terakhir yang sudah dilihat pengguna (agar tidak ditanya berulang). */
export function getVaultSeen(uid: string): number {
  try {
    return Number(localStorage.getItem(seenKey(uid)) || 0) || 0;
  } catch {
    return 0;
  }
}

export function setVaultSeen(uid: string, updatedAt: number) {
  try {
    const prev = getVaultSeen(uid);
    if (updatedAt > prev) localStorage.setItem(seenKey(uid), String(updatedAt));
  } catch (e) {
    console.error(e);
  }
}
