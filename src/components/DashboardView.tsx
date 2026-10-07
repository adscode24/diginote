import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Receipt,
  BellRing,
  X,
  Tag,
  Cloud,
  Eye,
  EyeOff,
  Plus,
  Wallet,
  CreditCard,
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
  getDebtCycleStatus,
} from '../utils/formatters';
import { CategoryIcon } from './CategoryIcon';
import { TransactionModal } from './TransactionModal';
import { PayDebtModal } from './PayDebtModal';
import { BillPayModal } from './BillPayModal';
import { useBillCards } from '../hooks/useBillCards';
import { useAmountPrivacy } from '../hooks/useAmountPrivacy';
import { Debt, ActiveTab, Transaction, TransactionType, Bill } from '../types';

interface DashboardViewProps {
  onNavigateTab: (tab: ActiveTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigateTab }) => {
  const { summary, transactions, debts, accounts, categories, reminderSettings, syncNotice, clearSyncNotice, syncStatus, pullFromVaultNow } = useFinance();
  const { currentUser } = useAuth();

  const [selectedDebtToPay, setSelectedDebtToPay] = useState<Debt | null>(null);
  const [billToPay, setBillToPay] = useState<Bill | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [txModal, setTxModal] = useState<{ open: boolean; type: 'income' | 'expense' }>({
    open: false,
    type: 'expense',
  });

  // Month filter state
  const today = getTodayString();
  const [selectedYear, setSelectedYear] = useState(() => Number(today.split('-')[0]));
  const [selectedMonth, setSelectedMonth] = useState(() => Number(today.split('-')[1]));

  // Bottom Sheet for Pemasukan / Pengeluaran breakdown
  const [breakdownType, setBreakdownType] = useState<TransactionType | null>(null);

  // Bottom Sheet ringkas: Tagihan Rutin & Jatuh Tempo (kartu hanya tampilkan total)
  const [showBillsSheet, setShowBillsSheet] = useState(false);
  const [showDebtsSheet, setShowDebtsSheet] = useState(false);

  // Kunci scroll halaman belakang saat bottom sheet / modal terbuka
  useBodyScrollLock(
    breakdownType !== null || showBillsSheet || showDebtsSheet || selectedDebtToPay !== null || billToPay !== null || txModal.open
  );

  const selectedMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  // Periode 0 = Semua Bulan (akumulasi seluruh data, seperti inspirasi desain)
  const isAllMonths = selectedMonth === 0;
  const selectedMonthLabel = isAllMonths ? 'Semua Bulan' : formatMonthYearIndo(selectedYear, selectedMonth);

  // Check if today has transactions
  const hasLoggedToday = transactions.some(t => t.date === today);

  // Filtered transactions for selected month (atau seluruh data bila Semua Bulan)
  const monthlyTransactions = useMemo(() => {
    if (isAllMonths) return [...transactions];
    return transactions.filter(t => t.date && t.date.startsWith(selectedMonthStr));
  }, [transactions, selectedMonthStr, isAllMonths]);

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

  // Hutang berjalan yang belum tertutup siklus (untuk kartu total + sheet rincian).
  // Diurut jatuh tempo terdekat dulu; tanpa batas 3 (kartu hanya tampilkan total).
  const dueDebts = useMemo(() => {
    return debts
      .filter(d => d.status !== 'paid' && d.type === 'payable' && !getDebtCycleStatus(d).covered)
      .map(d => {
        const effectiveDueDate = d.dueDayOfMonth ? getNextDueDate(d.dueDayOfMonth) : d.dueDate;
        const status = calculateDueDateStatus(effectiveDueDate);
        return {
          ...d,
          effectiveDueDate,
          statusInfo: status,
        };
      })
      .sort((a, b) => a.statusInfo.daysRemaining - b.statusInfo.daysRemaining);
  }, [debts]);
  const dueDebtsRemaining = useMemo(
    () => dueDebts.reduce((s, d) => s + (Number(d.remainingAmount) || 0), 0),
    [dueDebts]
  );

  // Total sumber dana tersedia (semua kecuali kartu kredit) + total dana di kartu kredit
  const fundAvailable = useMemo(() => {
    const list = accounts.filter(a => a.type !== 'credit_card');
    return {
      total: list.reduce((s, a) => s + (Number(a.balance) || 0), 0),
      count: list.length,
    };
  }, [accounts]);
  const fundCredit = useMemo(() => {
    const list = accounts.filter(a => a.type === 'credit_card');
    return {
      total: list.reduce((s, a) => s + (Number(a.balance) || 0), 0),
      count: list.length,
    };
  }, [accounts]);

  // 3 transaksi terakhir berdasar tanggal transaksi (lalu waktu catat)
  const latestThree = useMemo(() => {
    return [...transactions]
      .sort((a, b) => {
        const dateDiff = b.date.localeCompare(a.date);
        if (dateDiff !== 0) return dateDiff;
        return (b.createdAt || 0) - (a.createdAt || 0);
      })
      .slice(0, 3);
  }, [transactions]);

  // Privasi angka: 1 eye-toggle untuk seluruh kartu KPI + eye per kartu carousel
  // (default tertutup; carousel otomatis menutup lagi saat digeser).
  const { isHidden, toggleHidden: toggleHide, hideIds, masked } = useAmountPrivacy();

  const EyeToggle: React.FC<{ id: string; dark?: boolean }> = ({ id, dark }) => (
    <button
      onClick={e => {
        e.stopPropagation();
        toggleHide(id);
      }}
      className={`p-1.5 rounded-lg transition ${
        dark
          ? 'text-white/80 hover:text-white hover:bg-white/10'
          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
      title={isHidden(id) ? 'Tampilkan angka' : 'Sembunyikan angka'}
    >
      {isHidden(id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  // Carousel kartu dana: coverflow lingkaran (satu fokus, swipe memutar)
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const goCard = (idx: number) => {
    if (accounts.length === 0) return;
    // Geser carousel = angka kartu yang sempat dibuka otomatis tertutup lagi
    hideIds(accounts.map(a => `acc:${a.id}`));
    setActiveCardIdx(((idx % accounts.length) + accounts.length) % accounts.length);
  };
  const dragRef = React.useRef<{ startX: number; dragging: boolean }>({ startX: 0, dragging: false });
  const handleDragStart = (clientX: number) => {
    dragRef.current = { startX: clientX, dragging: true };
  };
  const handleDragEnd = (clientX: number) => {
    if (!dragRef.current.dragging) return;
    const dx = clientX - dragRef.current.startX;
    dragRef.current.dragging = false;
    if (dx <= -50) goCard(activeCardIdx + 1);
    else if (dx >= 50) goCard(activeCardIdx - 1);
  };
  // Jaga index valid bila daftar akun berubah
  useEffect(() => {
    setActiveCardIdx(prev => (accounts.length === 0 ? 0 : prev % accounts.length));
  }, [accounts.length]);

  const maskAccountNumber = (num?: string) => {
    if (!num) return '•••• ••••';
    const clean = num.replace(/\s/g, '');
    if (clean.length <= 4) return '•••• ' + clean;
    return clean.slice(0, 2) + '•• •••• ' + clean.slice(-2);
  };
  const hourNow = new Date().getHours();
  const greeting =
    hourNow < 11 ? 'Selamat pagi' : hourNow < 15 ? 'Selamat siang' : hourNow < 19 ? 'Selamat sore' : 'Selamat malam';

  // Tagihan rutin bulan berjalan (read-only di Beranda; kelola di tab Hutang)
  const billCards = useBillCards();

  // Total tagihan rutin tercatat (aktif) + akumulasi nominal per bulan
  const billsActiveTotal = useMemo(
    () => billCards.reduce((s, b) => s + (Number(b.amount) || 0), 0),
    [billCards]
  );

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

      {/* Hero sapaan */}
      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-sand dark:border-slate-800 shadow-xs">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">
          {formatDateIndo(today)}
        </div>
        <h4 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
          {greeting}, {currentUser?.name?.split(' ')[0] || 'Pengguna'}!
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {!hasLoggedToday && reminderSettings.enabled
            ? 'Belum ada catatan hari ini, yuk catat.'
            : 'Arus kas tercatat rapi hari ini.'}
        </p>
      </div>

      {/* Kartu Dana ala Mobile Banking (carousel geser + eye per kartu) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
            Sumber Dana Kamu
          </h3>
          <button
            onClick={() => onNavigateTab('accounts')}
            className="text-xs font-bold text-orange-600 dark:text-orange-400 underline underline-offset-2 hover:text-orange-700"
          >
            Lihat Semua
          </button>
        </div>

        {accounts.length === 0 ? (
          <button
            onClick={() => onNavigateTab('accounts')}
            className="w-full p-6 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 hover:border-orange-500 hover:text-orange-600 transition"
          >
            Belum ada sumber dana. Klik untuk buat kartu dana pertama Anda.
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => goCard(activeCardIdx - 1)}
                className="hidden sm:flex p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-orange-600 hover:border-orange-500 transition shrink-0 items-center justify-center"
                title="Kartu sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Panggung coverflow lingkaran: satu kartu fokus, swipe memutar */}
              <div
                className="relative flex-1 h-[196px] overflow-hidden"
                style={{ perspective: '900px' }}
                onTouchStart={e => handleDragStart(e.touches[0].clientX)}
                onTouchEnd={e => handleDragEnd(e.changedTouches[0].clientX)}
                onMouseDown={e => handleDragStart(e.clientX)}
                onMouseUp={e => handleDragEnd(e.clientX)}
                onMouseLeave={() => {
                  dragRef.current.dragging = false;
                }}
              >
                {accounts.map((acc, i) => {
                  const hideId = `acc:${acc.id}`;
                  // Jarak sirkular terpendek: geser kiri/kanan memutar lingkaran
                  const n = accounts.length;
                  let offset = (i - activeCardIdx) % n;
                  if (offset > n / 2) offset -= n;
                  if (offset < -n / 2) offset += n;
                  const abs = Math.abs(offset);
                  const visible = abs <= 2;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => {
                        try {
                          sessionStorage.setItem('diginote_focus_account', acc.id);
                          sessionStorage.setItem('diginote_focus_back', 'dashboard');
                        } catch {
                          /* abaikan */
                        }
                        onNavigateTab('accounts');
                      }}
                      className="absolute top-1 left-1/2 w-[78%] max-w-[320px] h-[188px] cursor-pointer"
                      style={{
                        transform: `translateX(-50%) translateX(${offset * 62}%) translateZ(${-abs * 120}px) rotateY(${offset * -32}deg) scale(${1 - abs * 0.1})`,
                        opacity: visible ? 1 - abs * 0.35 : 0,
                        zIndex: 10 - abs,
                        pointerEvents: visible ? 'auto' : 'none',
                        transition: 'transform 0.45s cubic-bezier(0.22, 0.9, 0.3, 1.2), opacity 0.35s',
                        transformStyle: 'preserve-3d',
                      }}
                    >
                      <div
                        className="relative overflow-hidden rounded-2xl w-full h-full shadow-lg"
                        style={{
                          background: `linear-gradient(120deg, ${acc.color} 0%, ${acc.color} 55%, rgba(0,0,0,0.38) 135%)`,
                        }}
                      >
                        {/* Lengkungan dekoratif */}
                        <div className="absolute -right-10 -top-16 w-44 h-44 rounded-full bg-white/10 pointer-events-none" />
                        <div className="absolute -right-4 top-6 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
                        <div className="absolute -left-8 -bottom-14 w-36 h-36 rounded-full bg-black/10 pointer-events-none" />

                        <div className="relative p-4 flex flex-col justify-between h-full">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80 truncate">
                                {acc.name}
                              </div>
                              <div className="text-lg font-extrabold tabular-nums text-white tracking-wide mt-0.5">
                                {maskAccountNumber(acc.accountNumber)}
                              </div>
                            </div>
                            {(acc.isDefault || accounts[0]?.id === acc.id) && (
                              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white text-slate-900 shrink-0">
                                Utama
                              </span>
                            )}
                          </div>

                          <div>
                            <div className="text-[11px] text-white/80">Saldo efektif</div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xl font-extrabold tabular-nums text-white">
                                {masked(hideId, acc.balance)}
                              </span>
                              <EyeToggle id={hideId} dark />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => goCard(activeCardIdx + 1)}
                className="hidden sm:flex p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-orange-600 hover:border-orange-500 transition shrink-0 items-center justify-center"
                title="Kartu berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {accounts.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-0.5">
                {accounts.map((acc, i) => (
                  <button
                    key={acc.id}
                    onClick={() => goCard(i)}
                    aria-label={`Ke kartu ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${
                      i === activeCardIdx ? 'w-4 bg-slate-900 dark:bg-white' : 'w-1.5 bg-slate-300 dark:bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Filter periode: di bawah carousel, menempel kartu ringkasan (ala inspirasi) */}
      <div className="flex items-center justify-end gap-2 px-1 -mb-4">
        <span className="text-xs font-semibold text-slate-400">Periode:</span>
        <div className="flex items-center gap-1 p-1 pl-2.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xs">
          <Calendar className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(Number(e.target.value))}
            className="px-1.5 py-1 text-xs font-bold bg-transparent text-slate-800 dark:text-slate-200 focus:outline-hidden"
            title="Bulan periode"
          >
            <option value={0}>Semua Bulan (Total)</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
              <option key={m} value={m}>
                {new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, m - 1, 1))}
              </option>
            ))}
          </select>
          {!isAllMonths && (
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="px-1.5 py-1 text-xs font-bold bg-transparent border-l border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden"
              title="Tahun periode"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Ringkasan: hero gelap + grid 2x2 (ala inspirasi) */}
      <div className="rounded-3xl bg-[#161C30] border border-white/5 shadow-lg p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-orange-500/20 text-orange-300 flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-extrabold tracking-tight text-white leading-tight">
              {isAllMonths ? 'Ringkasan Keseluruhan' : 'Ringkasan Bulan Ini'}
            </h3>
            <p className="text-[11px] text-white/50">
              {isAllMonths ? 'Total akumulasi seluruh periode' : `Total akumulasi ${selectedMonthLabel}`}
            </p>
          </div>
          <EyeToggle id="kpi-all" dark />
        </div>

        {/* Hero: total sumber dana tersedia (di luar kartu kredit) */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/60">Total Sumber Dana Tersedia</div>
            <div className="text-2xl sm:text-[28px] font-extrabold tabular-nums text-white mt-1 break-words">
              {masked('kpi-all', fundAvailable.total)}
            </div>
            <div className="text-[11px] text-white/40 mt-1">
              Selain kartu kredit · {fundAvailable.count} sumber dana
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-extrabold tabular-nums text-white">
              {monthlyTransactions.length} <span className="font-semibold text-white/60">total transaksi</span>
            </div>
            <div className="text-[11px] text-white/40 mt-1">{selectedMonthLabel}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
        {/* Monthly Income Card (Clickable to view details) */}
        <div
          onClick={() => setBreakdownType('income')}
          className="rounded-2xl border border-orange-400/20 bg-orange-500/10 p-3.5 cursor-pointer hover:bg-orange-500/15 transition"
          title="Klik untuk melihat rincian pemasukan"
        >
          <div className="flex items-center gap-1.5 text-orange-300">
            <ArrowDownLeft className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold truncate">Total Pemasukan</span>
          </div>
          <div className="text-lg font-extrabold tabular-nums text-white mt-2 break-words">
            +{masked('kpi-all', filteredIncome)}
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            {monthlyTransactions.filter(t => t.type === 'income').length}x pemasukan
          </div>
        </div>

        {/* Monthly Expense Card (Clickable to view details) */}
        <div
          onClick={() => setBreakdownType('expense')}
          className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3.5 cursor-pointer hover:bg-red-500/15 transition"
          title="Klik untuk melihat rincian pengeluaran"
        >
          <div className="flex items-center gap-1.5 text-red-300">
            <ArrowUpRight className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold truncate">Total Pengeluaran</span>
          </div>
          <div className="text-lg font-extrabold tabular-nums text-white mt-2 break-words">
            -{masked('kpi-all', filteredExpense)}
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            {monthlyTransactions.filter(t => t.type === 'expense').length}x pengeluaran
          </div>
        </div>

        <div
          onClick={() => onNavigateTab('debts')}
          className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3.5 cursor-pointer hover:bg-amber-500/15 transition"
          title="Lihat hutang di halaman Hutang"
        >
          <div className="flex items-center gap-1.5 text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold truncate">Sisa Hutang Berjalan</span>
          </div>
          <div className="text-lg font-extrabold tabular-nums text-white mt-2 break-words">
            {masked('kpi-all', summary.totalPayableDebt)}
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            {dueDebts.length} hutang berjalan
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            Piutang: {masked('kpi-all', summary.totalReceivableDebt)}
          </div>
        </div>

        {/* Mini: Dana di Kartu Kredit */}
        <div
          onClick={() => onNavigateTab('accounts')}
          className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3.5 cursor-pointer hover:bg-sky-500/15 transition"
          title="Lihat kartu kredit di halaman Dana"
        >
          <div className="flex items-center gap-1.5 text-sky-300">
            <CreditCard className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold truncate">Dana Kartu Kredit</span>
          </div>
          <div className="text-lg font-extrabold tabular-nums text-white mt-2 break-words">
            {masked('kpi-all', fundCredit.total)}
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            {fundCredit.count}x kartu kredit
          </div>
        </div>
        </div>
      </div>

      {/* Kartu Total: Tagihan Rutin & Jatuh Tempo (total saja, klik = bottom sheet rincian) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => setShowBillsSheet(true)}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-3 text-left hover:border-orange-500 transition group"
        >
          <div className="w-11 h-11 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Tagihan Rutin Tercatat
            </div>
            <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-0.5">
              {billCards.length} <span className="text-xs font-bold text-slate-400">tagihan</span>
            </div>
            <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              {masked('kpi-all', billsActiveTotal)} / bulan · klik untuk rincian
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 group-hover:text-orange-500 transition shrink-0" />
        </button>

        <button
          onClick={() => setShowDebtsSheet(true)}
          className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-3 text-left hover:border-amber-500 transition group"
        >
          <div className="w-11 h-11 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Jatuh Tempo Terdekat
            </div>
            <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-0.5">
              {dueDebts.length} <span className="text-xs font-bold text-slate-400">jatuh tempo</span>
            </div>
            <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
              Sisa {masked('kpi-all', dueDebtsRemaining)} · klik untuk rincian
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 group-hover:text-amber-500 transition shrink-0" />
        </button>
      </div>

      {/* Bottom Sheet: Rincian Tagihan Rutin (logika + tombol Bayar sama) */}
      {showBillsSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowBillsSheet(false)}
        >
          <div
            className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-600 text-white flex items-center justify-center shrink-0">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Rincian Tagihan Rutin
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {billCards.length} tagihan · {formatRupiah(billsActiveTotal)} / bulan
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBillsSheet(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-2">
        {billCards.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            Belum ada tagihan rutin. Tambahkan di halaman Hutang tab Tagihan Rutin.
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
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    <strong className="tabular-nums">{formatRupiah(bill.amount)}</strong>
                    <span className="text-[11px] text-slate-400"> · Tgl {bill.dueDayOfMonth} tiap bulan</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Jatuh tempo: {formatDateIndo(bill.dueDateStr)}
                    {bill.categoryName && ` · ${bill.categoryName}`}
                  </div>
                  <div className="text-[11px] mt-0.5 font-medium text-slate-500 dark:text-slate-400">
                    {bill.lastPayment
                      ? `Terakhir dibayar: ${formatDateIndo(bill.lastPayment.paymentDate)} (${formatRupiah(bill.lastPayment.amount)})`
                      : 'Belum pernah dibayar'}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowBillsSheet(false);
                    setBillToPay(bill);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition shadow-xs shrink-0"
                >
                  Bayar
                </button>
              </div>
            ))}
          </div>
        )}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 text-center">
              <button
                onClick={() => setShowBillsSheet(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bottom Sheet: Rincian Jatuh Tempo (logika + tombol Bayar sama) */}
      {showDebtsSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowDebtsSheet(false)}
        >
          <div
            className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Rincian Jatuh Tempo
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {dueDebts.length} hutang · Sisa {formatRupiah(dueDebtsRemaining)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowDebtsSheet(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-3">
              {dueDebts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  <CheckCircle2 className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                  <p>Tidak ada hutang yang mendekati tanggal jatuh tempo.</p>
                </div>
              ) : (
                dueDebts.map(debt => {
                  const status = debt.statusInfo || calculateDueDateStatus(debt.effectiveDueDate || debt.dueDate);
                  const isInstallment = debt.installmentCategory && debt.installmentCategory !== 'non_installment';
                  const lastPay = [...(debt.payments || [])].sort((a, b) =>
                    a.paymentDate < b.paymentDate ? 1 : -1
                  )[0];
                  const showPay = status.daysRemaining <= 7;
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
                            <div className="text-[11px] mt-0.5 font-medium text-slate-500 dark:text-slate-400">
                              {lastPay
                                ? `Terakhir dibayar: ${formatDateIndo(lastPay.paymentDate)} (${formatRupiah(lastPay.amount)})`
                                : 'Belum pernah dibayar'}
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
                            <div className="text-[11px] mt-0.5 font-medium">
                              {lastPay
                                ? `Terakhir dibayar: ${formatDateIndo(lastPay.paymentDate)} (${formatRupiah(lastPay.amount)})`
                                : 'Belum pernah dibayar'}
                            </div>
                          </div>
                        )}
                      </div>

                      {showPay && (
                        <button
                          onClick={() => {
                            setShowDebtsSheet(false);
                            setSelectedDebtToPay(debt);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition shadow-xs shrink-0"
                        >
                          Bayar
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 text-center">
              <button
                onClick={() => setShowDebtsSheet(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaksi Terakhir */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Transaksi Terakhir
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

            <div className="mt-4 space-y-2">
              {latestThree.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Belum ada transaksi yang dicatat.
                </div>
              ) : (
                latestThree.map(tx => {
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
                            {tx.authorName && ` · ${tx.authorName.split(' ')[0]}`}
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
              Lihat Data Transaksi Selengkapnya
            </button>
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

      {/* Pay Debt Modal (Bottom Sheet) */}
      <PayDebtModal
        isOpen={!!selectedDebtToPay}
        onClose={() => setSelectedDebtToPay(null)}
        debt={selectedDebtToPay}
      />

      {/* Bill Pay Modal */}
      <BillPayModal
        isOpen={!!billToPay}
        onClose={() => setBillToPay(null)}
        bill={billToPay}
      />

      {/* Floating Action Button (kanan halaman) + pilihan wraparound */}
      <div className="fixed right-4 bottom-[120px] z-40 flex flex-col items-center gap-2">
        <button
          onClick={() => {
            setFabOpen(false);
            setTxModal({ open: true, type: 'income' });
          }}
          aria-label="Catat pemasukan"
          className={`flex flex-col items-center gap-1 transition-all duration-300 ${
            fabOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-4 pointer-events-none'
          }`}
        >
          <span className="w-12 h-12 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center shadow-lg">
            <ArrowDownLeft className="w-5 h-5" />
          </span>
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur shadow">
            Masuk
          </span>
        </button>
        <button
          onClick={() => {
            setFabOpen(false);
            setTxModal({ open: true, type: 'expense' });
          }}
          aria-label="Catat pengeluaran"
          className={`flex flex-col items-center gap-1 transition-all duration-300 ${
            fabOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-50 translate-y-4 pointer-events-none'
          }`}
          style={{ transitionDelay: fabOpen ? '70ms' : '0ms' }}
        >
          <span className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg">
            <ArrowUpRight className="w-5 h-5" />
          </span>
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur shadow">
            Keluar
          </span>
        </button>
        <button
          onClick={() => setFabOpen(v => !v)}
          aria-label={fabOpen ? 'Tutup' : 'Catat transaksi'}
          className="w-14 h-14 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white flex items-center justify-center shadow-xl transition-all active:scale-95"
        >
          {fabOpen ? <X className="w-6 h-6" /> : <Plus className="w-7 h-7 stroke-[2.5]" />}
        </button>
      </div>

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={txModal.open}
        onClose={() => setTxModal(prev => ({ ...prev, open: false }))}
        initialType={txModal.type}
      />
    </div>
  );
};
