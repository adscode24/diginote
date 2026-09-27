/**
 * Frasa sandi vault hanya disimpan di memori + sessionStorage (per tab).
 * Tidak pernah dikirim ke server dalam bentuk apa pun.
 */

let memoryKey: { uid: string; passphrase: string } | null = null;

function sessionKey(uid: string) {
  return `diginote_${uid}_vault_key`;
}

export function setVaultPassphrase(uid: string, passphrase: string) {
  memoryKey = { uid, passphrase };
  try {
    sessionStorage.setItem(sessionKey(uid), passphrase);
  } catch (e) {
    console.error(e);
  }
}

export function getVaultPassphrase(uid: string): string | null {
  if (memoryKey && memoryKey.uid === uid) return memoryKey.passphrase;
  try {
    const stored = sessionStorage.getItem(sessionKey(uid));
    if (stored) {
      memoryKey = { uid, passphrase: stored };
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
    } else {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.endsWith('_vault_key')) keys.push(k);
      }
      keys.forEach(k => sessionStorage.removeItem(k));
    }
  } catch (e) {
    console.error(e);
  }
}
