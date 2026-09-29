import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  CreditCard,
  CalendarDays,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ActiveTab } from './types';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { AccountsView } from './components/AccountsView';
import { DebtsView } from './components/DebtsView';
import { SummaryView } from './components/SummaryView';
import { SettingsView } from './components/SettingsView';
import { AuthView } from './components/AuthView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PullToRefresh } from './components/PullToRefresh';
import { ToastProvider, useToast } from './components/Toast';
import { TransactionModal } from './components/TransactionModal';
import { consumeSharedTransaction, SharedTransactionPrefill } from './services/shareIntent';
import { forceUnlockBodyScroll } from './hooks/useBodyScrollLock';

import { ProfileView } from './components/ProfileView';

/** Tombol toggle tema terang/gelap di header. */
const ThemeToggleButton: React.FC = () => {
  const { themeMode, setThemeMode } = useFinance();
  const isDark = themeMode === 'dark';
  return (
    <button
      onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
      className="flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-amber-300 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-300 transition"
      title={isDark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}
      aria-label="Ganti tema tampilan"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};

function MainApp() {
  const { currentUser } = useAuth();
  const { pullFromVaultNow } = useFinance();
  const { pushToast } = useToast();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [sharedPrefill, setSharedPrefill] = useState<SharedTransactionPrefill | null>(null);
  const [sharedKey, setSharedKey] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const profileInitial = ((currentUser?.name || 'D').trim()[0] || 'D').toUpperCase();

  // Terima share gambar/teks dari aplikasi lain (otomatisasi input masuk/keluar):
  // cek saat aplikasi dibuka + setiap kembali dari luar (resume/fokus tab).
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const data = await consumeSharedTransaction();
        if (!cancelled && data && (data.amount > 0 || data.receiptImage || data.rawText)) {
          setSharedPrefill(data);
          setSharedKey(k => k + 1);
          setIsShareModalOpen(true);
          setActiveTab('transactions');
          pushToast('Bukti transaksi diterima — periksa lalu simpan.');
        }
      } catch {
        /* abaikan: share opsional, jangan ganggu aplikasi */
      }
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pushToast]);

  // Penyembuhan otomatis: tidak ada modal yang bisa terbuka saat pindah halaman,
  // jadi paksa buka kunci scroll di sini agar halaman tak pernah macet.
  useEffect(() => {
    forceUnlockBodyScroll();
  }, [activeTab]);

  const navItems: { id: ActiveTab; label: string; shortLabel: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transaksi', shortLabel: 'Transaksi', icon: Receipt },
    { id: 'accounts', label: 'Sumber Dana', shortLabel: 'Dana', icon: Wallet },
    { id: 'debts', label: 'Hutang Piutang', shortLabel: 'Hutang', icon: CreditCard },
    { id: 'summary', label: 'Summary', shortLabel: 'Summary', icon: CalendarDays },
    { id: 'settings', label: 'Pengaturan', shortLabel: 'Setelan', icon: Settings },
  ];

  // Bubble highlight meluncur ke tab aktif (efek ala video): ukur posisi tombol
  const navTrackRef = useRef<HTMLDivElement | null>(null);
  const navBarRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [bubble, setBubble] = useState({ left: 0, width: 0, visible: false });
  const [touchTab, setTouchTab] = useState<ActiveTab | null>(null);

  // Kaca interaktif: sorotan mengikuti kursor (web) / sentuhan (mobile)
  const updateGlassSpot = (clientX: number, clientY: number) => {
    const bar = navBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    bar.style.setProperty('--gx', `${clientX - rect.left}px`);
    bar.style.setProperty('--gy', `${clientY - rect.top}px`);
  };
  const handleNavMouseMove = (e: React.MouseEvent) => updateGlassSpot(e.clientX, e.clientY);
  const handleNavTouch = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) updateGlassSpot(t.clientX, t.clientY);
  };

  useLayoutEffect(() => {
    const update = () => {
      const track = navTrackRef.current;
      const btn = itemRefs.current[activeTab];
      if (!track || !btn) return;
      const trackRect = track.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setBubble({
        left: btnRect.left - trackRect.left,
        width: btnRect.width,
        visible: true,
      });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [activeTab]);

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    const isTouched = touchTab === item.id && !isActive;
    return (
      <button
        key={item.id}
        data-nav={item.id}
        ref={el => {
          itemRefs.current[item.id] = el;
        }}
        onClick={() => {
          setActiveTab(item.id);
        }}
        className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition min-w-[44px] min-h-[44px] relative z-10 group ${
          isActive || isTouched
            ? 'text-orange-600 dark:text-orange-400 font-bold'
            : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
        }`}
      >
        <Icon
          className={`w-5 h-5 transition-transform group-active:scale-95 ${
            isActive || isTouched ? 'stroke-[2.5]' : 'stroke-2'
          }`}
        />
        <span className="text-[10px] tracking-tight mt-1 truncate max-w-[68px]">
          <span className="sm:hidden">{item.shortLabel}</span>
          <span className="hidden sm:inline">{item.label}</span>
        </span>
        {isActive && (
          <span className="w-1 h-1 mt-0.5 rounded-full bg-orange-600 dark:bg-orange-400" />
        )}
      </button>
    );
  };

  // Hold + geser di dock (mobile/APK): tiap tab dilewati menyala bergantian,
  // lepas tepat di ikon -> halaman itu terbuka. Lepas di luar ikon -> diam.
  // Tap biasa tidak berubah (klik). touchcancel sengaja tidak navigasi.
  const navTouchId = useRef<number | null>(null);
  const tabFromPoint = (clientX: number, clientY: number): ActiveTab | null => {
    const el = document.elementFromPoint(clientX, clientY);
    const btn = el?.closest?.('[data-nav]') as HTMLElement | null;
    const id = btn?.dataset?.nav;
    return navItems.some(n => n.id === id) ? (id as ActiveTab) : null;
  };
  const handleDockTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    navTouchId.current = t.identifier;
  };
  const handleDockTouchMove = (e: React.TouchEvent) => {
    if (navTouchId.current === null) return;
    const t = Array.from(e.touches).find(x => x.identifier === navTouchId.current) || e.touches[0];
    if (!t) return;
    updateGlassSpot(t.clientX, t.clientY);
    setTouchTab(tabFromPoint(t.clientX, t.clientY));
  };
  const endDockTouch = (navigate: boolean) => (e: React.TouchEvent) => {
    const t =
      Array.from(e.changedTouches).find(x => x.identifier === navTouchId.current) ||
      e.changedTouches[0];
    navTouchId.current = null;
    const target = t ? tabFromPoint(t.clientX, t.clientY) : null;
    setTouchTab(null);
    if (navigate && target) setActiveTab(target);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased selection:bg-orange-500/20 selection:text-orange-600">
      {/* Clean Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Brand: Logo Vektor DigiNote */}
          <div className="flex items-center gap-2.5">
            <img
              src="/icon.svg"
              alt="Logo DigiNote"
              className="w-8 h-8 rounded-xl shadow-xs"
            />
            <div className="leading-tight">
              <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white block">
                DigiNote
              </span>
              <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400 block -mt-0.5 tracking-wide">
                Your Digital Note
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle Tema Terang/Gelap */}
            <ThemeToggleButton />
            {/* Foto Profil -> Halaman Profile */}
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition shadow-xs overflow-hidden ${
                activeTab === 'profile'
                  ? 'ring-2 ring-orange-500/40'
                  : 'hover:ring-2 hover:ring-orange-500/30'
              }`}
              title={currentUser?.name || 'Profil'}
              aria-label="Profil pengguna"
            >
              {currentUser?.photoURL && !currentUser.photoURL.startsWith('data:') && !currentUser.photoURL.startsWith('http') ? (
                <span className="flex items-center justify-center w-8 h-8 rounded-full text-lg bg-gradient-to-tr from-orange-600 to-amber-500">
                  {currentUser.photoURL}
                </span>
              ) : currentUser?.photoURL ? (
                <img src={currentUser.photoURL} alt="Foto profil" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-extrabold text-white bg-gradient-to-tr from-orange-600 to-amber-500">
                  {profileInitial}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport with generous bottom padding for floating dock */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-36">
        <PullToRefresh onRefresh={() => pullFromVaultNow().catch(() => {})}>
          {activeTab === 'dashboard' && <DashboardView onNavigateTab={tab => setActiveTab(tab)} />}
          {activeTab === 'transactions' && <TransactionsView />}
          {activeTab === 'accounts' && <AccountsView onNavigateTab={tab => setActiveTab(tab)} />}
          {activeTab === 'debts' && <DebtsView />}
          {activeTab === 'summary' && <SummaryView />}
          {activeTab === 'settings' && <SettingsView />}
          {activeTab === 'profile' && <ProfileView onBack={() => setActiveTab('dashboard')} />}
        </PullToRefresh>
      </main>

      {/* Floating Glass Bottom Navigation (iOS style, kaca gençet) */}
      <nav
        ref={navBarRef}
        aria-label="Navigasi Utama"
        onMouseMove={handleNavMouseMove}
        onTouchStart={e => {
          handleNavTouch(e);
          handleDockTouchStart(e);
        }}
        onTouchMove={e => {
          handleNavTouch(e);
          handleDockTouchMove(e);
        }}
        onTouchEnd={endDockTouch(true)}
        onTouchCancel={() => {
          navTouchId.current = null;
          setTouchTab(null);
        }}
        className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[480px] z-40 rounded-[28px] bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.45)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden"
      >
        {/* Sorotan kaca mengikuti kursor/sentuhan */}
        <span
          aria-hidden
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(140px circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,0.28), transparent 70%)',
          }}
        />
        <div className="px-2 sm:px-3 relative">
          <div ref={navTrackRef} className="flex items-center justify-between h-[68px] relative">
            {/* Bubble highlight meluncur ke tab aktif */}
            <span
              aria-hidden
              className="absolute top-1.5 bottom-1.5 rounded-2xl bg-orange-500/15 dark:bg-white/10 border border-orange-500/20 dark:border-white/10 transition-all duration-300 ease-out pointer-events-none"
              style={{
                left: bubble.left,
                width: bubble.width,
                opacity: bubble.visible ? 1 : 0,
              }}
            />
            {navItems.map(renderNavItem)}
          </div>
        </div>
      </nav>

      {/* Modal otomatis dari share gambar/teks luar (hasil OCR + prefill) */}
      <TransactionModal
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          setSharedPrefill(null);
        }}
        initialType={sharedPrefill?.type || 'expense'}
        initialDate={sharedPrefill?.date}
        prefill={sharedPrefill}
        prefillKey={sharedKey}
      />
    </div>
  );
}

function GatedApp() {
  const { currentUser, authReady } = useAuth();

  // Tunggu status sesi Firebase pulih agar pengguna login tidak melihat kedip login
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <img src="/icon.svg" alt="Logo DigiNote" className="w-20 h-20 rounded-3xl shadow-lg mx-auto" />
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span>Memuat DigiNote…</span>
          </div>
        </div>
      </div>
    );
  }

  // Belum login -> halaman login/pendaftaran
  if (!currentUser) {
    return <AuthView />;
  }

  // Data terisolasi per pengguna login
  return (
    <FinanceProvider userId={currentUser.id}>
      <MainApp />
    </FinanceProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <GatedApp />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
