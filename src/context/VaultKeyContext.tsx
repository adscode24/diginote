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
}

const VaultKeyContext = createContext<VaultKeyContextType | undefined>(undefined);

export const VaultKeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{ uid: string | null; key: string | null }>({
    uid: null,
    key: null,
  });
  const [dismissed, setDismissed] = useState(false);

  const unlock = useCallback((uid: string, passphrase: string) => {
    setVaultPassphrase(uid, passphrase);
    setState({ uid, key: passphrase });
    setDismissed(false);
  }, []);

  const lock = useCallback((uid?: string) => {
    clearVaultPassphrase(uid);
    setState(prev => (uid && prev.uid !== uid ? prev : { uid: null, key: null }));
    setDismissed(false);
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);
  const reopen = useCallback(() => setDismissed(false), []);

  // Sinkronkan state bila kunci sudah ada di session (mis. refresh tab)
  const effectiveKey =
    state.key ?? (state.uid ? getVaultPassphrase(state.uid) : null);

  return (
    <VaultKeyContext.Provider
      value={{ vaultKey: effectiveKey, vaultKeyUid: state.uid, unlock, lock, dismissed, dismiss, reopen }}
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
