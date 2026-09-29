import { Capacitor } from '@capacitor/core';
import type { TransactionType } from '../types';
import { getTodayString } from '../utils/formatters';

export interface SharedTransactionPrefill {
  amount: number;
  type: TransactionType;
  categoryHint: string;
  date: string;
  description: string;
  rawText: string;
  receiptImage?: string;
}

interface NativeSharedData {
  hasData?: boolean;
  amount?: number;
  type?: string;
  categoryHint?: string;
  date?: string;
  description?: string;
  rawText?: string;
  receiptImage?: string;
  error?: string;
}

/**
 * Ubah token angka struk menjadi rupiah bulat.
 * - Abaikan desimal 1-2 digit di belakang (`2,000,000.00` -> 2000000,
 *   `Rp300.000,00` -> 300000, `150,000.00` -> 150000).
 * - Digit berjalan >16 dianggap ID (no. rekening/PAN/NPWP), bukan nominal.
 */
export function parseReceiptAmountToken(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim();
  s = s.replace(/[.,]\d{1,2}$/, '');
  const digits = s.replace(/[^\d]/g, '');
  if (!digits || digits.length > 16) return 0;
  const v = Number(digits);
  return isFinite(v) ? v : 0;
}

const FEE_KEYWORDS = ['biaya', 'admin', 'fee', 'charge'];
const TRANSFER_KEYWORDS = [
  'nominal transfer',
  'top up amount',
  'topup amount',
  'jumlah',
  'nominal',
  'total',
  'bayar',
  'pembayaran',
  'payment',
  'amount',
  'transfer',
  'topup',
  'top up',
];

function keywordHit(context: string, keys: string[]): boolean {
  return keys.some(k => context.includes(k));
}

/** Parser fallback (sisi web) untuk teks share saat plugin native tak tersedia. */
export function parseSharedText(text: string): SharedTransactionPrefill | null {
  if (!text || !text.trim()) return null;
  const t = text.trim();

  // 1. Nominal: kumpulkan semua kandidat Rp/IDR beserta konteks labelnya.
  //    total = nominal transfer + biaya (bila keduanya terdeteksi).
  let transfer = 0;
  let fee = 0;
  let biggestRp = 0;
  const rpRe = /(?:Rp\.?|IDR)\s*(\d[\d.,]*\d|\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = rpRe.exec(t)) !== null) {
    const v = parseReceiptAmountToken(m[1] || '');
    if (v <= 0) continue;
    if (v > biggestRp) biggestRp = v;
    const ctx = t.slice(Math.max(0, (m.index || 0) - 50), m.index || 0).toLowerCase();
    if (keywordHit(ctx, FEE_KEYWORDS)) {
      if (v > fee) fee = v;
    } else if (keywordHit(ctx, TRANSFER_KEYWORDS)) {
      if (v > transfer) transfer = v;
    }
  }
  let amount = transfer > 0 ? transfer : biggestRp;
  // Jangan hitung baris yang sama sebagai biaya (konteks mengandung keduanya)
  if (fee > 0 && fee !== transfer) amount += fee;

  // 2. Fallback bila tanpa label Rp/IDR: angka terbesar yang wajar
  //    (4-13 digit, bukan pecahan tanggal/waktu, bukan ID panjang).
  if (!amount) {
    const numRe = /(?<![\d/:.-])(\d[\d.,]{3,})(?![\d/:.-])/g;
    while ((m = numRe.exec(t)) !== null) {
      const v = parseReceiptAmountToken(m[1] || '');
      if (v >= 1000 && v <= 9999999999999 && v > amount) amount = v;
    }
  }

  const lower = t.toLowerCase();
  const inKw = ['diterima', 'masuk', 'pemasukan', 'credit', 'gajian', 'gaji', 'refund', 'cashback', 'dana masuk'];
  const outKw = ['bayar', 'pembayaran', 'keluar', 'pengeluaran', 'debit', 'tagihan', 'tarik tunai', 'belanja', 'transfer', 'top up', 'topup', 'qris', 'merchant'];
  const hasIn = inKw.some(k => lower.includes(k));
  const hasOut = outKw.some(k => lower.includes(k));
  const type: TransactionType = hasIn && !hasOut ? 'income' : 'expense';

  let date = getTodayString();
  const d1 = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (d1) {
    const dd = d1[1].padStart(2, '0');
    const mm = d1[2].padStart(2, '0');
    let yy = d1[3];
    if (yy.length === 2) yy = '20' + yy;
    date = `${yy}-${mm}-${dd}`;
  } else {
    const d2 = t.match(/(\d{1,2})\s+(jan\w*|feb\w*|mar\w*|apr\w*|mei|may|jun\w*|jul\w*|agu\w*|aug\w*|sep\w*|okt\w*|oct\w*|nov\w*|des\w*|dec\w*)\s+(\d{4})/i);
    if (d2) {
      const months = ['jan', 'feb', 'mar', 'apr', 'mei', 'may', 'jun', 'jul', 'agu', 'aug', 'sep', 'okt', 'oct', 'nov', 'des', 'dec'];
      let mo = months.findIndex(x => d2[2].toLowerCase().startsWith(x));
      if (mo >= 0) {
        const map = [1, 2, 3, 4, 5, 5, 6, 7, 8, 8, 9, 10, 10, 11, 12, 12];
        date = `${d2[3]}-${String(map[mo]).padStart(2, '0')}-${d2[1].padStart(2, '0')}`;
      }
    }
  }

  let categoryHint = '';
  const groups: Array<[string, string[]]> = [
    ['Transport', ['bensin', 'pertamina', 'shell', 'spbu', 'tol', 'parkir', 'grab', 'gojek', 'bengkel']],
    ['Makanan', ['makan', 'minum', 'resto', 'warung', 'kopi', 'kafe', 'cafe', 'kuliner']],
    ['Transfer', ['transfer', 'topup', 'top up', 'flazz', 'e-money', 'emoney', 'biaya admin', 'admin bank']],
    ['Belanja', ['belanja', 'shopping', 'mall', 'market', 'indomaret', 'alfamart', 'shopee', 'tokopedia', 'qris', 'merchant']],
    ['Tagihan', ['listrik', 'pln', 'pdam', 'wifi', 'indihome', 'pulsa', 'kuota', 'internet']],
    ['Kesehatan', ['klinik', 'apotek', 'dokter', 'rumah sakit', 'obat']],
    ['Gaji', ['gaji', 'honor', 'bonus', 'thr']],
  ];
  for (const [name, keys] of groups) {
    if (keys.some(k => lower.includes(k))) {
      categoryHint = name;
      break;
    }
  }

  // Kolom keterangan TIDAK diisi otomatis — pengguna mengisi sendiri.
  return {
    amount,
    type,
    categoryHint,
    date,
    description: '',
    rawText: t.length > 2000 ? t.substring(0, 2000) : t,
  };
}

async function readNativeSharedData(): Promise<SharedTransactionPrefill | null> {
  try {
    if (Capacitor.getPlatform() === 'web') return null;
    const plugin = Capacitor.registerPlugin<{
      getSharedData: (o?: object) => Promise<NativeSharedData>;
      clearSharedData: (o?: object) => Promise<unknown>;
    }>('ShareReceiver');
    const res = await plugin.getSharedData({});
    if (!res || !res.hasData) return null;
    const rawText = typeof res.rawText === 'string' ? res.rawText : '';
    const parsed = rawText ? parseSharedText(rawText) : null;
    const amount = Number(res.amount) > 0 ? Number(res.amount) : (parsed?.amount || 0);
    const type: TransactionType = res.type === 'income' || res.type === 'expense' ? res.type : (parsed?.type || 'expense');
    const date = typeof res.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(res.date) ? res.date : (parsed?.date || getTodayString());
    return {
      amount,
      type,
      categoryHint: typeof res.categoryHint === 'string' ? res.categoryHint : (parsed?.categoryHint || ''),
      date,
      description: '',
      rawText,
      receiptImage: typeof res.receiptImage === 'string' ? res.receiptImage : undefined,
    };
  } catch {
    return null;
  }
}

export async function consumeSharedTransaction(): Promise<SharedTransactionPrefill | null> {
  // 1. Mode uji di browser: ?shareText=... (tanpa plugin native)
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('shareText');
    if (q) {
      url.searchParams.delete('shareText');
      window.history.replaceState({}, '', url.toString());
      return parseSharedText(decodeURIComponent(q));
    }
  } catch {
    /* abaikan */
  }
  // 2. Native (APK): baca dari plugin lalu bersihkan agar tidak terbuka dua kali
  const data = await readNativeSharedData();
  if (data) {
    try {
      if (Capacitor.getPlatform() !== 'web') {
        const plugin = Capacitor.registerPlugin<{ clearSharedData: (o?: object) => Promise<unknown> }>('ShareReceiver');
        await plugin.clearSharedData({});
      }
    } catch {
      /* abaikan */
    }
  }
  return data;
}
