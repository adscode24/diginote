import React, { useState } from 'react';
import {
  LayoutDashboard,
  Receipt,
  Wallet,
  CreditCard,
  Calendar,
  BarChart3,
  Settings,
} from 'lucide-react';
import { FinanceProvider } from './context/FinanceContext';
import { ActiveTab } from './types';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { AccountsView } from './components/AccountsView';
import { DebtsView } from './components/DebtsView';
import { CalendarView } from './components/CalendarView';
import { ReportView } from './components/ReportView';
import { SettingsView } from './components/SettingsView';

function MainApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  const navItems: { id: ActiveTab; label: string; shortLabel: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transaksi', shortLabel: 'Transaksi', icon: Receipt },
    { id: 'accounts', label: 'Sumber Dana', shortLabel: 'Dana', icon: Wallet },
    { id: 'debts', label: 'Hutang Piutang', shortLabel: 'Hutang', icon: CreditCard },
    { id: 'reports', label: 'Laporan', shortLabel: 'Laporan', icon: BarChart3 },
    { id: 'settings', label: 'Pengaturan', shortLabel: 'Setelan', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col antialiased selection:bg-emerald-500/20 selection:text-emerald-600">
      {/* Clean Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Brand Wordmark: DigiNote */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-bold shadow-xs">
              <Wallet className="w-4 h-4" />
            </div>
            <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
              DigiNote
            </span>
          </div>

          {/* Calendar Icon Button in Top Right Header */}
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              activeTab === 'calendar'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Buka Kalender Transaksi"
            aria-label="Kalender"
          >
            <Calendar className={`w-4 h-4 ${activeTab === 'calendar' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} />
            <span>Kalender</span>
          </button>
        </div>
      </header>

      {/* Main Content Viewport with generous bottom padding for bottom dock */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-28">
        {activeTab === 'dashboard' && <DashboardView onNavigateTab={tab => setActiveTab(tab)} />}
        {activeTab === 'transactions' && <TransactionsView />}
        {activeTab === 'accounts' && <AccountsView />}
        {activeTab === 'debts' && <DebtsView />}
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'reports' && <ReportView />}
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
                      ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                  }`}
                >
                  {/* Active highlight pill indicator */}
                  {isActive && (
                    <span className="absolute -top-1 w-8 h-1 bg-emerald-600 dark:bg-emerald-400 rounded-full" />
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

export default function App() {
  return (
    <FinanceProvider>
      <MainApp />
    </FinanceProvider>
  );
}
