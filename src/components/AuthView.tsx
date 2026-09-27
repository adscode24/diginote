import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, UserPlus, AlertCircle, Lock, Cloud, Smartphone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isCloudEnabled } from '../services/firebase';

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const online = isCloudEnabled();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!name.trim()) {
      setError(online ? 'Alamat email wajib diisi' : 'Nama pengguna wajib diisi');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak sama');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(name, password);
      } else {
        await register(name, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memproses, coba lagi');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <img
            src="/icon.svg"
            alt="Logo DigiNote"
            className="w-20 h-20 rounded-3xl shadow-lg mx-auto"
          />
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-3">
            DigiNote
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Catatan keuangan digital dengan enkripsi privasi
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xl overflow-hidden">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 p-1.5 m-3 mb-0 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Masuk</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                mode === 'register'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Daftar</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {mode === 'login' ? 'Selamat Datang Kembali' : 'Buat Akun Baru'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {mode === 'login'
                  ? 'Masuk untuk mengakses catatan keuangan Anda'
                  : 'Daftar untuk mulai mencatat keuangan Anda'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                {online ? 'Alamat Email *' : 'Nama Pengguna *'}
              </label>
              <input
                type={online ? 'email' : 'text'}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={online ? 'Contoh: nama@email.com' : 'Contoh: Budi Santoso'}
                autoComplete={online ? 'email' : 'username'}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Kata Sandi *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? (online ? 'Minimal 6 karakter' : 'Minimal 4 karakter') : 'Kata sandi Anda'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Konfirmasi Kata Sandi *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi"
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
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white shadow-xs transition"
            >
              {isSubmitting ? 'Memproses…' : mode === 'login' ? 'Masuk ke DigiNote' : 'Daftar Akun'}
            </button>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              {mode === 'login' ? (
                <>
                  Belum punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('register')}
                    className="font-bold text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    Daftar di sini
                  </button>
                </>
              ) : (
                <>
                  Sudah punya akun?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="font-bold text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    Masuk di sini
                  </button>
                </>
              )}
            </p>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-400 mt-4 flex items-center justify-center gap-1.5">
          {online ? (
            <>
              <Cloud className="w-3.5 h-3.5 text-orange-500" />
              <span>Akun cloud: data tersinkron di semua perangkat Anda</span>
            </>
          ) : (
            <>
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mode perangkat: data tersimpan aman di perangkat ini · Sesi berakhir saat tab ditutup</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
};
