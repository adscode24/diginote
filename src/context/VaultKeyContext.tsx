import React, { createContext, useContext, useState, useCallback } from 'react';
import { setVaultPassphrase, getVaultPassphrase, clearVaultPassphrase } from '../services/vaultSession';

interface VaultKeyContextType {
  /** Frasa sandi vault untuk pengguna aktif (null = terkunci). */
  vaultKey: string | null;
  vaultKeyUid: string | null;
  unlock: (uid: string, passphrase: string) => void;
  lock: (uid?: string) => void;
  dismissed: boolean;
  dismiss: () => void;
  reopen: () => void;
  /** Buka modal secara eksplisit (mis. dari Pengaturan), walau tidak ada perubahan baru. */
  promptOpen: boolean;
  requestOpen: () => void;
  /** Pulihkan kunci tersimpan ke state (dipanggil saat login/refresh). */
  restore: (uid: string) => void;
}

const VaultKeyContext = createContext<VaultKeyContextType | undefined>(undefined);

export const VaultKeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{ uid: string | null; key: string | null }>({
    uid: null,
    key: null,
  });
  const [dismissed, setDismissed] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const unlock = useCallback((uid: string, passphrase: string) => {
    setVaultPassphrase(uid, passphrase);
    setState({ uid, key: passphrase });
    setDismissed(false);
    setPromptOpen(false);
  }, []);

  const lock = useCallback((uid?: string) => {
    clearVaultPassphrase(uid);
    setState(prev => (uid && prev.uid !== uid ? prev : { uid: null, key: null }));
    setDismissed(false);
    setPromptOpen(false);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setPromptOpen(false);
  }, []);
  const reopen = useCallback(() => setDismissed(false), []);
  const requestOpen = useCallback(() => {
    setDismissed(false);
    setPromptOpen(true);
  }, []);

  // Pulihkan kunci dari penyimpanan lokal (agar tidak ditanya ulang tiap refresh/tab)
  const restore = useCallback((uid: string) => {
    const stored = getVaultPassphrase(uid);
    if (stored) setState({ uid, key: stored });
  }, []);

  // Sinkronkan state bila kunci sudah ada di session (mis. refresh tab)
  const effectiveKey =
    state.key ?? (state.uid ? getVaultPassphrase(state.uid) : null);

  return (
    <VaultKeyContext.Provider
      value={{ vaultKey: effectiveKey, vaultKeyUid: state.uid, unlock, lock, dismissed, dismiss, reopen, promptOpen, requestOpen, restore }}
    >
      {children}
    </VaultKeyContext.Provider>
  );
};

export function useVaultKey() {
  const context = useContext(VaultKeyContext);
  if (!context) {
    throw new Error('useVaultKey must be used within a VaultKeyProvider');
  }
  return context;
}
