import React, { useState } from 'react';
import { Download, Smartphone, X, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // If already running as an installed standalone PWA, show gentle indicator or null
  if (isInstalled) {
    if (compact) return null;
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Terpasang di Perangkat</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      setInstallSuccess(true);
      setTimeout(() => setInstallSuccess(false), 4000);
    }
  };

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <>
        <button
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-2 font-medium rounded-lg transition-colors shadow-sm ${
            compact
              ? 'px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
          title="Pasang aplikasi di layar utama Android / Desktop"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Pasang di HP / Android</span>
        </button>

        {installSuccess && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-800 text-white px-4 py-2 rounded-xl shadow-lg text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span>Aplikasi berhasil dipasang di perangkat Anda!</span>
          </div>
        )}
      </>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
            compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Pasang di iPhone / iPad</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  Pasang di Layar Utama iOS
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    1
                  </div>
                  <p>Tekan tombol <strong>Bagikan (Share)</strong> ikon panah ke atas di bagian bawah Safari.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    2
                  </div>
                  <p>Gulir menu dan pilih <strong>"Tambahkan ke Layar Utama" (Add to Home Screen)</strong>.</p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0">
                    3
                  </div>
                  <p>Tekan <strong>Tambah</strong> di pojok kanan atas. Aplikasi siap digunakan seperti aplikasi native!</p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-2.5 text-sm font-medium hover:bg-slate-800 transition"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback info button for unsupported browsers or when prompt is not yet ready
  return (
    <button
      onClick={() => {
        alert('Untuk memasang di Android: buka menu browser (tanda titik tiga ⋮ di kanan atas) lalu pilih "Tambahkan ke Layar Utama" atau "Instal Aplikasi".');
      }}
      className={`inline-flex items-center gap-1.5 font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors ${
        compact ? 'text-xs' : 'text-sm'
      }`}
      title="Petunjuk instalasi di perangkat mobile"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Instal di Android</span>
    </button>
  );
};
