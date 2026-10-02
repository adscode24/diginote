import React, { useState, useEffect } from 'react';
import { X, Calendar, Settings2, Upload, Trash2, Wallet, Plus, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Transaction, TransactionType, PaymentMethod } from '../types';
import { SharedTransactionPrefill } from '../services/shareIntent';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHODS } from '../utils/constants';
import { getTodayString, formatRupiah } from '../utils/formatters';
import { CategoryIcon } from './CategoryIcon';
import { CategoryManagerModal } from './CategoryManagerModal';
import { AccountModal } from './AccountModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useToast } from './Toast';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: TransactionType;
  initialDate?: string;
  transactionToEdit?: Transaction | null;
  prefill?: SharedTransactionPrefill | null;
  prefillKey?: number;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  initialType = 'expense',
  initialDate,
  transactionToEdit,
  prefill = null,
  prefillKey = 0,
}) => {
  const { categories, accounts, addTransaction, updateTransaction, pairPartner } = useFinance();
  const { currentUser } = useAuth();
  const { pushToast } = useToast();

  const [type, setType] = useState<TransactionType>(initialType);
  const [authorUid, setAuthorUid] = useState<string | undefined>(undefined);
  const [authorName, setAuthorName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(initialDate || getTodayString());
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transfer');
  const [receiptImage, setReceiptImage] = useState<string | undefined>(undefined);
  // Saldo sumber dana disembunyikan default (privasi saat input manual maupun dari share)
  const [showBalances, setShowBalances] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(isOpen || isCategoryModalOpen || isAccountModalOpen);

  // Pilihan penulis dari data Keuangan Berdua (terbaca jelas oleh database):
  // Saya (akun login) + pasangan bila tertaut. Nilai tersimpan authorUid+authorName.
  const authorOptions = [
    {
      uid: currentUser?.id || '',
      name: currentUser?.name || 'Saya',
      label: `Saya (${currentUser?.name || 'akun ini'})`,
    },
    ...(pairPartner
      ? [
          {
            uid: pairPartner.uid,
            name: pairPartner.name || pairPartner.email || 'Pasangan',
            label: pairPartner.name || pairPartner.email || 'Pasangan',
          },
        ]
      : []),
  ];

  // Synchronize when opening for edit or new
  useEffect(() => {
    // Setiap kali form dibuka (manual maupun dari share), saldo kembali disembunyikan
    setShowBalances(false);
    if (transactionToEdit) {
      setAuthorUid(transactionToEdit.authorUid || currentUser?.id);
      setAuthorName(transactionToEdit.authorName || currentUser?.name || '');
      setType(transactionToEdit.type);
      setAmountStr(String(transactionToEdit.amount));
      setCategoryId(transactionToEdit.categoryId);
      setAccountId(transactionToEdit.accountId || (accounts[0]?.id || ''));
      setDate(transactionToEdit.date);
      setDescription(transactionToEdit.description);
      setPaymentMethod(transactionToEdit.paymentMethod);
      setReceiptImage(transactionToEdit.receiptUrl);
    } else if (prefill) {
      // Prefill dari hasil share gambar/teks (OCR): nominal, jenis, tanggal,
      // keterangan, dan bukti foto terisi otomatis — pengguna tinggal simpan.
      setAuthorUid(currentUser?.id);
      setAuthorName(currentUser?.name || '');
      setType(prefill.type);
      setAmountStr(prefill.amount > 0 ? String(prefill.amount) : '');
      setDate(prefill.date || initialDate || getTodayString());
      setDescription(prefill.description || '');
      setAccountId(accounts[0]?.id || '');
      setPaymentMethod('transfer');
      setReceiptImage(prefill.receiptImage);
      if (prefill.categoryHint) {
        const match = categories.find(
          c =>
            c.type === prefill.type &&
            (c.name.toLowerCase() === prefill.categoryHint.toLowerCase() ||
              c.name.toLowerCase().includes(prefill.categoryHint.toLowerCase()) ||
              prefill.categoryHint.toLowerCase().includes(c.name.toLowerCase())),
        );
        if (match) setCategoryId(match.id);
      }
    } else {
      setAuthorUid(currentUser?.id);
      setAuthorName(currentUser?.name || '');
      setType(initialType);
      setAmountStr('');
      setDate(initialDate || getTodayString());
      setDescription('');
      setAccountId(accounts[0]?.id || '');
      setPaymentMethod('transfer');
      setReceiptImage(undefined);
    }
    setError('');
  }, [transactionToEdit, prefill, prefillKey, initialType, initialDate, isOpen, accounts]);

  // Dynamically filter categories matching the selected transaction type
  const availableCategories = categories.filter(c => c.type === type);
  useEffect(() => {
    if (!categoryId || !availableCategories.some(c => c.id === categoryId)) {
      if (availableCategories.length > 0) {
        setCategoryId(availableCategories[0].id);
      } else {
        setCategoryId('');
      }
    }
  }, [type, availableCategories, categoryId]);

  if (!isOpen) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setAmountStr(val);
  };

  const addQuickAmount = (val: number) => {
    const current = Number(amountStr) || 0;
    setAmountStr(String(current + val));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Hanya file gambar yang didukung');
      return;
    }

    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Kompresi agresif (640px, kualitas 0.55): struk tetap terbaca,
        // ukuran ~5x lebih kecil agar penyimpanan & sinkronisasi tidak freeze.
        const MAX_WIDTH = 640;
        const MAX_HEIGHT = 640;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.55);
        setReceiptImage(compressedDataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(amountStr);
    if (!numericAmount || numericAmount <= 0) {
      setError('Nominal harus lebih besar dari 0');
      return;
    }

    const selectedCategory = categories.find(c => c.id === categoryId);
    if (!selectedCategory) {
      setError('Silakan pilih kategori yang sesuai');
      return;
    }

    const selectedAccount = accounts.find(a => a.id === accountId);
    const trimmedAuthor = authorName.trim();
    const authorEntry =
      authorOptions.find(o => o.uid && o.uid === authorUid) ||
      authorOptions.find(o => o.name.toLowerCase() === trimmedAuthor.toLowerCase()) ||
      authorOptions[0];
    const finalAuthorUid = authorEntry?.uid || currentUser?.id;
    const finalAuthorName = (trimmedAuthor || authorEntry?.name || '').trim() || undefined;

    if (transactionToEdit) {
      updateTransaction(transactionToEdit.id, {
        type,
        amount: numericAmount,
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        accountId: selectedAccount?.id,
        accountName: selectedAccount?.name,
        date,
        description: description.trim(),
        paymentMethod,
        receiptUrl: receiptImage,
        authorUid: finalAuthorUid,
        authorName: finalAuthorName,
      });
    } else {
      addTransaction({
        type,
        amount: numericAmount,
        categoryId: selectedCategory.id,
        categoryName: selectedCategory.name,
        accountId: selectedAccount?.id,
        accountName: selectedAccount?.name,
        date,
        description: description.trim(),
        paymentMethod,
        receiptUrl: receiptImage,
        authorUid: finalAuthorUid,
        authorName: finalAuthorName,
      });
    }

    pushToast(transactionToEdit ? 'Perubahan berhasil disimpan.' : 'Data berhasil disimpan.');
    onClose();
  };

  return (
    <>
      {/* Bottom Sheet Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        {/* Bottom Sheet Container */}
        <div
          className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* Mobile Drag Handle */}
          <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {transactionToEdit ? 'Edit Transaksi' : 'Catat Transaksi'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pilih jenis transaksi, sumber dana, dan kategori
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Form Body */}
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-4">
            {/* Pencatat transaksi (dropdown dari data Keuangan Berdua) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Dicatat oleh
              </label>
              <select
                value={authorUid || authorOptions[0]?.uid || ''}
                onChange={e => {
                  const opt = authorOptions.find(o => o.uid === e.target.value);
                  setAuthorUid(opt?.uid);
                  setAuthorName(opt?.name || '');
                }}
                className="w-full px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              >
                {authorOptions.map(o => (
                  <option key={o.uid || o.label} value={o.uid}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Dropdown List for Transaction Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Jenis Transaksi *
              </label>
              <div className="relative">
                <select
                  value={type}
                  onChange={e => setType(e.target.value as TransactionType)}
                  className={`w-full appearance-none pl-3.5 pr-10 py-2.5 text-xs sm:text-sm font-semibold rounded-xl border bg-white dark:bg-slate-950 focus:outline-hidden focus:ring-2 focus:ring-orange-500 transition ${
                    type === 'expense'
                      ? 'border-red-300 dark:border-red-800/80 text-red-600 dark:text-red-400'
                      : 'border-orange-300 dark:border-orange-800/80 text-orange-600 dark:text-orange-400'
                  }`}
                >
                  <option value="expense">Transaksi Keluar (Pengeluaran)</option>
                  <option value="income">Transaksi Masuk (Pemasukan)</option>
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Sumber Dana (Account / Wallet) Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                  <span>Sumber Dana (Rekening / E-Wallet / Tunai) *</span>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowBalances(v => !v)}
                    className="p-1 rounded-lg text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title={showBalances ? 'Sembunyikan saldo' : 'Tampilkan saldo'}
                  >
                    {showBalances ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAccountModalOpen(true)}
                    className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tambah Sumber Dana</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/40">
                {accounts.length === 0 && (
                  <p className="col-span-2 text-center text-[11px] text-slate-400 py-3">
                    Belum ada sumber dana. Buat dulu lewat tombol "Tambah Sumber Dana" di atas.
                  </p>
                )}
                {accounts.map(acc => {
                  const isSelected = accountId === acc.id;

                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setAccountId(acc.id);
                        if (acc.type === 'cash') setPaymentMethod('cash');
                        else if (acc.type === 'ewallet') setPaymentMethod('ewallet');
                        else if (acc.type === 'credit_card') setPaymentMethod('credit_card');
                        else setPaymentMethod('transfer');
                      }}
                      className={`p-2 rounded-xl border text-left transition flex items-center gap-2 ${
                        isSelected
                          ? 'border-orange-500 bg-white dark:bg-slate-900 shadow-xs ring-1 ring-orange-500/20'
                          : 'border-transparent hover:bg-white/60 dark:hover:bg-slate-900/60'
                      }`}
                    >
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 text-xs shadow-xs"
                        style={{ backgroundColor: acc.color }}
                      >
                        <CategoryIcon name={acc.icon} className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {acc.name}
                          </span>
                        </div>
                        <div className="text-[10px] tabular-nums truncate text-slate-500 dark:text-slate-400">
                          {showBalances ? formatRupiah(acc.balance) : 'Rp••••••'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nominal Input */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Nominal (Rupiah) *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  Rp
                </span>
                <input
                  type="tel"
                  autoComplete="off"
                  inputMode="numeric"
                  placeholder="0"
                  value={amountStr ? new Intl.NumberFormat('id-ID').format(Number(amountStr)) : ''}
                  onChange={handleAmountChange}
                  className="w-full pl-11 pr-4 py-2.5 text-lg font-bold tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Quick Nominal Chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[10000, 25000, 50000, 100000, 250000, 500000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => addQuickAmount(val)}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    +{formatRupiah(val, false)}
                  </button>
                ))}
                {amountStr && (
                  <button
                    type="button"
                    onClick={() => setAmountStr('')}
                    className="px-2 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Category Picker - Automatically dynamically filtered by selected type */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Kategori {type === 'expense' ? 'Pengeluaran' : 'Pemasukan'} *
                </label>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>Sesuaikan Kategori</span>
                </button>
              </div>

              {availableCategories.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl">
                  Belum ada kategori untuk jenis ini. Klik "Sesuaikan Kategori" untuk menambah.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                  {availableCategories.map(cat => {
                    const isSelected = categoryId === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryId(cat.id)}
                        className={`flex items-center gap-2 p-2 rounded-xl text-left transition border ${
                          isSelected
                            ? 'border-orange-500 bg-white dark:bg-slate-900 shadow-xs'
                            : 'border-transparent hover:bg-white/60 dark:hover:bg-slate-900/60'
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0 text-xs shadow-xs"
                          style={{ backgroundColor: cat.color }}
                        >
                          <CategoryIcon name={cat.icon} className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {cat.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Date & Payment Method */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Tanggal *
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Metode Pembayaran
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                >
                  {PAYMENT_METHODS.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Keterangan / Catatan (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Belanja bahan dapur bulanan"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Receipt Upload */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Lampiran Bukti Transaksi / Struk (Opsional)
              </label>
              {receiptImage ? (
                <div className="relative inline-block border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden group">
                  <img
                    src={receiptImage}
                    alt="Bukti Transaksi"
                    className="w-32 h-32 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setReceiptImage(undefined)}
                    className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full shadow-md hover:bg-red-700 transition"
                    title="Hapus foto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Upload Foto / Struk Pembayaran
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Submit / Cancel Footer */}
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
                {transactionToEdit ? 'Simpan Perubahan' : 'Catat Transaksi'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        defaultType={type}
      />

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />
    </>
  );
};
