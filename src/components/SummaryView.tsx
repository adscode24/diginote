import React, { useState } from 'react';
import { Calendar as CalendarIcon, BarChart3, LayoutGrid } from 'lucide-react';
import { CalendarView } from './CalendarView';
import { ReportView } from './ReportView';

/**
 * Halaman Summary: gabungan Kalender + Laporan dalam dua tab internal.
 */
export const SummaryView: React.FC = () => {
  const [innerTab, setInnerTab] = useState<'calendar' | 'reports'>('calendar');

  return (
    <div className="space-y-5">
      {/* Header Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span>Summary</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Kalender transaksi dan laporan keuangan dalam satu halaman
          </p>
        </div>

        {/* Tab Kalender / Laporan */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setInnerTab('calendar')}
            className={`py-2 px-4 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
              innerTab === 'calendar'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span>Kalender</span>
          </button>
          <button
            type="button"
            onClick={() => setInnerTab('reports')}
            className={`py-2 px-4 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
              innerTab === 'reports'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Laporan</span>
          </button>
        </div>
      </div>

      {innerTab === 'calendar' ? <CalendarView /> : <ReportView />}
    </div>
  );
};
