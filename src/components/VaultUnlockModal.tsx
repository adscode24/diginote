import React, { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, Lock } from 'lucide-react';
import { useVaultKey } from '../context/VaultKeyContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { getVaultDoc, type VaultDoc } from '../services/onlineSync';
import { decryptData } from '../services/crypto';
import { getVaultSeen, setVaultSeen } from '../services/vaultSession';

interface VaultUnlockModalProps {
  uid: string;
  email?: string;
}

/**
 * Gerbang frasa sandi vault. Hanya muncul bila:
 * - vault cloud SUDAH ADA + lebih baru dari yang terakhir dilihat + belum dibuka
 *   (artinya ada perubahan data dari perangkat lain), atau
 * - pengguna sengaja membukanya (tombol di Pengaturan) untuk membuat vault baru.
 * Kunci yang pernah dimasukkan tersimpan di perangkat ini sehingga tidak ditanya berulang.
 */
export const VaultUnlockModal: React.FC<VaultUnlockModalProps> = ({ uid, email }) => {
  const { vaultKey, vaultKeyUid, unlock, dismiss, promptOpen } = useVaultKey();
  const [remote, setRemote] = useState<VaultDoc | null>(null);
  const [checked, setChecked] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const hasKey = !!vaultKey && vaultKeyUid === uid;

  useEffect(() => {
    if (hasKey) return;
    setChecked(false);
    setRemote(null);
    getVaultDoc(uid)
      .then(doc => {
        setRemote(doc);
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [uid, hasKey]);

  const hasUnseenChanges = !!remote && remote.updatedAt > getVaultSeen(uid);
  // Mode buat: hanya bila diminta eksplisit dan belum ada vault
  const showCreate = !hasKey && promptOpen && checked && !remote;
  // Mode buka: ada perubahan yang belum dilihat dan belum dibuka
  const showUnlock = !hasKey && checked && hasUnseenChanges;
  const open = showCreate || showUnlock;
  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setError('');
      setPassphrase('');
      setConfirm('');
    }
  }, [open ]);

  if (!open) return null;
  const mode: 'create' | 'unlock' = showCreate ? 'create' : 'unlock';

  const handleDismiss = () => {
    if (remote) setVaultSeen(uid, remote.updatedAt);
    dismiss();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.length < 6) {
      setError('Frasa sandi minimal 6 karakter');
      return;
    }
    if (passphrase !== confirm) {
      setError('Konfirmasi frasa sandi tidak sama');
      return;
    }
    setError('');
    unlock(uid, passphrase);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase) {
      setError('Masukkan frasa sandi vault Anda');
      return;
    }
    setError('');
    setChecking(true);
    try {
      const latest = remote || (await getVaultDoc(uid));
      if (!latest) {
        unlock(uid, passphrase);
        return;
      }
      // Verifikasi dengan trial-decrypt sebelum membuka
      await decryptData(latest.payload, passphrase);
      setVaultSeen(uid, latest.updatedAt);
      unlock(uid, passphrase);
    } catch {
      setError('Frasa sandi salah. Data tidak dapat dibuka.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200">
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            {mode === 'create' ? <ShieldCheck className="w-5 h-5" /> : <KeyRound className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {mode === 'create' ? 'Amankan Vault Cloud Anda' : 'Ada Perubahan Baru'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {email || 'Akun cloud'} · {mode === 'create' ? 'buat frasa sandi baru' : 'masukkan frasa sandi'}
            </p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <form onSubmit={mode === 'create' ? handleCreate : handleUnlock} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {mode === 'create' ? (
                <>
                  Buat <strong>frasa sandi vault</strong> untuk mengenkripsi data Anda. Data di server
                  hanya tersimpan terenkripsi — <strong>jangan sampai lupa</strong>, karena kami tidak
                  bisa memulihkannya.
                </>
              ) : (
                <>
                  Ada <strong>perubahan data dari perangkat lain</strong> yang belum Anda lihat.
                  Masukkan <strong>frasa sandi vault</strong> untuk membuka dan menyelaraskannya.
                </>
              )}
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Frasa Sandi Vault *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  autoComplete="new-password"
                  className="w-full pl-9 pr-16 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400 hover:text-slate-600"
                >
                  {showPass ? 'Sembunyi' : 'Lihat'}
                </button>
              </div>
            </div>

            {mode === 'create' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Konfirmasi Frasa Sandi *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Ulangi frasa sandi"
                    autoComplete="new-password"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={checking}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white shadow-xs transition"
            >
              {checking ? 'Memeriksa…' : mode === 'create' ? 'Buat & Aktifkan Sinkronisasi' : 'Buka & Selaraskan'}
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-full py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
            >
              Nanti Saja
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
