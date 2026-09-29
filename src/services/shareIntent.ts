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

/** Parser fallback (sisi web) untuk teks share saat plugin native tak tersedia. */
export function parseSharedText(text: string): SharedTransactionPrefill | null {
  if (!text || !text.trim()) return null;
  const t = text.trim();

  let amount = 0;
  const rpRe = /(?:Rp\.?|IDR)\s*([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = rpRe.exec(t)) !== null) {
    const v = Number((m[1] || '').replace(/[^\d]/g, '')) || 0;
    if (v > amount) amount = v;
  }
  if (!amount) {
    const numRe = /(?<!\d)(\d[\d.,]{3,})(?!\d)/g;
    while ((m = numRe.exec(t)) !== null) {
      const v = Number((m[1] || '').replace(/[^\d]/g, '')) || 0;
      if (v > amount) amount = v;
    }
    if (amount < 1000) amount = 0;
  }

  const lower = t.toLowerCase();
  const inKw = ['diterima', 'masuk', 'pemasukan', 'credit', 'top up', 'topup', 'gajian', 'gaji', 'refund', 'cashback', 'dana masuk'];
  const outKw = ['bayar', 'pembayaran', 'keluar', 'pengeluaran', 'debit', 'tagihan', 'tarik tunai', 'belanja'];
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
  }

  let categoryHint = '';
  const groups: Array<[string, string[]]> = [
    ['Transport', ['bensin', 'pertamina', 'shell', 'spbu', 'tol', 'parkir', 'grab', 'gojek', 'bengkel']],
    ['Makanan', ['makan', 'minum', 'resto', 'warung', 'kopi', 'kafe', 'cafe', 'kuliner']],
    ['Transfer', ['transfer', 'biaya admin', 'admin bank']],
    ['Belanja', ['belanja', 'shopping', 'mall', 'market', 'indomaret', 'alfamart', 'shopee', 'tokopedia']],
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

  const clean = t.replace(/\s+/g, ' ').trim();
  return {
    amount,
    type,
    categoryHint,
    date,
    description: clean.length > 200 ? clean.substring(0, 200) : clean,
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
      description: typeof res.description === 'string' && res.description ? res.description : (parsed?.description || ''),
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
