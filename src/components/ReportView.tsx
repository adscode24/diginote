import React, { useState, useMemo } from 'react';
import {
  FileText,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  Download,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useFinance } from '../context/FinanceContext';
import { formatRupiah, formatMonthYearIndo, getTodayString } from '../utils/formatters';
import { exportToPDF, exportToXLSX } from '../utils/exportReport';
import { CategoryIcon } from './CategoryIcon';

export const ReportView: React.FC = () => {
  const { transactions, debts, categories } = useFinance();

  const today = getTodayString();
  const [selectedYear, setSelectedYear] = useState(() => Number(today.split('-')[0]));
  const [selectedMonth, setSelectedMonth] = useState(() => Number(today.split('-')[1]));
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Month-Year string format "YYYY-MM"
  const currentMonthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

  // Filter transactions for this month
  const monthlyTransactions = useMemo(() => {
    return transactions.filter(t => t.date && t.date.startsWith(currentMonthStr));
  }, [transactions, currentMonthStr]);

  // Financial Summary for this month
  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    const categoryExpenseMap: Record<string, { name: string; amount: number; color: string; icon: string }> = {};
    const categoryIncomeMap: Record<string, { name: string; amount: number; color: string; icon: string }> = {};

    monthlyTransactions.forEach(t => {
      const cat = categories.find(c => c.id === t.categoryId);
      const catName = t.categoryName || cat?.name || 'Lainnya';
      const catColor = cat?.color || '#64748B';
      const catIcon = cat?.icon || 'Tag';

      if (t.type === 'income') {
        income += t.amount;
        if (!categoryIncomeMap[catName]) {
          categoryIncomeMap[catName] = { name: catName, amount: 0, color: catColor, icon: catIcon };
        }
        categoryIncomeMap[catName].amount += t.amount;
      } else {
        expense += t.amount;
        if (!categoryExpenseMap[catName]) {
          categoryExpenseMap[catName] = { name: catName, amount: 0, color: catColor, icon: catIcon };
        }
        categoryExpenseMap[catName].amount += t.amount;
      }
    });

    const net = income - expense;
    const savingsRate = income > 0 ? Math.max(0, (net / income) * 100) : 0;
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const dailyAverageExpense = daysInMonth > 0 ? Math.round(expense / daysInMonth) : 0;

    const topExpenseCategories = Object.values(categoryExpenseMap)
      .sort((a, b) => b.amount - a.amount);

    const topIncomeCategories = Object.values(categoryIncomeMap)
      .sort((a, b) => b.amount - a.amount);

    // Weekly comparison
    const weeklyData = [
      { week: 'Minggu 1', range: '1-7', income: 0, expense: 0 },
      { week: 'Minggu 2', range: '8-14', income: 0, expense: 0 },
      { week: 'Minggu 3', range: '15-21', income: 0, expense: 0 },
      { week: 'Minggu 4', range: '22-28', income: 0, expense: 0 },
      { week: 'Minggu 5', range: '29-31', income: 0, expense: 0 },
    ];

    monthlyTransactions.forEach(t => {
      const day = parseInt(t.date.split('-')[2], 10);
      let targetIdx = 0;
      if (day <= 7) targetIdx = 0;
      else if (day <= 14) targetIdx = 1;
      else if (day <= 21) targetIdx = 2;
      else if (day <= 28) targetIdx = 3;
      else targetIdx = 4;

      if (t.type === 'income') weeklyData[targetIdx].income += t.amount;
      else weeklyData[targetIdx].expense += t.amount;
    });

    return {
      totalIncome: income,
      totalExpense: expense,
      netBalance: net,
      savingsRate,
      dailyAverageExpense,
      topExpenseCategories,
      topIncomeCategories,
      weeklyData,
    };
  }, [monthlyTransactions, categories, selectedYear, selectedMonth]);

  // Export handlers
  const handleExportPDF = () => {
    try {
      exportToPDF(selectedYear, selectedMonth, monthlyTransactions, debts, {
        totalIncome: summary.totalIncome,
        totalExpense: summary.totalExpense,
        netBalance: summary.netBalance,
        savingsRate: summary.savingsRate,
      });
      setExportSuccessMessage('Laporan PDF berhasil diunduh ke perangkat Anda!');
      setTimeout(() => setExportSuccessMessage(null), 4000);
    } catch (e) {
      alert('Gagal membuat file PDF. Silakan coba lagi.');
    }
  };

  const handleExportXLSX = () => {
    try {
      const monthYearTitle = formatMonthYearIndo(selectedYear, selectedMonth);
      exportToXLSX(monthYearTitle, monthlyTransactions, debts, {
        totalIncome: summary.totalIncome,
        totalExpense: summary.totalExpense,
        netBalance: summary.netBalance,
        savingsRate: summary.savingsRate,
      });
      setExportSuccessMessage('Laporan Excel (.xlsx) berhasil diunduh ke perangkat Anda!');
      setTimeout(() => setExportSuccessMessage(null), 4000);
    } catch (e) {
      alert('Gagal membuat file XLSX. Silakan coba lagi.');
    }
  };

  // Helper for SVG donut charts
  const donutExpenseSlices = useMemo(() => {
    if (summary.totalExpense === 0) return [];
    let cumulativeAngle = 0;
    return summary.topExpenseCategories.map(cat => {
      const percentage = (cat.amount / summary.totalExpense) * 100;
      const angle = (cat.amount / summary.totalExpense) * 360;
      const startAngle = cumulativeAngle;
      cumulativeAngle += angle;
      return {
        ...cat,
        percentage,
        startAngle,
        angle,
      };
    });
  }, [summary.topExpenseCategories, summary.totalExpense]);

  // Weekly bar chart max value for proportional heights
  const maxWeeklyAmount = useMemo(() => {
    let m = 1;
    summary.weeklyData.forEach(w => {
      if (w.income > m) m = w.income;
      if (w.expense > m) m = w.expense;
    });
    return m;
  }, [summary.weeklyData]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Export Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Laporan Keuangan Bulanan</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Analisis arus kas, visualisasi grafik pengeluaran, dan ekspor laporan resmi
          </p>
        </div>

        {/* Period Selector & Export CTAs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Month / Year Select */}
          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-transparent text-slate-900 dark:text-white focus:outline-hidden"
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
              className="px-2 py-1 text-xs font-semibold rounded-lg bg-transparent text-slate-900 dark:text-white focus:outline-hidden"
            >
              {[2024, 2025, 2026, 2027].map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Export PDF Button */}
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-xs transition"
            title="Download Laporan Format PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Ekspor PDF</span>
          </button>

          {/* Export XLSX Button */}
          <button
            onClick={handleExportXLSX}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
            title="Download Laporan Format Microsoft Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Ekspor XLSX</span>
          </button>
        </div>
      </div>

      {exportSuccessMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{exportSuccessMessage}</span>
        </div>
      )}

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Total Pemasukan
          </span>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            +{formatRupiah(summary.totalIncome)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {monthlyTransactions.filter(t => t.type === 'income').length} transaksi masuk
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Total Pengeluaran
          </span>
          <div className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-1">
            -{formatRupiah(summary.totalExpense)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Rata-rata: {formatRupiah(summary.dailyAverageExpense)}/hari
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Arus Kas Bersih (Surplus)
          </span>
          <div
            className={`text-lg sm:text-xl font-bold tabular-nums mt-1 ${
              summary.netBalance >= 0
                ? 'text-slate-900 dark:text-white'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {summary.netBalance >= 0 ? '+' : ''}{formatRupiah(summary.netBalance)}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {summary.netBalance >= 0 ? 'Kondisi surplus positif' : 'Pengeluaran melebihi pemasukan'}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Tingkat Tabungan (Savings Rate)
          </span>
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {summary.savingsRate.toFixed(1)}%
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {summary.savingsRate >= 20 ? 'Target sehat (>=20%) tercapai' : 'Dianjurkan hemat 20% penghasilan'}
          </span>
        </div>
      </div>

      {/* Visual Graphs Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graph 1: Weekly Comparison Bar Chart */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Perbandingan Pemasukan vs Pengeluaran per Pekan
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Visualisasi grafik batang mingguan {formatMonthYearIndo(selectedYear, selectedMonth)}
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                  <span className="text-slate-600 dark:text-slate-300">Masuk</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                  <span className="text-slate-600 dark:text-slate-300">Keluar</span>
                </div>
              </div>
            </div>

            {/* SVG / Styled Bar Graph */}
            <div className="mt-6 pt-2">
              <div className="grid grid-cols-5 gap-3 h-48 items-end px-2 border-b border-slate-200 dark:border-slate-700">
                {summary.weeklyData.map(w => {
                  const incomeHeight = maxWeeklyAmount > 0 ? (w.income / maxWeeklyAmount) * 100 : 0;
                  const expenseHeight = maxWeeklyAmount > 0 ? (w.expense / maxWeeklyAmount) * 100 : 0;

                  return (
                    <div key={w.week} className="flex flex-col items-center h-full justify-end group">
                      <div className="flex items-end gap-1.5 w-full justify-center h-full">
                        {/* Income Bar */}
                        <div
                          className="w-3.5 sm:w-5 bg-emerald-500 rounded-t-sm transition-all duration-300 group-hover:bg-emerald-600 relative"
                          style={{ height: `${Math.max(4, incomeHeight)}%` }}
                          title={`Pemasukan ${w.week}: ${formatRupiah(w.income)}`}
                        />
                        {/* Expense Bar */}
                        <div
                          className="w-3.5 sm:w-5 bg-red-500 rounded-t-sm transition-all duration-300 group-hover:bg-red-600 relative"
                          style={{ height: `${Math.max(4, expenseHeight)}%` }}
                          title={`Pengeluaran ${w.week}: ${formatRupiah(w.expense)}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* X-axis Labels */}
              <div className="grid grid-cols-5 gap-3 text-center mt-2">
                {summary.weeklyData.map(w => (
                  <div key={w.week} className="text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold block text-slate-700 dark:text-slate-300">{w.week}</span>
                    <span className="text-[10px] text-slate-400">Tgl {w.range}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            Arus kas mingguan memberikan gambaran stabilitas pengeluaran agar tidak habis di awal bulan.
          </div>
        </div>

        {/* Graph 2: Donut / Distribution by Category */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Distribusi Kategori Pengeluaran
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Proporsi pengeluaran berdasarkan pos belanja
                </p>
              </div>
              <PieChartIcon className="w-4 h-4 text-slate-400" />
            </div>

            {summary.topExpenseCategories.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Belum ada pengeluaran pada bulan ini.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {summary.topExpenseCategories.slice(0, 5).map(cat => {
                  const pct = summary.totalExpense > 0 ? (cat.amount / summary.totalExpense) * 100 : 0;
                  return (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {cat.name}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                          {formatRupiah(cat.amount)} ({pct.toFixed(1)}%)
                        </div>
                      </div>

                      {/* Visual progress bar */}
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: cat.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Healthy budgeting advice */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Rekomendasi 50/30/20: Kebutuhan 50%, Keinginan 30%, Tabungan 20%.</span>
          </div>
        </div>
      </div>

      {/* Income Streams Breakdown */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
          Sumber Aliran Pemasukan ({summary.topIncomeCategories.length} Kategori)
        </h3>

        {summary.topIncomeCategories.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Belum ada pemasukan tercatat bulan ini.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.topIncomeCategories.map(cat => {
              const pct = summary.totalIncome > 0 ? (cat.amount / summary.totalIncome) * 100 : 0;
              return (
                <div
                  key={cat.name}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: cat.color }}
                    >
                      <CategoryIcon name={cat.icon} className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {cat.name}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {pct.toFixed(1)}% dari total masuk
                      </div>
                    </div>
                  </div>

                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    +{formatRupiah(cat.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
