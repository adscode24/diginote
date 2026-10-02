import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  Edit2,
  Image as ImageIcon,
  Tag,
  ChevronDown,
  ChevronUp,
  Receipt,
  X,
  Calendar,
} from 'lucide-react';
import { Transaction, TransactionType } from '../types';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { formatRupiah, formatDateIndo, formatMonthYearIndo, splitTransactionsByAuthor } from '../utils/formatters';
import { CategoryIcon } from './CategoryIcon';
import { TransactionModal } from './TransactionModal';
import { CategoryManagerModal } from './CategoryManagerModal';
import { ReceiptViewerModal } from './ReceiptViewerModal';
import { useToast } from './Toast';

export const TransactionsView: React.FC = () => {
  const { transactions, categories, deleteTransaction, pairPartner, lastUpdatedByCode } = useFinance();
  const { pushToast } = useToast();
  const { currentUser } = useAuth();

  // Search & Type Toggle (No category, account, period, or date_desc filters as requested)
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');

  // Filter periode khusus kartu Keuangan Berdua (bulan + tahun)
  const nowRef = useMemo(() => new Date(), []);
  const [coYear, setCoYear] = useState(() => nowRef.getFullYear());
  const [coMonth, setCoMonth] = useState(() => nowRef.getMonth() + 1);
  const coMonthStr = `${coYear}-${String(coMonth).padStart(2, '0')}`;
  const coupleStats = useMemo(() => {
    if (!pairPartner) return null;
    const inPeriod = transactions.filter(t => t.date && t.date.startsWith(coMonthStr));
    const split = splitTransactionsByAuthor(inPeriod, currentUser?.id, pairPartner.uid);
    const sumType = (list: Transaction[], type: TransactionType) =>
      list.filter(t => t.type === type).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const me = {
      label: 'Saya',
      income: sumType(split.mine, 'income'),
      expense: sumType(split.mine, 'expense'),
    };
    const partner = {
      label: (pairPartner.name || pairPartner.email || 'Pasangan').split(' ')[0],
      income: sumType(split.partner, 'income'),
      expense: sumType(split.partner, 'expense'),
    };
    const legacy = {
      label: 'Tanpa penulis',
      income: sumType(split.unattributed, 'income'),
      expense: sumType(split.unattributed, 'expense'),
    };
    return { me, partner, legacy, hasLegacy: split.unattributed.length > 0 };
  }, [transactions, pairPartner, coMonthStr, currentUser?.id]);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [txToEdit, setTxToEdit] = useState<Transaction | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<{ url: string; title: string } | null>(null);

  // Group transactions by month ("YYYY-MM")
  const groupedByMonth = useMemo(() => {
    // 1. Filter by search and type
    const filtered = transactions.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchDesc = t.description && t.description.toLowerCase().includes(q);
        const matchCat = t.categoryName && t.categoryName.toLowerCase().includes(q);
        const matchAmount = String(t.amount).includes(q);
        const matchAccount = t.accountName && t.accountName.toLowerCase().includes(q);
        if (!matchDesc && !matchCat && !matchAmount && !matchAccount) return false;
      }
      return true;
    });

    // 2. Group into months
    const groups: Record<
      string,
      {
        monthKey: string;
        label: string;
        transactions: Transaction[];
        totalIncome: number;
        totalExpense: number;
        netBalance: number;
        incomeCount: number;
        expenseCount: number;
      }
    > = {};

    filtered.forEach(tx => {
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
          netBalance: 0,
          incomeCount: 0,
          expenseCount: 0,
        };
      }

      groups[monthKey].transactions.push(tx);
      if (tx.type === 'income') {
        groups[monthKey].totalIncome += tx.amount;
        groups[monthKey].incomeCount += 1;
      } else {
        groups[monthKey].totalExpense += tx.amount;
        groups[monthKey].expenseCount += 1;
      }
      groups[monthKey].netBalance = groups[monthKey].totalIncome - groups[monthKey].totalExpense;
    });

    // Sort transactions within each month by date descending
    Object.values(groups).forEach(g => {
      g.transactions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    });

    // Sort month groups descending (latest month first)
    const sortedKeys = Object.keys(groups).sort().reverse();
    return sortedKeys.map(k => groups[k]);
  }, [transactions, search, typeFilter]);

  // Current month in YYYY-MM format
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Accordion state: by default closed if already passed month, open for current/future month
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const isMonthExpanded = (monthKey: string) => {
    if (expandedMonths[monthKey] !== undefined) {
      return expandedMonths[monthKey];
    }
    // Default: tertutup jika sudah lewat bulan (< currentMonthKey)
    return monthKey >= currentMonthKey;
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => {
      const isPastMonth = monthKey < currentMonthKey;
      const currentVal = prev[monthKey] !== undefined ? prev[monthKey] : !isPastMonth;
      return {
        ...prev,
        [monthKey]: !currentVal,
      };
    });
  };

  const handleEdit = (tx: Transaction) => {
    setTxToEdit(tx);
    setIsTxModalOpen(true);
  };

  const handleDelete = (tx: Transaction) => {
    if (confirm('Apakah Anda yakin untuk menghapus data ini?')) {
      deleteTransaction(tx.id);
      pushToast('Data berhasil dihapus.');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <span>Riwayat Transaksi Harian</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Daftar transaksi tersusun per bulan dengan total pemasukan & pengeluaran
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsCatModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            <span>Kelola Kategori</span>
          </button>

          <button
            onClick={() => {
              setTxToEdit(null);
              setIsTxModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Catat Transaksi</span>
          </button>
        </div>
      </div>

      {/* Clean Search & Type Filter Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari transaksi, keterangan, atau nominal..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Type Segmented Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${
                typeFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setTypeFilter('expense')}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${
                typeFilter === 'expense'
                  ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
              }`}
            >
              Pengeluaran
            </button>
            <button
              onClick={() => setTypeFilter('income')}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${
                typeFilter === 'income'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
              }`}
            >
              Pemasukan
            </button>
          </div>
        </div>
      </div>

      {/* Kartu Keuangan Berdua: total pemasukan - pengeluaran per orang + filter periode */}
      {pairPartner && coupleStats && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">
              Keuangan Berdua
            </h3>
            <div className="flex items-center gap-2">
              {lastUpdatedByCode && (
                <span className="text-[10px] text-slate-400 mr-1">
                  Terbaru: <strong className="font-mono">{lastUpdatedByCode}</strong>
                </span>
              )}
              <select
                value={coMonth}
                onChange={e => setCoMonth(Number(e.target.value))}
                className="px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-hidden"
                title="Bulan periode"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>
                    {new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2026, m - 1, 1))}
                  </option>
                ))}
              </select>
              <select
                value={coYear}
                onChange={e => setCoYear(Number(e.target.value))}
                className="px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-hidden"
                title="Tahun periode"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[coupleStats.me, coupleStats.partner, ...(coupleStats.hasLegacy ? [coupleStats.legacy] : [])].map((p, idx) => {
              const initial = ((p.label || '?').trim()[0] || '?').toUpperCase();
              const net = p.income - p.expense;
              const key = idx === 0 ? 'me' : idx === 1 ? pairPartner.uid : 'legacy';
              const sub =
                idx === 2 ? 'Data lama tanpa penulis — catat baru selalu bernama.' : null;
              return (
                <div
                  key={key}
                  className={`p-3.5 rounded-xl border flex items-center gap-3 ${
                    idx === 2
                      ? 'bg-slate-100/70 dark:bg-slate-800/30 border-dashed border-slate-300 dark:border-slate-700'
                      : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/60 dark:border-slate-800'
                  }`}
                >
                  <span className={`w-10 h-10 rounded-full text-white text-base font-extrabold flex items-center justify-center shrink-0 ${
                    idx === 2
                      ? 'bg-slate-400 dark:bg-slate-600'
                      : 'bg-gradient-to-tr from-orange-600 to-amber-500'
                  }`}>
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {p.label}
                    </div>
                    <div className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                      Masuk <span className="font-bold text-orange-600 dark:text-orange-400">+{formatRupiah(p.income)}</span>
                      {' · '}Keluar <span className="font-bold text-red-600 dark:text-red-400">-{formatRupiah(p.expense)}</span>
                    </div>
                    <div className={`text-xs font-extrabold tabular-nums mt-0.5 ${net >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400'}`}>
                      Selisih {net >= 0 ? '+' : ''}{formatRupiah(net)}
                    </div>
                    {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Accordion List per Bulan */}
      <div className="space-y-4">
        {groupedByMonth.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <Tag className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Belum Ada Transaksi
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {search
                ? 'Tidak ada transaksi yang cocok dengan kata kunci pencarian.'
                : 'Mulai catat transaksi pengeluaran atau pemasukan harian Anda.'}
            </p>
          </div>
        ) : (
          groupedByMonth.map(group => {
            const isExpanded = isMonthExpanded(group.monthKey);

            return (
              <div
                key={group.monthKey}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden transition"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleMonth(group.monthKey)}
                  className="w-full p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition border-b border-transparent data-[expanded=true]:border-slate-100 dark:data-[expanded=true]:border-slate-800"
                  data-expanded={isExpanded}
                >
                  {/* Left: Month Name & Transaction Count */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {group.label}
                        </h3>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {group.transactions.length} Transaksi
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {group.incomeCount} masuk · {group.expenseCount} keluar — klik untuk{' '}
                        {isExpanded ? 'menutup' : 'melihat'} rincian bulan ini
                      </p>
                    </div>
                  </div>

                  {/* Right: Monthly Totals Summary & Toggle Icon */}
                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3 sm:gap-4 text-xs font-semibold tabular-nums">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-normal">Masuk</span>
                        <span className="text-orange-600 dark:text-orange-400 font-bold">
                          +{formatRupiah(group.totalIncome)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-normal">Keluar</span>
                        <span className="text-red-600 dark:text-red-400 font-bold">
                          -{formatRupiah(group.totalExpense)}
                        </span>
                      </div>
                      <div className="text-right pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-normal">Selisih</span>
                        <span
                          className={`font-bold ${
                            group.netBalance >= 0
                              ? 'text-slate-900 dark:text-white'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {formatRupiah(group.netBalance)}
                        </span>
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Accordion Body: Transaction List for this month */}
                {isExpanded && (
                  <div className="p-3 sm:p-5 pt-1 space-y-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/30">
                    {group.transactions.map(tx => {
                      const cat = categories.find(c => c.id === tx.categoryId);
                      const isIncome = tx.type === 'income';

                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition shadow-xs group"
                        >
                          {/* Left side: Category Icon & Details */}
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                              style={{ backgroundColor: cat?.color || (isIncome ? '#10B981' : '#EF4444') }}
                            >
                              <CategoryIcon
                                name={cat?.icon || (isIncome ? 'ArrowDownLeft' : 'ArrowUpRight')}
                                className="w-5 h-5"
                              />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                  {tx.categoryName}
                                </span>
                                {tx.debtPaymentId && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                                    Hutang
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                <span>{formatDateIndo(tx.date)}</span>
                                <span>·</span>
                                <span className="font-semibold text-orange-600 dark:text-orange-400">
                                  {tx.accountName || tx.paymentMethod}
                                </span>
                                {tx.authorName && (
                                  <>
                                    <span>·</span>
                                    <span className="font-medium text-slate-500 dark:text-slate-400">
                                      {tx.authorName.split(' ')[0]}
                                    </span>
                                  </>
                                )}
                                {tx.description && (
                                  <>
                                    <span>·</span>
                                    <span className="text-slate-700 dark:text-slate-300 truncate max-w-[140px] sm:max-w-md">
                                      "{tx.description}"
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right side: Amount, Receipt & Actions */}
                          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
                            {/* Receipt Proof Thumbnail Button */}
                            {tx.receiptUrl && (
                              <button
                                onClick={() =>
                                  setSelectedReceipt({
                                    url: tx.receiptUrl!,
                                    title: `Bukti: ${tx.categoryName} (${formatDateIndo(tx.date)})`,
                                  })
                                }
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
                                title="Lihat Bukti Transfer"
                              >
                                <ImageIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                              </button>
                            )}

                            <div className="text-right">
                              <div
                                className={`text-xs sm:text-sm font-bold tabular-nums ${
                                  isIncome
                                    ? 'text-orange-600 dark:text-orange-400'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {isIncome ? '+' : '-'}{formatRupiah(tx.amount)}
                              </div>
                            </div>

                            {/* Edit & Delete Actions */}
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => handleEdit(tx)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                title="Edit Transaksi"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(tx)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                                title="Hapus Transaksi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* Keterangan total: ringkasan rincian bulan ini agar mudah dicocokkan dengan total header */}
                    <div className="px-3 sm:px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        Total {group.label}: {group.transactions.length} transaksi
                      </span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-orange-600 dark:text-orange-400">
                          {group.incomeCount} masuk · +{formatRupiah(group.totalIncome)}
                        </span>
                        <span className="mx-1.5 text-slate-300 dark:text-slate-600">|</span>
                        <span className="font-bold text-red-600 dark:text-red-400">
                          {group.expenseCount} keluar · -{formatRupiah(group.totalExpense)}
                        </span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Transaction Modal (Responsive Bottom Sheet) */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setTxToEdit(null);
        }}
        transactionToEdit={txToEdit}
      />

      {/* Category Manager Modal (Responsive Bottom Sheet) */}
      <CategoryManagerModal
        isOpen={isCatModalOpen}
        onClose={() => setIsCatModalOpen(false)}
      />

      {/* Receipt Viewer (Responsive Bottom Sheet) */}
      <ReceiptViewerModal
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        imageUrl={selectedReceipt?.url}
        title={selectedReceipt?.title}
      />
    </div>
  );
};
