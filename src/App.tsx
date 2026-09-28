import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  CreditCard,
  CalendarDays,
  Settings,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { FinanceProvider } from './context/FinanceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ActiveTab } from './types';
import { TransactionModal } from './components/TransactionModal';
import { useBodyScrollLock } from './hooks/useBodyScrollLock';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { AccountsView } from './components/AccountsView';
import { DebtsView } from './components/DebtsView';
import { SummaryView } from './components/SummaryView';
import { SettingsView } from './components/SettingsView';
import { AuthView } from './components/AuthView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { forceUnlockBodyScroll } from './hooks/useBodyScrollLock';

import { ProfileView } from './components/ProfileView';

function MainApp() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [fabOpen, setFabOpen] = useState(false);
  const [txModal, setTxModal] = useState<{ open: boolean; type: 'income' | 'expense' }>({
    open: false,
    type: 'expense',
  });
  useBodyScrollLock(txModal.open);
  const profileInitial = ((currentUser?.name || 'D').trim()[0] || 'D').toUpperCase();

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
    { id: 'settings', label: 'Pengaturan', shortLabel: 'Setelan', icon: Settings },
  ];
  const leftItems = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

  const openTxModal = (type: 'income' | 'expense') => {
    setFabOpen(false);
    setTxModal({ open: true, type });
  };

  const renderNavItem = (item: (typeof navItems)[number]) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => {
          setFabOpen(false);
          setActiveTab(item.id);
        }}
        className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition min-w-[44px] min-h-[44px] relative group ${
          isActive
            ? 'text-orange-600 dark:text-orange-400 font-bold'
            : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
        }`}
      >
        {isActive && (
          <span className="absolute -top-1 w-8 h-1 bg-orange-600 dark:bg-orange-400 rounded-full" />
        )}
        <Icon
          className={`w-5 h-5 transition-transform group-active:scale-95 ${
            isActive ? 'stroke-[2.5]' : 'stroke-2'
          }`}
        />
        <span className="text-[10px] tracking-tight mt-1 truncate max-w-[68px]">
          <span className="sm:hidden">{item.shortLabel}</span>
          <span className="hidden sm:inline">{item.label}</span>
        </span>
      </button>
    );
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
            {/* Summary Button in Top Right Header */}
            <button
              onClick={() => setActiveTab('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                activeTab === 'summary'
                  ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
              title="Buka Summary (Kalender & Laporan)"
              aria-label="Summary"
            >
              <CalendarDays className={`w-4 h-4 ${activeTab === 'summary' ? 'text-white' : 'text-orange-600 dark:text-orange-400'}`} />
              <span>Summary</span>
            </button>

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
              {currentUser?.photoURL ? (
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
        {activeTab === 'dashboard' && <DashboardView onNavigateTab={tab => setActiveTab(tab)} />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'accounts' && <AccountsView onNavigateTab={tab => setActiveTab(tab)} />}
        {activeTab === 'debts' && <DebtsView />}
        {activeTab === 'summary' && <SummaryView />}
        {activeTab === 'settings' && <SettingsView />}
        {activeTab === 'profile' && <ProfileView onBack={() => setActiveTab('dashboard')} />}
      </main>

      {/* Floating Glass Bottom Navigation (iOS style) dengan tombol + tengah */}
      <nav
        aria-label="Navigasi Utama"
        className="fixed bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[420px] z-40 rounded-3xl bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/40 dark:border-slate-700/60 shadow-2xl"
      >
        <div className="px-2 sm:px-4">
          <div className="flex items-end justify-between h-[72px] relative">
            <div className="flex items-center justify-around flex-1">
              {leftItems.map(renderNavItem)}
            </div>

            {/* Tombol + */}
            <div className="relative flex flex-col items-center justify-end w-[76px] shrink-0">
              {/* Pilihan wraparound: Masuk / Keluar */}
              <button
                onClick={() => openTxModal('income')}
                aria-label="Catat pemasukan"
                className={`absolute left-0 bottom-[74px] flex flex-col items-center gap-1 transition-all duration-300 ${
                  fabOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-4 pointer-events-none'
                }`}
                style={{ transitionDelay: fabOpen ? '90ms' : '0ms' }}
              >
                <span className="w-12 h-12 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center shadow-lg">
                  <ArrowDownLeft className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur">
                  Masuk
                </span>
              </button>
              <button
                onClick={() => openTxModal('expense')}
                aria-label="Catat pengeluaran"
                className={`absolute right-0 bottom-[74px] flex flex-col items-center gap-1 transition-all duration-300 ${
                  fabOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-4 pointer-events-none'
                }`}
                style={{ transitionDelay: fabOpen ? '0ms' : '90ms' }}
              >
                <span className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg">
                  <ArrowUpRight className="w-5 h-5" />
                </span>
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur">
                  Keluar
                </span>
              </button>

              <button
                onClick={() => setFabOpen(v => !v)}
                aria-label={fabOpen ? 'Tutup' : 'Catat transaksi'}
                className="w-14 h-14 -mt-7 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white flex items-center justify-center shadow-xl transition-all active:scale-95"
              >
                {fabOpen ? <X className="w-6 h-6" /> : <Plus className="w-7 h-7 stroke-[2.5]" />}
              </button>
            </div>

            <div className="flex items-center justify-around flex-1">
              {rightItems.map(renderNavItem)}
            </div>
          </div>
        </div>
      </nav>

      {/* Modal catat transaksi global */}
      <TransactionModal
        isOpen={txModal.open}
        onClose={() => setTxModal(prev => ({ ...prev, open: false }))}
        initialType={txModal.type}
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
        <GatedApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
