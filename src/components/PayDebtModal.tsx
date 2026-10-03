import React, { useState } from 'react';
import { X, CheckCircle2, Upload, Trash2, ArrowUpRight, AlertCircle, Calendar, Wallet, Percent } from 'lucide-react';
import { Debt } from '../types';
import { useFinance } from '../context/FinanceContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { formatRupiah, getTodayString, getActiveTierRate, calculateTieredPayment } from '../utils/formatters';

interface PayDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  debt: Debt | null;
}

export const PayDebtModal: React.FC<PayDebtModalProps> = ({ isOpen, onClose, debt }) => {
  const { payDebt, accounts } = useFinance();

  const [amountStr, setAmountStr] = useState('');
  const [paymentDate, setPaymentDate] = useState(getTodayString());
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState<{
    amount: number;
    remaining: number;
    interestPortion?: number;
    principalPortion?: number;
    annualRate?: number;
  } | null>(null);
  useBodyScrollLock(isOpen);

  React.useEffect(() => {
    if (debt && isOpen) {
      if (debt.monthlyInstallment && debt.monthlyInstallment > 0) {
        setAmountStr(String(Math.min(debt.monthlyInstallment, debt.remainingAmount)));
      } else {
        setAmountStr('');
      }
      setSelectedAccountId(accounts[0]?.id || '');
      setPaymentDate(getTodayString());
      setNotes(
        debt.installmentCategory && debt.installmentCategory !== 'non_installment'
          ? `Pembayaran cicilan: ${debt.counterparty}${debt.remainingTenor ? ` (Sisa ${debt.remainingTenor}x)` : ''}`
          : ''
      );
      setError('');
      setSuccessInfo(null);
    }
  }, [debt, isOpen, accounts]);

  if (!isOpen || !debt) return null;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setAmountStr(val);
  };

  const setPresetAmount = (amount: number) => {
    setAmountStr(String(Math.min(amount, debt.remainingAmount)));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Hanya file foto atau gambar yang diperbolehkan');
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
      setError('Nominal pembayaran harus lebih besar dari 0');
      return;
    }

    if (numericAmount > debt.remainingAmount) {
      setError(`Nominal pembayaran melebihi sisa hutang (${formatRupiah(debt.remainingAmount)})`);
      return;
    }

    try {
      const result = payDebt(debt.id, numericAmount, paymentDate, notes.trim(), receiptImage, selectedAccountId);

      setSuccessInfo({
        amount: numericAmount,
        remaining: result.breakdown ? result.breakdown.remainingAfter : Math.max(0, debt.remainingAmount - numericAmount),
        interestPortion: result.breakdown?.interestPortion,
        principalPortion: result.breakdown?.principalPortion,
        annualRate: result.breakdown?.annualRate,
      });
      setTimeout(() => {
        setSuccessInfo(null);
        onClose();
      }, 2600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memproses pembayaran');
    }
  };

  const isPayable = debt.type === 'payable';

  // Preview rincian amortisasi cicilan berjangka sebelum konfirmasi
  const numericAmountPreview = Number(amountStr) || 0;
  const paidSoFarPreview =
    typeof debt.totalTenor === 'number' && typeof debt.remainingTenor === 'number'
      ? Math.max(0, debt.totalTenor - debt.remainingTenor)
      : debt.payments.length;
  const activeRatePreview =
    isPayable && debt.installmentCategory === 'tiered_installment'
      ? getActiveTierRate(debt.tieredPeriods, paidSoFarPreview)
      : undefined;
  const previewBreakdown =
    activeRatePreview !== undefined && activeRatePreview > 0 && numericAmountPreview > 0
      ? { ...calculateTieredPayment(debt.remainingAmount, activeRatePreview, numericAmountPreview), annualRate: activeRatePreview }
      : null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              {isPayable ? 'Bayar Hutang' : 'Terima Pembayaran Piutang'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Kepada: <strong>{debt.counterparty}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successInfo ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-950/80 text-orange-600 dark:text-orange-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h4 className="text-base font-bold text-slate-900 dark:text-white">
              Pembayaran Berhasil Dicatat!
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Uang sebesar <strong>{formatRupiah(successInfo.amount)}</strong> telah dipotong dari sumber dana
              dan tercatat ke transaksi pengeluaran.
            </p>
            {successInfo.annualRate !== undefined && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Bunga {formatRupiah(successInfo.interestPortion || 0)} · Pokok berkurang{' '}
                {formatRupiah(successInfo.principalPortion || 0)} (bunga {successInfo.annualRate}% p.a.)
              </p>
            )}
            <div className="text-xs font-semibold text-orange-600 dark:text-orange-400 pt-1">
              Sisa Hutang: {formatRupiah(successInfo.remaining)}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-4">
            {/* Debt Overview Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400">Total Pinjaman:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                  {formatRupiah(debt.totalAmount)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 dark:text-slate-400">Sisa Hutang Sekarang:</span>
                <span className="font-bold text-red-600 dark:text-red-400 tabular-nums text-sm">
                  {formatRupiah(debt.remainingAmount)}
                </span>
              </div>
              {debt.monthlyInstallment && debt.monthlyInstallment > 0 && (
                <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700">
                  <span className="text-orange-600 dark:text-orange-400 font-medium">Cicilan per Bulan:</span>
                  <span className="font-bold text-orange-600 dark:text-orange-400 tabular-nums">
                    {formatRupiah(debt.monthlyInstallment)}
                  </span>
                </div>
              )}
              {debt.remainingTenor !== undefined && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Sisa Tenor:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {debt.remainingTenor}x lagi
                    {debt.estimatedPayoffDate && ` (Estimasi: ${debt.estimatedPayoffDate})`}
                  </span>
                </div>
              )}
            </div>

            {/* Rincian Amortisasi Cicilan Berjangka */}
            {previewBreakdown && (
              <div className="p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-orange-800 dark:text-orange-300">
                  <Percent className="w-3.5 h-3.5" />
                  <span>Rincian Cicilan (Bunga {previewBreakdown.annualRate}% p.a.)</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Bunga bulan ini:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    {formatRupiah(previewBreakdown.interestPortion)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Pokok berkurang:</span>
                  <span className="font-semibold text-orange-700 dark:text-orange-300 tabular-nums">
                    {formatRupiah(previewBreakdown.principalPortion)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pt-1 border-t border-orange-200/70 dark:border-orange-800">
                  <span className="text-slate-500 dark:text-slate-400">Sisa pokok setelah bayar:</span>
                  <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatRupiah(previewBreakdown.remainingAfter)}
                  </span>
                </div>
                {previewBreakdown.principalPortion < 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Nominal kurang dari bunga berjalan — selisihnya menambah sisa pokok (kapitalisasi bunga).
                  </p>
                )}
              </div>
            )}

            {/* Sumber Dana (Account / Wallet) Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                <span>Gunakan Sumber Dana *</span>
              </label>
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (Saldo: {formatRupiah(acc.balance)})
                  </option>
                ))}
              </select>
            </div>

            {/* Input Nominal */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Nominal Pembayaran *
                </label>
                {debt.monthlyInstallment && (
                  <span className="text-[11px] text-orange-600 dark:text-orange-400">
                    Nominal cicilan dapat disesuaikan
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  Rp
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  inputMode="numeric" pattern="[0-9]*"
                  placeholder="0"
                  value={amountStr ? new Intl.NumberFormat('id-ID').format(Number(amountStr)) : ''}
                  onChange={handleAmountChange}
                  className="w-full pl-11 pr-4 py-2.5 text-base font-bold tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Preset Buttons */}
              <div className="flex flex-wrap gap-2 mt-2">
                {debt.monthlyInstallment && debt.monthlyInstallment > 0 && (
                  <button
                    type="button"
                    onClick={() => setPresetAmount(debt.monthlyInstallment!)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-orange-100 dark:bg-orange-950/80 text-orange-800 dark:text-orange-200 hover:bg-orange-200 transition border border-orange-300 dark:border-orange-700"
                  >
                    Cicilan Bulanan ({formatRupiah(debt.monthlyInstallment)})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPresetAmount(debt.remainingAmount)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition"
                >
                  Bayar Lunas ({formatRupiah(debt.remainingAmount)})
                </button>
                <button
                  type="button"
                  onClick={() => setPresetAmount(Math.round(debt.remainingAmount / 2))}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition"
                >
                  50% ({formatRupiah(Math.round(debt.remainingAmount / 2))})
                </button>
              </div>
            </div>

            {/* Payment Date */}
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

            {/* Receipt Image Upload */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Upload Bukti Pembayaran / Struk Transfer (Opsional)
              </label>
              {receiptImage ? (
                <div className="relative inline-block border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden group">
                  <img
                    src={receiptImage}
                    alt="Bukti Transfer"
                    className="w-32 h-32 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setReceiptImage(undefined)}
                    className="absolute top-1.5 right-1.5 p-1 bg-red-600 text-white rounded-full shadow-md hover:bg-red-700 transition"
                    title="Hapus foto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-2.5 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Pilih Foto Bukti Transfer / Kwitansi
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

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Catatan Pembayaran (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Cicilan ke-2 transfer m-banking"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Notice */}
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <ArrowUpRight className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Saldo & Hutang:</strong> Saldo sumber dana terpilih akan{' '}
                <strong>otomatis berkurang</strong> dan memotong sisa hutang Anda sebesar nominal yang dibayarkan.
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
