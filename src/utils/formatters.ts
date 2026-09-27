import type { TieredPeriod } from '../types';

export function formatRupiah(amount: number, withPrefix = true): string {
  const rounded = Math.round(amount || 0);
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(Math.abs(rounded));

  const prefix = withPrefix ? 'Rp ' : '';
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${prefix}${formatted}`;
}

export function formatCompactRupiah(amount: number): string {
  const abs = Math.abs(amount || 0);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace('.0', '')} M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace('.0', '')} jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${(abs / 1_000).toFixed(0)} rb`;
  }
  return formatRupiah(amount);
}

export function formatDateIndo(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function formatMonthYearIndo(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DueDateStatus {
  label: string;
  isOverdue: boolean;
  isDueSoon: boolean;
  daysRemaining: number;
}

export function calculateDueDateStatus(dueDateStr: string): DueDateStatus {
  if (!dueDateStr) {
    return { label: 'Tidak ada tenggat', isOverdue: false, isDueSoon: false, daysRemaining: 999 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = dueDateStr.split('-').map(Number);
  const due = new Date(year, month - 1, day);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: `Lewat ${Math.abs(diffDays)} hari`,
      isOverdue: true,
      isDueSoon: false,
      daysRemaining: diffDays,
    };
  } else if (diffDays === 0) {
    return {
      label: 'Jatuh tempo hari ini!',
      isOverdue: false,
      isDueSoon: true,
      daysRemaining: 0,
    };
  } else if (diffDays <= 3) {
    return {
      label: `${diffDays} hari lagi`,
      isOverdue: false,
      isDueSoon: true,
      daysRemaining: diffDays,
    };
  } else {
    return {
      label: `${diffDays} hari lagi`,
      isOverdue: false,
      isDueSoon: false,
      daysRemaining: diffDays,
    };
  }
}

/**
 * Menghitung tanggal jatuh tempo bulanan berikutnya berdasarkan angka tanggal (1-31)
 */
export function getNextDueDate(dueDay: number): string {
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth(); // 0-indexed

  if (today.getDate() > dueDay) {
    month += 1;
  }

  // Tentukan jumlah hari maksimal di bulan target (agar tanggal 31 di Februari tidak crash)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(Math.max(1, dueDay), daysInMonth);
  const nextDate = new Date(year, month, clampedDay);

  const yyyy = nextDate.getFullYear();
  const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
  const dd = String(nextDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Menghitung estimasi tanggal cicilan lunas berdasarkan tanggal jatuh tempo dan sisa tenor
 */
export function calculatePayoffDate(dueDay: number, remainingTenor: number): { dateStr: string; formatted: string } {
  if (!remainingTenor || remainingTenor <= 0) {
    return { dateStr: '', formatted: '-' };
  }

  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth();

  // Jika tanggal hari ini sudah melewati tanggal jatuh tempo, cicilan pertama tenor dimulai bulan depan
  if (today.getDate() > dueDay) {
    month += 1;
  }

  // Cicilan terakhir adalah (remainingTenor - 1) bulan setelah cicilan berikutnya
  month += (remainingTenor - 1);

  // Buat objek Date dan sesuaikan tanggal
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;

  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(Math.max(1, dueDay), daysInMonth);
  const payoffDate = new Date(targetYear, targetMonth, clampedDay);

  const yyyy = payoffDate.getFullYear();
  const mm = String(payoffDate.getMonth() + 1).padStart(2, '0');
  const dd = String(payoffDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const formatted = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(payoffDate);

  return { dateStr, formatted };
}

/**
 * Menentukan index periode bunga aktif berdasarkan jumlah cicilan yang sudah dibayar.
 * Periode dihitung berurutan sesuai durasi masing-masing (dalam bulan).
 * Jika sudah melewati semua periode, gunakan periode terakhir.
 * Return -1 jika tidak ada periode yang valid.
 */
export function getActiveTierPeriodIndex(periods: TieredPeriod[] | undefined, paidCount: number): number {
  if (!periods || periods.length === 0) return -1;
  const elapsed = Math.max(0, Math.floor(paidCount));
  let cumulative = 0;
  for (let i = 0; i < periods.length; i++) {
    const duration = Math.max(0, Math.floor(Number(periods[i]?.durationMonths) || 0));
    cumulative += duration;
    if (elapsed < cumulative) return i;
  }
  return periods.length - 1;
}

/**
 * Mengambil suku bunga (% p.a.) periode aktif.
 * Return undefined jika tidak ada periode / bunga yang valid (= pakai perilaku lama).
 */
export function getActiveTierRate(periods: TieredPeriod[] | undefined, paidCount: number): number | undefined {
  const idx = getActiveTierPeriodIndex(periods, paidCount);
  if (idx < 0 || !periods) return undefined;
  const rate = Number(periods[idx]?.interestRate);
  if (!isFinite(rate) || rate < 0) return undefined;
  return rate;
}

export interface TieredPaymentResult {
  interestPortion: number; // porsi cicilan untuk bunga bulan berjalan (Rp, dibulatkan)
  principalPortion: number; // porsi cicilan yang memotong pokok (Rp, dibulatkan, bisa negatif)
  remainingAfter: number; // sisa pokok setelah pembayaran (Rp, dibulatkan, >= 0)
  isFullPayoff: boolean; // true jika pembayaran melunasi seluruh sisa pokok
}

/**
 * Menghitung sisa pokok hutang cicilan berjangka setelah satu pembayaran.
 *
 * Rumus: sisa_baru = a - (c - ((a * b) / 12))
 *   a = sisa pokok sebelum dibayar (Rp)
 *   b = suku bunga periode aktif (% p.a., mis. 5 untuk 5%)
 *   c = nominal cicilan yang dibayar (Rp)
 *
 * Contoh: a=10.000.000, b=5, c=500.000
 *   bunga = 10.000.000*5%/12 = 41.667
 *   sisa = 10.000.000 - (500.000-41.667) = 9.541.667
 *
 * Aturan khusus:
 * - Jika nominal >= sisa pokok (bayar lunas), sisa menjadi 0.
 * - Jika cicilan < bunga berjalan, pokok bertambah (kapitalisasi bunga, seperti KPR riil).
 */
export function calculateTieredPayment(
  principalBefore: number,
  annualRatePct: number,
  paymentAmount: number
): TieredPaymentResult {
  const a = Math.max(0, Math.round(principalBefore));
  const c = Math.max(0, Math.round(paymentAmount));
  const b = Number(annualRatePct) || 0;

  if (a === 0) {
    return { interestPortion: 0, principalPortion: 0, remainingAfter: 0, isFullPayoff: true };
  }

  // Bayar lunas: nominal menutup seluruh sisa pokok -> hutang selesai.
  if (c >= a) {
    const interestPortion = Math.round((a * b) / 100 / 12);
    return { interestPortion, principalPortion: a, remainingAfter: 0, isFullPayoff: true };
  }

  const interestPortion = Math.round((a * b) / 100 / 12);
  const principalPortion = c - interestPortion;
  const remainingAfter = Math.max(0, a - principalPortion);
  return { interestPortion, principalPortion, remainingAfter, isFullPayoff: remainingAfter === 0 };
}

