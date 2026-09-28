import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  Cloud,
  Shield,
  Trash2,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { ThemeMode } from '../types';
import {
  getDigifuelLink,
  linkDigifuelAccount,
  unlinkDigifuelAccount,
  persistDigifuelLink,
  fetchDigifuelVault,
} from '../services/digifuel';
import { requestNotificationPermission, sendDailyReminderNotification, isNotificationSupported } from '../services/notifications';
import { CloudSyncModal } from './CloudSyncModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export const SettingsView: React.FC = () => {
  const {
    themeMode,
    setThemeMode,
    reminderSettings,
    updateReminderSettings,
    cloudVaultId,
    resetToDefaultData,
    clearAllData,
  } = useFinance();

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [notificationTestMessage, setNotificationTestMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  useBodyScrollLock(showClearConfirm || isSyncModalOpen);
  const { currentUser, mode: authMode } = useAuth();
  const { accounts, pullDigifuelNow } = useFinance();

  // Integrasi DigiFuel
  const [dfEmail, setDfEmail] = useState('');
  const [dfPassword, setDfPassword] = useState('');
  const [dfAccountId, setDfAccountId] = useState('');
  const [dfBusy, setDfBusy] = useState(false);
  const [dfLink, setDfLink] = useState(() =>
    currentUser ? getDigifuelLink(currentUser.id) : null
  );

  const refreshDfLink = () => {
    setDfLink(currentUser ? getDigifuelLink(currentUser.id) : null);
  };

  const handleDfLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setDfBusy(true);
    setFeedbackMessage(null);
    try {
      await linkDigifuelAccount(dfEmail, dfPassword);
      persistDigifuelLink(currentUser.id, {
        email: dfEmail.trim().toLowerCase(),
        accountId: dfAccountId || undefined,
      });
      setDfPassword('');
      // Verifikasi langsung: apakah vault email ini ada & berisi apa
      const { fetchDigifuelVault } = await import('../services/digifuel');
      const vault = await fetchDigifuelVault(dfEmail);
      refreshDfLink();
      if (vault) {
        const nFuel = (vault.fuelRecords || []).length;
        const nSvc = (vault.serviceHistory || []).length;
        setFeedbackMessage(
          `Terhubung! Vault ditemukan berisi ${nFuel} catatan bensin & ${nSvc} servis. Tekan Tarik agar masuk.`
        );
      } else {
        setFeedbackMessage(
          'Terhubung, tapi vault kosong/tidak ditemukan. Pastikan pernah login (bukan tamu) di DigiFuel dan Rules sudah di-publish.'
        );
      }
      setTimeout(() => setFeedbackMessage(null), 6000);
    } catch (err: unknown) {
      setFeedbackMessage(err instanceof Error ? err.message : 'Gagal menghubungkan DigiFuel');
      setTimeout(() => setFeedbackMessage(null), 4000);
    } finally {
      setDfBusy(false);
    }
  };

  const handleDfPull = async () => {
    setDfBusy(true);
    try {
      const res = await pullDigifuelNow();
      refreshDfLink();
      setFeedbackMessage(
        `${res.diag} Hasil: ${res.mirrored} baru, ${res.removed} dihapus.`
      );
      setTimeout(() => setFeedbackMessage(null), 6000);
    } catch (err: unknown) {
      setFeedbackMessage(err instanceof Error ? err.message : 'Gagal menarik dari DigiFuel');
      setTimeout(() => setFeedbackMessage(null), 6000);
    } finally {
      setDfBusy(false);
    }
  };

  const handleDfUnlink = async () => {
    if (!currentUser) return;
    if (!confirm('Putuskan hubungan DigiFuel? Transaksi cerminan yang sudah ada tetap tersimpan.')) return;
    await unlinkDigifuelAccount();
    try {
      const { clearDigifuelLink } = await import('../services/digifuel');
      clearDigifuelLink(currentUser.id);
    } catch {
      /* abaikan */
    }
    refreshDfLink();
  };

  const handleToggleReminder = async (enabled: boolean) => {
    if (enabled && isNotificationSupported()) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alert('Izin notifikasi belum diberikan di browser Anda. Pengingat tetap akan muncul di dalam aplikasi.');
      }
    }
    updateReminderSettings({ enabled });
  };

  const handleTestNotification = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      sendDailyReminderNotification();
      setNotificationTestMessage('Notifikasi pengingat terkirim!');
    } else {
      setNotificationTestMessage('Izin notifikasi tidak aktif. Aktifkan izin notifikasi di browser Anda.');
    }
    setTimeout(() => setNotificationTestMessage(null), 4000);
  };

  const handleResetData = () => {
    if (confirm('Mulai dari awal? Semua data (transaksi, hutang, tagihan, sumber dana) akan dikosongkan. Kategori bawaan tetap dipertahankan.')) {
      resetToDefaultData();
      setFeedbackMessage('Data berhasil dikosongkan. Silakan buat sumber dana baru di halaman Dana.');
      setTimeout(() => setFeedbackMessage(null), 3500);
    }
  };

  const handleExecuteClearAll = () => {
    clearAllData();
    setShowClearConfirm(false);
    setFeedbackMessage('Semua data transaksi, hutang, dan saldo berhasil dikosongkan.');
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Pengaturan Aplikasi DigiNote
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Sesuaikan preferensi tema tampilan, notifikasi harian, enkripsi data, dan kelola penyimpanan
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
            v1.0.0
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              authMode === 'online'
                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}
          >
            {authMode === 'online' ? 'Mode Cloud' : 'Mode Lokal'}
          </span>
          {currentUser?.email && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
              {currentUser.email}
            </span>
          )}
        </div>
      </div>

      {feedbackMessage && (
        <div className="p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 text-xs font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* 1. Theme Configuration */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Pilihan Mode Tampilan
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pilih mode terang, gelap, atau otomatis mengikuti tema sistem operasi perangkat Anda
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-1">
          {[
            { id: 'light', label: 'Mode Terang', icon: Sun },
            { id: 'dark', label: 'Mode Gelap', icon: Moon },
            { id: 'system', label: 'Sesuai Sistem', icon: Monitor },
          ].map(item => {
            const Icon = item.icon;
            const isSelected = themeMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setThemeMode(item.id as ThemeMode)}
                className={`p-3.5 rounded-xl border text-center transition flex flex-col items-center gap-2 ${
                  isSelected
                    ? 'border-orange-500 bg-orange-50/60 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 ring-2 ring-orange-500/20 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Daily Recording Reminder */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span>Sistem Pengingat Catat Harian</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Notifikasi rutin untuk memastikan Anda tidak lupa mencatat pengeluaran setiap hari
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={reminderSettings.enabled}
              onChange={e => handleToggleReminder(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600"></div>
          </label>
        </div>

        {reminderSettings.enabled && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Waktu Pengingat Setiap Hari:
                </span>
                <p className="text-[11px] text-slate-400">
                  Pengingat akan muncul di dashboard dan notifikasi browser pada jam ini
                </p>
              </div>

              <input
                type="time"
                value={reminderSettings.time}
                onChange={e => updateReminderSettings({ time: e.target.value })}
                className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={handleTestNotification}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
              >
                Uji Coba Notifikasi Sekarang
              </button>
              {notificationTestMessage && (
                <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                  {notificationTestMessage}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Cloud Sync & Privacy Encryption */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cloud className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Sinkronisasi Cloud Antar Perangkat</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Satu akun berlaku di semua perangkat — data tersinkron otomatis via vault pribadi Anda
            </p>
          </div>

          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition shadow-xs self-start sm:self-auto"
          >
            Buka Pengaturan Cloud
          </button>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Kode Vault Cloud:</span>{' '}
            <strong className="font-mono text-slate-900 dark:text-white tabular-nums">
              {cloudVaultId || '-'}
            </strong>
          </div>
          <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 font-semibold text-[11px]">
            <Shield className="w-3.5 h-3.5" />
            <span>Vault Pribadi</span>
          </div>
        </div>
      </div>

      {/* Integrasi DigiFuel: catatan bensin & biaya -> transaksi keluar */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <img src="/digifuel-logo.svg" alt="Logo DigiFuel" className="w-5 h-5 rounded-md shadow-xs" />
            <span>Integrasi DigiFuel</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Catatan bensin & biaya servis di DigiFuel otomatis tercatat sebagai transaksi keluar di sini (satu arah).
          </p>
        </div>

        {!dfLink ? (
          <form onSubmit={handleDfLink} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="email"
                value={dfEmail}
                onChange={e => setDfEmail(e.target.value)}
                placeholder="Email DigiFuel (sama)"
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
              <input
                type="password"
                value={dfPassword}
                onChange={e => setDfPassword(e.target.value)}
                placeholder="Kata sandi DigiFuel"
                autoComplete="current-password"
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Sumber dana untuk catatan cerminan (opsional)
              </label>
              <select
                value={dfAccountId}
                onChange={e => setDfAccountId(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Otomatis (rekening/tunai pertama)</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={dfBusy}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
            >
              {dfBusy ? 'Menghubungkan…' : 'Hubungkan Akun DigiFuel'}
            </button>
            <p className="text-[11px] text-slate-400">
              Akun DigiFuel terdaftar terpisah — gunakan email yang sama agar datanya cocok.
            </p>
          </form>
        ) : (
          <div className="space-y-2.5">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Terhubung:</span>
                <strong className="text-slate-900 dark:text-white">{dfLink.email}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Tercermin:</span>
                <strong className="text-slate-900 dark:text-white tabular-nums">{dfLink.mirroredCount} transaksi</strong>
              </div>
              {dfLink.lastPulledAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Terakhir ditarik:</span>
                  <strong className="text-slate-900 dark:text-white">
                    {new Date(dfLink.lastPulledAt).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </strong>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Sumber dana untuk catatan cerminan
              </label>
              <select
                value={dfLink.accountId || ''}
                onChange={e => {
                  if (!currentUser) return;
                  persistDigifuelLink(currentUser.id, { accountId: e.target.value || undefined });
                  refreshDfLink();
                }}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Otomatis (rekening/tunai pertama)</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDfPull}
                disabled={dfBusy}
                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
              >
                {dfBusy ? 'Menarik…' : 'Tarik dari DigiFuel'}
              </button>
              <button
                onClick={handleDfUnlink}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
              >
                Putuskan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Data Management: Reset & Delete All Data */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Pengelolaan & Pembersihan Data
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Mulai dari awal atau kosongkan seluruh catatan keuangan
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Reset to Empty */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between space-y-3">
            <div>
              <div className="font-semibold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Mulai Dari Awal</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Kosongkan seluruh data dan mulai mencatat dari nol.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetData}
              className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
            >
              Kosongkan & Mulai Baru
            </button>
          </div>

          {/* Delete All Data Feature */}
          <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 flex flex-col justify-between space-y-3">
            <div>
              <div className="font-semibold text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Seluruh Data</span>
              </div>
              <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-1">
                Mengosongkan semua transaksi, catatan hutang piutang, dan mereset saldo sumber dana.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="py-2 px-3 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-xs transition"
            >
              Hapus Semua Data
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Bottom Sheet for Clearing All Data */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-red-200 dark:border-red-900/60 p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto -mt-2 mb-2 sm:hidden" />

            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Hapus Semua Data Aplikasi?
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Tindakan ini tidak dapat dibatalkan. Seluruh riwayat transaksi, catatan hutang piutang, bukti pembayaran, dan saldo akan dihapus bersih.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteClearAll}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition shadow-xs"
              >
                Ya, Hapus Semua
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cloud Sync Modal */}
      <CloudSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
      />
    </div>
  );
};
