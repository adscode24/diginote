import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  UserCheck,
  AlertCircle,
  Clock,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Layers,
  Banknote,
} from 'lucide-react';
import { Debt, DebtType, InstallmentCategory, TieredPeriod } from '../types';
import { useFinance } from '../context/FinanceContext';
import { useToast } from './Toast';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { formatRupiah, getTodayString, calculatePayoffDate, getNextDueDate } from '../utils/formatters';

interface AddDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: DebtType;
  debtToEdit?: Debt | null;
}

export const AddDebtModal: React.FC<AddDebtModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'payable',
  debtToEdit = null,
}) => {
  const { addDebt, updateDebt } = useFinance();
  const { pushToast } = useToast();

  const [installmentCategory, setInstallmentCategory] = useState<InstallmentCategory>('non_installment');
  const [type, setType] = useState<DebtType>(defaultType);
  const [counterparty, setCounterparty] = useState('');
  const [totalAmountStr, setTotalAmountStr] = useState('');
  const [monthlyInstallmentStr, setMonthlyInstallmentStr] = useState('');
  const [startDate, setStartDate] = useState(getTodayString());
  const [dueDate, setDueDate] = useState('');
  const [dueDayOfMonth, setDueDayOfMonth] = useState<number>(10);
  const [remainingTenorStr, setRemainingTenorStr] = useState('');
  const [totalTenorStr, setTotalTenorStr] = useState('');
  const [notes, setNotes] = useState('');
  const [tieredPeriods, setTieredPeriods] = useState<TieredPeriod[]>([]);
  const [error, setError] = useState('');
  useBodyScrollLock(isOpen);

  const isEditing = !!debtToEdit;

  useEffect(() => {
    if (debtToEdit) {
      setInstallmentCategory(debtToEdit.installmentCategory || 'non_installment');
      setType(debtToEdit.type);
      setCounterparty(debtToEdit.counterparty);
      setTotalAmountStr(String(debtToEdit.totalAmount || ''));
      setMonthlyInstallmentStr(debtToEdit.monthlyInstallment ? String(debtToEdit.monthlyInstallment) : '');
      setStartDate(debtToEdit.startDate || getTodayString());
      setDueDate(debtToEdit.dueDate || '');
      setDueDayOfMonth(debtToEdit.dueDayOfMonth || 10);
      setRemainingTenorStr(debtToEdit.remainingTenor !== undefined ? String(debtToEdit.remainingTenor) : '');
      setTotalTenorStr(debtToEdit.totalTenor !== undefined ? String(debtToEdit.totalTenor) : '');
      setNotes(debtToEdit.notes || '');
      setTieredPeriods(debtToEdit.tieredPeriods || []);
    } else {
      setInstallmentCategory('non_installment');
      setType(defaultType);
      setCounterparty('');
      setTotalAmountStr('');
      setMonthlyInstallmentStr('');
      setStartDate(getTodayString());
      setDueDate('');
      setDueDayOfMonth(10);
      setRemainingTenorStr('');
      setTotalTenorStr('');
      setNotes('');
      setTieredPeriods([]);
    }
    setError('');
  }, [isOpen, debtToEdit, defaultType]);

  if (!isOpen) return null;

  const handleTotalAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setTotalAmountStr(val);
  };

  const handleMonthlyInstallmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setMonthlyInstallmentStr(val);
  };

  const handleNumericTenorChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setter(val);
  };

  // Kalkulasi estimasi lunas untuk cicilan tetap & cicilan berjangka
  const remainingTenorNum = Number(remainingTenorStr) || 0;
  const payoffEstimation =
    installmentCategory !== 'non_installment' && remainingTenorNum > 0
      ? calculatePayoffDate(dueDayOfMonth, remainingTenorNum)
      : null;

  const addTierPeriod = () => {
    setTieredPeriods(prev => [
      ...prev,
      {
        id: `tier_${Date.now()}`,
        name: `Periode Tahap ${prev.length + 1}`,
        durationMonths: 12,
        monthlyAmount: Number(monthlyInstallmentStr) || 0,
        interestRate: 8.5,
        isFloating: false,
      },
    ]);
  };

  const updateTierPeriod = (index: number, field: keyof TieredPeriod, value: unknown) => {
    setTieredPeriods(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeTierPeriod = (index: number) => {
    setTieredPeriods(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!counterparty.trim()) {
      setError('Nama pihak (pemberi pinjaman / peminjam) wajib diisi');
      return;
    }

    const totalAmount = Number(totalAmountStr);
    if (!totalAmount || totalAmount <= 0) {
      setError('Total nominal pinjaman harus lebih besar dari 0');
      return;
    }

    let calculatedDueDate = dueDate;
    const monthlyInstallment = Number(monthlyInstallmentStr) || undefined;
    const remainingTenor = Number(remainingTenorStr) || undefined;
    const totalTenor = Number(totalTenorStr) || undefined;

    if (installmentCategory === 'non_installment') {
      if (!dueDate) {
        setError('Tanggal jatuh tempo wajib diisi untuk bukan cicilan');
        return;
      }
    } else {
      // Cicilan Tetap atau Cicilan Berjangka
      if (!monthlyInstallment || monthlyInstallment <= 0) {
        setError('Cicilan per bulan harus diisi dengan nominal yang valid');
        return;
      }
      if (!dueDayOfMonth || dueDayOfMonth < 1 || dueDayOfMonth > 31) {
        setError('Tanggal jatuh tempo bulanan harus antara tanggal 1 s/d 31');
        return;
      }
      if (!remainingTenor || remainingTenor <= 0) {
        setError('Sisa tenor cicilan harus diisi (berapa kali lagi harus dibayar)');
        return;
      }

      // Validasi tahapan periode bunga untuk cicilan berjangka
      if (installmentCategory === 'tiered_installment') {
        for (let i = 0; i < tieredPeriods.length; i++) {
          const p = tieredPeriods[i];
          if (!p.durationMonths || p.durationMonths < 1) {
            setError(`Periode "${p.name || `#${i + 1}`}": Tenor (bulan) minimal 1 bulan`);
            return;
          }
          if (p.interestRate === undefined || p.interestRate === null || Number.isNaN(p.interestRate) || p.interestRate < 0) {
            setError(`Periode "${p.name || `#${i + 1}`}": Bunga (% p.a) harus diisi (0 atau lebih)`);
            return;
          }
          if (!p.monthlyAmount || p.monthlyAmount <= 0) {
            setError(`Periode "${p.name || `#${i + 1}`}": Cicilan per bulan harus lebih besar dari 0`);
            return;
          }
        }
      }

      // Hitung tanggal jatuh tempo terdekat
      calculatedDueDate = getNextDueDate(dueDayOfMonth);
    }

    const estimatedPayoffDate = payoffEstimation?.formatted;

    if (isEditing && debtToEdit) {
      updateDebt(debtToEdit.id, {
        type,
        counterparty: counterparty.trim(),
        totalAmount,
        startDate: startDate || getTodayString(),
        dueDate: calculatedDueDate,
        dueDayOfMonth: installmentCategory !== 'non_installment' ? dueDayOfMonth : undefined,
        notes: notes.trim(),
        installmentCategory,
        monthlyInstallment,
        remainingTenor,
        totalTenor,
        estimatedPayoffDate,
        tieredPeriods: installmentCategory === 'tiered_installment' ? tieredPeriods : undefined,
      });
    } else {
      addDebt({
        type,
        counterparty: counterparty.trim(),
        totalAmount,
        startDate: startDate || getTodayString(),
        dueDate: calculatedDueDate,
        dueDayOfMonth: installmentCategory !== 'non_installment' ? dueDayOfMonth : undefined,
        notes: notes.trim(),
        installmentCategory,
        monthlyInstallment,
        remainingTenor,
        totalTenor,
        estimatedPayoffDate,
        tieredPeriods: installmentCategory === 'tiered_installment' ? tieredPeriods : undefined,
      });
    }

    pushToast(isEditing ? 'Perubahan berhasil disimpan.' : 'Data berhasil disimpan.');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isEditing ? 'Edit Catatan Hutang / Piutang' : 'Tambah Catatan Hutang'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Kelola pinjaman umum, cicilan tetap, maupun KPR bunga berjangka
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
          {/* 1. Dropdown Jenis Hutang */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span>Jenis Skema Hutang *</span>
              </span>
              <span className="text-[11px] font-normal text-slate-400">Pilih skema pencatatan</span>
            </label>
            <select
              value={installmentCategory}
              onChange={e => setInstallmentCategory(e.target.value as InstallmentCategory)}
              className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
            >
              <option value="non_installment">Bukan Cicilan (Hutang Sekali Lunas / Tempo Bebas)</option>
              <option value="fixed_installment">Cicilan Tetap (Angsuran Flat Tiap Bulan: Motor, Pinjol, dll)</option>
              <option value="tiered_installment">Cicilan Berjangka (KPR, Bunga Fixed Promo & Floating)</option>
            </select>
          </div>

          {/* Type Selector (Hutang Saya vs Piutang) */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setType('payable')}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                type === 'payable'
                  ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Hutang Saya (Harus Dibayar)
            </button>
            <button
              type="button"
              onClick={() => setType('receivable')}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                type === 'receivable'
                  ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Piutang Saya (Akan Diterima)
            </button>
          </div>

          {/* Counterparty Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {installmentCategory === 'tiered_installment'
                ? 'Nama Bank / Lembaga KPR / Kreditur *'
                : type === 'payable'
                ? 'Nama Pemberi Pinjaman / Bank / Lembaga *'
                : 'Nama Peminjam *'}
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={
                  installmentCategory === 'tiered_installment'
                    ? 'Contoh: KPR Bank BTN Griya, KPR BCA Platinum'
                    : type === 'payable'
                    ? 'Contoh: Bank Mandiri, Leasing Honda, Teman Kantor'
                    : 'Contoh: Rian Pratama, Ibu Linda'
                }
                value={counterparty}
                onChange={e => setCounterparty(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {/* Total Amount */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {installmentCategory === 'tiered_installment'
                ? 'Total Plafon / Pokok Pinjaman KPR (Rupiah) *'
                : 'Total Pinjaman (Rupiah) *'}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                Rp
              </span>
              <input
                type="text"
                autoComplete="off"
                inputMode="numeric" pattern="[0-9]*"
                placeholder="0"
                value={totalAmountStr ? new Intl.NumberFormat('id-ID').format(Number(totalAmountStr)) : ''}
                onChange={handleTotalAmountChange}
                className="w-full pl-10 pr-3.5 py-2.5 text-sm font-bold tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
              />
            </div>
            {isEditing && debtToEdit && debtToEdit.payments && debtToEdit.payments.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">
                Sudah dibayar sebesar Rp {new Intl.NumberFormat('id-ID').format(debtToEdit.payments.reduce((s, p) => s + p.amount, 0))}. Sisa hutang akan dihitung otomatis.
              </p>
            )}
          </div>

          {/* SPECIFIC FIELDS FOR "BUKAN CICILAN" */}
          {installmentCategory === 'non_installment' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Tanggal Pinjam
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Tanggal Jatuh Tempo *
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
          )}

          {/* SPECIFIC FIELDS FOR "CICILAN TETAP" & "CICILAN BERJANGKA" */}
          {installmentCategory !== 'non_installment' && (
            <div className="space-y-4 pt-1">
              {/* Kolom Cicilan per Bulan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Banknote className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span>
                      {installmentCategory === 'tiered_installment'
                        ? 'Cicilan per Bulan Saat Ini (Rupiah) *'
                        : 'Cicilan per Bulan (Rupiah) *'}
                    </span>
                  </span>
                  <span className="text-[10px] text-orange-600 font-medium">Muncul di Beranda & Isi Bayar</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="text"
                    autoComplete="off"
                    inputMode="numeric" pattern="[0-9]*"
                    placeholder="0"
                    value={monthlyInstallmentStr ? new Intl.NumberFormat('id-ID').format(Number(monthlyInstallmentStr)) : ''}
                    onChange={handleMonthlyInstallmentChange}
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm font-bold tabular-nums rounded-xl border border-orange-300 dark:border-orange-800 bg-orange-50/30 dark:bg-orange-950/20 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Nominal ini akan otomatis mengisi kolom pembayaran saat klik Bayar Hutang, dan ditampilkan pada kartu Jatuh Tempo di Beranda.
                </p>
              </div>

              {/* Tanggal Jatuh Tempo (HANYA MEMILIH ANGKA TANGGAL 1 - 31) & Sisa Tenor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Tanggal Jatuh Tempo Bulanan *
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={dueDayOfMonth}
                      onChange={e => setDueDayOfMonth(Number(e.target.value))}
                      className="w-full pl-9 pr-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day}>
                          Setiap Tanggal {day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Jatuh tempo rutin setiap tanggal {dueDayOfMonth} per bulannya.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Sisa Tenor Cicilan (Bulan / Kali) *
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      autoComplete="off"
                      inputMode="numeric" pattern="[0-9]*"
                      placeholder="Contoh: 12 atau 60"
                      value={remainingTenorStr}
                      onChange={handleNumericTenorChange(setRemainingTenorStr)}
                      className="w-full pl-9 pr-3.5 py-2 text-xs font-bold tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Sisa berapa kali lagi cicilan harus dibayar.
                  </p>
                </div>
              </div>

              {/* Keterangan Estimasi Cicilan Lunas */}
              {payoffEstimation && (
                <div className="p-3.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 text-xs">
                  <div className="flex items-center gap-2 text-orange-800 dark:text-orange-300 font-bold">
                    <Sparkles className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <span>Estimasi Cicilan Lunas:</span>
                  </div>
                  <div className="mt-1 text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed">
                    Dengan sisa <strong className="text-orange-700 dark:text-orange-300">{remainingTenorNum} kali</strong> cicilan setiap tanggal {dueDayOfMonth}, pinjaman ini diperkirakan akan lunas pada:{' '}
                    <strong className="text-orange-700 dark:text-orange-300 text-xs block mt-0.5 font-bold">
                      📅 {payoffEstimation.formatted}
                    </strong>
                  </div>
                </div>
              )}

              {/* Total Tenor Awal (Opsional) */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Total Tenor Awal (Bulan / Opsional)
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  inputMode="numeric" pattern="[0-9]*"
                  placeholder="Contoh: 24, 36, 120 bulan"
                  value={totalTenorStr}
                  onChange={handleNumericTenorChange(setTotalTenorStr)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* SECTION KHUSUS: CICILAN BERJANGKA (KPR BUNGA FIX & FLOATING) */}
              {installmentCategory === 'tiered_installment' && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-orange-600" />
                        <span>Skema Tahapan Periode KPR (Bunga Fix & Floating)</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Isi manual tiap tahapan: Tenor (bulan), Bunga (% p.a), dan Cicilan per bulan
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addTierPeriod}
                      className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/60 px-2.5 py-1 rounded-lg border border-orange-200 dark:border-orange-800 transition flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah Periode</span>
                    </button>
                  </div>

                  {tieredPeriods.length > 0 ? (
                    <div className="space-y-2.5">
                      {tieredPeriods.map((period, idx) => (
                        <div
                          key={period.id || idx}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={period.name}
                              onChange={e => updateTierPeriod(idx, 'name', e.target.value)}
                              placeholder="Nama Periode (e.g. Tahun 1-3 Fix)"
                              className="font-bold text-xs bg-transparent border-b border-transparent hover:border-slate-300 focus:border-orange-500 focus:outline-hidden text-slate-900 dark:text-white flex-1"
                            />
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                  period.isFloating
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                    : 'bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300'
                                }`}
                              >
                                {period.isFloating ? 'Floating' : 'Fixed'}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeTierPeriod(idx)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                                title="Hapus Periode Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">Durasi (Bulan)</label>
                              <input
                                type="text"
                                autoComplete="off"
                                inputMode="numeric" pattern="[0-9]*"
                                value={period.durationMonths}
                                onChange={e => updateTierPeriod(idx, 'durationMonths', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">Bunga (% p.a)</label>
                              <input
                                type="text"
                                autoComplete="off"
                                inputMode="decimal" pattern="[0-9.,]*"
                                value={period.interestRate ?? ''}
                                onChange={e => updateTierPeriod(idx, 'interestRate', Number(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0)}
                                placeholder="3.75"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-400 block mb-0.5">Cicilan / Bln (Rp)</label>
                              <input
                                type="text"
                                autoComplete="off"
                                inputMode="numeric" pattern="[0-9]*"
                                value={period.monthlyAmount ? new Intl.NumberFormat('id-ID').format(Number(String(period.monthlyAmount).replace(/[^0-9]/g, '')) || 0) : ''}
                                onChange={e => updateTierPeriod(idx, 'monthlyAmount', Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                                placeholder="0"
                                className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={addTierPeriod}
                        className="w-full py-2 text-xs font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 border border-dashed border-orange-300 dark:border-orange-800 rounded-xl hover:bg-orange-50/50 dark:hover:bg-orange-950/20 transition flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Periode Bunga KPR</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-center">
                      <Info className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Belum ada tahapan periode bunga. Isi manual tiap periode: Tenor (bulan), Bunga (% p.a), dan Cicilan per bulan.
                      </p>
                      <button
                        type="button"
                        onClick={addTierPeriod}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 px-3.5 py-2 rounded-xl transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Periode Bunga KPR</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Catatan / Detail Tambahan (Opsional)
            </label>
            <textarea
              rows={2}
              placeholder="Contoh: No. Akad KPR, nomor rekening autodebet, kontak marketing, dll"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
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
              {isEditing ? 'Simpan Perubahan' : 'Simpan Catatan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
