import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Calendar, Wallet, CheckCircle2, Tags } from 'lucide-react';
import { Bill } from '../types';
import { useFinance } from '../context/FinanceContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { formatRupiah, getTodayString } from '../utils/formatters';

interface BillPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: Bill | null;
}

export const BillPayModal: React.FC<BillPayModalProps> = ({ isOpen, onClose, bill }) => {
  const { payBill, accounts, categories } = useFinance();
  useBodyScrollLock(isOpen);

  const [amountStr, setAmountStr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayString());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const expenseCategories = categories.filter(c => c.type === 'expense');

  useEffect(() => {
    if (bill && isOpen) {
      setAmountStr(String(bill.amount || ''));
      setAccountId(bill.accountId || accounts[0]?.id || '');
      const defaultCat =
        (bill.categoryId && expenseCategories.some(c => c.id === bill.categoryId) && bill.categoryId) ||
        expenseCategories.find(c => c.id === 'cat_bills')?.id ||
        expenseCategories[0]?.id ||
        '';
      setCategoryId(defaultCat);
      setPaymentDate(getTodayString());
      setError('');
      setSuccess(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bill, isOpen]);

  if (!isOpen || !bill) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amountStr);
    if (!numericAmount || numericAmount <= 0) {
      setError('Nominal pembayaran harus lebih besar dari 0');
      return;
    }
    if (!categoryId) {
      setError('Pilih kategori pengeluaran untuk pembayaran ini');
      return;
    }
    try {
      const monthKey = (paymentDate || getTodayString()).substring(0, 7);
      payBill(bill.id, {
        monthKey,
        amount: numericAmount,
        accountId: accountId || undefined,
        categoryId,
        paymentDate: paymentDate || getTodayString(),
      });
      setSuccess(true);
      setTimeout(onClose, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memproses pembayaran');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Bayar Tagihan
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <strong>{bill.name}</strong> · Jatuh tempo tiap tanggal {bill.dueDayOfMonth}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Tagihan Berhasil Dibayar!
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Tercatat sebagai pengeluaran dan periode bulan ini ditandai lunas.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400">Nominal Tagihan:</span>
              <span className="font-bold text-slate-900 dark:text-white tabular-nums text-sm">
                {formatRupiah(bill.amount)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Nominal Dibayar (Rp) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  Rp
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  inputMode="numeric" pattern="[0-9]*"
                  value={amountStr ? new Intl.NumberFormat('id-ID').format(Number(amountStr)) : ''}
                  onChange={e => setAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  className="w-full pl-11 pr-4 py-2.5 text-base font-bold tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Tags className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                <span>Tercatat dengan Kategori Pengeluaran *</span>
              </label>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              >
                {expenseCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                <span>Sumber Dana</span>
              </label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Tanpa sumber dana (hanya catat)</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatRupiah(a.balance)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Tanggal Pembayaran *
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="py-2.5 px-5 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white shadow-xs transition"
              >
                Konfirmasi Pembayaran
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
