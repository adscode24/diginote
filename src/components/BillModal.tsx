import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Calendar, BellRing, Wallet } from 'lucide-react';
import { Bill } from '../types';
import { useFinance } from '../context/FinanceContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { formatRupiah } from '../utils/formatters';

interface BillModalProps {
  isOpen: boolean;
  onClose: () => void;
  billToEdit?: Bill | null;
}

export const BillModal: React.FC<BillModalProps> = ({ isOpen, onClose, billToEdit = null }) => {
  const { addBill, updateBill, categories, accounts } = useFinance();
  useBodyScrollLock(isOpen);

  const [name, setName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [dueDay, setDueDay] = useState(10);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const isEditing = !!billToEdit;

  useEffect(() => {
    if (billToEdit) {
      setName(billToEdit.name);
      setAmountStr(String(billToEdit.amount || ''));
      setDueDay(billToEdit.dueDayOfMonth || 10);
      setCategoryId(billToEdit.categoryId || '');
      setAccountId(billToEdit.accountId || '');
      setNotes(billToEdit.notes || '');
    } else {
      setName('');
      setAmountStr('');
      setDueDay(10);
      setCategoryId('');
      setAccountId('');
      setNotes('');
    }
    setError('');
  }, [isOpen, billToEdit]);

  // Default kategori "Tagihan & Utilitas" bila ada
  useEffect(() => {
    if (!categoryId) {
      const fallback = expenseCategories.find(c => c.id === 'cat_bills') || expenseCategories[0];
      if (fallback) setCategoryId(fallback.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama tagihan wajib diisi (mis. WiFi, Listrik)');
      return;
    }
    const amount = Number(amountStr) || 0;
    if (amount < 0) {
      setError('Nominal tagihan tidak valid');
      return;
    }
    if (!dueDay || dueDay < 1 || dueDay > 31) {
      setError('Tanggal jatuh tempo harus antara 1 s/d 31');
      return;
    }

    const category = categories.find(c => c.id === categoryId);
    const payload = {
      name: name.trim(),
      amount,
      dueDayOfMonth: dueDay,
      categoryId: category?.id,
      categoryName: category?.name,
      accountId: accountId || undefined,
      notes: notes.trim(),
      isActive: billToEdit?.isActive !== false,
    };

    if (isEditing && billToEdit) {
      updateBill(billToEdit.id, payload);
    } else {
      addBill(payload);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BellRing className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span>{isEditing ? 'Edit Tagihan Rutin' : 'Tambah Tagihan Rutin'}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Tagihan berulang tiap bulan dengan pengingat di Beranda
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Nama Tagihan *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Contoh: WiFi IndiHome, Listrik PLN, Air PDAM"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Nominal / Bulan (Rp) <span className="font-normal text-slate-400">(Opsional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  Rp
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amountStr ? new Intl.NumberFormat('id-ID').format(Number(amountStr)) : ''}
                  onChange={e => setAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  className="w-full pl-9 pr-3 py-2.5 text-sm font-bold tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Jatuh Tempo Tiap Tgl *
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={dueDay}
                  onChange={e => setDueDay(Number(e.target.value))}
                  className="w-full pl-9 pr-3 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <option key={day} value={day}>
                      Tanggal {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Kategori Pengeluaran
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
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                <span>Sumber Dana Default (Opsional)</span>
              </span>
            </label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            >
              <option value="">Pilih saat bayar</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatRupiah(a.balance)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Catatan (Opsional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Contoh: No. pelanggan, ID meter"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            />
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
              {isEditing ? 'Simpan Perubahan' : 'Simpan Tagihan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
