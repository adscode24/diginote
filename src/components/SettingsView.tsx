import React, { useState } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  Cloud,
  Shield,
  Smartphone,
  Trash2,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { ThemeMode } from '../types';
import { requestNotificationPermission, sendDailyReminderNotification, isNotificationSupported } from '../services/notifications';
import { PWAInstallButton } from './PWAInstallButton';
import { CloudSyncModal } from './CloudSyncModal';

export const SettingsView: React.FC = () => {
  const {
    themeMode,
    setThemeMode,
    reminderSettings,
    updateReminderSettings,
    syncSettings,
    resetToDefaultData,
    clearAllData,
  } = useFinance();

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [notificationTestMessage, setNotificationTestMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

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
    if (confirm('Apakah Anda yakin ingin memulihkan data demonstrasi? Data saat ini akan diganti dengan data contoh.')) {
      resetToDefaultData();
      setFeedbackMessage('Data berhasil dipulihkan ke data demonstrasi bawaan.');
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
      </div>

      {feedbackMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
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
                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 ring-2 ring-emerald-500/20 font-bold shadow-xs'
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
              <Bell className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
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
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
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
              <Cloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Sinkronisasi Cloud & Enkripsi Data</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enkripsi AES-GCM 256-bit menjamin data keuangan Anda sepenuhnya privat antar perangkat
            </p>
          </div>

          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs self-start sm:self-auto"
          >
            Buka Pengaturan Cloud
          </button>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Kode Vault Cloud:</span>{' '}
            <strong className="font-mono text-slate-900 dark:text-white tabular-nums">
              {syncSettings.vaultId}
            </strong>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
            <Shield className="w-3.5 h-3.5" />
            <span>Terenkripsi Lokal</span>
          </div>
        </div>
      </div>

      {/* 4. Android PWA Ready Installation */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Instalasi DigiNote di HP / Android</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pasang ke layar beranda untuk pengalaman cepat, tanpa browser, dan berfungsi offline
            </p>
          </div>

          <PWAInstallButton />
        </div>
      </div>

      {/* 5. Data Management: Reset Demonstration & Delete All Data */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Pengelolaan & Pembersihan Data
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pulihkan data demonstrasi bawaan atau kosongkan seluruh catatan keuangan
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Reset to Sample Data */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between space-y-3">
            <div>
              <div className="font-semibold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Pulihkan Data Contoh</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Isi ulang aplikasi dengan data demonstrasi bawaan untuk keperluan uji coba.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetData}
              className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
            >
              Reset ke Data Contoh
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
