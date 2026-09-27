import React, { useState } from 'react';
import {
  X,
  Cloud,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  FileDown,
  FileUp,
  AlertCircle,
  RefreshCw,
  UploadCloud,
  DownloadCloud,
  KeyRound,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    cloudVaultId,
    syncStatus,
    lastSyncedAt,
    pushToVaultNow,
    pullFromVaultNow,
    exportBackupFile,
    importBackupFile,
  } = useFinance();
  const { currentUser } = useAuth();

  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleCopyVaultId = () => {
    if (!cloudVaultId) return;
    navigator.clipboard.writeText(cloudVaultId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePush = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const ok = await pushToVaultNow();
      setStatusMessage(
        ok
          ? { type: 'success', text: 'Data berhasil disinkronkan ke cloud!' }
          : { type: 'error', text: 'Sinkronisasi tidak dapat dilakukan saat ini.' }
      );
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal sinkronisasi' });
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const ok = await pullFromVaultNow();
      setStatusMessage(
        ok
          ? { type: 'success', text: 'Data terbaru dari cloud berhasil diterapkan!' }
          : { type: 'error', text: 'Tidak ada data baru atau penarikan gagal.' }
      );
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengambil data' });
    } finally {
      setBusy(false);
    }
  };

  const handleExportFile = async () => {
    if (!backupPassphrase.trim()) {
      setStatusMessage({ type: 'error', text: 'Masukkan kata sandi untuk mengenkripsi file cadangan.' });
      return;
    }
    try {
      await exportBackupFile(backupPassphrase);
      setStatusMessage({ type: 'success', text: 'File cadangan terenkripsi (.enc.json) berhasil diunduh.' });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengekspor file' });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!backupPassphrase.trim()) {
      setStatusMessage({ type: 'error', text: 'Masukkan kata sandi file cadangan untuk membukanya.' });
      return;
    }
    try {
      await importBackupFile(file, backupPassphrase);
      setStatusMessage({ type: 'success', text: 'Data cadangan berhasil dipulihkan!' });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mendekripsi file' });
    }
  };

  const statusLabel =
    syncStatus === 'synced'
      ? 'Tersinkron'
      : syncStatus === 'syncing'
      ? 'Menyinkronkan…'
      : syncStatus === 'connecting'
      ? 'Menghubungkan…'
      : syncStatus === 'offline'
      ? 'Lokal / Offline'
      : 'Gagal sinkron';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Sinkronisasi Cloud
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Satu akun berlaku di web, web-mobile, dan Android
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Security Banner */}
          <div className="p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200/80 dark:border-orange-800 flex items-start gap-2.5 text-xs text-orange-900 dark:text-orange-300">
            <ShieldCheck className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Vault pribadi per akun:</span>
              Hanya akun yang login (email + kata sandi) yang bisa membaca dan menulis
              vault-nya sendiri. Login dengan email yang sama di perangkat lain membuka
              data yang sama.
            </div>
          </div>

          {/* Account + Vault Code */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400">Akun:</span>
              <span className="font-bold text-slate-900 dark:text-white truncate max-w-[240px]">
                {currentUser?.email || currentUser?.name || '-'}
              </span>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Kode Vault Cloud (sama di semua perangkat = data sama)
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3.5 py-2 text-sm font-mono font-bold tracking-wider rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums">
                  {cloudVaultId || '…'}
                </div>
                <button
                  type="button"
                  onClick={handleCopyVaultId}
                  disabled={!cloudVaultId}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition disabled:opacity-50"
                >
                  {copied ? <Check className="w-4 h-4 text-orange-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400">Status:</span>
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin text-blue-500' : 'text-orange-500'}`} />
                <span>{statusLabel}</span>
              </span>
            </div>
            {lastSyncedAt && (
              <div className="text-[11px] text-slate-400">
                Terakhir sinkron:{' '}
                {new Date(lastSyncedAt).toLocaleString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
          </div>

          {/* Sync Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handlePush}
              disabled={busy}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{busy ? 'Memproses…' : 'Sinkronkan ke Cloud'}</span>
            </button>
            <button
              onClick={handlePull}
              disabled={busy}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <DownloadCloud className="w-4 h-4" />
              <span>{busy ? 'Memproses…' : 'Tarik dari Cloud'}</span>
            </button>
          </div>

          {/* Offline File Backup & Restore (terenkripsi kata sandi) */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Cadangan berkas terenkripsi (.enc.json):
            </span>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="Kata sandi file cadangan"
                value={backupPassphrase}
                onChange={e => setBackupPassphrase(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleExportFile}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition"
              >
                <FileDown className="w-3.5 h-3.5 text-orange-600" />
                <span>Simpan File</span>
              </button>
              <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition cursor-pointer">
                <FileUp className="w-3.5 h-3.5 text-blue-600" />
                <span>Buka File</span>
                <input
                  type="file"
                  accept=".json,.enc.json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                  : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
