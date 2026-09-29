import { useState, useCallback } from 'react';
import { formatRupiah } from '../utils/formatters';

/**
 * Privasi angka rupiah: SELALU default tersembunyi, diketuk untuk tampil.
 *
 * State sengaja ephemeral (tidak disimpan ke localStorage): setiap halaman
 * di-mount ulang saat navigasi tab sehingga semua angka otomatis tertutup
 * lagi ketika pengguna pindah halaman.
 */
export function useAmountPrivacy() {
  const [hiddenMap, setHiddenMap] = useState<Record<string, boolean>>({});

  const isHidden = useCallback((id: string) => hiddenMap[id] ?? true, [hiddenMap]);

  const toggleHidden = useCallback((id: string) => {
    setHiddenMap(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }, []);

  /** Paksa daftar id kembali tersembunyi (mis. saat carousel digeser). */
  const hideIds = useCallback((ids: string[]) => {
    setHiddenMap(prev => {
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        if ((next[id] ?? true) !== true) {
          next[id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  /** Tutup semua angka yang pernah dibuka. */
  const hideAll = useCallback(() => {
    setHiddenMap(prev => (Object.keys(prev).length === 0 ? prev : {}));
  }, []);

  const masked = useCallback(
    (id: string, amount: number) => (isHidden(id) ? 'Rp••••••' : formatRupiah(amount)),
    [isHidden]
  );

  return { isHidden, toggleHidden, hideIds, hideAll, masked };
}
