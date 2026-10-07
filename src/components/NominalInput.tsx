import React from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * True bila berjalan sebagai aplikasi native (APK Capacitor).
 * WebView Android mengabaikan `inputmode` pada `type="text"` sehingga
 * keyboard QWERTY penuh yang muncul; `type="number"` yang dipatuhinya.
 * Chrome (PWA/desktop) sebaliknya patuh pada `inputmode`, jadi di web
 * tetap `type="text"` agar format ribuan id-ID (50.000) bisa ditampilkan
 * (atribut `pattern` DILARANG: titik format dianggap melanggar pola
 * sehingga browser memblokir submit).
 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

interface NominalInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange' | 'pattern' | 'inputMode'
  > {
  /** Digit mentah (desimal mentah bila `decimal`). */
  digits: string;
  /** Dipanggil dengan string yang sudah tersanitasi setiap perubahan. */
  onDigits: (digits: string) => void;
  /** Izinkan koma/titik desimal (mis. bunga %). */
  decimal?: boolean;
  /** Izinkan tanda minus (mis. penyesuaian saldo). */
  allowNegative?: boolean;
}

export const NominalInput: React.FC<NominalInputProps> = ({
  digits,
  onDigits,
  decimal,
  allowNegative,
  ...rest
}) => {
  const native = isNativeApp();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (decimal) onDigits(raw.replace(/[^0-9.,]/g, ''));
    else if (allowNegative) onDigits(raw.replace(/[^0-9-]/g, ''));
    else onDigits(raw.replace(/[^0-9]/g, ''));
  };

  let value: string;
  if (decimal) {
    // `type="number"` hanya sah dengan titik desimal.
    value = native ? digits.replace(/,/g, '.') : digits;
  } else if (native) {
    value = digits;
  } else {
    value =
      digits && digits !== '-'
        ? new Intl.NumberFormat('id-ID').format(Number(digits.replace(/[^0-9-]/g, '')))
        : digits;
  }

  return (
    <input
      type={native ? 'number' : 'text'}
      autoComplete="off"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={value}
      onChange={handleChange}
      {...rest}
    />
  );
};
