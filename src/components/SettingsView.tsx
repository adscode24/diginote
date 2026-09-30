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
import { publishInvite, revokeInvite, lookupInvite } from '../services/cloudSync';

/** Kartu Keuangan Berdua: bagikan 1 vault ke pasangan via kode undangan. */
const CoupleCard: React.FC = () => {
  const {
    shareMode,
    shareMembers,
    myInviteCode,
    joinSharedVault,
    leaveSharedVault,
    kickSharedMember,
    rotateSharedCode,
    refreshShareMembers,
  } = useFinance();
  const { currentUser } = useAuth();
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteOn, setInviteOn] = useState(false);

  const flash = (text: string, ms = 5000) => {
    setMsg(text);
    setTimeout(() => setMsg(null), ms);
  };

  // Cek apakah undangan kode saya sedang aktif (saat kartu dibuka)
  useEffect(() => {
    if (!myInviteCode) return;
    let cancelled = false;
    lookupInvite(myInviteCode)
      .then(inv => {
        if (!cancelled) setInviteOn(!!inv);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [myInviteCode]);

  const ownerOf = () =>
    currentUser
      ? { uid: currentUser.id, email: currentUser.email ?? null, displayName: currentUser.name ?? null }
      : null;

  const handlePublish = async () => {
    const owner = ownerOf();
    if (!owner) return;
    setBusy(true);
    try {
      // Undangan selalu dibuka di vault pribadi sendiri (doc = uid sendiri)
      await publishInvite(owner, owner.uid);
      setInviteOn(true);
      flash(`Undangan aktif! Kode: ${myInviteCode}. Pasangan memasukkannya di HP-nya.`);
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal menyalakan undangan.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!myInviteCode) return;
    setBusy(true);
    try {
      await revokeInvite(myInviteCode);
      setInviteOn(false);
      flash('Undangan dicabut. Kode lama tak bisa dipakai gabung lagi.');
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal mencabut undangan.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const res = await joinSharedVault(joinCode);
      setJoinCode('');
      flash(
        res.ownerName
          ? `Terhubung ke vault ${res.ownerName}! Data terbaru dimuat.`
          : 'Terhubung ke vault pasangan! Data terbaru dimuat.'
      );
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal gabung.');
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async (uid: string, name: string) => {
    if (!confirm(`Keluarkan ${name || 'anggota ini'} dari vault berdua?`)) return;
    setBusy(true);
    try {
      await kickSharedMember(uid);
      flash('Anggota dikeluarkan.');
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal mengeluarkan.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Keluar dari vault berdua dan kembali ke data pribadi?')) return;
    setBusy(true);
    try {
      await leaveSharedVault();
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal keluar.');
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async () => {
    if (!confirm('Ganti kode undangan? Kode lama langsung mati.')) return;
    setBusy(true);
    try {
      const code = await rotateSharedCode();
      setInviteOn(true);
      flash(`Kode baru: ${code}. Bagikan ke pasangan.`);
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'Gagal mengganti kode.');
    } finally {
      setBusy(false);
    }
  };

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
            shareMode === 'shared'
              ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
          }`}
        >
          {shareMode === 'shared' ? `Berdua · ${shareMembers.length} anggota` : 'Pribadi'}
        </span>
      </div>

      {msg && (
        <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 text-xs font-medium text-orange-700 dark:text-orange-300">
          {msg}
        </div>
      )}

      {shareMode === 'personal' && (
        <>
          {/* Kode undangan saya */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] text-slate-400">Kode undangan saya</div>
              <div className="text-lg font-extrabold font-mono tracking-widest text-slate-900 dark:text-white tabular-nums">
                {myInviteCode || '-'}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={busy || !myInviteCode}
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(myInviteCode);
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
                onClick={handleRotate}
                className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
                title="Ganti kode baru"
              >
                Acak
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handlePublish}
              className="py-2 px-3 text-xs font-bold rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
            >
              {busy ? 'Memproses…' : inviteOn ? 'Undangan Aktif ✓' : 'Nyalakan Undangan'}
            </button>
            {inviteOn && (
              <button
                type="button"
                disabled={busy}
                onClick={handleRevoke}
                className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                Cabut Undangan
              </button>
            )}
          </div>

          {/* Gabung ke vault pasangan */}
          <form onSubmit={handleJoin} className="flex items-center gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
              placeholder="Kode pasangan, mis. DN-XXXXXX"
              className="flex-1 px-3 py-2 text-xs font-mono font-bold tracking-widest rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            />
            <button
              type="submit"
              disabled={busy || !joinCode.trim()}
              className="py-2 px-4 text-xs font-bold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50 transition shrink-0"
            >
              Gabung
            </button>
          </form>
        </>
      )}

      {/* Anggota */}
      {shareMembers.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Anggota ({shareMembers.length})
            </span>
            <button
              type="button"
              onClick={() => void refreshShareMembers()}
              className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
            >
              Muat ulang
            </button>
          </div>
          {shareMembers.map(m => {
            const isMe = currentUser?.id === m.uid;
            const initial = ((m.name || m.email || '?').trim()[0] || '?').toUpperCase();
            return (
              <div
                key={m.uid}
                className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white text-xs font-extrabold flex items-center justify-center shrink-0">
                    {initial}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {m.name || m.email || 'Anggota'}
                      {isMe && <span className="ml-1 text-[10px] font-semibold text-orange-600">(Anda)</span>}
                    </div>
                    {m.email && m.name && (
                      <div className="text-[10px] text-slate-400 truncate">{m.email}</div>
                    )}
                  </div>
                </div>
                {!isMe && shareMode === 'shared' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleKick(m.uid, m.name || m.email || '')}
                    className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0 disabled:opacity-50"
                  >
                    Keluarkan
                  </button>
                )}
              </div>
            );
          })}
          {shareMode === 'shared' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLeave()}
              className="w-full py-2 text-xs font-semibold rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-50"
            >
              Keluar dari Vault Berdua
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Butuh Rules Firestore terbaru (lihat FIRESTORE_SETUP.md) lalu Publish. Bila keduanya mencatat bersamaan,
        simpanan terakhir yang menang — tunggu notifikasi sinkron sebelum pindah HP.
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
