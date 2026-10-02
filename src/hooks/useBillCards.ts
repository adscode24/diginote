import { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { calculateDueDateStatus, getTodayString } from '../utils/formatters';
import type { Bill } from '../types';

export interface BillCard extends Bill {
  paid: boolean;
  dueDateStr: string;
  statusInfo: ReturnType<typeof calculateDueDateStatus>;
  lastPayment: { paymentDate: string; amount: number } | null;
  /** True bila hitung mundur perlu ditampilkan (<8 hari atau lewat tempo & belum bayar). */
  showCountdown: boolean;
  /** Teks badge: hitung mundur, atau netral bila masih jauh. */
  badgeLabel: string;
}

/**
 * Kartu tagihan rutin bulan berjalan, diurut berdasarkan jatuh tempo terdekat
 * (lewat tempo paling urgent di atas, yang sudah lunas di bawah).
 */
export function useBillCards(): BillCard[] {
  const { bills, billPayments } = useFinance();
  const today = getTodayString();
  const currentMonthKey = today.substring(0, 7);

  return useMemo(() => {
    const [cy, cm] = currentMonthKey.split('-').map(Number);
    const daysInMonth = new Date(cy, cm, 0).getDate();
    // Siklus sebelumnya (untuk mengenali bayar di muka / tepat waktu)
    const pcm = cm === 1 ? 12 : cm - 1;
    const pcy = cm === 1 ? cy - 1 : cy;
    const prevDays = new Date(pcy, pcm, 0).getDate();
    return bills
      .filter(b => b.isActive !== false)
      .map(b => {
        const dueDay = Math.min(Math.max(1, b.dueDayOfMonth || 1), daysInMonth);
        const dueDateStr = `${currentMonthKey}-${String(dueDay).padStart(2, '0')}`;
        const prevDay = Math.min(dueDay, prevDays);
        const prevDueStr = `${pcy}-${String(pcm).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;
        // Lunas bila: ada pembayaran di bulan berjalan (termasuk telat di bulan
        // yang sama) ATAU ada pembayaran sejak jatuh tempo siklus lalu sampai
        // jatuh tempo siklus ini (bayar di muka / tepat waktu).
        const paid = billPayments.some(
          p =>
            p.billId === b.id &&
            (p.monthKey === currentMonthKey ||
              (!!p.paymentDate && p.paymentDate >= prevDueStr && p.paymentDate <= dueDateStr))
        );
        const current = calculateDueDateStatus(dueDateStr);
        // Sudah dibayar bulan ini -> tidak dianggap lewat; hitung mundur ke siklus depan.
        let statusInfo = current;
        if (paid) {
          const ny = cm === 12 ? cy + 1 : cy;
          const nm = cm === 12 ? 1 : cm + 1;
          const nextDays = new Date(ny, nm, 0).getDate();
          const nextDay = Math.min(dueDay, nextDays);
          const nextStr = `${ny}-${String(nm).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
          statusInfo = calculateDueDateStatus(nextStr);
        }
        const showCountdown = !paid && (statusInfo.isOverdue || statusInfo.daysRemaining < 8);
        const badgeLabel = showCountdown
          ? statusInfo.label
          : paid
          ? `Jatuh tempo ${statusInfo.daysRemaining} hari lagi`
          : `Tgl ${dueDay} tiap bulan`;
        const history = billPayments
          .filter(p => p.billId === b.id)
          .sort((x, y) => (x.paymentDate < y.paymentDate ? 1 : -1));
        const last = history[0];
        return {
          ...b,
          paid,
          dueDateStr,
          statusInfo,
          showCountdown,
          badgeLabel,
          lastPayment: last ? { paymentDate: last.paymentDate, amount: last.amount } : null,
        };
      })
      .sort((a, b) => {
        if (a.paid !== b.paid) return a.paid ? 1 : -1;
        return a.statusInfo.daysRemaining - b.statusInfo.daysRemaining;
      });
  }, [bills, billPayments, currentMonthKey]);
}
