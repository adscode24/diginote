import React, { useState } from 'react';
import {
  ArrowLeft,
  LogOut,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
  Camera,
  Pencil,
  Cloud,
  Smartphone,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFinance } from '../context/FinanceContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface ProfileViewProps {
  onBack: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onBack }) => {
  const { currentUser, mode, logout, sendPasswordReset, changeOfflinePassword, updateProfileInfo } = useAuth();
  const { cloudVaultId } = useFinance();
  useBodyScrollLock(false);

  const [editName, setEditName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const displayName = currentUser?.name || 'Pengguna';
  const email = currentUser?.email || '';
  const photoURL = currentUser?.photoURL || null;
  const initial = (displayName.trim()[0] || 'D').toUpperCase();

  const handleLogout = () => {
    if (confirm(`Keluar dari akun "${displayName}"?`)) {
      logout();
    }
  };

  const handleSaveName = async () => {
    if (!editName.trim()) {
      setMessage({ type: 'error', text: 'Nama pengguna wajib diisi' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await updateProfileInfo({ name: editName });
      setEditingName(false);
      setMessage({ type: 'success', text: 'Nama pengguna berhasil diubah.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengubah nama' });
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Hanya file gambar yang diperbolehkan' });
      return;
    }
    setPhotoBusy(true);
    setMessage(null);
    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = async () => {
        try {
          // Kompres ke 256px agar ringan dan tersinkron antar perangkat
          const MAX = 256;
          let width = img.width;
          let height = img.height;
          const scale = Math.min(1, MAX / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          await updateProfileInfo({ photoURL: dataUrl });
          setMessage({ type: 'success', text: 'Foto profil berhasil disimpan.' });
        } catch (err: unknown) {
          setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal menyimpan foto' });
        } finally {
          setPhotoBusy(false);
        }
      };
      img.onerror = () => {
        setPhotoBusy(false);
        setMessage({ type: 'error', text: 'File gambar tidak dapat dibaca' });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = async () => {
    if (!photoURL) return;
    if (!confirm('Hapus foto profil?')) return;
    setPhotoBusy(true);
    setMessage(null);
    try {
      await updateProfileInfo({ photoURL: null });
      setMessage({ type: 'success', text: 'Foto profil dihapus.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal menghapus foto' });
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSendReset = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await sendPasswordReset();
      setMessage({ type: 'success', text: 'Tautan reset kata sandi terkirim ke email Anda.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengirim email reset' });
    } finally {
      setBusy(false);
    }
  };

  const handleChangeOfflinePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Konfirmasi kata sandi baru tidak sama' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await changeOfflinePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: 'Kata sandi berhasil diubah.' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Gagal mengubah kata sandi' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title="Kembali"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Profil Pengguna
        </h2>
      </div>

      {/* Identity Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
        <div className="relative shrink-0">
          {photoURL ? (
            <img
              src={photoURL}
              alt="Foto profil"
              className="w-16 h-16 rounded-full object-cover shadow-md border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center text-2xl font-extrabold shadow-md">
              {initial}
            </div>
          )}
          <label
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center cursor-pointer shadow transition"
            title="Ubah foto profil"
          >
            <Camera className="w-3.5 h-3.5" />
            <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
          </label>
        </div>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1.5 text-sm font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={handleSaveName}
                disabled={busy}
                className="p-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
                title="Simpan nama"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Batal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-slate-900 dark:text-white truncate">
                {displayName}
              </span>
              <button
                onClick={() => {
                  setEditName(displayName);
                  setEditingName(true);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/40 transition"
                title="Edit nama pengguna"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {email && (
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate mt-0.5">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate">{email}</span>
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                mode === 'online'
                  ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {mode === 'online' ? 'Akun Cloud' : 'Akun Lokal'}
            </span>
            {mode === 'online' && cloudVaultId && (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {cloudVaultId}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">
              {photoBusy ? 'Memproses foto…' : photoURL ? 'Klik ikon kamera untuk ganti foto' : 'Tambahkan foto profil'}
            </span>
            {photoURL && (
              <button onClick={handleRemovePhoto} className="font-semibold text-red-500 hover:underline">
                Hapus
              </button>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
              : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Account Details */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          <span>Detail Akun</span>
        </h3>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 dark:text-slate-400">Nama pengguna</span>
          <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">{displayName}</span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 dark:text-slate-400">Email</span>
          <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">
            {email || '-'}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-500 dark:text-slate-400">Mode</span>
          <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
            {mode === 'online' ? <Cloud className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
            <span>{mode === 'online' ? 'Cloud (tersinkron)' : 'Lokal (perangkat ini)'}</span>
          </span>
        </div>
      </div>

      {/* Change Password */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          <span>Ubah Kata Sandi</span>
        </h3>
        {mode === 'online' ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Tautan reset akan dikirim ke <strong>{email || 'email Anda'}</strong>. Ikuti tautan
              tersebut untuk membuat kata sandi baru.
            </p>
            <button
              onClick={handleSendReset}
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
            >
              {busy ? 'Mengirim…' : 'Kirim Email Reset Kata Sandi'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleChangeOfflinePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Kata Sandi Lama *
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Kata Sandi Baru *
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Minimal 4 karakter"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Konfirmasi Baru *
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showPass} onChange={e => setShowPass(e.target.checked)} />
              <span>Tampilkan kata sandi</span>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
            >
              {busy ? 'Menyimpan…' : 'Simpan Kata Sandi Baru'}
            </button>
          </form>
        )}

        {message && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}
      </div>

      {/* Logout (paling bawah) */}
      <button
        onClick={handleLogout}
        className="w-full py-3 px-4 rounded-2xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs transition flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        <span>Keluar dari Akun</span>
      </button>
    </div>
  );
};
