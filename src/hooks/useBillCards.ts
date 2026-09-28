import { useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { calculateDueDateStatus, getTodayString } from '../utils/formatters';
import type { Bill } from '../types';

export interface BillCard extends Bill {
  paid: boolean;
  dueDateStr: string;
  statusInfo: ReturnType<typeof calculateDueDateStatus>;
  lastPayment: { paymentDate: string; amount: number } | null;
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
    return bills
      .filter(b => b.isActive !== false)
      .map(b => {
        const paid = billPayments.some(p => p.billId === b.id && p.monthKey === currentMonthKey);
        const dueDay = Math.min(Math.max(1, b.dueDayOfMonth || 1), daysInMonth);
        const dueDateStr = `${currentMonthKey}-${String(dueDay).padStart(2, '0')}`;
        const statusInfo = calculateDueDateStatus(dueDateStr);
        const history = billPayments
          .filter(p => p.billId === b.id)
          .sort((x, y) => (x.paymentDate < y.paymentDate ? 1 : -1));
        const last = history[0];
        return {
          ...b,
          paid,
          dueDateStr,
          statusInfo,
          lastPayment: last ? { paymentDate: last.paymentDate, amount: last.amount } : null,
        };
      })
      .sort((a, b) => {
        if (a.paid !== b.paid) return a.paid ? 1 : -1;
        return a.statusInfo.daysRemaining - b.statusInfo.daysRemaining;
      });
  }, [bills, billPayments, currentMonthKey]);
}
