import React, { useState, useEffect } from 'react';
import { X, Building2, CreditCard, Smartphone, Banknote, TrendingUp, Wallet, Check, AlertCircle } from 'lucide-react';
import { Account, AccountType } from '../types';
import { useFinance } from '../context/FinanceContext';
import { NominalInput } from './NominalInput';
import { ACCOUNT_TYPES, COLOR_PALETTE } from '../utils/constants';
import { CategoryIcon } from './CategoryIcon';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useToast } from './Toast';
import { formatRupiah } from '../utils/formatters';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountToEdit?: Account | null;
  mode?: 'create_or_edit' | 'adjust_balance';
  defaultType?: AccountType;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  accountToEdit,
  mode = 'create_or_edit',
  defaultType = 'bank',
}) => {
  const { addAccount, updateAccount, adjustAccountBalance } = useFinance();
  const { pushToast } = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>(defaultType);
  const [accountNumber, setAccountNumber] = useState('');
  const [initialBalanceStr, setInitialBalanceStr] = useState('');
  const [adjustedBalanceStr, setAdjustedBalanceStr] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLOR_PALETTE[0]);
  const [selectedIcon, setSelectedIcon] = useState('Building2');
  const [error, setError] = useState('');
  useBodyScrollLock(isOpen);

  const getDefaultIconForType = (t: AccountType) => {
    if (t === 'bank') return 'Building2';
    if (t === 'ewallet') return 'Smartphone';
    if (t === 'credit_card') return 'CreditCard';
    if (t === 'cash') return 'Banknote';
    if (t === 'investment') return 'TrendingUp';
    return 'Wallet';
  };

  useEffect(() => {
    if (accountToEdit) {
      setName(accountToEdit.name);
      setType(accountToEdit.type);
      setAccountNumber(accountToEdit.accountNumber || '');
      setInitialBalanceStr(String(accountToEdit.initialBalance || 0));
      setAdjustedBalanceStr(String(accountToEdit.balance || 0));
      setSelectedColor(accountToEdit.color || COLOR_PALETTE[0]);
      setSelectedIcon(accountToEdit.icon || getDefaultIconForType(accountToEdit.type));
    } else {
      setName('');
      setType(defaultType);
      setAccountNumber('');
      setInitialBalanceStr('0');
      setAdjustedBalanceStr('0');
      setSelectedColor(COLOR_PALETTE[0]);
      setSelectedIcon(getDefaultIconForType(defaultType));
    }
    setError('');
  }, [accountToEdit, isOpen, defaultType]);

  // Update default icon when type changes
  const handleTypeChange = (newType: AccountType) => {
    setType(newType);
    if (!accountToEdit) {
      if (newType === 'bank') setSelectedIcon('Building2');
      else if (newType === 'ewallet') setSelectedIcon('Smartphone');
      else if (newType === 'credit_card') setSelectedIcon('CreditCard');
      else if (newType === 'cash') setSelectedIcon('Banknote');
      else if (newType === 'investment') setSelectedIcon('TrendingUp');
      else setSelectedIcon('Wallet');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'adjust_balance' && accountToEdit) {
      const newBal = Number(adjustedBalanceStr.replace(/[^0-9-]/g, ''));
      if (isNaN(newBal)) {
        setError('Saldo harus berupa angka');
        return;
      }
      adjustAccountBalance(accountToEdit.id, newBal);
      pushToast('Data berhasil disimpan.');
      onClose();
      return;
    }

    if (!name.trim()) {
      setError('Nama sumber dana wajib diisi');
      return;
    }

    const initBal = Number(initialBalanceStr.replace(/[^0-9-]/g, '')) || 0;

    if (accountToEdit) {
      updateAccount(accountToEdit.id, {
        name: name.trim(),
        type,
        accountNumber: accountNumber.trim(),
        color: selectedColor,
        icon: selectedIcon,
      });
    } else {
      addAccount({
        name: name.trim(),
        type,
        initialBalance: initBal,
        balance: initBal,
        accountNumber: accountNumber.trim(),
        color: selectedColor,
        icon: selectedIcon,
        isDefault: false,
      });
    }

    pushToast(accountToEdit ? 'Perubahan berhasil disimpan.' : 'Data berhasil disimpan.');
    onClose();
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
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {mode === 'adjust_balance'
                ? 'Sesuaikan Saldo Manual'
                : accountToEdit
                ? 'Edit Sumber Dana'
                : 'Tambah Sumber Dana Baru'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {mode === 'adjust_balance'
                ? `Perbarui saldo saat ini untuk ${accountToEdit?.name}`
                : 'Kelola rekening, kartu kredit, e-wallet, atau uang tunai'}
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
          {mode === 'adjust_balance' && accountToEdit ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Saldo Tercatat Sekarang:
                </div>
                <div
                  className={`text-lg font-bold tabular-nums ${
                    accountToEdit.balance < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {formatRupiah(accountToEdit.balance)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Saldo Baru yang Disesuaikan (Rupiah) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                    Rp
                  </span>
                  <NominalInput
                    autoComplete="off"
                    placeholder="0"
                    digits={adjustedBalanceStr}
                    onDigits={setAdjustedBalanceStr}
                    allowNegative
                    className="w-full pl-10 pr-3.5 py-2.5 text-base font-bold tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Saldo akan langsung diperbarui ke nominal ini tanpa merusak riwayat transaksi Anda.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Account Type Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Jenis Sumber Dana *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {ACCOUNT_TYPES.map(t => {
                    const isSelected = type === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleTypeChange(t.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition text-xs ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-semibold shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <CategoryIcon name={t.icon} className="w-4 h-4 shrink-0 text-orange-600 dark:text-orange-400" />
                        <div className="min-w-0 flex-1 truncate">
                          <span>{t.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Account Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nama Sumber Dana *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: BCA Gaji, GoPay, Kartu Kredit BCA"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Account / Card Number (Optional) */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Nomor Rekening / No. HP E-Wallet / 4 Digit Kartu (Opsional)
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  inputMode="numeric"
                  placeholder="Contoh: 8492019482 atau 0812345678"
                  value={accountNumber}
                  onChange={e => setAccountNumber(e.target.value.replace(/[^0-9 ]/g, ''))}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Initial Balance (Only when creating) */}
              {!accountToEdit && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Saldo Awal (Rupiah) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      Rp
                    </span>
                    <NominalInput
                      autoComplete="off"
                      placeholder="0"
                      digits={initialBalanceStr}
                      onDigits={setInitialBalanceStr}
                      allowNegative
                      className="w-full pl-10 pr-3.5 py-2 text-sm font-bold tabular-nums rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Saldo ini dapat diedit atau disesuaikan secara manual kapan saja nanti.
                  </p>
                </div>
              )}

              {/* Color selection */}
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Warna Kartu / Ikon
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PALETTE.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className="w-6 h-6 rounded-full transition-transform flex items-center justify-center shadow-xs"
                      style={{ backgroundColor: c, transform: selectedColor === c ? 'scale(1.2)' : 'scale(1)' }}
                    >
                      {selectedColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

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
              {mode === 'adjust_balance'
                ? 'Simpan Saldo Baru'
                : accountToEdit
                ? 'Simpan Perubahan'
                : 'Tambah Sumber Dana'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
