import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  Transaction,
  Category,
  Account,
  Debt,
  DebtStatus,
  DebtPayment,
  Bill,
  BillPayment,
  FinanceSummary,
  ReminderSettings,
  SyncSettings,
  ThemeMode,
} from '../types';
import { ALL_DEFAULT_CATEGORIES } from '../utils/constants';
import { getTodayString, calculatePayoffDate, getNextDueDate, getActiveTierRate, calculateTieredPayment, TieredPaymentResult, toRupiahInt, sanitizeTransactions, sanitizeDebts } from '../utils/formatters';
import { generateVaultId, hashPassphrase } from '../services/crypto';
import { exportEncryptedBackup, importEncryptedBackup, type SyncPayload } from '../services/sync';
import { isCloudEnabled, isCloudCapableUid } from '../services/firebase';
import { getActiveEmail } from './AuthContext';
import {
  ensureUserVault,
  pushVault,
  fetchVault,
  type CloudVault,
  type VaultPayload,
  type VaultOwner,
} from '../services/cloudSync';
import {
  getDigifuelLink,
  fetchDigifuelVault,
  persistDigifuelLink,
  subscribeDigifuelVault,
} from '../services/digifuel';

interface FinanceContextType {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  debts: Debt[];
  bills: Bill[];
  billPayments: BillPayment[];
  summary: FinanceSummary;
  reminderSettings: ReminderSettings;
  syncSettings: SyncSettings;
  themeMode: ThemeMode;

  // Transaction mutations
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Transaction;
  updateTransaction: (id: string, tx: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  // Account / Sumber Dana mutations
  addAccount: (acc: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => Account;
  updateAccount: (id: string, acc: Partial<Account>) => void;
  adjustAccountBalance: (id: string, newBalance: number, reason?: string) => void;
  deleteAccount: (id: string) => void;

  // Category mutations
  addCategory: (cat: Omit<Category, 'id'>) => Category;
  updateCategory: (id: string, cat: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  // Debt mutations
  addDebt: (debt: Omit<Debt, 'id' | 'remainingAmount' | 'status' | 'payments' | 'createdAt' | 'updatedAt'>) => Debt;
  updateDebt: (id: string, debt: Partial<Debt>) => void;
  deleteDebt: (id: string) => void;
  payDebt: (
    debtId: string,
    amount: number,
    paymentDate: string,
    notes: string,
    receiptImage?: string,
    accountId?: string
  ) => { payment: DebtPayment; transaction: Transaction; breakdown?: TieredPaymentResult & { annualRate: number } };
  deleteDebtPayment: (debtId: string, paymentId: string) => void;

  // Sinkronisasi cloud (Fuel-Traxr style: vault terstruktur + realtime)
  syncStatus: 'offline' | 'connecting' | 'syncing' | 'synced' | 'error';
  lastSyncedAt: number | null;
  syncNotice: { text: string; action: 'pull' | null } | null;
  clearSyncNotice: () => void;
  cloudVaultId: string | null;
  pushToVaultNow: () => Promise<boolean>;
  pullFromVaultNow: () => Promise<boolean>;

  // Tagihan Rutin
  addBill: (bill: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>) => Bill;
  updateBill: (id: string, bill: Partial<Bill>) => void;
  deleteBill: (id: string) => void;
  payBill: (billId: string, payment: { monthKey: string; amount: number; accountId?: string; categoryId: string; paymentDate: string }) => BillPayment;
  deleteBillPayment: (paymentId: string) => void;

  // Integrasi DigiFuel (cermin satu arah -> transaksi keluar)
  pullDigifuelNow: () => Promise<{ mirrored: number; removed: number; diag: string }>;

  // Settings & Theme
  setThemeMode: (mode: ThemeMode) => void;
  updateReminderSettings: (settings: Partial<ReminderSettings>) => void;
  updateSyncSettings: (settings: Partial<SyncSettings>) => void;

  // Cloud Sync & Backup
  exportBackupFile: (passphrase: string) => Promise<void>;
  importBackupFile: (file: File, passphrase: string) => Promise<boolean>;
  resetToDefaultData: () => void;
  clearAllData: () => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

const STORAGE_KEYS = {
  TRANSACTIONS: 'diginote_transactions_v2',
  CATEGORIES: 'diginote_categories_v2',
  ACCOUNTS: 'diginote_accounts_v2',
  DEBTS: 'diginote_debts_v2',
  REMINDERS: 'diginote_reminders_v2',
  SYNC: 'diginote_sync_v2',
  THEME: 'diginote_theme_v2',
};

// Legacy keys from before the Notaku -> DigiNote rename.
// Read once and migrated automatically so existing users keep their data.
const LEGACY_STORAGE_KEYS = {
  TRANSACTIONS: 'notaku_transactions_v2',
  CATEGORIES: 'notaku_categories_v2',
  ACCOUNTS: 'notaku_accounts_v2',
  DEBTS: 'notaku_debts_v2',
  REMINDERS: 'notaku_reminders_v2',
  SYNC: 'notaku_sync_v2',
  THEME: 'notaku_theme_v2',
};

function readStoredKey(newKey: string, ...legacyKeys: string[]): string | null {
  try {
    const current = localStorage.getItem(newKey);
    if (current) return current;
    for (const legacyKey of legacyKeys) {
      if (!legacyKey) continue;
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        localStorage.setItem(newKey, legacy);
        localStorage.removeItem(legacyKey);
        return legacy;
      }
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

/**
 * Menghitung ulang sisa pokok hutang cicilan berjangka dengan me-replay
 * seluruh pembayaran kronologis memakai rumus sisa = a - (c - ((a*b)/12)).
 * Dipakai setelah hapus/edit agar konsisten dengan logika bayar.
 */
function replayTieredRemaining(
  totalAmount: number,
  periods: Debt['tieredPeriods'],
  payments: Pick<DebtPayment, 'amount' | 'paymentDate' | 'createdAt'>[],
  totalTenor: number | undefined,
  currentRemainingTenor: number | undefined
): number {
  const chronological = [...payments].sort((x, y) =>
    x.paymentDate === y.paymentDate ? x.createdAt - y.createdAt : x.paymentDate < y.paymentDate ? -1 : 1
  );
  // Offset = cicilan yang sudah lunas sebelum periode terlacak:
  // totalTenor - (sisa tenor saat ini + jumlah pembayaran tercatat)
  const elapsedOffset =
    typeof totalTenor === 'number' && typeof currentRemainingTenor === 'number'
      ? Math.max(0, totalTenor - currentRemainingTenor - chronological.length)
      : 0;
  let balance = Math.max(0, Math.round(totalAmount));
  chronological.forEach((p, i) => {
    const rate = getActiveTierRate(periods, elapsedOffset + i);
    if (rate !== undefined && rate > 0) {
      balance = calculateTieredPayment(balance, rate, p.amount).remainingAfter;
    } else {
      balance = Math.max(0, balance - p.amount);
    }
  });
  return balance;
}

// Kunci penyimpanan per pengguna (isolasi data tiap akun login).
// Untuk kompatibilitas, baca juga kunci global lama lalu migrasikan.
function buildStorageKeys(userId: string) {
  const prefix = 'diginote_' + userId;
  return {
    TRANSACTIONS: prefix + '_transactions_v2',
    CATEGORIES: prefix + '_categories_v2',
    ACCOUNTS: prefix + '_accounts_v2',
    DEBTS: prefix + '_debts_v2',
    BILLS: prefix + '_bills_v2',
    BILL_PAYMENTS: prefix + '_bill_payments_v2',
    REMINDERS: prefix + '_reminders_v2',
    SYNC: prefix + '_sync_v2',
    // Tema adalah preferensi perangkat (tidak per pengguna)
    THEME: 'diginote_theme_v2',
  };
}

// Kunci global era sebelum login multi-akun (dimigrasikan otomatis).
const LEGACY_GLOBAL_KEYS: Record<string, string> = {
  TRANSACTIONS: 'diginote_transactions_v2',
  CATEGORIES: 'diginote_categories_v2',
  ACCOUNTS: 'diginote_accounts_v2',
  DEBTS: 'diginote_debts_v2',
  REMINDERS: 'diginote_reminders_v2',
  SYNC: 'diginote_sync_v2',
};

export const FinanceProvider: React.FC<{ children: React.ReactNode; userId: string }> = ({ children, userId }) => {
  const STORAGE_KEYS = buildStorageKeys(userId);
  // 1. Accounts / Sumber Dana State (kosong secara default, pengguna buat sendiri)
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.ACCOUNTS, LEGACY_GLOBAL_KEYS.ACCOUNTS, LEGACY_STORAGE_KEYS.ACCOUNTS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // 2. Transactions State (tanpa data contoh; selalu disanitasi agar
  // nominal string/desimal dari data lama tidak merusak penjumlahan total)
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.TRANSACTIONS, LEGACY_GLOBAL_KEYS.TRANSACTIONS, LEGACY_STORAGE_KEYS.TRANSACTIONS);
      if (stored) return sanitizeTransactions(JSON.parse(stored));
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // 3. Categories State (kategori bawaan tetap ada sebagai master)
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.CATEGORIES, LEGACY_GLOBAL_KEYS.CATEGORIES, LEGACY_STORAGE_KEYS.CATEGORIES);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return [...ALL_DEFAULT_CATEGORIES];
  });

  // 4. Debts State (tanpa data contoh; disanitasi seperti transaksi)
  const [debts, setDebts] = useState<Debt[]>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.DEBTS, LEGACY_GLOBAL_KEYS.DEBTS, LEGACY_STORAGE_KEYS.DEBTS);
      if (stored) return sanitizeDebts(JSON.parse(stored));
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // 5. Reminder Settings
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.REMINDERS, LEGACY_GLOBAL_KEYS.REMINDERS, LEGACY_STORAGE_KEYS.REMINDERS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return { enabled: true, time: '20:00' };
  });

  // 6. Sync Settings
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.SYNC, LEGACY_GLOBAL_KEYS.SYNC, LEGACY_STORAGE_KEYS.SYNC);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return {
      vaultId: generateVaultId(),
      isEncrypted: true,
      autoSync: false,
    };
  });

  // 8. Tagihan Rutin (Recurring Bills)
  const [bills, setBills] = useState<Bill[]>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.BILLS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // 9. Riwayat Pembayaran Tagihan Rutin
  const [billPayments, setBillPayments] = useState<BillPayment[]>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.BILL_PAYMENTS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // 7. Theme State
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const stored = readStoredKey(STORAGE_KEYS.THEME, LEGACY_STORAGE_KEYS.THEME);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch (e) {
      console.error(e);
    }
    return 'system';
  });

  // ---- Cloud Vault lintas perangkat (pola Fuel-Traxr) ----
  // Satu email = satu vault (digiVaults/{uid}); login email sama di HP lain
  // membuka data yang sama. Tanpa passphrase: keamanan = Auth + Rules.
  const cloudEnabled = isCloudEnabled();
  const [syncStatus, setSyncStatus] = useState<'offline' | 'connecting' | 'syncing' | 'synced' | 'error'>(
    'offline'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncNotice, setSyncNotice] = useState<{ text: string; action: 'pull' | null } | null>(null);
  const [cloudVaultId, setCloudVaultId] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const justAppliedRef = React.useRef(false);
  const pushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const getStoredBase = () => {
    try {
      return localStorage.getItem(`diginote_${userId}_vault_base`) || '';
    } catch {
      return '';
    }
  };
  const persistBase = (v: string) => {
    try {
      localStorage.setItem(`diginote_${userId}_vault_base`, v);
    } catch (e) {
      console.error(e);
    }
  };

  const vaultOwner = (email?: string | null): VaultOwner => ({
    uid: userId,
    email: email ?? null,
  });

  const applyCloudVault = (vault: CloudVault) => {
    // Foto struk tidak ikut ke cloud (lihat sanitizeForFirestore) — sambung ulang
    // foto lokal berdasarkan ID agar tidak hilang saat pull.
    const localTxById = new Map(transactions.map(t => [t.id, t]));
    const localPayById = new Map(
      debts.flatMap(d => (d.payments || []).map(p => [`${d.id}:${p.id}`, p]))
    );
    if (Array.isArray(vault.transactions)) {
      setTransactions(
        sanitizeTransactions(
          vault.transactions.map(t => {
            const local = localTxById.get(t.id);
            if (local?.receiptUrl && !t.receiptUrl) return { ...t, receiptUrl: local.receiptUrl };
            return t;
          })
        )
      );
    }
    if (Array.isArray(vault.categories) && vault.categories.length > 0)
      setCategories(vault.categories);
    if (Array.isArray(vault.accounts)) setAccounts(vault.accounts);
    if (Array.isArray(vault.debts)) {
      setDebts(
        sanitizeDebts(
          vault.debts.map(d => ({
            ...d,
            payments: (d.payments || []).map(p => {
              const local = localPayById.get(`${d.id}:${p.id}`);
              if (local?.receiptImage && !p.receiptImage)
                return { ...p, receiptImage: local.receiptImage };
              return p;
            }),
          }))
        )
      );
    }
    if (Array.isArray(vault.bills)) setBills(vault.bills);
    if (Array.isArray(vault.billPayments)) setBillPayments(vault.billPayments);
    if (vault.reminderSettings) setReminderSettings(vault.reminderSettings);
    setLastSyncedAt(Date.now());
  };

  const readLegacyGlobalState = (): VaultPayload | null => {
    try {
      const pick = <T,>(base: string): T | undefined => {
        for (const k of [`diginote_${base}`, `notaku_${base}`]) {
          const raw = localStorage.getItem(k);
          if (raw) return JSON.parse(raw) as T;
        }
        return undefined;
      };
      const data: VaultPayload = {
        transactions: pick<Transaction[]>('transactions_v2') ?? [],
        categories: pick<Category[]>('categories_v2') ?? [],
        accounts: pick<Account[]>('accounts_v2') ?? [],
        debts: pick<Debt[]>('debts_v2') ?? [],
        bills: [],
        billPayments: [],
        reminderSettings: pick<ReminderSettings>('reminders_v2') ?? { enabled: true, time: '20:00' },
      };
      const hasData = [data.transactions, data.accounts, data.debts].some(
        v => Array.isArray(v) && v.length > 0
      );
      return hasData ? data : null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const currentEmail = (): string | null => getActiveEmail();

  // Setup vault per akun Firebase asli (satu kali per login) + tarik terbaru saat buka aplikasi.
  // Akun lokal/offline (user_...) tetap offline-only dan tidak menyentuh cloud.
  useEffect(() => {
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    justAppliedRef.current = false;

    if (!cloudEnabled || !isCloudCapableUid(userId)) {
      setCloudVaultId(null);
      setSyncStatus('offline');
      setSyncErrorMsg(null);
      setLastSyncedAt(null);
      return;
    }

    let cancelled = false;

    setSyncStatus(navigator.onLine ? 'connecting' : 'offline');
    setSyncErrorMsg(null);

    (async () => {
      try {
        // Data lokal perangkat ini sebagai modal awal jika vault belum ada di cloud.
        // Termasuk migrasi sekali dari kunci global lama agar data tidak hilang.
        const scopedEmpty =
          transactions.length === 0 &&
          accounts.length === 0 &&
          debts.length === 0 &&
          bills.length === 0 &&
          billPayments.length === 0;
        const legacy = scopedEmpty ? readLegacyGlobalState() : null;
        const localSnapshot: VaultPayload = legacy ?? {
          transactions,
          categories,
          accounts,
          debts,
          bills,
          billPayments,
          reminderSettings,
        };
        if (legacy) {
          if (legacy.transactions.length > 0) setTransactions(sanitizeTransactions(legacy.transactions));
          if (legacy.categories.length > 0) setCategories(legacy.categories);
          if (legacy.accounts.length > 0) setAccounts(legacy.accounts);
          if (legacy.debts.length > 0) setDebts(sanitizeDebts(legacy.debts));
          if (legacy.reminderSettings) setReminderSettings(legacy.reminderSettings);
          setSyncNotice({ text: 'Data lama perangkat ini dimuat dan akan disinkronkan ke cloud.', action: null });
        }

        const owner = vaultOwner(currentEmail());
        const vault = await ensureUserVault(owner, localSnapshot);
        if (cancelled) return;
        setCloudVaultId(vault.vaultCode || '');
        setLastSyncedAt(Date.now());

        // Otomatis tersinkron ke data terbaru setiap buka aplikasi:
        // bila cloud lebih baru dari terakhir yang kita selaraskan, pakai cloud.
        const storedBase = getStoredBase();
        const localEmpty =
          localSnapshot.transactions.length === 0 &&
          localSnapshot.accounts.length === 0 &&
          localSnapshot.debts.length === 0 &&
          localSnapshot.bills.length === 0 &&
          localSnapshot.billPayments.length === 0;
        const cloudHasData =
          vault.transactions.length > 0 ||
          vault.debts.length > 0 ||
          vault.bills.length > 0 ||
          vault.billPayments.length > 0;
        if (cloudHasData && (localEmpty || (vault.updatedAt && vault.updatedAt > storedBase))) {
          justAppliedRef.current = true;
          applyCloudVault(vault);
          persistBase(vault.updatedAt || '');
          if (!localEmpty) {
            setSyncNotice({ text: 'Data terbaru dari cloud dimuat.', action: null });
          }
        } else {
          persistBase(vault.updatedAt || storedBase);
        }

        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = (err as Error)?.message || 'Gagal menghubungkan cloud.';
        if (!navigator.onLine) {
          setSyncStatus('offline');
          setSyncErrorMsg(null);
        } else {
          setSyncStatus('error');
          setSyncErrorMsg(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /**
   * Push manual: kirim seluruh data lokal ke cloud SEKARANG (via Pengaturan).
   */
  const pushToVaultNow = useCallback(async (): Promise<boolean> => {
    if (!cloudEnabled || !isCloudCapableUid(userId) || !cloudVaultId) return false;
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return false;
    }
    setSyncStatus('syncing');
    try {
      const updatedAt = await pushVault(vaultOwner(currentEmail()), cloudVaultId, {
        transactions,
        categories,
        accounts,
        debts,
        bills,
        billPayments,
        reminderSettings,
      });
      setLastSyncedAt(Date.now());
      setSyncStatus('synced');
      setSyncErrorMsg(null);
      setSyncNotice({ text: 'Data berhasil disinkronkan ke cloud.', action: null });
      persistBase(updatedAt);
      return true;
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Gagal sinkron ke cloud.';
      setSyncStatus('error');
      setSyncErrorMsg(msg);
      setSyncNotice({ text: msg, action: null });
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, userId, transactions, accounts, debts, categories, bills, billPayments, reminderSettings, cloudVaultId]);

  /**
   * Pull manual: tarik data terbaru dari cloud SEKARANG (via Pengaturan).
   */
  const pullFromVaultNow = useCallback(async (): Promise<boolean> => {
    if (!cloudEnabled || !isCloudCapableUid(userId)) return false;
    setSyncStatus('syncing');
    try {
      const remote = await fetchVault(userId);
      if (!remote) {
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
        return false;
      }
      if (remote.vaultCode) setCloudVaultId(remote.vaultCode);
      applyCloudVault(remote);
      setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      setSyncErrorMsg(null);
      setSyncNotice(null);
      return true;
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Gagal menarik data dari cloud.';
      setSyncStatus('error');
      setSyncErrorMsg(msg);
      setSyncNotice({ text: msg, action: null });
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, userId]);

  const clearSyncNotice = () => setSyncNotice(null);

  // Otomatis menyimpan ke cloud setiap ada data baru (debounced, pola Fuel-Traxr).
  // Aman dari freeze: payload terstruktur kecil (tanpa foto), tanpa listener realtime.
  useEffect(() => {
    if (!cloudEnabled || !isCloudCapableUid(userId)) return;
    if (!cloudVaultId) return;
    if (justAppliedRef.current) {
      justAppliedRef.current = false;
      return;
    }
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(async () => {
      pushTimerRef.current = null;
      if (!navigator.onLine) {
        setSyncStatus('offline');
        return;
      }
      setSyncStatus('syncing');
      try {
        const updatedAt = await pushVault(vaultOwner(currentEmail()), cloudVaultId, {
          transactions,
          categories,
          accounts,
          debts,
          bills,
          billPayments,
          reminderSettings,
        });
        persistBase(updatedAt);
        setLastSyncedAt(Date.now());
        setSyncStatus('synced');
        setSyncErrorMsg(null);
      } catch (err: unknown) {
        const msg = (err as Error)?.message || 'Gagal sinkron ke cloud.';
        if (!navigator.onLine) {
          setSyncStatus('offline');
          setSyncErrorMsg(null);
        } else {
          setSyncStatus('error');
          setSyncErrorMsg(msg);
        }
      }
    }, 1500);
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, accounts, debts, categories, bills, billPayments, reminderSettings, cloudVaultId, userId]);

  // Penyimpanan lokal: SATU effect debounce (anti-freeze).
  // Alasan: foto struk base64 membuat state bermegabyte; stringify + setItem
  // sinkron 8x tiap perubahan mengunci UI. Debounce menggabungkan burst
  // (mis. apply pull) menjadi satu tulis. Bila quota penuh, ulangi tanpa foto
  // agar data keuangan selalu tersimpan.
  useEffect(() => {
    const timer = setTimeout(() => {
      const pairs: [string, unknown][] = [
        [STORAGE_KEYS.ACCOUNTS, accounts],
        [STORAGE_KEYS.TRANSACTIONS, transactions],
        [STORAGE_KEYS.CATEGORIES, categories],
        [STORAGE_KEYS.DEBTS, debts],
        [STORAGE_KEYS.BILLS, bills],
        [STORAGE_KEYS.BILL_PAYMENTS, billPayments],
        [STORAGE_KEYS.REMINDERS, reminderSettings],
        [STORAGE_KEYS.SYNC, syncSettings],
      ];
      try {
        for (const [key, value] of pairs) {
          localStorage.setItem(key, JSON.stringify(value));
        }
      } catch (e) {
        console.error('localStorage penuh, simpan ulang tanpa foto:', e);
        try {
          const stripPhotos = (v: unknown): unknown =>
            JSON.parse(
              JSON.stringify(v, (k, val) =>
                typeof val === 'string' && val.startsWith('data:') ? undefined : val
              )
            );
          for (const [key, value] of pairs) {
            localStorage.setItem(key, JSON.stringify(stripPhotos(value)));
          }
        } catch (e2) {
          console.error(e2);
        }
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, transactions, categories, debts, bills, billPayments, reminderSettings, syncSettings]);

  // Robust Dark / Light / System Theme Management
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, themeMode);
    } catch (e) {
      console.error(e);
    }

    const root = document.documentElement;
    const body = document.body;

    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
        root.style.colorScheme = 'dark';
        if (body) {
          body.classList.add('dark');
          body.setAttribute('data-theme', 'dark');
        }
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
        root.style.colorScheme = 'light';
        if (body) {
          body.classList.remove('dark');
          body.setAttribute('data-theme', 'light');
        }
      }
    };

    if (themeMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(themeMode === 'dark');
    }
  }, [themeMode]);

  // Financial summary calculations
  const summary: FinanceSummary = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let monthlyIncome = 0;
    let monthlyExpense = 0;

    const currentYearMonth = getTodayString().substring(0, 7); // "YYYY-MM"

    transactions.forEach(t => {
      if (t.type === 'income') {
        totalIncome += t.amount;
        if (t.date.startsWith(currentYearMonth)) {
          monthlyIncome += t.amount;
        }
      } else {
        totalExpense += t.amount;
        if (t.date.startsWith(currentYearMonth)) {
          monthlyExpense += t.amount;
        }
      }
    });

    const netBalance = totalIncome - totalExpense;
    const monthlyBalance = monthlyIncome - monthlyExpense;
    const savingsRate = monthlyIncome > 0 ? Math.max(0, (monthlyBalance / monthlyIncome) * 100) : 0;

    // Total saldo seluruh sumber dana (kartu kredit diperlakukan sama seperti bank)
    const totalAccountBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    const totalAssetBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

    let totalDirectDebt = 0;
    let totalReceivableDebt = 0;

    debts.forEach(d => {
      if (d.status !== 'paid') {
        if (d.type === 'payable') {
          totalDirectDebt += d.remainingAmount;
        } else {
          totalReceivableDebt += d.remainingAmount;
        }
      }
    });

    // Total hutang hanya dari catatan hutang (kartu kredit bukan hutang)
    const totalPayableDebt = totalDirectDebt;

    return {
      totalIncome,
      totalExpense,
      netBalance,
      totalAccountBalance,
      totalAssetBalance,
      totalPayableDebt,
      totalReceivableDebt,
      monthlyIncome,
      monthlyExpense,
      monthlyBalance,
      savingsRate,
    };
  }, [transactions, debts, accounts]);

  // Account / Sumber Dana mutations
  const addAccount = (data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>) => {
    // Semua jenis akun (termasuk kartu kredit) diperlakukan sama seperti rekening bank
    const initialBal = data.initialBalance || 0;

    const newAcc: Account = {
      ...data,
      id: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      initialBalance: initialBal,
      balance: initialBal,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setAccounts(prev => [...prev, newAcc]);
    return newAcc;
  };

  const updateAccount = (id: string, data: Partial<Account>) => {
    setAccounts(prev =>
      prev.map(a => (a.id === id ? { ...a, ...data, updatedAt: Date.now() } : a))
    );
  };

  const adjustAccountBalance = (id: string, newBalance: number) => {
    setAccounts(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        return {
          ...a,
          balance: newBalance,
          updatedAt: Date.now(),
        };
      })
    );
  };

  const deleteAccount = (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  // Transaction mutations with automatic account balance adjustment
  const addTransaction = (data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => {
    const cleanAmount = toRupiahInt(data.amount);
    const newTx: Transaction = {
      ...data,
      amount: cleanAmount,
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Automatically update account balance
    if (data.accountId) {
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id !== data.accountId) return acc;
          const delta = data.type === 'income' ? cleanAmount : -cleanAmount;
          return {
            ...acc,
            balance: acc.balance + delta,
            updatedAt: Date.now(),
          };
        })
      );
    }

    setTransactions(prev => [newTx, ...prev]);
    return newTx;
  };

  const updateTransaction = (id: string, updatedData: Partial<Transaction>) => {
    const oldTx = transactions.find(t => t.id === id);
    if (!oldTx) return;

    // Revert old effect and apply new effect on accounts
    const oldAccountId = oldTx.accountId;
    const newAccountId = updatedData.accountId !== undefined ? updatedData.accountId : oldTx.accountId;
    const oldType = oldTx.type;
    const newType = updatedData.type || oldType;
    const oldAmount = toRupiahInt(oldTx.amount);
    const newAmount = updatedData.amount !== undefined ? toRupiahInt(updatedData.amount) : oldAmount;
    if (updatedData.amount !== undefined) {
      updatedData = { ...updatedData, amount: newAmount };
    }

    setAccounts(prev =>
      prev.map(acc => {
        let newBalance = acc.balance;

        // Revert old transaction from its account
        if (acc.id === oldAccountId) {
          const revertDelta = oldType === 'income' ? -oldAmount : oldAmount;
          newBalance += revertDelta;
        }

        // Apply new transaction to its account
        if (acc.id === newAccountId) {
          const applyDelta = newType === 'income' ? newAmount : -newAmount;
          newBalance += applyDelta;
        }

        return newBalance !== acc.balance ? { ...acc, balance: newBalance, updatedAt: Date.now() } : acc;
      })
    );

    setTransactions(prev =>
      prev.map(t => (t.id === id ? { ...t, ...updatedData, updatedAt: Date.now() } : t))
    );
  };

  const deleteTransaction = (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (tx && tx.accountId) {
      // Revert account balance
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id !== tx.accountId) return acc;
          const revertDelta = tx.type === 'income' ? -tx.amount : tx.amount;
          return { ...acc, balance: acc.balance + revertDelta, updatedAt: Date.now() };
        })
      );
    }
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  // Category mutations
  const addCategory = (data: Omit<Category, 'id'>) => {
    const newCat: Category = {
      ...data,
      id: `cat_custom_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    };
    setCategories(prev => [...prev, newCat]);
    return newCat;
  };

  const updateCategory = (id: string, data: Partial<Category>) => {
    setCategories(prev => prev.map(c => (c.id === id ? { ...c, ...data } : c)));
  };

  const deleteCategory = (id: string) => {
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  // Debt mutations
  const addDebt = (
    data: Omit<Debt, 'id' | 'remainingAmount' | 'status' | 'payments' | 'createdAt' | 'updatedAt'>
  ) => {
    let effectiveDueDate = data.dueDate;
    let estimatedPayoff = data.estimatedPayoffDate;

    if (data.installmentCategory && data.installmentCategory !== 'non_installment') {
      if (data.dueDayOfMonth) {
        effectiveDueDate = getNextDueDate(data.dueDayOfMonth);
        if (data.remainingTenor && data.remainingTenor > 0) {
          estimatedPayoff = calculatePayoffDate(data.dueDayOfMonth, data.remainingTenor).formatted;
        }
      }
    }

    const newDebt: Debt = {
      ...data,
      totalAmount: toRupiahInt(data.totalAmount),
      dueDate: effectiveDueDate,
      estimatedPayoffDate: estimatedPayoff,
      id: `debt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      remainingAmount: toRupiahInt(data.totalAmount),
      status: 'unpaid',
      payments: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setDebts(prev => [newDebt, ...prev]);
    return newDebt;
  };

  const updateDebt = (id: string, data: Partial<Debt>) => {
    setDebts(prev =>
      prev.map(d => {
        if (d.id !== id) return d;
        const merged = { ...d, ...data, updatedAt: Date.now() };
        if (data.totalAmount !== undefined) merged.totalAmount = toRupiahInt(data.totalAmount);
        if (data.remainingAmount !== undefined) merged.remainingAmount = toRupiahInt(data.remainingAmount);
        if (data.monthlyInstallment !== undefined) merged.monthlyInstallment = toRupiahInt(data.monthlyInstallment);
        if (data.tieredPeriods !== undefined && Array.isArray(data.tieredPeriods)) {
          merged.tieredPeriods = data.tieredPeriods.map(tp => ({
            ...tp,
            monthlyAmount: toRupiahInt(tp.monthlyAmount),
            durationMonths: Math.max(0, Math.floor(Number(tp.durationMonths) || 0)),
          }));
        }
        const updated = merged;

        if (updated.installmentCategory && updated.installmentCategory !== 'non_installment') {
          if (updated.dueDayOfMonth) {
            updated.dueDate = getNextDueDate(updated.dueDayOfMonth);
            if (updated.remainingTenor && updated.remainingTenor > 0) {
              updated.estimatedPayoffDate = calculatePayoffDate(updated.dueDayOfMonth, updated.remainingTenor).formatted;
            }
          }
        }

        const totalPaid = (updated.payments || []).reduce((sum, p) => sum + toRupiahInt(p.amount), 0);
        // Cicilan berjangka: replay amortisasi agar konsisten dengan logika bayar
        const remaining =
          updated.type === 'payable' &&
          updated.installmentCategory === 'tiered_installment' &&
          updated.tieredPeriods &&
          updated.tieredPeriods.length > 0
            ? replayTieredRemaining(
                updated.totalAmount,
                updated.tieredPeriods,
                updated.payments || [],
                updated.totalTenor,
                // Sisa tenor saat ini sudah termasuk seluruh pembayaran tercatat
                typeof updated.remainingTenor === 'number'
                  ? updated.remainingTenor
                  : undefined
              )
            : Math.max(0, updated.totalAmount - totalPaid);
        const status = remaining === 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';
        return {
          ...updated,
          remainingAmount: remaining,
          status,
        };
      })
    );
  };

  const deleteDebt = (id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id));
  };

  /**
   * Pay Debt Handler with Account / Sumber Dana Support:
   */
  const payDebt = (
    debtId: string,
    amount: number,
    paymentDate: string,
    notes: string,
    receiptImage?: string,
    accountId?: string
  ) => {
    const targetDebt = debts.find(d => d.id === debtId);
    if (!targetDebt) throw new Error('Catatan hutang tidak ditemukan');
    const cleanDebtAmount = toRupiahInt(amount);
    if (cleanDebtAmount <= 0) throw new Error('Nominal pembayaran harus lebih dari 0');
    amount = cleanDebtAmount;

    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Amortisasi cicilan berjangka (KPR): cicilan menutup bunga berjalan dulu,
    // sisanya memotong pokok. Rumus: sisa = a - (c - ((a*b)/12).
    // Hanya untuk hutang payable + skema tiered + ada periode bunga aktif.
    let breakdown: (TieredPaymentResult & { annualRate: number }) | undefined;
    let newRemaining: number;
    if (
      targetDebt.type === 'payable' &&
      targetDebt.installmentCategory === 'tiered_installment' &&
      targetDebt.tieredPeriods &&
      targetDebt.tieredPeriods.length > 0
    ) {
      const paidSoFar =
        typeof targetDebt.totalTenor === 'number' && typeof targetDebt.remainingTenor === 'number'
          ? Math.max(0, targetDebt.totalTenor - targetDebt.remainingTenor)
          : targetDebt.payments.length;
      const activeRate = getActiveTierRate(targetDebt.tieredPeriods, paidSoFar);
      if (activeRate !== undefined && activeRate > 0) {
        const result = calculateTieredPayment(targetDebt.remainingAmount, activeRate, amount);
        breakdown = { ...result, annualRate: activeRate };
        newRemaining = result.remainingAfter;
      } else {
        newRemaining = Math.max(0, targetDebt.remainingAmount - amount);
      }
    } else {
      newRemaining = Math.max(0, targetDebt.remainingAmount - amount);
    }

    let newStatus: DebtStatus = newRemaining === 0 ? 'paid' : 'partial';

    // Handle installment tenor decrement
    let newRemainingTenor = targetDebt.remainingTenor;
    let newEstimatedPayoff = targetDebt.estimatedPayoffDate;
    if (
      targetDebt.installmentCategory &&
      targetDebt.installmentCategory !== 'non_installment' &&
      typeof targetDebt.remainingTenor === 'number' &&
      targetDebt.remainingTenor > 0
    ) {
      newRemainingTenor = Math.max(0, targetDebt.remainingTenor - 1);
      // Jangan paksa lunas bila amortisasi menyisakan pokok (bunga belum tertutup)
      if (newRemainingTenor === 0 && !breakdown) {
        newStatus = 'paid';
      }
      if (targetDebt.dueDayOfMonth) {
        newEstimatedPayoff = newRemainingTenor > 0
          ? calculatePayoffDate(targetDebt.dueDayOfMonth, newRemainingTenor).formatted
          : 'Lunas';
      }
    }

    const isPayable = targetDebt.type === 'payable';
    const txCategory = isPayable
      ? categories.find(c => c.id === 'cat_debt_pay') || {
          id: 'cat_debt_pay',
          name: 'Pembayaran Hutang',
        }
      : categories.find(c => c.id === 'cat_debt_received') || {
          id: 'cat_debt_received',
          name: 'Penerimaan Piutang',
        };

    const targetAccount = accounts.find(a => a.id === accountId);

    const newTx: Transaction = {
      id: `tx_debt_${paymentId}`,
      type: isPayable ? 'expense' : 'income',
      amount: amount,
      categoryId: txCategory.id,
      categoryName: txCategory.name,
      accountId: targetAccount?.id,
      accountName: targetAccount?.name,
      date: paymentDate || getTodayString(),
      description: `${isPayable ? 'Bayar Hutang' : 'Terima Piutang'}: ${targetDebt.counterparty}${
        notes ? ' (' + notes + ')' : ''
      }`,
      paymentMethod: targetAccount ? (targetAccount.type === 'cash' ? 'cash' : targetAccount.type === 'ewallet' ? 'ewallet' : 'transfer') : 'transfer',
      debtPaymentId: paymentId,
      receiptUrl: receiptImage,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const newPayment: DebtPayment = {
      id: paymentId,
      debtId: targetDebt.id,
      amount,
      accountId: targetAccount?.id,
      accountName: targetAccount?.name,
      paymentDate: paymentDate || getTodayString(),
      notes,
      receiptImage,
      transactionId: newTx.id,
      createdAt: Date.now(),
      interestPortion: breakdown?.interestPortion,
      principalPortion: breakdown?.principalPortion,
      annualRateApplied: breakdown?.annualRate,
    };

    // Deduct from account balance if account selected
    if (targetAccount) {
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id !== targetAccount.id) return acc;
          const delta = isPayable ? -amount : amount;
          return { ...acc, balance: acc.balance + delta, updatedAt: Date.now() };
        })
      );
    }

    setDebts(prev =>
      prev.map(d => {
        if (d.id !== debtId) return d;
        return {
          ...d,
          remainingAmount: newRemaining,
          remainingTenor: newRemainingTenor,
          estimatedPayoffDate: newEstimatedPayoff,
          status: newStatus,
          payments: [newPayment, ...d.payments],
          updatedAt: Date.now(),
        };
      })
    );

    setTransactions(prev => [newTx, ...prev]);

    return { payment: newPayment, transaction: newTx, breakdown };
  };

  const deleteDebtPayment = (debtId: string, paymentId: string) => {
    const targetDebt = debts.find(d => d.id === debtId);
    if (!targetDebt) return;

    const paymentToDelete = targetDebt.payments.find(p => p.id === paymentId);
    if (!paymentToDelete) return;

    // 1. Revert account balance if payment had an account
    if (paymentToDelete.accountId) {
      const isPayable = targetDebt.type === 'payable';
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id !== paymentToDelete.accountId) return acc;
          const delta = isPayable ? paymentToDelete.amount : -paymentToDelete.amount;
          return { ...acc, balance: acc.balance + delta, updatedAt: Date.now() };
        })
      );
    }

    // 2. Remove the associated transaction from transactions list
    setTransactions(prev =>
      prev.filter(
        tx =>
          tx.id !== paymentToDelete.transactionId &&
          tx.debtPaymentId !== paymentToDelete.id &&
          tx.id !== `tx_debt_${paymentToDelete.id}`
      )
    );

    // 3. Update debt: remove payment and recalculate remaining amount, tenor and status
    setDebts(prev =>
      prev.map(d => {
        if (d.id !== debtId) return d;
        const newPayments = d.payments.filter(p => p.id !== paymentId);
        const totalPaid = newPayments.reduce((acc, curr) => acc + curr.amount, 0);

        // Cicilan berjangka: hitung ulang dengan replay amortisasi kronologis
        // agar konsisten dengan rumus sisa = a - (c - ((a*b)/12)).
        let newRemaining: number;
        if (d.type === 'payable' && d.installmentCategory === 'tiered_installment' && d.tieredPeriods && d.tieredPeriods.length > 0) {
          // Sisa tenor saat ini masih termasuk pembayaran yang dihapus -> kembalikan dulu
          const tenorBeforeDelete = typeof d.remainingTenor === 'number' ? d.remainingTenor + 1 : undefined;
          newRemaining = replayTieredRemaining(d.totalAmount, d.tieredPeriods, newPayments, d.totalTenor, tenorBeforeDelete);
        } else {
          newRemaining = Math.max(0, d.totalAmount - totalPaid);
        }
        const newStatus: DebtStatus = newRemaining === 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

        let restoredTenor = d.remainingTenor;
        let restoredPayoff = d.estimatedPayoffDate;
        if (
          d.installmentCategory &&
          d.installmentCategory !== 'non_installment' &&
          typeof d.remainingTenor === 'number'
        ) {
          restoredTenor = d.remainingTenor + 1;
          if (d.dueDayOfMonth) {
            restoredPayoff = calculatePayoffDate(d.dueDayOfMonth, restoredTenor).formatted;
          }
        }

        return {
          ...d,
          remainingAmount: newRemaining,
          remainingTenor: restoredTenor,
          estimatedPayoffDate: restoredPayoff,
          status: newStatus,
          payments: newPayments,
          updatedAt: Date.now(),
        };
      })
    );
  };

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  // Tagihan Rutin (Recurring Bills) mutations
  const addBill = (data: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newBill: Bill = {
      ...data,
      amount: toRupiahInt(data.amount),
      id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setBills(prev => [...prev, newBill]);
    return newBill;
  };

  const updateBill = (id: string, data: Partial<Bill>) => {
    const clean = data.amount !== undefined ? { ...data, amount: toRupiahInt(data.amount) } : data;
    setBills(prev => prev.map(b => (b.id === id ? { ...b, ...clean, updatedAt: Date.now() } : b)));
  };

  const deleteBill = (id: string) => {
    setBills(prev => prev.filter(b => b.id !== id));
    // Riwayat pembayaran tagihan yang dihapus ikut dibersihkan,
    // transaksi pengeluaran yang sudah tercatat tetap tersimpan.
    setBillPayments(prev => prev.filter(p => p.billId !== id));
  };

  /**
   * Bayar tagihan rutin: tercatat sebagai transaksi keluar (pengeluaran)
   * dengan kategori pilihan + menandai periode bulan tersebut lunas.
   */
  const payBill = (
    billId: string,
    payment: { monthKey: string; amount: number; accountId?: string; categoryId: string; paymentDate: string }
  ) => {
    const targetBill = bills.find(b => b.id === billId);
    if (!targetBill) throw new Error('Tagihan tidak ditemukan');
    const cleanBillAmount = toRupiahInt(payment.amount);
    if (cleanBillAmount <= 0) throw new Error('Nominal pembayaran harus lebih dari 0');
    payment = { ...payment, amount: cleanBillAmount };

    const category = categories.find(c => c.id === payment.categoryId);
    if (!category) throw new Error('Kategori pengeluaran tidak valid');

    const targetAccount = accounts.find(a => a.id === payment.accountId);

    const newTx: Transaction = {
      id: `tx_bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'expense',
      amount: payment.amount,
      categoryId: category.id,
      categoryName: category.name,
      accountId: targetAccount?.id,
      accountName: targetAccount?.name,
      date: payment.paymentDate || getTodayString(),
      description: `Bayar Tagihan: ${targetBill.name}`,
      paymentMethod: targetAccount
        ? targetAccount.type === 'cash'
          ? 'cash'
          : targetAccount.type === 'ewallet'
          ? 'ewallet'
          : targetAccount.type === 'credit_card'
          ? 'credit_card'
          : 'transfer'
        : 'transfer',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const newBillPayment: BillPayment = {
      id: `billpay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      billId: targetBill.id,
      monthKey: payment.monthKey,
      amount: payment.amount,
      accountId: targetAccount?.id,
      accountName: targetAccount?.name,
      categoryId: category.id,
      categoryName: category.name,
      paymentDate: payment.paymentDate || getTodayString(),
      transactionId: newTx.id,
      createdAt: Date.now(),
    };

    // Kurangi saldo sumber dana yang dipilih
    if (targetAccount) {
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id !== targetAccount.id) return acc;
          return { ...acc, balance: acc.balance - payment.amount, updatedAt: Date.now() };
        })
      );
    }

    setBillPayments(prev => [...prev, newBillPayment]);
    setTransactions(prev => [newTx, ...prev]);

    return newBillPayment;
  };

  const deleteBillPayment = (paymentId: string) => {
    const target = billPayments.find(p => p.id === paymentId);
    if (!target) return;

    // Kembalikan saldo sumber dana
    if (target.accountId) {
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id !== target.accountId) return acc;
          return { ...acc, balance: acc.balance + target.amount, updatedAt: Date.now() };
        })
      );
    }

    // Hapus transaksi pengeluaran terkait
    setTransactions(prev => prev.filter(tx => tx.id !== target.transactionId));
    setBillPayments(prev => prev.filter(p => p.id !== paymentId));
  };

  const updateReminderSettings = (settings: Partial<ReminderSettings>) => {
    setReminderSettings(prev => ({ ...prev, ...settings }));
  };

  /**
   * Cermin DigiFuel -> DigiNote (satu arah): catatan bensin & biaya di DigiFuel
   * menjadi transaksi keluar di DigiNote. Idempoten via sourceId; data yang
   * dihapus di DigiFuel ikut dibersihkan. Akun pilihan pengguna dipertahankan
   * (hanya dipakai saat pembuatan).
   */
  const lastDigifuelAtRef = React.useRef<string>('');

  /**
   * Inti pencerminan DigiFuel -> transaksi keluar (dipakai tarik manual & auto-realtime).
   * Mengembalikan {mirrored, removed, diag}.
   */
  const applyDigifuelVault = (
    vault: import('../services/digifuel').DigifuelVault,
    linkAccountId?: string
  ): { mirrored: number; removed: number; diag: string } => {
    const fuelTotal = (vault.fuelRecords || []).length;
    const svcTotal = (vault.serviceHistory || []).length;

    const vehicleName = new Map((vault.vehicles || []).map(v => [v.id, v.name]));
    const expenseCats = categories.filter(c => c.type === 'expense');
    const fuelCat =
      expenseCats.find(c => c.id === 'cat_transport') ||
      expenseCats.find(c => c.id === 'cat_other_exp') ||
      expenseCats[0];
    if (!fuelCat) throw new Error('Tidak ada kategori pengeluaran di DigiNote.');
    const mappedAccount = accounts.find(a => a.id === linkAccountId);
    const targetAccount = mappedAccount || accounts.find(a => a.type === 'bank' || a.type === 'cash' || a.type === 'ewallet') || accounts[0];

    let mirrored = 0;
    const seenSourceIds = new Set<string>();
    const upserts: Transaction[] = [];

    for (const r of vault.fuelRecords || []) {
      if (!toRupiahInt(r.totalCost)) continue;
      const sourceId = `fuel:${r.id}`;
      seenSourceIds.add(sourceId);
      const existing = transactions.find(t => t.sourceType === 'digifuel' && t.sourceId === sourceId);
      const vName = vehicleName.get(r.vehicleId) || '';
      const base = {
        type: 'expense' as const,
        amount: toRupiahInt(r.totalCost),
        categoryId: fuelCat.id,
        categoryName: fuelCat.name,
        date: r.date,
        description: `BBM ${vName ? vName + ' · ' : ''}${r.liters}L ${r.fuelType}${r.stationName ? ` · ${r.stationName}` : ''}`.trim(),
        paymentMethod: 'transfer' as const,
        sourceType: 'digifuel',
        sourceId,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      if (existing) {
        // Mirror menang untuk isi, tapi akun pilihan pengguna dipertahankan
        upserts.push({ ...existing, ...base, id: existing.id, accountId: existing.accountId, accountName: existing.accountName });
      } else {
        upserts.push({
          ...base,
          id: `tx_dfuel_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
          accountId: targetAccount?.id,
          accountName: targetAccount?.name,
        });
        mirrored++;
      }
    }

    for (const s of vault.serviceHistory || []) {
      if (!toRupiahInt(s.cost)) continue;
      const sourceId = `svc:${s.id}`;
      seenSourceIds.add(sourceId);
      const existing = transactions.find(t => t.sourceType === 'digifuel' && t.sourceId === sourceId);
      const vName = vehicleName.get(s.vehicleId) || '';
      const base = {
        type: 'expense' as const,
        amount: toRupiahInt(s.cost),
        categoryId: fuelCat.id,
        categoryName: fuelCat.name,
        date: s.date,
        description: `Servis ${vName ? vName + ' · ' : ''}${s.title}${s.workshop ? ` · ${s.workshop}` : ''}`.trim(),
        paymentMethod: 'transfer' as const,
        sourceType: 'digifuel',
        sourceId,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      if (existing) {
        upserts.push({ ...existing, ...base, id: existing.id, accountId: existing.accountId, accountName: existing.accountName });
      } else {
        upserts.push({
          ...base,
          id: `tx_dfuel_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
          accountId: targetAccount?.id,
          accountName: targetAccount?.name,
        });
        mirrored++;
      }
    }

    // Terapkan upsert + prune cerminan yang sumbernya sudah tidak ada
    const removed = transactions.filter(
      t => t.sourceType === 'digifuel' && t.sourceId && !seenSourceIds.has(t.sourceId)
    ).length;
    setTransactions(prev => {
      const kept = prev.filter(
        t => t.sourceType !== 'digifuel' || !t.sourceId || seenSourceIds.has(t.sourceId)
      );
      const byId = new Map(kept.map(t => [t.id, t]));
      for (const u of upserts) byId.set(u.id, u);
      return [...byId.values()].sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        return d !== 0 ? d : (b.createdAt || 0) - (a.createdAt || 0);
      });
    });

    const fuelQualified = (vault.fuelRecords || []).filter(r => r.totalCost && r.totalCost > 0).length;
    const svcQualified = (vault.serviceHistory || []).filter(s => s.cost && s.cost > 0).length;
    const diag =
      `Vault: ${fuelTotal} bensin (${fuelQualified} bernominal), ` +
      `${svcTotal} servis (${svcQualified} berbiaya).`;
    return { mirrored, removed, diag };
  };

  const pullDigifuelNow = async (): Promise<{
    mirrored: number;
    removed: number;
    diag: string;
  }> => {
    const link = getDigifuelLink(userId);
    if (!link) throw new Error('Hubungkan akun DigiFuel dulu di Pengaturan.');
    const vault = await fetchDigifuelVault(link.email);
    if (!vault) {
      throw new Error(
        'Vault DigiFuel tidak ditemukan untuk email ini. Pastikan Anda pernah login di aplikasi DigiFuel (bukan mode tamu) dan Rules sudah di-publish.'
      );
    }
    const res = applyDigifuelVault(vault, link.accountId);
    persistDigifuelLink(userId, { lastPulledAt: Date.now(), mirroredCount: res.mirrored });
    lastDigifuelAtRef.current = vault.updatedAt || '';
    return res;
  };

  // Realtime DigiFuel: setiap ada catatan bensin/biaya baru di cloud,
  // otomatis tercermin di DigiNote (debounced, tanpa perlu aplikasi DigiFuel).
  // Tombol "Tarik dari DigiFuel" tetap ada untuk penarikan manual paksa.
  useEffect(() => {
    const link = getDigifuelLink(userId);
    if (!link) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeDigifuelVault(
        link.email,
        vault => {
          if (cancelled || !vault) return;
          if (vault.updatedAt && vault.updatedAt === lastDigifuelAtRef.current) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            if (cancelled) return;
            try {
              const freshLink = getDigifuelLink(userId);
              const res = applyDigifuelVault(vault, freshLink?.accountId);
              lastDigifuelAtRef.current = vault.updatedAt || '';
              persistDigifuelLink(userId, {
                lastPulledAt: Date.now(),
                mirroredCount: res.mirrored,
              });
              if (res.mirrored > 0) {
                setSyncNotice({
                  text: `DigiFuel: ${res.mirrored} catatan baru masuk sebagai pengeluaran.`,
                  action: null,
                });
              }
            } catch (e) {
              console.error(e);
            }
          }, 2000);
        },
        err => console.error('DigiFuel subscribe error:', err)
      );
    } catch (e) {
      console.error(e);
    }
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (unsub) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const updateSyncSettings = (settings: Partial<SyncSettings>) => {
    setSyncSettings(prev => ({ ...prev, ...settings }));
  };

  const exportBackupFile = async (passphrase: string) => {
    const payload = {
      transactions,
      categories,
      accounts,
      debts,
      bills,
      billPayments,
      reminderSettings,
      timestamp: Date.now(),
    };
    await exportEncryptedBackup(payload as SyncPayload, passphrase, `diginote_backup_${getTodayString()}.enc.json`);
  };

  const importBackupFile = async (file: File, passphrase: string): Promise<boolean> => {
    const data = await importEncryptedBackup(file, passphrase);
    const ext = data as SyncPayload & { bills?: Bill[]; billPayments?: BillPayment[] };
    if (Array.isArray(data.transactions)) setTransactions(sanitizeTransactions(data.transactions));
    if (Array.isArray(data.categories)) setCategories(data.categories as Category[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray((data as any).accounts)) setAccounts((data as any).accounts as Account[]);
    if (Array.isArray(data.debts)) setDebts(sanitizeDebts(data.debts));
    if (Array.isArray(ext.bills)) setBills(ext.bills as Bill[]);
    if (Array.isArray(ext.billPayments)) setBillPayments(ext.billPayments as BillPayment[]);
    if (data.reminderSettings) setReminderSettings(data.reminderSettings as ReminderSettings);
    return true;
  };

  const resetToDefaultData = () => {
    // Mulai dari awal: tanpa data contoh, tanpa sumber dana bawaan.
    // Kategori bawaan tetap dipertahankan sebagai master.
    setCategories([...ALL_DEFAULT_CATEGORIES]);
    setAccounts([]);
    setTransactions([]);
    setDebts([]);
    setBills([]);
    setBillPayments([]);
  };

  const clearAllData = () => {
    setTransactions([]);
    setDebts([]);
    setBills([]);
    setBillPayments([]);
    setCategories(ALL_DEFAULT_CATEGORIES);
    setAccounts([]);
    try {
      localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
      localStorage.removeItem(STORAGE_KEYS.DEBTS);
      localStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
      localStorage.removeItem(STORAGE_KEYS.CATEGORIES);
      localStorage.removeItem(STORAGE_KEYS.BILLS);
      localStorage.removeItem(STORAGE_KEYS.BILL_PAYMENTS);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <FinanceContext.Provider
      value={{
        transactions,
        categories,
        accounts,
        debts,
        bills,
        billPayments,
        summary,
        reminderSettings,
        syncSettings,
        themeMode,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addAccount,
        updateAccount,
        adjustAccountBalance,
        deleteAccount,
        addCategory,
        updateCategory,
        deleteCategory,
        addDebt,
        updateDebt,
        deleteDebt,
        payDebt,
        deleteDebtPayment,
        addBill,
        updateBill,
        deleteBill,
        payBill,
        deleteBillPayment,
        pullDigifuelNow,
        setThemeMode,
        updateReminderSettings,
        updateSyncSettings,
        exportBackupFile,
        importBackupFile,
        resetToDefaultData,
        clearAllData,
        syncStatus,
        lastSyncedAt,
        syncNotice,
        clearSyncNotice,
        cloudVaultId,
        pushToVaultNow,
        pullFromVaultNow,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}
