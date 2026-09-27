import React, { useState } from 'react';
import {
  X,
  Cloud,
  Lock,
  KeyRound,
  UploadCloud,
  DownloadCloud,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  FileDown,
  FileUp,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatDateIndo } from '../utils/formatters';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    syncSettings,
    updateSyncSettings,
    syncToCloud,
    pullFromCloud,
    exportBackupFile,
    importBackupFile,
    isSyncing,
    syncError,
  } = useFinance();

  const [passphrase, setPassphrase] = useState('');
  const [targetVaultId, setTargetVaultId] = useState(syncSettings.vaultId);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleCopyVaultId = () => {
    navigator.clipboard.writeText(syncSettings.vaultId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePush = async () => {
    if (!passphrase.trim()) {
      setStatusMessage({ type: 'error', text: 'Masukkan kata sandi enkripsi rahasia Anda terlebih dahulu.' });
      return;
    }
    try {
      await syncToCloud(passphrase);
      setStatusMessage({ type: 'success', text: 'Data berhasil dienkripsi dan diunggah ke Cloud!' });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal sinkronisasi' });
    }
  };

  const handlePull = async () => {
    if (!targetVaultId.trim()) {
      setStatusMessage({ type: 'error', text: 'Masukkan Kode Vault yang ingin dihubungkan.' });
      return;
    }
    if (!passphrase.trim()) {
      setStatusMessage({ type: 'error', text: 'Masukkan kata sandi enkripsi untuk membuka data.' });
      return;
    }

    try {
      await pullFromCloud(targetVaultId.trim(), passphrase);
      setStatusMessage({ type: 'success', text: 'Data berhasil ditarik dari Cloud dan didekripsi dengan aman!' });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengambil data' });
    }
  };

  const handleExportFile = async () => {
    if (!passphrase.trim()) {
      setStatusMessage({ type: 'error', text: 'Masukkan kata sandi enkripsi sebelum mengekspor backup.' });
      return;
    }
    try {
      await exportBackupFile(passphrase);
      setStatusMessage({ type: 'success', text: 'File cadangan terenkripsi (.enc.json) berhasil diunduh.' });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengekspor file' });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!passphrase.trim()) {
      setStatusMessage({ type: 'error', text: 'Masukkan kata sandi enkripsi file sebelum membuka file.' });
      return;
    }
    try {
      await importBackupFile(file, passphrase);
      setStatusMessage({ type: 'success', text: 'Data cadangan terenkripsi berhasil dipulihkan!' });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mendekripsi file' });
    }
  };

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
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Sinkronisasi Cloud & Keamanan Enkripsi
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Akses catatan keuangan Anda di berbagai perangkat (Android, PC, Tablet)
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
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-300">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Privasi Tingkat Militer (AES-GCM 256-bit):</span>
              Data keuangan Anda dienkripsi secara lokal di perangkat Anda sebelum dikirim ke Cloud.
              Hanya orang yang memiliki kata sandi ini yang dapat membaca datanya.
            </div>
          </div>

          {/* Vault ID Box */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Kode Vault Perangkat Anda
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3.5 py-2 text-sm font-mono font-bold tracking-wider rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white tabular-nums">
                {syncSettings.vaultId}
              </div>
              <button
                type="button"
                onClick={handleCopyVaultId}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Gunakan kode ini di HP Android atau perangkat lain untuk menghubungkan akun.
            </p>
          </div>

          {/* Secret Passphrase Input */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center justify-between">
              <span>Kata Sandi Enkripsi Rahasia *</span>
              <span className="text-[11px] text-slate-400">Wajib diingat untuk buka data</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                placeholder="Masukkan kata sandi privasi Anda"
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Sync Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handlePush}
              disabled={isSyncing}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{isSyncing ? 'Mengunggah...' : 'Unggah ke Cloud'}</span>
            </button>

            <button
              onClick={handlePull}
              disabled={isSyncing}
              className="py-2.5 px-4 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <DownloadCloud className="w-4 h-4" />
              <span>{isSyncing ? 'Mengunduh...' : 'Tarik dari Cloud'}</span>
            </button>
          </div>

          {syncSettings.lastSyncedAt && (
            <div className="text-[11px] text-slate-400 text-center">
              Terakhir disinkronkan:{' '}
              <strong>{formatDateIndo(new Date(syncSettings.lastSyncedAt).toISOString().split('T')[0])}</strong>{' '}
              pukul{' '}
              {new Date(syncSettings.lastSyncedAt).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}

          {/* Connect Another Device Vault */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Hubungkan ke Vault Perangkat Lain:
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Contoh: DN-8492-1092"
                value={targetVaultId}
                onChange={e => setTargetVaultId(e.target.value.toUpperCase())}
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => {
                  updateSyncSettings({ vaultId: targetVaultId.trim() });
                  setStatusMessage({ type: 'success', text: `Vault ID diubah ke ${targetVaultId.trim()}` });
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition"
              >
                Ganti Vault
              </button>
            </div>
          </div>

          {/* Offline File Backup & Restore */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Cadangan Berkas (.enc.json):</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportFile}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition"
              >
                <FileDown className="w-3.5 h-3.5 text-emerald-600" />
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
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
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
