import type { TieredPeriod, Transaction, Debt } from '../types';

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

/**
 * Paksa nilai menjadi rupiah bulat (integer >= 0).
 * Menerima number, string angka ("50000", "Rp 50.000"), desimal, dsb.
 * Mengembalikan 0 untuk nilai tak valid. Ini garis pertahanan agar
 * penjumlahan total (`+=`) tidak pernah berubah menjadi gabungan string
 * dan total header selalu sama dengan jumlah rincian.
 */
export function toRupiahInt(v: unknown): number {
  let n: number;
  if (typeof v === 'string') {
    n = Number(normalizeLooseAmount(v));
  } else {
    n = Number(v);
  }
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), Number.MAX_SAFE_INTEGER);
}

/** Normalisasi string angka gaya Indonesia ("Rp 1.500.000", "10.000,50") ke bentuk parseable. */
function normalizeLooseAmount(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const hasDot = t.includes('.');
  const hasComma = t.includes(',');
  let norm = t.replace(/[^0-9.,\-]/g, '');
  if (hasDot && hasComma) {
    norm = norm.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    norm = /,\d{1,2}$/.test(norm) ? norm.replace(',', '.') : norm.replace(/,/g, '');
  } else if (hasDot) {
    if (/(\.\d{3})+$/.test(norm)) norm = norm.replace(/\./g, '');
  }
  return norm;
}

/**
 * Normalisasi satu transaksi dari sumber tak tepercaya
 * (localStorage lama, cloud vault, file backup, cermin DigiFuel):
 * nominal bulat, jenis valid, tanggal valid, timestamp angka.
 */
export function sanitizeTransaction<T extends Partial<Transaction> & { id?: string }>(t: T): T {
  const c = { ...t } as T & Record<string, unknown>;
  c.amount = toRupiahInt((t as Transaction).amount);
  const type = (t as Transaction).type;
  c.type = type === 'income' || type === 'expense' ? type : 'expense';
  const date = (t as Transaction).date;
  c.date =
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getTodayString();
  const ca = Number((t as Transaction).createdAt);
  const ua = Number((t as Transaction).updatedAt);
  c.createdAt = isFinite(ca) && ca > 0 ? ca : Date.now();
  c.updatedAt = isFinite(ua) && ua > 0 ? ua : Date.now();
  return c as T;
}

/** Buang transaksi cerminan DigiFuel (fitur dihentikan): tak pernah disimpan/dimuat lagi. */
export function stripDigifuelMirror(list: Transaction[]): Transaction[] {
  if (!Array.isArray(list)) return [];
  return list.filter(t => t && t.sourceType !== 'digifuel');
}

/** Normalisasi daftar hutang/piutang (nominal pembayaran & pokok bulat). */
export function sanitizeDebts(list: unknown): Debt[] {
  if (!Array.isArray(list)) return [];
  const out: Debt[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const d = { ...(raw as Debt) };
    if (typeof d.id !== 'string' || !d.id) continue;
    d.totalAmount = toRupiahInt(d.totalAmount);
    d.remainingAmount = toRupiahInt(d.remainingAmount);
    // Sisa nol = lunas (perbaiki status macet dari data lama)
    if (d.remainingAmount <= 0) {
      d.remainingAmount = 0;
      d.status = 'paid';
    }
    if (d.monthlyInstallment !== undefined) {
      d.monthlyInstallment = toRupiahInt(d.monthlyInstallment);
    }
    if (Array.isArray(d.payments)) {
      d.payments = d.payments.map(p => ({ ...p, amount: toRupiahInt(p.amount) }));
    }
    if (Array.isArray(d.tieredPeriods)) {
      d.tieredPeriods = d.tieredPeriods.map(tp => ({
        ...tp,
        monthlyAmount: toRupiahInt(tp.monthlyAmount),
        durationMonths: Math.max(0, Math.floor(Number(tp.durationMonths) || 0)),
      }));
    }
    out.push(d);
  }
  return out;
}

/** Normalisasi daftar transaksi (saring entri rusak, tanpa id dibuang). */
export function sanitizeTransactions(list: unknown): Transaction[] {
  if (!Array.isArray(list)) return [];
  const out: Transaction[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Partial<Transaction> & { id?: unknown };
    if (typeof t.id !== 'string' || !t.id) continue;
    out.push(sanitizeTransaction(t as Transaction) as Transaction);
  }
  return out;
}

/**
 * Bagi transaksi per penulis untuk kartu Keuangan Berdua.
 * - mine: authorUid persis milik saya (atau nama saya bila uid hilang).
 * - partner: authorUid persis milik pasangan (atau nama pasangan bila uid hilang).
 * - unattributed: tanpa authorUid dan tanpa nama yang cocok (data lama).
 * Data lama TIDAK ditebak ke siapa pun agar total per orang jujur.
 * Fallback nama penting agar simetris di kedua HP: bila satu sisi menyimpan
 * uid lokal lama yang tak dikenal sisi lain, nama pencatat tetap mengatribusikan
 * dengan benar.
 */
export function splitTransactionsByAuthor(
  list: Transaction[],
  myUid: string | undefined,
  partnerUid: string | undefined,
  myName?: string | null,
  partnerName?: string | null
): { mine: Transaction[]; partner: Transaction[]; unattributed: Transaction[] } {
  const norm = (s: unknown) => String(s || '').trim().toLowerCase();
  const myN = norm(myName);
  const partnerN = norm(partnerName);
  const mine: Transaction[] = [];
  const partner: Transaction[] = [];
  const unattributed: Transaction[] = [];
  for (const t of list) {
    const auid = t.authorUid || '';
    const aname = norm(t.authorName);
    if (auid && partnerUid && auid === partnerUid) { partner.push(t); continue; }
    if (auid && myUid && auid === myUid) { mine.push(t); continue; }
    if (aname && partnerN && aname === partnerN) { partner.push(t); continue; }
    if (aname && myN && aname === myN) { mine.push(t); continue; }
    unattributed.push(t);
  }
  return { mine, partner, unattributed };
}

/**
 * Pasangan efektif untuk kartu/dropdown Berdua: pasangan tertaut bila ada,
 * bila tidak, diturunkan dari penulis lain yang muncul di transaksi (agar kartu
 * tetap muncul di kedua akun walau memori tautan lokal satu sisi hilang).
 */
export function getEffectivePairPartner(
  pairPartner: { uid: string; email?: string | null; name?: string | null; code?: string } | null,
  transactions: { authorUid?: string; authorName?: string }[],
  myUid: string | undefined
): { uid: string; email: string | null; name: string | null; code: string; derived: boolean } | null {
  if (pairPartner) return { uid: pairPartner.uid, email: pairPartner.email ?? null, name: pairPartner.name ?? null, code: pairPartner.code ?? '', derived: false };
  const counts = new Map<string, { uid: string; name: string; n: number }>();
  for (const t of transactions) {
    const uid = (t.authorUid || '').trim();
    if (!uid || (myUid && uid === myUid)) continue;
    const name = (t.authorName || '').trim() || 'Pasangan';
    const prev = counts.get(uid);
    if (prev) { prev.n += 1; if (!prev.name && name) prev.name = name; }
    else counts.set(uid, { uid, name, n: 1 });
  }
  let best: { uid: string; name: string; n: number } | null = null;
  for (const c of counts.values()) {
    if (!best || c.n > best.n) best = c;
  }
  if (!best) return null;
  return { uid: best.uid, email: null, name: best.name, code: '', derived: true };
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
 * Tanggal jatuh tempo bulanan berikutnya (murni dari string tanggal,
 * agar bisa diuji). Sama persis dengan perilaku getNextDueDate.
 */
export function getNextMonthlyDate(dueDay: number, fromDateStr: string): string {
  const [y, m, d] = fromDateStr.split('-').map(Number);
  const base = new Date(y, (m || 1) - 1 + (d > dueDay ? 1 : 0), 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(Math.max(1, Math.floor(Number(dueDay) || 1)), daysInMonth);
  const yyyy = year;
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Geser tanggal per bulan kalender dengan batas hari (mis. 31 Jan -> 28 Feb). */
export function shiftMonthClamped(dateStr: string, deltaMonths: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(y, (m || 1) - 1 + deltaMonths, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(Math.max(1, d || 1), daysInMonth);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

/**
 * Menghitung tanggal jatuh tempo bulanan berikutnya berdasarkan angka tanggal (1-31)
 */
export function getNextDueDate(dueDay: number): string {
  return getNextMonthlyDate(dueDay, getTodayString());
}

export interface DebtCycleStatus {
  /** Tanggal siklus yang dinilai (bulan berjalan untuk cicilan, dueDate untuk bukan cicilan). */
  judgedDue: string;
  /** Tanggal ditampilkan (siklus mendatang untuk cicilan). */
  displayDue: string;
  /** Jatuh tempo siklus sebelumnya (batas awal jendela pembayaran). */
  prevCycleDue: string;
  /** Tanggal pembayaran terakhir (bila ada). */
  lastPaymentDate: string | null;
  /** True bila siklus ini tertutup pembayaran (atau sudah lunas). */
  covered: boolean;
  /** True bila lewat tempo dan belum tertutup pembayaran. */
  overdue: boolean;
}

/**
 * Status jatuh tempo berbasis SIKLUS + PEMBAYARAN (bukan tanggal saja).
 *
 * Aturan: siklus dinilai lunas (`covered`) bila ada pembayaran dengan
 * tanggal >= jatuh tempo siklus sebelumnya (bayar di muka / tepat waktu /
 * telat wajar). `overdue` hanya bila hari ini melewati tanggal siklus DAN
 * tidak tertutup pembayaran. Yang berstatus lunas / sisa nol tak pernah overdue.
 *
 * Contoh terbukti: jatuh tempo 1 Okt, dibayar 1 Okt, dicek 2 Okt -> covered,
 * tidak overdue. Menunggak beneran (bayar terakhir sebelum siklus lalu)
 * -> tetap overdue.
 */
export function getDebtCycleStatus(
  debt: {
    dueDate: string;
    dueDayOfMonth?: number;
    status: string;
    remainingAmount: number;
    payments: { paymentDate: string }[];
  },
  todayStr: string = getTodayString()
): DebtCycleStatus {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(todayStr) ? todayStr : getTodayString();
  const empty = { judgedDue: '', displayDue: '', prevCycleDue: '', lastPaymentDate: null, covered: false, overdue: false };
  const dueDay = Math.floor(Number(debt.dueDayOfMonth) || 0);
  let judgedDue = '';
  let displayDue = '';
  if (dueDay >= 1 && dueDay <= 31) {
    const [y, m] = t.split('-').map(Number);
    const dimCurr = new Date(y, m, 0).getDate();
    const dd = String(Math.min(Math.max(1, dueDay), dimCurr)).padStart(2, '0');
    judgedDue = `${y}-${String(m).padStart(2, '0')}-${dd}`;
    displayDue = getNextMonthlyDate(dueDay, t);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(debt.dueDate || '')) {
    judgedDue = debt.dueDate;
    displayDue = debt.dueDate;
  } else {
    return empty;
  }
  const prevCycleDue = shiftMonthClamped(judgedDue, -1);
  let last: string | null = null;
  for (const p of debt.payments || []) {
    if (p.paymentDate && (!last || p.paymentDate > last)) last = p.paymentDate;
  }
  const paidOff = debt.status === 'paid' || (Number(debt.remainingAmount) || 0) <= 0;
  const covered = paidOff || (!!last && last >= prevCycleDue);
  const overdue = !covered && t > judgedDue;
  return { judgedDue, displayDue, prevCycleDue, lastPaymentDate: last, covered, overdue };
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

