import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Wallet,
  Building2,
  Smartphone,
  CreditCard,
  Banknote,
  TrendingUp,
  Edit2,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
  SlidersHorizontal,
  Layers,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { Account, AccountType } from '../types';
import { useFinance } from '../context/FinanceContext';
import { formatRupiah, formatDateIndo, formatMonthYearIndo } from '../utils/formatters';
import { CategoryIcon } from './CategoryIcon';
import { AccountModal } from './AccountModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

const TYPE_CONFIGS: { type: AccountType; label: string; icon: string }[] = [
  { type: 'bank', label: 'Rekening Bank', icon: 'Building2' },
  { type: 'cash', label: 'Uang Tunai', icon: 'Banknote' },
  { type: 'credit_card', label: 'Kartu Kredit', icon: 'CreditCard' },
  { type: 'ewallet', label: 'Dompet Digital', icon: 'Smartphone' },
  { type: 'investment', label: 'Investasi', icon: 'TrendingUp' },
  { type: 'other', label: 'Lainnya', icon: 'Wallet' },
];

export const AccountsView: React.FC = () => {
  const { accounts, transactions, deleteAccount, summary } = useFinance();

  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create_or_edit' | 'adjust_balance'>('create_or_edit');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [sheetAccountId, setSheetAccountId] = useState<string | null>(null);
  useBodyScrollLock(sheetAccountId !== null);

  // Mata bottom sheet: default tertutup (sembunyikan saldo + isi mutasi)
  const [sheetHiddenMap, setSheetHiddenMap] = useState<Record<string, boolean>>({});
  const toggleSheetHidden = (id: string) => {
    setSheetHiddenMap(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  // Fokus dari Beranda (klik kartu carousel): buka bottom sheet + mutasi otomatis
  useEffect(() => {
    try {
      const focusId = sessionStorage.getItem('diginote_focus_account');
      if (focusId) {
        sessionStorage.removeItem('diginote_focus_account');
        setSheetAccountId(focusId);
      }
    } catch {
      /* abaikan */
    }
  }, []);

  // Current month string for default accordion collapse logic (YYYY-MM)
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Accordion state for monthly mutations inside cards
  const [expandedAccountMonths, setExpandedAccountMonths] = useState<Record<string, boolean>>({});

  const isAccountMonthExpanded = (key: string, monthKey: string) => {
    if (expandedAccountMonths[key] !== undefined) {
      return expandedAccountMonths[key];
    }
    // Default: tertutup jika sudah lewat bulan (< currentMonthKey), terbuka jika bulan sekarang / masa depan
    return monthKey >= currentMonthKey;
  };

  const toggleAccountMonth = (key: string, monthKey: string) => {
    setExpandedAccountMonths(prev => {
      const isPastMonth = monthKey < currentMonthKey;
      const currentVal = prev[key] !== undefined ? prev[key] : !isPastMonth;
      return {
        ...prev,
        [key]: !currentVal,
      };
    });
  };

  // Group an account's transactions by month
  const getAccountGroupedTx = (accountId: string) => {
    const accTx = transactions.filter(t => t.accountId === accountId);
    const groups: Record<
      string,
      {
        monthKey: string;
        label: string;
        transactions: typeof transactions;
        totalIncome: number;
        totalExpense: number;
      }
    > = {};

    accTx.forEach(tx => {
      const monthKey = tx.date && tx.date.length >= 7 ? tx.date.substring(0, 7) : 'Lainnya';
      if (!groups[monthKey]) {
        let label = monthKey;
        if (monthKey.includes('-')) {
          const [y, m] = monthKey.split('-');
          label = formatMonthYearIndo(Number(y), Number(m));
        }
        groups[monthKey] = {
          monthKey,
          label,
          transactions: [],
          totalIncome: 0,
          totalExpense: 0,
        };
      }
      groups[monthKey].transactions.push(tx);
      if (tx.type === 'income') {
        groups[monthKey].totalIncome += tx.amount;
      } else {
        groups[monthKey].totalExpense += tx.amount;
      }
    });

    // Sort transactions descending inside each month
    Object.values(groups).forEach(g => {
      g.transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    });

    // Sort months descending (latest month first)
    const sortedKeys = Object.keys(groups).sort().reverse();
    return sortedKeys.map(k => groups[k]);
  };

  // Category Tabs: hanya jenis yang memiliki data sumber dana
  const categoryTabs = useMemo(() => {
    const tabs = TYPE_CONFIGS.map(cfg => {
      const matchingAccounts = accounts.filter(a => a.type === cfg.type);
      const totalBalance = matchingAccounts.reduce((acc, curr) => acc + curr.balance, 0);
      return {
        id: cfg.type,
        label: cfg.label,
        icon: cfg.icon,
        count: matchingAccounts.length,
        totalBalance,
      };
    })
      // Sembunyikan tab jenis yang belum punya data
      .filter(t => t.count > 0);

    // Urutkan berdasarkan alfabet judul tab jenis sumber dana
    return tabs.sort((a, b) => a.label.localeCompare(b.label, 'id'));
  }, [accounts]);

  // Jika tab aktif kehabisan data (mis. akun terakhir dihapus), kembali ke Semua
  React.useEffect(() => {
    if (activeCategoryTab !== 'all' && !accounts.some(a => a.type === activeCategoryTab)) {
      setActiveCategoryTab('all');
    }
  }, [accounts, activeCategoryTab]);

  // Current active tab accounts sorted alphabetically
  const displayedAccounts = useMemo(() => {
    let list = accounts;
    if (activeCategoryTab !== 'all') {
      list = accounts.filter(a => a.type === activeCategoryTab);
    }
    // Urutkan akun di dalam tab berdasarkan alfabet nama akun
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [accounts, activeCategoryTab]);

  // Current active tab total summary
  const currentTabMeta = useMemo(() => {
    if (activeCategoryTab === 'all') {
      return {
        label: 'Semua Sumber Dana',
        count: accounts.length,
        totalBalance: summary.totalAccountBalance,
      };
    }
    const found = categoryTabs.find(t => t.id === activeCategoryTab);
    return {
      label: found?.label || 'Sumber Dana',
      count: found?.count || 0,
      totalBalance: found?.totalBalance || 0,
    };
  }, [activeCategoryTab, accounts, summary, categoryTabs]);

  const handleOpenCreate = (defaultType?: AccountType) => {
    setSelectedAccount(null);
    setModalMode('create_or_edit');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (account: Account) => {
    setSelectedAccount(account);
    setModalMode('create_or_edit');
    setIsModalOpen(true);
  };

  const handleOpenAdjust = (account: Account) => {
    setSelectedAccount(account);
    setModalMode('adjust_balance');
    setIsModalOpen(true);
  };

  const handleDelete = (account: Account) => {
    if (account.isDefault) {
      alert('Sumber dana utama / default tidak dapat dihapus.');
      return;
    }
    if (
      confirm(
        `Hapus sumber dana "${account.name}"? Transaksi yang sudah tercatat dengan akun ini akan tetap tersimpan.`
      )
    ) {
      deleteAccount(account.id);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <span>Sumber Dana & Rekening</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Kelola saldo dompet fisik, rekening bank, e-wallet, investasi, dan kartu kredit Anda
          </p>
        </div>

        <button
          onClick={() => handleOpenCreate(activeCategoryTab !== 'all' ? (activeCategoryTab as AccountType) : undefined)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Sumber Dana</span>
        </button>
      </div>

      {/* Summary Highlight Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-md border border-slate-700/60">
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-400">
            Total Saldo Bersih Seluruh Sumber Dana
          </span>
          <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-bold border border-orange-500/30">
            Real-time
          </span>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight mt-2 text-white">
          {formatRupiah(summary.totalAccountBalance)}
        </div>

        {/* Breakdown of Assets */}
        <div className="flex flex-wrap items-center gap-3 pt-3 mt-3 border-t border-slate-700/80 text-xs">
          <div className="flex items-center gap-1.5 text-orange-300 bg-orange-950/60 border border-orange-800/80 px-2.5 py-1 rounded-lg">
            <span>Total Semua Sumber Dana:</span>
            <strong className="font-bold tabular-nums">+{formatRupiah(summary.totalAssetBalance)}</strong>
          </div>

          <span className="text-slate-400 text-[11px] ml-auto">
            {accounts.length} Sumber Dana Aktif
          </span>
        </div>
      </div>

      {/* Tabs Jenis Sumber Dana (Diurutkan Secara Alfabet) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Tab Jenis Sumber Dana
          </span>
          <span className="text-[11px] text-slate-400">
            Urutan alfabet berdasarkan jenis
          </span>
        </div>

        {/* Horizontal Scrollable Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {/* Tab Semua */}
          <button
            onClick={() => setActiveCategoryTab('all')}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-left shrink-0 transition ${
              activeCategoryTab === 'all'
                ? 'bg-orange-600 text-white border-orange-600 shadow-xs ring-2 ring-orange-500/20'
                : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <div className="text-left">
              <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                <span>Semua</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                  activeCategoryTab === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {accounts.length}
                </span>
              </div>
              <div className={`text-[11px] font-semibold tabular-nums mt-0.5 ${
                activeCategoryTab === 'all'
                  ? 'text-orange-100'
                  : 'text-slate-500 dark:text-slate-400'
              }`}>
                {formatRupiah(summary.totalAccountBalance)}
              </div>
            </div>
          </button>

          {/* Individual Category Tabs (Sorted Alphabetically by Title) */}
          {categoryTabs.map(tab => {
            const isActive = activeCategoryTab === tab.id;
            const isNegative = tab.totalBalance < 0;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategoryTab(tab.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-left shrink-0 transition ${
                  isActive
                    ? 'bg-orange-600 text-white border-orange-600 shadow-xs ring-2 ring-orange-500/20'
                    : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-orange-600 dark:text-orange-400'
                }`}>
                  <CategoryIcon name={tab.icon} className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}>
                      {tab.count}
                    </span>
                  </div>
                  <div className={`text-[11px] font-semibold tabular-nums mt-0.5 ${
                    isActive
                      ? 'text-orange-100'
                      : isNegative
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-orange-600 dark:text-orange-400'
                  }`}>
                    {formatRupiah(tab.totalBalance)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Daftar {currentTabMeta.label}
          </span>
          <span className="text-[11px] text-slate-400">
            ({displayedAccounts.length} akun terdaftar, terurut alfabet A-Z)
          </span>
        </div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Sisa Total Dana Kategori:{' '}
          <strong className={`font-bold tabular-nums ml-1 ${
            currentTabMeta.totalBalance < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-orange-600 dark:text-orange-400'
          }`}>
            {formatRupiah(currentTabMeta.totalBalance)}
          </strong>
        </div>
      </div>

      {/* Account Cards Grid */}
      {displayedAccounts.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <Wallet className="w-10 h-10 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Belum Ada Sumber Dana untuk Kategori "{currentTabMeta.label}"
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Tambahkan akun atau rekening baru untuk kategori ini agar saldo dan mutasi tercatat rapi.
          </p>
          <button
            onClick={() => handleOpenCreate(activeCategoryTab !== 'all' ? (activeCategoryTab as AccountType) : undefined)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>{activeCategoryTab === 'all' ? 'Tambah Sumber Dana' : `Tambah ${currentTabMeta.label}`}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {displayedAccounts.map(acc => {
            return (
              <div
                key={acc.id}
                onClick={() => setSheetAccountId(acc.id)}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border transition shadow-xs flex flex-col justify-between cursor-pointer border-slate-200/80 dark:border-slate-800 hover:border-orange-500"
              >
                <div>
                  {/* Top Row: Icon, Name & Type */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                        style={{ backgroundColor: acc.color }}
                      >
                        <CategoryIcon name={acc.icon} className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                            {acc.name}
                          </h4>
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium capitalize mt-0.5">
                          {acc.type === 'bank'
                            ? 'Rekening Bank'
                            : acc.type === 'ewallet'
                            ? 'Dompet Digital'
                            : acc.type === 'credit_card'
                            ? 'Kartu Kredit'
                            : acc.type === 'cash'
                            ? 'Uang Tunai'
                            : acc.type === 'investment'
                            ? 'Investasi'
                            : 'Lainnya'}
                          {acc.accountNumber && ` · ${acc.accountNumber}`}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenEdit(acc);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {!acc.isDefault && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDelete(acc);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Balance Display */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="text-[11px] text-slate-400 font-medium">
                      Saldo Saat Ini
                    </div>
                    <div
                      className={`text-xl font-bold tabular-nums tracking-tight mt-0.5 ${
                        acc.balance >= 0
                          ? 'text-slate-900 dark:text-white'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {formatRupiah(acc.balance)}
                    </div>

                    <div className="text-[10px] text-slate-400 mt-1">
                      Saldo Awal: {formatRupiah(acc.initialBalance)}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleOpenAdjust(acc);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition"
                  >
                    <SlidersHorizontal className="w-3 h-3 text-slate-500" />
                    <span>Sesuaikan Saldo</span>
                  </button>

                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setSheetAccountId(acc.id);
                    }}
                    className="text-[11px] font-semibold transition px-2.5 py-1.5 rounded-lg text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100"
                  >
                    Lihat Mutasi
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Sheet: Preview Kartu + Mutasi (mata default tertutup) */}
      {(() => {
        const sheetAcc = accounts.find(a => a.id === sheetAccountId);
        if (!sheetAcc) return null;
        const monthGroups = getAccountGroupedTx(sheetAcc.id);
        const sheetHidden = sheetHiddenMap[sheetAcc.id] ?? true;
        const sheetMasked = (amount: number) => (sheetHidden ? 'Rp••••••' : formatRupiah(amount));
        return (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setSheetAccountId(null)}
          >
            <div
              className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

              {/* Preview Kartu */}
              <div className="p-4 pb-3 shrink-0">
                <div
                  className="relative overflow-hidden rounded-2xl shadow-md"
                  style={{
                    background: `linear-gradient(120deg, ${sheetAcc.color} 0%, ${sheetAcc.color} 55%, rgba(0,0,0,0.38) 135%)`,
                  }}
                >
                  <div className="absolute -right-10 -top-16 w-44 h-44 rounded-full bg-white/10 pointer-events-none" />
                  <div className="absolute -right-4 top-6 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
                  <div className="relative p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80 truncate">
                        {sheetAcc.name}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl font-extrabold tabular-nums text-white mt-0.5">
                          {sheetMasked(sheetAcc.balance)}
                        </span>
                        <button
                          onClick={() => toggleSheetHidden(sheetAcc.id)}
                          className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
                          title={sheetHidden ? 'Tampilkan data' : 'Sembunyikan data'}
                        >
                          {sheetHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => setSheetAccountId(null)}
                      className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition shrink-0"
                      title="Tutup"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Mutasi (terbuka) */}
              <div className="px-4 pb-2 shrink-0">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Mutasi {sheetAcc.name}
                </div>
              </div>
              <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-2">
                {monthGroups.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic py-3 text-center bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800">
                    Belum ada riwayat transaksi pada sumber dana ini.
                  </p>
                ) : (
                  monthGroups.map(group => {
                    const accordionKey = `${sheetAcc.id}_${group.monthKey}`;
                    const isExpanded = isAccountMonthExpanded(accordionKey, group.monthKey);
                    return (
                      <div
                        key={group.monthKey}
                        className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleAccountMonth(accordionKey, group.monthKey)}
                          className="w-full p-2.5 flex items-center justify-between text-left hover:bg-slate-100/70 dark:hover:bg-slate-900/60 transition gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {group.label}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {group.transactions.length} transaksi
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right text-[11px] tabular-nums font-semibold">
                              {group.totalIncome > 0 && (
                                <div className="text-orange-600 dark:text-orange-400">
                                  +{sheetHidden ? '••••••' : formatRupiah(group.totalIncome, false)}
                                </div>
                              )}
                              {group.totalExpense > 0 && (
                                <div className="text-slate-600 dark:text-slate-400">
                                  -{sheetHidden ? '••••••' : formatRupiah(group.totalExpense, false)}
                                </div>
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="p-2 pt-0 space-y-1.5 border-t border-slate-200/60 dark:border-slate-800 mt-1">
                            {group.transactions.map(tx => {
                              const isIncome = tx.type === 'income';
                              return (
                                <div
                                  key={tx.id}
                                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-[11px]"
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                      {tx.categoryName}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate">
                                      {formatDateIndo(tx.date)} {tx.description && `· ${tx.description}`}
                                    </div>
                                  </div>
                                  <div
                                    className={`font-bold tabular-nums shrink-0 ${
                                      isIncome
                                        ? 'text-orange-600 dark:text-orange-400'
                                        : 'text-slate-900 dark:text-white'
                                    }`}
                                  >
                                    {isIncome ? '+' : '-'}{sheetMasked(tx.amount)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Account Modal */}
      <AccountModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        accountToEdit={selectedAccount}
        mode={modalMode}
        defaultType={activeCategoryTab !== 'all' ? (activeCategoryTab as AccountType) : 'bank'}
      />
    </div>
  );
};
