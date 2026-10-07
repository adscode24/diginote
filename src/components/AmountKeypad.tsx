import React from 'react';
import { Delete, X } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

/**
 * Keypad angka kustom di dalam aplikasi: pengalaman IDENTIK di APK (WebView),
 * PWA mobile, maupun desktop. Tidak lagi bergantung pada keyboard sistem
 * (yang diabaikan WebView) sehingga nominal selalu format ribuan + tombol angka.
 */
interface AmountKeypadProps {
  open: boolean;
  digits: string;
  onDigits: (digits: string) => void;
  onClose: () => void;
  decimal?: boolean;
  allowNegative?: boolean;
  title?: string;
}

export const AmountKeypad: React.FC<AmountKeypadProps> = ({
  open,
  digits,
  onDigits,
  onClose,
  decimal,
  allowNegative,
  title = 'Masukkan Nominal',
}) => {
  useBodyScrollLock(open);
  if (!open) return null;

  const hasSep = /[.,]/.test(digits);

  const typeDigit = (d: string) => {
    if (decimal && hasSep) {
      const sepIdx = digits.search(/[.,]/);
      if (digits.length - sepIdx > 2) return; // maks 2 desimal
    }
    onDigits(digits === '0' ? d : digits + d);
  };

  const typeSep = () => {
    if (!decimal || hasSep) return;
    onDigits(digits === '' || digits === '-' ? digits + '0,' : digits + ',');
  };

  const typeTripleZero = () => {
    if (digits === '' || digits === '-' || digits === '0') return;
    onDigits(digits + '000');
  };

  const backspace = () => {
    onDigits(digits.slice(0, -1));
  };

  const toggleNegative = () => {
    if (!allowNegative) return;
    onDigits(digits.startsWith('-') ? digits.slice(1) : digits ? '-' + digits : '-');
  };

  // Tampilan format ribuan; desimal tetap apa adanya (pisah koma/titik)
  let display = '';
  if (digits === '' || digits === '-') {
    display = digits;
  } else if (decimal) {
    const [intPart, decPart] = digits.split(/[.,]/);
    const grouped = intPart ? new Intl.NumberFormat('id-ID').format(Number(intPart)) : '0';
    display = decPart !== undefined ? `${grouped},${decPart}` : grouped;
  } else {
    display = new Intl.NumberFormat('id-ID').format(Number(digits));
  }

  const Key: React.FC<{ label: string; onPress: () => void; accent?: boolean }> = ({
    label,
    onPress,
    accent,
  }) => (
    <button
      type="button"
      onClick={onPress}
      className={`h-14 rounded-2xl text-lg font-extrabold tabular-nums transition active:scale-95 ${
        accent
          ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-5 space-y-4 animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden" />
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white truncate">
            {display || '0'}
          </div>
          {allowNegative && (
            <button
              type="button"
              onClick={toggleNegative}
              className="px-2.5 py-1 rounded-lg text-xs font-extrabold text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              +/-
            </button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(d => (
            <Key key={d} label={d} onPress={() => typeDigit(d)} />
          ))}
          {decimal ? (
            <Key label="," onPress={typeSep} accent />
          ) : (
            <Key label="000" onPress={typeTripleZero} accent />
          )}
          <Key label="0" onPress={() => typeDigit('0')} />
          <button
            type="button"
            onClick={backspace}
            className="h-14 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95 transition"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-extrabold transition"
        >
          Selesai
        </button>
      </div>
    </div>
  );
};
