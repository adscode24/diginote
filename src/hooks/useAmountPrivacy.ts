import { useState, useCallback } from 'react';
import { formatRupiah } from '../utils/formatters';

const HIDE_KEY = 'diginote_hide_amounts_v2';

function loadHidden(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(HIDE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* abaikan */
  }
  return {};
}

/**
 * Privasi angka rupiah: default TERSEMBUNYI, diketuk untuk tampil.
 * Pilihan tersimpan di perangkat.
 */
export function useAmountPrivacy() {
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>(loadHidden);

  const isHidden = useCallback((id: string) => hiddenMap[id] ?? true, [hiddenMap]);

  const toggleHidden = useCallback((id: string) => {
    setHiddenMap(prev => {
      const next = { ...prev, [id]: !(prev[id] ?? true) };
      try {
        localStorage.setItem(HIDE_KEY, JSON.stringify(next));
      } catch {
        /* abaikan */
      }
      return next;
    });
  }, []);

  const masked = useCallback(
    (id: string, amount: number) => (isHidden(id) ? 'Rp••••••' : formatRupiah(amount)),
    [isHidden]
  );

  return { isHidden, toggleHidden, masked };
}
