import React, { useState, useMemo } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Receipt,
  BellRing,
  X,
  Tag,
  Plus,
  Pencil,
  Trash2,
  Cloud,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import {
  formatRupiah,
  formatDateIndo,
  calculateDueDateStatus,
  getTodayString,
  formatMonthYearIndo,
  getNextDueDate,
} from '../utils/formatters';
import { CategoryIcon } from './CategoryIcon';
import { TransactionModal } from './TransactionModal';
import { PayDebtModal } from './PayDebtModal';
import { BillModal } from './BillModal';
import { BillPayModal } from './BillPayModal';
import { Debt, ActiveTab, Transaction, TransactionType, Bill } from '../types';

interface DashboardViewProps {
  onNavigateTab: (tab: ActiveTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateTab }) => {
  const { summary, transactions, debts, accounts, categories, reminderSettings, bills, billPayments, deleteBill, syncNotice, clearSyncNotice, syncStatus, pullFromVaultNow } = useFinance();
  const { currentUser } = useAuth();

  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [selectedDebtToPay, setSelectedDebtToPay] = useState<Debt | null>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  const [billToPay, setBillToPay] = useState<Bill | null>(null);

  // Month filter state
  const today = getTodayString();
  const [selectedYear, setSelectedYear] = useState(() => Number(today.split('-')[0]));
  const [selectedMonth, setSelectedMonth] = useState(() => Number(today.split('-')[1]));

  // Bottom Sheet for Pemasukan / Pengeluaran breakdown
  const [breakdownType, setBreakdownType] = useState<TransactionType | null>(null);

  // Kunci scroll halaman belakang saat bottom sheet / modal terbuka
  useBodyScrollLock(breakdownType !== null || isTxModalOpen || selectedDebtToPay !== null || isBillModalOpen || billToPay !== null);

  const selectedMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const selectedMonthLabel = formatMonthYearIndo(selectedYear, selectedMonth);

  // Check if today has transactions
  const hasLoggedToday = transactions.some(t => t.date === today);

  // Filtered transactions for selected month
  const monthlyTransactions = useMemo(() => {
    return transactions.filter(t => t.date && t.date.startsWith(selectedMonthStr));
  }, [transactions, selectedMonthStr]);

  const filteredIncome = useMemo(() => {
    return monthlyTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [monthlyTransactions]);

  const filteredExpense = useMemo(() => {
    return monthlyTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [monthlyTransactions]);

  const filteredBalance = filteredIncome - filteredExpense;
  const filteredSavingsRate = filteredIncome > 0 ? Math.max(0, (filteredBalance / filteredIncome) * 100) : 0;

  // Breakdown transactions list for bottom sheet
  const breakdownList = useMemo(() => {
    if (!breakdownType) return [];
    return monthlyTransactions.filter(t => t.type === breakdownType);
  }, [monthlyTransactions, breakdownType]);

  // Upcoming / Overdue debts (limit to 3)
  const urgentDebts = useMemo(() => {
    return debts
      .filter(d => d.status !== 'paid' && d.type === 'payable')
      .map(d => {
        const effectiveDueDate = d.dueDayOfMonth ? getNextDueDate(d.dueDayOfMonth) : d.dueDate;
        const status = calculateDueDateStatus(effectiveDueDate);
        return {
          ...d,
          effectiveDueDate,
          statusInfo: status,
        };
      })
      .sort((a, b) => a.statusInfo.daysRemaining - b.statusInfo.daysRemaining)
      .slice(0, 3);
  }, [debts]);

  // Hitung total saldo semua sumber dana (kartu kredit = sumber dana biasa)
  const liquidAccounts = useMemo(() => {
    return accounts.filter(a => a.type === 'bank' || a.type === 'cash' || a.type === 'ewallet' || a.type === 'credit_card');
  }, [accounts]);

  const totalLiquidAccountsBalance = useMemo(() => {
    return liquidAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  }, [liquidAccounts]);

  // Transaksi terbaru diurutkan berdasarkan tanggal transaksi (date), bukan tanggal dibuat
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) return dateDiff;
        return (b.createdAt || 0) - (a.createdAt || 0);
      })
      .slice(0, 5);
  }, [transactions]);

  // Tagihan rutin bulan berjalan: status lunas / jatuh tempo
  const currentMonthKey = today.substring(0, 7);
  const billCards = useMemo(() => {
    const [cy, cm] = currentMonthKey.split('-').map(Number);
    const daysInMonth = new Date(cy, cm, 0).getDate();
    return bills
      .filter(b => b.isActive !== false)
      .map(b => {
        const paid = billPayments.some(p => p.billId === b.id && p.monthKey === currentMonthKey);
        const dueDay = Math.min(Math.max(1, b.dueDayOfMonth || 1), daysInMonth);
        const dueDateStr = `${currentMonthKey}-${String(dueDay).padStart(2, '0')}`;
        const statusInfo = calculateDueDateStatus(dueDateStr);
        return { ...b, paid, dueDateStr, statusInfo };
      })
      .sort((a, b) => {
        if (a.paid !== b.paid) return a.paid ? 1 : -1;
        return a.statusInfo.daysRemaining - b.statusInfo.daysRemaining;
      });
  }, [bills, billPayments, currentMonthKey]);

  return (
    <div className="space-y-6 pb-6">
      {/* Cloud Sync Notice (umpan balik operasi manual dari Pengaturan) */}
      {syncNotice && (
        <div className="p-3.5 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-xs text-orange-800 dark:text-orange-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 shrink-0" />
            <span>{syncNotice.text}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {syncNotice.action === 'pull' && (
              <button
                onClick={() => void pullFromVaultNow()}
                disabled={syncStatus === 'syncing'}
                className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white transition"
              >
                Sinkronkan Sekarang
              </button>
            )}
            <button
              onClick={clearSyncNotice}
              className="p-1 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/60 transition shrink-0"
              title="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Kartu Ucapan Selamat Datang */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-700 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0 text-lg font-extrabold">
            {((currentUser?.name || 'D').trim()[0] || 'D').toUpperCase()}
          </div>
          <div>
            <h4 className="text-sm font-bold">Selamat Datang, {currentUser?.name || 'Pengguna'}!</h4>
            <p className="text-xs text-orange-100 mt-0.5">
              {formatDateIndo(today)}
              {!hasLoggedToday && reminderSettings.enabled && ' · Belum ada catatan hari ini, yuk catat!'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsTxModalOpen(true)}
          className="self-start sm:self-auto px-4 py-2 text-xs font-bold rounded-xl bg-white text-orange-800 hover:bg-orange-50 transition shadow-xs whitespace-nowrap"
        >
          + Catat Sekarang
        </button>
      </div>

      {/* Header Bar with Month Filter Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Periode Laporan Beranda
          </span>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Ringkasan Keuangan {selectedMonthLabel}
          </h2>
        </div>

        {/* Month & Year Select Dropdowns */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 p-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <Calendar className="w-4 h-4 text-orange-600 dark:text-orange-400 ml-1.5 shrink-0" />
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-2 py-1 text-xs font-bold bg-transparent text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>
                  {new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, m - 1, 1))}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-2 py-1 text-xs font-bold bg-transparent text-slate-800 dark:text-slate-200 focus:outline-hidden"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Saldo Sumber Dana */}
        <div
          onClick={() => onNavigateTab('accounts')}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between cursor-pointer hover:border-orange-500 transition group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition">
                Total Saldo Sumber Dana
              </span>
              <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-2xl font-bold tabular-nums mt-3 ${
                totalLiquidAccountsBalance >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatRupiah(totalLiquidAccountsBalance)}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>{liquidAccounts.length} Rekening, Tunai & Dompet Digital</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition shrink-0 ml-1" />
          </div>
        </div>

        {/* Monthly Income Card (Clickable to view details) */}
        <div
          onClick={() => setBreakdownType('income')}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between cursor-pointer hover:border-orange-500 hover:ring-2 hover:ring-orange-500/20 transition group"
          title="Klik untuk melihat daftar rincian pemasukan bulan ini"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition flex items-center gap-1">
                <span>Pemasukan ({new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(selectedYear, selectedMonth - 1, 1))})</span>
                <span className="text-[10px] text-orange-600 font-bold bg-orange-50 dark:bg-orange-950/60 px-1 rounded">Rincian ↗</span>
              </span>
              <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 tabular-nums mt-3">
              +{formatRupiah(filteredIncome)}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>{monthlyTransactions.filter(t => t.type === 'income').length} Transaksi Masuk</span>
            <span className="text-orange-600 font-medium">Lihat Rincian</span>
          </div>
        </div>

        {/* Monthly Expense Card (Clickable to view details) */}
        <div
          onClick={() => setBreakdownType('expense')}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between cursor-pointer hover:border-red-500 hover:ring-2 hover:ring-red-500/20 transition group"
          title="Klik untuk melihat daftar rincian pengeluaran bulan ini"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition flex items-center gap-1">
                <span>Pengeluaran ({new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(new Date(selectedYear, selectedMonth - 1, 1))})</span>
                <span className="text-[10px] text-red-600 font-bold bg-red-50 dark:bg-red-950/60 px-1 rounded">Rincian ↗</span>
              </span>
              <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-3">
              -{formatRupiah(filteredExpense)}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>{monthlyTransactions.filter(t => t.type === 'expense').length} Transaksi Keluar</span>
            <span className="text-red-600 font-medium">Lihat Rincian</span>
          </div>
        </div>

        {/* Remaining Debt Payable */}
        <div
          onClick={() => onNavigateTab('debts')}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between cursor-pointer hover:border-amber-500 transition group"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 group-hover:text-amber-600 transition">
                Sisa Hutang Berjalan
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-3">
              {formatRupiah(summary.totalPayableDebt)}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between">
            <span>Piutang: {formatRupiah(summary.totalReceivableDebt)}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition" />
          </div>
        </div>
      </div>

      {/* Sumber Dana Row */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Sumber Dana Saya
            </h3>
          </div>
          <button
            onClick={() => onNavigateTab('accounts')}
            className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-0.5"
          >
            <span>Buka Halaman Dana</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {accounts.length === 0 && (
            <button
              onClick={() => onNavigateTab('accounts')}
              className="col-span-2 sm:col-span-4 p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 hover:border-orange-500 hover:text-orange-600 transition"
            >
              Belum ada sumber dana. Klik untuk buat sumber dana pertama Anda.
            </button>
          )}
          {accounts.map(acc => {
            return (
              <div
                key={acc.id}
                onClick={() => onNavigateTab('accounts')}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 cursor-pointer hover:border-orange-500 transition"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center text-white shrink-0 text-[10px]"
                    style={{ backgroundColor: acc.color }}
                  >
                    <CategoryIcon name={acc.icon} className="w-3 h-3" />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {acc.name}
                  </span>
                </div>
                <div className="text-xs font-bold tabular-nums truncate text-slate-900 dark:text-white">
                  {formatRupiah(acc.balance)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tagihan Rutin */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Tagihan Rutin
            </h3>
          </div>
          <button
            onClick={() => {
              setBillToEdit(null);
              setIsBillModalOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Tagihan</span>
          </button>
        </div>

        {billCards.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            Belum ada tagihan rutin. Tambahkan tagihan seperti WiFi, listrik, atau air agar diingatkan tiap bulan.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {billCards.map(bill => (
              <div
                key={bill.id}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {bill.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        bill.paid
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/80 dark:text-orange-300'
                          : bill.statusInfo.isOverdue
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300'
                          : bill.statusInfo.isDueSoon
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {bill.paid ? 'Lunas' : bill.statusInfo.label}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    <strong className="tabular-nums">{formatRupiah(bill.amount)}</strong>
                    <span className="text-[11px] text-slate-400"> · Tgl {bill.dueDayOfMonth} tiap bulan</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Jatuh tempo: {formatDateIndo(bill.dueDateStr)}
                    {bill.categoryName && ` · ${bill.categoryName}`}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {!bill.paid && (
                    <button
                      onClick={() => setBillToPay(bill)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition shadow-xs"
                    >
                      Bayar
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setBillToEdit(bill);
                        setIsBillModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-orange-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Edit tagihan"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Hapus tagihan rutin "${bill.name}"?`)) deleteBill(bill.id);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                      title="Hapus tagihan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two Column Layout: Urgent Debts on Left, Recent Transactions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Urgent Debts */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Jatuh Tempo Hutang Terdekat
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('debts')}
                className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-0.5"
              >
                <span>Lihat Semua</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {urgentDebts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                  <p>Tidak ada hutang yang mendekati tanggal jatuh tempo.</p>
                </div>
              ) : (
                urgentDebts.map(debt => {
                  const status = debt.statusInfo || calculateDueDateStatus(debt.effectiveDueDate || debt.dueDate);
                  const isInstallment = debt.installmentCategory && debt.installmentCategory !== 'non_installment';
                  return (
                    <div
                      key={debt.id}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                            {debt.counterparty}
                          </span>
                          {isInstallment && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">
                              {debt.installmentCategory === 'tiered_installment' ? 'KPR / Berjangka' : 'Cicilan Tetap'}
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              status.isOverdue
                                ? 'bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300'
                                : status.isDueSoon
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {status.label}
                          </span>
                        </div>

                        {debt.monthlyInstallment && debt.monthlyInstallment > 0 ? (
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                            <span>Cicilan:{' '}</span>
                            <strong className="text-red-600 dark:text-red-400 font-bold tabular-nums text-sm">
                              {formatRupiah(debt.monthlyInstallment)}
                            </strong>
                            <span className="text-[11px] text-slate-400"> / bulan</span>
                            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>Sisa Pokok: {formatRupiah(debt.remainingAmount)}</span>
                              {debt.remainingTenor !== undefined && (
                                <span>· Sisa: {debt.remainingTenor}x lagi</span>
                              )}
                              {debt.dueDayOfMonth && (
                                <span>· Tgl {debt.dueDayOfMonth}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Sisa:{' '}
                            <strong className="text-red-600 dark:text-red-400 tabular-nums">
                              {formatRupiah(debt.remainingAmount)}
                            </strong>
                            {debt.dueDayOfMonth && (
                              <span className="ml-2 text-slate-400">· Siklus tgl {debt.dueDayOfMonth}</span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => setSelectedDebtToPay(debt)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition shadow-xs shrink-0"
                      >
                        Bayar
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>Saat dibayar, nominal langsung memotong saldo sumber dana dan sisa hutang.</span>
          </div>
        </div>

        {/* Right Column: Recent Transactions */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Transaksi Terbaru
                </h3>
              </div>
              <button
                onClick={() => onNavigateTab('transactions')}
                className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-0.5"
              >
                <span>Lihat Semua</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {recentTransactions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Belum ada transaksi yang dicatat.
                </div>
              ) : (
                recentTransactions.map(tx => {
                  const cat = categories.find(c => c.id === tx.categoryId);
                  const isIncome = tx.type === 'income';

                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: cat?.color || (isIncome ? '#10B981' : '#EF4444') }}
                        >
                          <CategoryIcon
                            name={cat?.icon || (isIncome ? 'ArrowDownLeft' : 'ArrowUpRight')}
                            className="w-4 h-4"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {tx.categoryName}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {formatDateIndo(tx.date)} · {tx.accountName || tx.paymentMethod}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`font-bold tabular-nums shrink-0 ml-2 ${
                          isIncome ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {isIncome ? '+' : '-'}{formatRupiah(tx.amount)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs font-semibold text-orange-600 dark:text-orange-400 hover:underline"
            >
              Lihat Riwayat Seluruh Transaksi
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Sheet for Pemasukan / Pengeluaran Breakdown */}
      {breakdownType && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setBreakdownType(null)}
        >
          <div
            className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 ${
                    breakdownType === 'income' ? 'bg-orange-600' : 'bg-red-600'
                  }`}
                >
                  {breakdownType === 'income' ? (
                    <ArrowDownLeft className="w-5 h-5" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {breakdownType === 'income' ? 'Rincian Pemasukan' : 'Rincian Pengeluaran'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Periode {selectedMonthLabel} · {breakdownList.length} Transaksi
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBreakdownType(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Banner */}
            <div
              className={`px-6 py-3 border-b flex items-center justify-between text-xs font-semibold shrink-0 ${
                breakdownType === 'income'
                  ? 'bg-orange-50/80 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200 border-orange-100 dark:border-orange-900/40'
                  : 'bg-red-50/80 dark:bg-red-950/40 text-red-800 dark:text-red-200 border-red-100 dark:border-red-900/40'
              }`}
            >
              <span>Total {breakdownType === 'income' ? 'Pemasukan' : 'Pengeluaran'}:</span>
              <span className="text-base font-bold tabular-nums">
                {breakdownType === 'income' ? '+' : '-'}{formatRupiah(breakdownType === 'income' ? filteredIncome : filteredExpense)}
              </span>
            </div>

            {/* Scrollable Transaction List */}
            <div className="overflow-y-auto flex-1 p-6 space-y-2">
              {breakdownList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <Tag className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                  <p>Tidak ada transaksi {breakdownType === 'income' ? 'pemasukan' : 'pengeluaran'} pada bulan ini.</p>
                </div>
              ) : (
                breakdownList.map(tx => {
                  const cat = categories.find(c => c.id === tx.categoryId);
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 transition text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                          style={{ backgroundColor: cat?.color || (breakdownType === 'income' ? '#10B981' : '#EF4444') }}
                        >
                          <CategoryIcon name={cat?.icon || 'DollarSign'} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white truncate">
                            {tx.categoryName}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {formatDateIndo(tx.date)}{' '}
                            {tx.accountName && <span>· {tx.accountName}</span>}
                            {tx.description && <span>· "{tx.description}"</span>}
                          </div>
                        </div>
                      </div>

                      <div
                        className={`text-sm font-bold tabular-nums shrink-0 ml-3 ${
                          breakdownType === 'income'
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {breakdownType === 'income' ? '+' : '-'}{formatRupiah(tx.amount)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 text-center">
              <button
                onClick={() => setBreakdownType(null)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Modal (Bottom Sheet) */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
      />

      {/* Pay Debt Modal (Bottom Sheet) */}
      <PayDebtModal
        isOpen={!!selectedDebtToPay}
        onClose={() => setSelectedDebtToPay(null)}
        debt={selectedDebtToPay}
      />

      {/* Bill Modal (Create / Edit Tagihan Rutin) */}
      <BillModal
        isOpen={isBillModalOpen}
        onClose={() => {
          setIsBillModalOpen(false);
          setBillToEdit(null);
        }}
        billToEdit={billToEdit}
      />

      {/* Bill Pay Modal */}
      <BillPayModal
        isOpen={!!billToPay}
        onClose={() => setBillToPay(null)}
        bill={billToPay}
      />
    </div>
  );
};
