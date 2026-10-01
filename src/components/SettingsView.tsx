import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  Cloud,
  Shield,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Heart,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { ThemeMode } from '../types';
import { isNotificationSupported, enableDailyReminder, disableDailyReminder, sendTestNotification, getNotificationPermissionStatus, withTimeout } from '../services/notifications';
import { CloudSyncModal } from './CloudSyncModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

/** Kartu Keuangan Berdua model tautan: tiap akun tetap punya vault+kode sendiri. */
const CoupleCard: React.FC = () => {
  const {
    pairPartner,
    pendingInvite,
    lastUpdatedByCode,
    myVaultCode,
    sendPairInviteTo,
    acceptPairInviteFrom,
    declinePairInviteFrom,
    unpairPartner,
    rotateMyCode,
    refreshPairing,
  } = useFinance();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const flash = (text: string, ms = 6000) => {
    setMsg(text);
    setTimeout(() => setMsg(null), ms);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await sendPairInviteTo(inviteEmail, inviteCode);
      setInviteEmail('');
      setInviteCode('');
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal mengirim undangan.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    setBusy(true);
    try {
      await acceptPairInviteFrom();
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal menerima undangan.');
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!confirm('Tolak undangan catat berdua? Undangan akan hilang.')) return;
    setBusy(true);
    try {
      await declinePairInviteFrom();
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal menolak undangan.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnpair = async () => {
    if (!confirm('Putus tautan berdua? Masing-masing kembali ke data sendiri.')) return;
    setBusy(true);
    try {
      await unpairPartner();
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal memutus tautan.');
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async () => {
    if (!confirm('Ganti kode vault saya? Beritahu kode baru ke pasangan.')) return;
    setBusy(true);
    try {
      const code = await rotateMyCode();
      flash(`Kode baru: ${code}. Bagikan ke pasangan bila perlu verifikasi ulang.`);
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal mengganti kode.');
    } finally {
      setBusy(false);
    }
  };

  const paired = !!pairPartner;
  const partnerInitial = ((pairPartner?.name || pairPartner?.email || '?').trim()[0] || '?').toUpperCase();

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Heart className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <span>Keuangan Berdua</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            1 catatan untuk 2 email — cocok untuk pasangan. Foto struk tetap tersimpan di masing-masing HP.
          </p>
        </div>
        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
            paired
              ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}
        >
          {paired ? 'Berdua' : 'Pribadi'}
        </span>
      </div>

      {msg && (
        <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 text-xs font-medium text-orange-700 dark:text-orange-300">
          {msg}
        </div>
      )}

      {/* Undangan masuk */}
      {pendingInvite && !paired && (
        <div className="p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 space-y-2.5">
          <div className="text-xs font-bold text-orange-800 dark:text-orange-200">
            Undangan Catat Berdua diterima
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {pendingInvite.fromName || pendingInvite.fromEmail || 'Pasangan'} ({pendingInvite.fromEmail || '-'})
            mengajak mencatat berdua. Terima untuk menampilkan data yang sama dan terbaru.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleAccept()}
              className="py-2 px-3 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
            >
              {busy ? 'Memproses…' : 'Terima Undangan'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDecline()}
              className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
            >
              Tolak Undangan
            </button>
          </div>
        </div>
      )}

      {/* Status pasangan tertaut */}
      {paired && pairPartner && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white text-sm font-extrabold flex items-center justify-center shrink-0">
                {partnerInitial}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {pairPartner.name || pairPartner.email || 'Pasangan'}
                </div>
                <div className="text-[10px] text-slate-400 truncate font-mono">
                  {pairPartner.email || ''}{pairPartner.code ? ` · ${pairPartner.code}` : ''}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleUnpair()}
              className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0 disabled:opacity-50"
            >
              Putuskan
            </button>
          </div>
          {lastUpdatedByCode && (
            <div className="text-[11px] text-slate-400">
              Terakhir diperbarui oleh <strong className="font-mono">{lastUpdatedByCode}</strong>
            </div>
          )}
        </div>
      )}

      {/* Kode vault saya */}
      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] text-slate-400">Kode vault saya (identitas saya di cloud)</div>
          <div className="text-lg font-extrabold font-mono tracking-widest text-slate-900 dark:text-white tabular-nums">
            {myVaultCode || '-'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={busy || !myVaultCode}
            onClick={() => {
              try {
                navigator.clipboard.writeText(myVaultCode);
                flash('Kode disalin.');
              } catch {
                /* abaikan */
              }
            }}
            className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
          >
            Salin
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRotate()}
            className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
            title="Ganti kode baru"
          >
            Acak
          </button>
        </div>
      </div>

      {/* Undang pasangan via email + kode vault mereka */}
      {!paired && (
        <form onSubmit={handleSend} className="space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Undang Catat Berdua</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="Email pasangan"
              className="px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            />
            <input
              type="text"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
              placeholder="Kode vault pasangan"
              className="px-3 py-2 text-xs font-mono font-bold tracking-widest rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !inviteEmail.trim() || !inviteCode.trim()}
            className="w-full py-2 px-3 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
          >
            {busy ? 'Mengirim…' : 'Kirim Undangan'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshPairing()}
            className="w-full py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline disabled:opacity-50"
          >
            Periksa status undangan
          </button>
        </form>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Pasangan menerima notifikasi + tombol Terima/Tolak. Setelah diterima, kedua akun menampilkan data yang sama dan terbaru; tiap akun tetap punya kode vault sendiri sebagai identitas penulis. Bila mencatat bersamaan, simpanan terakhir yang menang.
      </p>
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const {
    themeMode,
    setThemeMode,
    reminderSettings,
    updateReminderSettings,
    cloudVaultId,
    clearAllData,
  } = useFinance();

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [notificationTestMessage, setNotificationTestMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  useBodyScrollLock(showClearConfirm || isSyncModalOpen);
  const { currentUser, mode: authMode } = useAuth();

  const handleToggleReminder = async (enabled: boolean) => {
    // Toggle SELALU bisa on/off: pengingat dalam aplikasi (dashboard) tetap
    // jalan walau izin notifikasi sistem ditolak / plugin menggantung.
    updateReminderSettings({ enabled });
    if (!enabled) {
      withTimeout(disableDailyReminder(), 5000, undefined).catch(() => {});
      return;
    }
    if (!isNotificationSupported()) {
      setFeedbackMessage('Perangkat ini tidak mendukung notifikasi sistem. Pengingat hanya tampil di dashboard.');
      setTimeout(() => setFeedbackMessage(null), 4000);
      return;
    }
    // Minta izin + jadwalkan di latar (timeout agar toggle tak macet di HP tertentu)
    const ok = await withTimeout(enableDailyReminder(reminderSettings.time), 10000, false);
    if (ok) {
      setFeedbackMessage('Pengingat harian aktif. Notifikasi muncul tiap hari pada jam yang dipilih.');
    } else {
      const status = await withTimeout(getNotificationPermissionStatus(), 5000, 'unknown' as const);
      setFeedbackMessage(
        status === 'denied'
          ? 'Pengingat AKTIF untuk dalam aplikasi. Notifikasi sistem ditolak — buka Pengaturan HP > Aplikasi > DigiNote > Notifikasi untuk mengaktifkannya.'
          : 'Pengingat AKTIF untuk dalam aplikasi. Izin sistem belum diberikan — notifikasi HP menyusul setelah izin diberikan.'
      );
    }
    setTimeout(() => setFeedbackMessage(null), 6000);
  };

  const handleReminderTimeChange = async (time: string) => {
    updateReminderSettings({ time });
    // Jadwal ulang bila pengingat sedang aktif
    if (reminderSettings.enabled && time) {
      await enableDailyReminder(time);
    }
  };

  const handleTestNotification = async () => {
    const sent = await withTimeout(sendTestNotification(), 10000, false);
    if (sent) {
      setNotificationTestMessage('Notifikasi pengingat terkirim! Periksa bilah notifikasi HP Anda.');
    } else {
      const status = await withTimeout(getNotificationPermissionStatus(), 5000, 'unknown' as const);
      setNotificationTestMessage(
        status === 'denied'
          ? 'Izin notifikasi ditolak sistem. Aktifkan di Pengaturan HP > Aplikasi > DigiNote > Notifikasi.'
          : 'Izin notifikasi tidak aktif. Nyalakan pengingat dulu, lalu coba lagi.'
      );
    }
    setTimeout(() => setNotificationTestMessage(null), 5000);
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
                  Pengingat muncul sebagai notifikasi sistem HP + pengingat di dashboard pada jam ini
                </p>
              </div>

              <input
                type="time"
                value={reminderSettings.time}
                onChange={e => handleReminderTimeChange(e.target.value)}
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

      {/* Keuangan Berdua: 1 vault untuk 2 email (pasangan) */}
      <CoupleCard />
      {/* 4. Data Management: Delete All Data */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Pengelolaan & Pembersihan Data
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Kosongkan seluruh catatan keuangan
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1">
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
