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

