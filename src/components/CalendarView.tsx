import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar as CalendarIcon,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatRupiah, formatDateIndo, formatMonthYearIndo, getTodayString } from '../utils/formatters';
import { TransactionModal } from './TransactionModal';
import { CategoryIcon } from './CategoryIcon';

export const CalendarView: React.FC = () => {
  const { transactions, debts, categories } = useFinance();

  // Current viewed month and year
  const today = getTodayString();
  const [currentYear, setCurrentYear] = useState(() => Number(today.split('-')[0]));
  const [currentMonth, setCurrentMonth] = useState(() => Number(today.split('-')[1]));
  const [selectedDate, setSelectedDate] = useState<string>(today);

  // Modal
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);

  // Month navigation
  const prevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const jumpToToday = () => {
    const [y, m] = today.split('-').map(Number);
    setCurrentYear(y);
    setCurrentMonth(m);
    setSelectedDate(today);
  };

  // Calendar dates computation
  const { calendarDays, dailyStats, weeklyStats } = useMemo(() => {
    // First day of month and total days
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const totalDays = lastDay.getDate();

    // Day of week for first day (0 = Sunday, 1 = Monday). We use Monday start (Indonesian standard)
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday becomes 6

    const days: { dateStr: string; dayNumber: number; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateStr, dayNumber: d, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateStr, dayNumber: d, isCurrentMonth: true });
    }

    // Next month padding to fill grid to 35 or 42
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextY = currentMonth === 12 ? currentYear + 1 : currentYear;
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateStr, dayNumber: d, isCurrentMonth: false });
    }

    // Daily aggregations
    const daily: Record<string, { income: number; expense: number; txCount: number; debtsDue: typeof debts }> = {};

    transactions.forEach(t => {
      if (!daily[t.date]) {
        daily[t.date] = { income: 0, expense: 0, txCount: 0, debtsDue: [] };
      }
      if (t.type === 'income') daily[t.date].income += t.amount;
      else daily[t.date].expense += t.amount;
      daily[t.date].txCount += 1;
    });

    debts.forEach(d => {
      if (d.status !== 'paid' && d.dueDate) {
        if (!daily[d.dueDate]) {
          daily[d.dueDate] = { income: 0, expense: 0, txCount: 0, debtsDue: [] };
        }
        daily[d.dueDate].debtsDue.push(d);
      }
    });

    // Weekly stats
    const weeks = [
      { name: 'Minggu 1', range: '1 - 7', start: 1, end: 7, income: 0, expense: 0 },
      { name: 'Minggu 2', range: '8 - 14', start: 8, end: 14, income: 0, expense: 0 },
      { name: 'Minggu 3', range: '15 - 21', start: 15, end: 21, income: 0, expense: 0 },
      { name: 'Minggu 4', range: '22 - 28', start: 22, end: 28, income: 0, expense: 0 },
      { name: 'Minggu 5', range: `29 - ${totalDays}`, start: 29, end: totalDays, income: 0, expense: 0 },
    ];

    transactions.forEach(t => {
      const [y, m, d] = t.date.split('-').map(Number);
      if (y === currentYear && m === currentMonth) {
        weeks.forEach(w => {
          if (d >= w.start && d <= w.end) {
            if (t.type === 'income') w.income += t.amount;
            else w.expense += t.amount;
          }
        });
      }
    });

    return { calendarDays: days, dailyStats: daily, weeklyStats: weeks };
  }, [currentYear, currentMonth, transactions, debts]);

  // Selected date transactions & debts
  const selectedDayTransactions = useMemo(() => {
    return transactions.filter(t => t.date === selectedDate);
  }, [transactions, selectedDate]);

  const selectedDayDebtsDue = useMemo(() => {
    return debts.filter(d => d.dueDate === selectedDate && d.status !== 'paid');
  }, [debts, selectedDate]);

  const selectedDayTotals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    selectedDayTransactions.forEach(t => {
      if (t.type === 'income') inc += t.amount;
      else exp += t.amount;
    });
    return { inc, exp, net: inc - exp };
  }, [selectedDayTransactions]);

  const weekDayLabels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <span>Kalender Progres Keuangan</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pantau arus kas harian dan evaluasi progres keuangan setiap minggu secara visual
          </p>
        </div>

        {/* Month Navigation Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={jumpToToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Hari Ini
          </button>
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={prevMonth}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-900 dark:text-white min-w-[130px] text-center">
              {formatMonthYearIndo(currentYear, currentMonth)}
            </span>
            <button
              onClick={nextMonth}
              className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Bulan Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Weekly Progress Tracker Strip */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-900 dark:text-white">
            Evaluasi Progres Mingguan ({formatMonthYearIndo(currentYear, currentMonth)})
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Arus Kas Bersih (Pemasukan - Pengeluaran)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {weeklyStats.map(w => {
            const net = w.income - w.expense;
            const isPositive = net >= 0;
            return (
              <div
                key={w.name}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>{w.name}</span>
                    <span className="text-[10px] text-slate-400">Tgl {w.range}</span>
                  </div>
                  <div
                    className={`text-sm font-bold tabular-nums mt-1 ${
                      isPositive ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}{formatRupiah(net)}
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-200/40 dark:border-slate-700/40 text-[10px] space-y-0.5 text-slate-500 dark:text-slate-400 tabular-nums">
                  <div className="flex justify-between">
                    <span>Masuk:</span>
                    <span className="text-orange-600 font-medium">+{formatRupiah(w.income, false)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Keluar:</span>
                    <span className="text-red-600 font-medium">-{formatRupiah(w.expense, false)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Calendar on Left, Selected Day Details on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid (2 cols) */}
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
          {/* Day Names Header */}
          <div className="grid grid-cols-7 text-center pb-2 border-b border-slate-100 dark:border-slate-800">
            {weekDayLabels.map(day => (
              <div
                key={day}
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 py-1"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-2">
            {calendarDays.map((item, idx) => {
              const stat = dailyStats[item.dateStr];
              const isSelected = selectedDate === item.dateStr;
              const isCurrentDay = item.dateStr === today;
              const hasIncome = stat && stat.income > 0;
              const hasExpense = stat && stat.expense > 0;
              const hasDebtsDue = stat && stat.debtsDue && stat.debtsDue.length > 0;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedDate(item.dateStr)}
                  className={`min-h-[64px] sm:min-h-[82px] p-1.5 rounded-xl border text-left transition flex flex-col justify-between relative group ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/30 ring-2 ring-orange-500/20'
                      : item.isCurrentMonth
                      ? 'border-slate-200/70 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      : 'border-transparent text-slate-400/50 dark:text-slate-600 bg-slate-50/30 dark:bg-slate-950/20'
                  }`}
                >
                  {/* Day Number and Today Indicator */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold inline-flex items-center justify-center w-5 h-5 rounded-full ${
                        isCurrentDay
                          ? 'bg-orange-600 text-white font-bold'
                          : isSelected
                          ? 'text-orange-700 dark:text-orange-300 font-bold'
                          : item.isCurrentMonth
                          ? 'text-slate-700 dark:text-slate-300'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {item.dayNumber}
                    </span>

                    {/* Debt Due Flag Badge */}
                    {hasDebtsDue && (
                      <span
                        className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
                        title={`${stat.debtsDue.length} hutang jatuh tempo!`}
                      />
                    )}
                  </div>

                  {/* Income / Expense indicators */}
                  <div className="mt-1 space-y-0.5 overflow-hidden">
                    {hasIncome && (
                      <div className="text-[10px] font-medium text-orange-600 dark:text-orange-400 truncate tabular-nums">
                        +{stat.income >= 1000000 ? `${(stat.income / 1000000).toFixed(1)}jt` : `${Math.round(stat.income / 1000)}rb`}
                      </div>
                    )}
                    {hasExpense && (
                      <div className="text-[10px] font-medium text-red-600 dark:text-red-400 truncate tabular-nums">
                        -{stat.expense >= 1000000 ? `${(stat.expense / 1000000).toFixed(1)}jt` : `${Math.round(stat.expense / 1000)}rb`}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Calendar Legend */}
          <div className="flex flex-wrap items-center gap-4 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span>Pemasukan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span>Pengeluaran</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Jatuh Tempo Hutang</span>
            </div>
          </div>
        </div>

        {/* Selected Day Inspection Drawer (1 col) */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                  Detail Tanggal
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {formatDateIndo(selectedDate)}
                </h3>
              </div>
              <button
                onClick={() => setIsTxModalOpen(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Catat Transaksi</span>
              </button>
            </div>

            {/* Daily Totals */}
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
              <div>
                <span className="text-[11px] text-slate-400">Total Masuk</span>
                <div className="font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                  +{formatRupiah(selectedDayTotals.inc)}
                </div>
              </div>
              <div>
                <span className="text-[11px] text-slate-400">Total Keluar</span>
                <div className="font-bold text-red-600 dark:text-red-400 tabular-nums">
                  -{formatRupiah(selectedDayTotals.exp)}
                </div>
              </div>
            </div>

            {/* Debts due on this date alert */}
            {selectedDayDebtsDue.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 space-y-2">
                <div className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Jatuh Tempo Pada Tanggal Ini:</span>
                </div>
                {selectedDayDebtsDue.map(d => (
                  <div
                    key={d.id}
                    className="flex justify-between items-center text-xs text-amber-900 dark:text-amber-200"
                  >
                    <span>{d.counterparty} ({d.type === 'payable' ? 'Hutang' : 'Piutang'})</span>
                    <strong className="tabular-nums">{formatRupiah(d.remainingAmount)}</strong>
                  </div>
                ))}
              </div>
            )}

            {/* Transactions on this date list */}
            <div>
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Daftar Transaksi ({selectedDayTransactions.length})
              </div>

              {selectedDayTransactions.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center">
                  Belum ada catatan transaksi pada tanggal ini.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {selectedDayTransactions.map(tx => {
                    const cat = categories.find(c => c.id === tx.categoryId);
                    const isIncome = tx.type === 'income';
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 text-xs"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: cat?.color || (isIncome ? '#10B981' : '#EF4444') }}
                          >
                            <CategoryIcon name={cat?.icon || 'DollarSign'} className="w-3.5 h-3.5" />
                          </div>
                          <div className="truncate">
                            <div className="font-semibold text-slate-900 dark:text-white truncate">
                              {tx.categoryName}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {tx.description || tx.paymentMethod}
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
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setIsTxModalOpen(true)}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white transition flex items-center justify-center gap-2 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ Catat Pengeluaran / Pemasukan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Transaction Modal tied to selected date */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        initialDate={selectedDate}
      />
    </div>
  );
};
