import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  CreditCard,
  CalendarDays,
  Settings,
  LogOut,
  Cloud,
  CloudOff,
} from 'lucide-react';
import { FinanceProvider } from './context/FinanceContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultKeyProvider, useVaultKey } from './context/VaultKeyContext';
import { isCloudEnabled } from './services/firebase';
import { ActiveTab } from './types';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { AccountsView } from './components/AccountsView';
import { DebtsView } from './components/DebtsView';
import { SummaryView } from './components/SummaryView';
import { SettingsView } from './components/SettingsView';
import { AuthView } from './components/AuthView';
import { VaultUnlockModal } from './components/VaultUnlockModal';
import { ErrorBoundary } from './components/ErrorBoundary';

function MainApp() {
  const { currentUser, logout } = useAuth();
  const { lock } = useVaultKey();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  const navItems: { id: ActiveTab; label: string; shortLabel: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transaksi', shortLabel: 'Transaksi', icon: Receipt },
    { id: 'accounts', label: 'Sumber Dana', shortLabel: 'Dana', icon: Wallet },
    { id: 'debts', label: 'Hutang Piutang', shortLabel: 'Hutang', icon: CreditCard },
    { id: 'summary', label: 'Summary', shortLabel: 'Summary', icon: CalendarDays },
    { id: 'settings', label: 'Pengaturan', shortLabel: 'Setelan', icon: Settings },
  ];

  const handleLogout = () => {
    if (confirm(`Keluar dari akun "${currentUser?.name}"?`)) {
      if (currentUser) lock(currentUser.id);
      logout();
      setActiveTab('dashboard');
    }
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
            {/* Status Cloud */}
            <span
              className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${
                isCloudEnabled()
                  ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
              title={isCloudEnabled() ? 'Sinkronisasi cloud aktif' : 'Mode lokal perangkat'}
            >
              {isCloudEnabled() ? <Cloud className="w-3 h-3" /> : <CloudOff className="w-3 h-3" />}
              <span>{isCloudEnabled() ? 'Cloud' : 'Lokal'}</span>
            </span>

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

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-8 h-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 transition"
              title="Keluar dari akun"
              aria-label="Keluar"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport with generous bottom padding for bottom dock */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-28">
        {activeTab === 'dashboard' && <DashboardView onNavigateTab={tab => setActiveTab(tab)} />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'accounts' && <AccountsView />}
        {activeTab === 'debts' && <DebtsView />}
        {activeTab === 'summary' && <SummaryView />}
        {activeTab === 'settings' && <SettingsView />}
      </main>

      {/* Bottom Navigation Bar for BOTH Desktop and Mobile (User Requirement: "navigation bar berada di bagian bawah") */}
      <nav
        aria-label="Navigasi Utama"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200/90 dark:border-slate-800/90 shadow-lg"
      >
        <div className="max-w-4xl mx-auto px-2 sm:px-6">
          <div className="flex items-center justify-between sm:justify-around h-16">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition min-w-[44px] min-h-[44px] relative group ${
                    isActive
                      ? 'text-orange-600 dark:text-orange-400 font-bold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                  }`}
                >
                  {/* Active highlight pill indicator */}
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
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

function GatedApp() {
  const { currentUser, mode, authReady } = useAuth();
  const { restore } = useVaultKey();

  // Pulihkan kunci vault tersimpan agar tidak ditanya ulang tiap refresh
  useEffect(() => {
    if (currentUser) restore(currentUser.id);
  }, [currentUser, restore]);

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
      {mode === 'online' && <VaultUnlockModal uid={currentUser.id} email={currentUser.email} />}
    </FinanceProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <VaultKeyProvider>
          <GatedApp />
        </VaultKeyProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
