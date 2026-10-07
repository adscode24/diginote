import React, { useState } from 'react';
import { AmountKeypad, evaluateExpression, hasCalcOps } from './AmountKeypad';

/**
 * Input nominal dengan keypad angka kustom (AmountKeypad).
 *
 * Kenapa tidak keyboard sistem?
 * - WebView Android MENGABAIKAN `inputmode` pada `type="text"` → QWERTY penuh di APK.
 * - `type="number"` dipatuhi WebView, tapi nilainya harus digit mentah sehingga
 *   tampilan tidak bisa format ribuan id-ID ("50.000").
 * Solusi: kolom menjadi read-only yang menampilkan format ribuan, ketukan
 * angka masuk via AmountKeypad kustom → IDENTIK di APK, PWA, dan desktop.
 *
 * Catatan: jangan tambahkan atribut `pattern` — browser memblokir submit
 * saat tampilan mengandung titik ribuan ("please match the format").
 */
/** Desktop (PWA laptop/PC): tidak pakai keypad kustom — cukup ketik langsung
 * dengan keyboard fisik, tampilan tetap terformat. */
function isDesktopWeb(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches
    );
  } catch {
    return false;
  }
}

interface NominalInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange' | 'pattern' | 'inputMode' | 'readOnly'
  > {
  /** Digit mentah (desimal mentah bila `decimal`). */
  digits: string;
  /** Dipanggil dengan string tersanitasi setiap perubahan. */
  onDigits: (digits: string) => void;
  /** Izinkan koma/titik desimal (mis. bunga %). */
  decimal?: boolean;
  /** Izinkan tanda minus (mis. penyesuaian saldo). */
  allowNegative?: boolean;
  /** Judul keypad. */
  padTitle?: string;
}

export const NominalInput: React.FC<NominalInputProps> = ({
  digits,
  onDigits,
  decimal,
  allowNegative,
  padTitle,
  className,
  placeholder,
  ...rest
}) => {
  const [open, setOpen] = useState(false);

  let value: string;
  if (!digits) {
    value = '';
  } else if (hasCalcOps(digits)) {
    const r = evaluateExpression(digits);
    value = r !== null ? new Intl.NumberFormat('id-ID').format(Number(r)) : '0';
  } else if (decimal) {
    value = digits;
  } else if (digits === '-') {
    value = '-';
  } else {
    value = new Intl.NumberFormat('id-ID').format(Number(digits.replace(/[^0-9-]/g, '')));
  }

  const useKeypad = !isDesktopWeb();

  const onDesktopChange = (raw: string) => {
    // Desktop: ketik langsung angka; format ribuan ditangani di state.
    if (decimal) onDigits(raw.replace(/[^0-9.,]/g, ''));
    else if (allowNegative) onDigits(raw.replace(/[^0-9-]/g, ''));
    else onDigits(raw.replace(/[^0-9]/g, ''));
  };

  return (
    <>
      {useKeypad ? (
        <>
          <input
            type="text"
            readOnly
            autoComplete="off"
            inputMode="none"
            value={value}
            placeholder={placeholder}
            onClick={() => setOpen(true)}
            onFocus={() => setOpen(true)}
            className={`${className || ''} cursor-pointer caret-transparent`}
            {...rest}
          />
          <AmountKeypad
            open={open}
            digits={digits}
            onDigits={onDigits}
            onClose={() => setOpen(false)}
            decimal={decimal}
            allowNegative={allowNegative}
            title={padTitle || 'Masukkan Nominal'}
          />
        </>
      ) : (
        <input
          type="text"
          autoComplete="off"
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={value}
          placeholder={placeholder}
          onChange={e => onDesktopChange(e.target.value)}
          className={className}
          {...rest}
        />
      )}
    </>
  );
};
