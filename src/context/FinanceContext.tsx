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
import { getTodayString, calculatePayoffDate, getNextDueDate, getActiveTierRate, calculateTieredPayment, TieredPaymentResult, toRupiahInt, sanitizeTransactions, sanitizeDebts, stripDigifuelMirror } from '../utils/formatters';
import { generateVaultId, hashPassphrase } from '../services/crypto';
import { sendSyncNotification } from '../services/notifications';
import { exportEncryptedBackup, importEncryptedBackup, type SyncPayload } from '../services/sync';
import { isCloudEnabled, isCloudCapableUid } from '../services/firebase';
import { getActiveEmail } from './AuthContext';
import {
  ensureUserVault,
  pushVault,
  fetchVaultById,
  type CloudVault,
  type VaultPayload,
  type VaultOwner,
  type PairPartner,
  type PairInvite,
  upsertDirectoryEntry,
  lookupVaultByEmail,
  sendPairInvite,
  readMyPairInvite,
  cancelPairInvite,
  acceptPairInvite,
  declinePairInvite,
  removePairFromMyVault,
  rotateMyVaultCode,
  readPairedVaults,
  pushPairedVaults,
  readSentInvite,
  setMyPairedUids,
  deleteOwnCloudData,
} from '../services/cloudSync';

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
  pullFromVaultNow: (announce?: boolean) => Promise<boolean>;

  // Tagihan Rutin
  addBill: (bill: Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>) => Bill;
  updateBill: (id: string, bill: Partial<Bill>) => void;
  deleteBill: (id: string) => void;
  payBill: (billId: string, payment: { monthKey: string; amount: number; accountId?: string; categoryId: string; paymentDate: string }) => BillPayment;
  deleteBillPayment: (paymentId: string) => void;

  // Keuangan Berdua (1 vault untuk 2 email via kode undangan)
  // Keuangan Berdua model tautan (tiap akun tetap punya vault+kode sendiri)
  pairPartner: PairPartner | null;
  pendingInvite: PairInvite | null;
  lastUpdatedByCode: string | null;
  myVaultCode: string;
  sendPairInviteTo: (email: string, code: string) => Promise<void>;
  acceptPairInviteFrom: () => Promise<void>;
  declinePairInviteFrom: () => Promise<void>;
  unpairPartner: () => Promise<void>;
  rotateMyCode: () => Promise<string>;
  refreshPairing: () => Promise<void>;

  // Settings & Theme
  setThemeMode: (mode: ThemeMode) => void;
  updateReminderSettings: (settings: Partial<ReminderSettings>) => void;
  updateSyncSettings: (settings: Partial<SyncSettings>) => void;

  // Cloud Sync & Backup
  exportBackupFile: (passphrase: string) => Promise<void>;
  importBackupFile: (file: File, passphrase: string) => Promise<boolean>;
  clearAllData: () => void;
  deleteAccountData: () => Promise<{ warnings: string[] }>;
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

export const FinanceProvider: React.FC<{ children: React.ReactNode; userId: string; authorName?: string }> = ({ children, userId, authorName }) => {
  const STORAGE_KEYS = buildStorageKeys(userId);

  // Keuangan Berdua model tautan: pasangan tersimpan per akun, kode milik sendiri.
  const [pairPartner, setPairPartner] = useState<PairPartner | null>(() => {
    try {
      const raw = localStorage.getItem(`diginote_pair_partner_${userId}`);
      return raw ? (JSON.parse(raw) as PairPartner) : null;
    } catch {
      return null;
    }
  });
  const [pendingInvite, setPendingInvite] = useState<PairInvite | null>(null);
  const [lastUpdatedByCode, setLastUpdatedByCode] = useState<string | null>(null);
  const persistPartner = (pp: PairPartner | null) => {
    // Pengaman: pasangan tidak boleh diri sendiri
    if (pp && pp.uid === userId) return;
    setPairPartner(pp);
    try {
      if (pp) localStorage.setItem(`diginote_pair_partner_${userId}`, JSON.stringify(pp));
      else localStorage.removeItem(`diginote_pair_partner_${userId}`);
    } catch {
      /* abaikan */
    }
  };
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
      if (stored) return stripDigifuelMirror(sanitizeTransactions(JSON.parse(stored)));
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
    displayName: authorName || null,
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
        stripDigifuelMirror(
          sanitizeTransactions(
            vault.transactions.map(t => {
              const local = localTxById.get(t.id);
              if (local?.receiptUrl && !t.receiptUrl) return { ...t, receiptUrl: local.receiptUrl };
              return t;
            })
          )
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
    if (vault.lastUpdatedByCode) setLastUpdatedByCode(vault.lastUpdatedByCode);
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
        transactions: stripDigifuelMirror(pick<Transaction[]>('transactions_v2') ?? []),
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
          if (legacy.transactions.length > 0) setTransactions(stripDigifuelMirror(sanitizeTransactions(legacy.transactions)));
          if (legacy.categories.length > 0) setCategories(legacy.categories);
          if (legacy.accounts.length > 0) setAccounts(legacy.accounts);
          if (legacy.debts.length > 0) setDebts(sanitizeDebts(legacy.debts));
          if (legacy.reminderSettings) setReminderSettings(legacy.reminderSettings);
          setSyncNotice({ text: 'Data lama perangkat ini dimuat dan akan disinkronkan ke cloud.', action: null });
        }

        const owner = vaultOwner(currentEmail());
        const vault = await ensureUserVault(owner, localSnapshot, userId);
        if (cancelled) return;
        setCloudVaultId(vault.vaultCode || '');
        setLastSyncedAt(Date.now());
        // Daftarkan direktori agar pasangan bisa verifikasi undangan via email+kode
        void upsertDirectoryEntry(owner, vault.vaultCode || '').catch(() => {});

        // --- Keuangan Berdua: undangan masuk + vault pasangan ---
        let partnerVault: CloudVault | null = null;
        try {
          if (navigator.onLine) {
            const inv = await readMyPairInvite(userId);
            if (inv) {
              setPendingInvite(inv);
              const seenKey = `diginote_invite_notified_${userId}_${inv.fromUid}_${inv.createdAt}`;
              let seen = false;
              try {
                seen = !!localStorage.getItem(seenKey);
              } catch {
                /* abaikan */
              }
              if (!seen) {
                try {
                  localStorage.setItem(seenKey, '1');
                } catch {
                  /* abaikan */
                }
                const fromName = inv.fromName || inv.fromEmail || 'Pasangan';
                await notifyPairEvent(
                  'Undangan Catat Berdua',
                  `${fromName} mengundang Anda catat berdua. Buka Pengaturan untuk menerima/menolak.`
                );
              }
            } else {
              setPendingInvite(null);
            }
          }
        } catch {
          /* abaikan: lanjut mode pribadi */
        }
        // Rawat undangan yang saya kirim (diterima/ditolak?)
        await maintainSentInvites();
        // Baca vault pasangan (bila tertaut) + deteksi pencabutan
        try {
          if (navigator.onLine) {
            const paired = await readPairedVaults(userId);
            if (paired.revoked && paired.partnerUid) {
              try {
                const mine0 = await fetchVaultById(userId);
                const minePaired = mine0 && Array.isArray(mine0.pairedUids) ? mine0.pairedUids : [];
                if (minePaired.includes(paired.partnerUid)) {
                  await setMyPairedUids(owner, minePaired.filter(u => u !== paired.partnerUid));
                }
              } catch {
                /* abaikan */
              }
              if (pairPartner) persistPartner(null);
              saveSentInvites(loadSentInvites().filter(() => false));
              setSyncNotice({ text: 'Pasangan berhenti berbagi. Kembali ke data pribadi.', action: null });
              await notifyPairEvent('Keuangan Berdua berakhir', 'Pasangan berhenti berbagi catatan.');
            } else {
              partnerVault = paired.partner;
              const newest0 = pickNewestVault(vault, partnerVault);
              if (newest0?.lastUpdatedByCode) setLastUpdatedByCode(newest0.lastUpdatedByCode);
            }
          }
        } catch {
          /* abaikan: lanjut dengan vault sendiri */
        }

        // Sinkronisasi saat masuk aplikasi: selalu konvergen ke data terbaru.
        // - Cloud lebih baru (atau lokal kosong) -> pakai cloud, tampilkan terbaru.
        // - Lokal lebih baru (ada perubahan offline yg belum terkirim) -> dorong lokal ke cloud.
        const storedBase = getStoredBase();
        const localEmpty =
          localSnapshot.transactions.length === 0 &&
          localSnapshot.accounts.length === 0 &&
          localSnapshot.debts.length === 0 &&
          localSnapshot.bills.length === 0 &&
          localSnapshot.billPayments.length === 0;
        // Kandidat cloud: vault sendiri + vault pasangan (yang terbaru menang)
        const newestCloud = pickNewestVault(vault, partnerVault) || vault;
        const cloudHasData =
          newestCloud.transactions.length > 0 ||
          newestCloud.debts.length > 0 ||
          newestCloud.bills.length > 0 ||
          newestCloud.billPayments.length > 0;
        const vaultTime = newestCloud.updatedAt || '';
        if (newestCloud.lastUpdatedByCode) setLastUpdatedByCode(newestCloud.lastUpdatedByCode);
        if (cloudHasData && (localEmpty || (vaultTime && vaultTime > storedBase))) {
          justAppliedRef.current = true;
          applyCloudVault(newestCloud);
          persistBase(vaultTime);
          if (!localEmpty) {
            setSyncNotice({
              text: partnerVault && newestCloud === partnerVault ? 'Data terbaru pasangan dimuat.' : 'Data terbaru dari cloud dimuat.',
              action: null,
            });
          }
        } else if (!localEmpty && storedBase && (!vaultTime || storedBase > vaultTime)) {
          // Perangkat ini menyimpan perubahan yang belum ada di cloud -> kirim sekarang
          try {
            const { updatedAt } = await pushToBoth(localSnapshot, vault.vaultCode || '');
            persistBase(updatedAt);
            setLastSyncedAt(Date.now());
            setSyncNotice({ text: 'Perubahan offline dikirim ke cloud.', action: null });
          } catch (pushErr) {
            console.error(pushErr);
            persistBase(vaultTime || storedBase);
          }
        } else {
          persistBase(vaultTime || storedBase);
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
      const { updatedAt, partnerOk } = await pushToBoth({
        transactions,
        categories,
        accounts,
        debts,
        bills,
        billPayments,
        reminderSettings,
      }, cloudVaultId);
      setLastSyncedAt(Date.now());
      setSyncStatus('synced');
      setSyncErrorMsg(null);
      setSyncNotice({
        text: partnerOk ? 'Data berhasil disinkronkan ke cloud.' : 'Tersimpan di vault Anda, tetapi gagal ke vault pasangan.',
        action: null,
      });
      void sendSyncNotification(true, 'Data berhasil disinkronkan ke cloud.');
      persistBase(updatedAt);
      return true;
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Gagal sinkron ke cloud.';
      setSyncStatus('error');
      setSyncErrorMsg(msg);
      setSyncNotice({ text: msg, action: null });
      void sendSyncNotification(false, msg);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, userId, transactions, accounts, debts, categories, bills, billPayments, reminderSettings, cloudVaultId]);

  /**
   * Pull manual: tarik data terbaru dari cloud SEKARANG (via Pengaturan).
   * Notifikasi sistem hanya bila announce=true (tombol eksplisit),
   * agar pull-to-refresh / tombol dashboard tidak membanjiri bilah notifikasi.
   */
  const pullFromVaultNow = useCallback(async (announce = false): Promise<boolean> => {
    if (!cloudEnabled || !isCloudCapableUid(userId)) return false;
    setSyncStatus('syncing');
    try {
      const { mine, partner } = await readPairedVaults(userId);
      const remote = pickNewestVault(mine, partner);
      if (!remote) {
        setSyncStatus(navigator.onLine ? 'synced' : 'offline');
        return false;
      }
      // Kode yang tampil SELALU kode vault sendiri (jangan tertimpa kode pasangan)
      if (mine?.vaultCode) setCloudVaultId(mine.vaultCode);
      justAppliedRef.current = true;
      applyCloudVault(remote);
      persistBase(remote.updatedAt || '');
      setSyncStatus(navigator.onLine ? 'synced' : 'offline');
      setSyncErrorMsg(null);
      setSyncNotice(null);
      if (announce) void sendSyncNotification(true, 'Data terbaru dari cloud berhasil dimuat.');
      return true;
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Gagal menarik data dari cloud.';
      setSyncStatus('error');
      setSyncErrorMsg(msg);
      setSyncNotice({ text: msg, action: null });
      if (announce) void sendSyncNotification(false, msg);
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, userId]);

  const clearSyncNotice = () => setSyncNotice(null);

  // Notifikasi dashboard hilang otomatis tanpa perlu diklik (X tetap tersedia).
  useEffect(() => {
    if (!syncNotice) return;
    const timer = setTimeout(() => setSyncNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [syncNotice]);

  /** Rawat undangan terkirim: diterima (teraut) atau ditolak/dibatalkan. */
  const maintainSentInvites = async () => {
    try {
      if (!navigator.onLine) return;
      const sent = loadSentInvites();
      const stillPending: string[] = [];
      for (const toUid of sent) {
        try {
          const inv = await readSentInvite(toUid);
          if (inv) {
            stillPending.push(toUid);
            continue;
          }
          let accepted = false;
          try {
            const theirs = await fetchVaultById(toUid);
            accepted = !!theirs && Array.isArray(theirs.pairedUids) && theirs.pairedUids.includes(userId);
            if (accepted && theirs) {
              persistPartner({
                uid: toUid,
                email: theirs.ownerEmail || pairPartner?.email || null,
                name: theirs.displayName || pairPartner?.name || null,
                code: theirs.vaultCode || pairPartner?.code || '',
              });
              setSyncNotice({ text: 'Pasangan menerima undangan berdua!', action: null });
            }
          } catch {
            accepted = false;
          }
          if (!accepted) {
            try {
              const mine0 = await fetchVaultById(userId);
              const minePaired = mine0 && Array.isArray(mine0.pairedUids) ? mine0.pairedUids : [];
              if (minePaired.includes(toUid)) {
                await setMyPairedUids(vaultOwner(currentEmail()), minePaired.filter(u => u !== toUid));
              }
            } catch {
              /* abaikan */
            }
            if (pairPartner?.uid === toUid) persistPartner(null);
            setSyncNotice({ text: 'Undangan berdua ditolak/dibatalkan.', action: null });
          }
        } catch {
          stillPending.push(toUid);
        }
      }
      saveSentInvites(stillPending);
    } catch {
      /* abaikan */
    }
  };

  // ---------- Keuangan Berdua model tautan ----------
  const sentInviteKey = `diginote_sent_invites_${userId}`;
  const loadSentInvites = (): string[] => {
    try {
      const raw = localStorage.getItem(sentInviteKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
    } catch {
      return [];
    }
  };
  const saveSentInvites = (list: string[]) => {
    try {
      localStorage.setItem(sentInviteKey, JSON.stringify(list));
    } catch {
      /* abaikan */
    }
  };

  const pickNewestVault = (a: CloudVault | null, b: CloudVault | null): CloudVault | null => {
    if (a && b) return (b.updatedAt || '') > (a.updatedAt || '') ? b : a;
    return a || b;
  };

  const notifyPairEvent = async (title: string, body: string) => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const perm = await LocalNotifications.checkPermissions().catch(() => null);
      if (!perm || perm.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [{ id: 1004, title, body, schedule: { at: new Date(Date.now() + 500), allowWhileIdle: true } }],
      });
    } catch {
      /* abaikan */
    }
  };

  /** Tulis ke vault sendiri + vault pasangan (best-effort). */
  const pushToBoth = async (payload: VaultPayload, code: string): Promise<{ updatedAt: string; partnerOk: boolean }> => {
    const owner = vaultOwner(currentEmail());
    const updatedAt = await pushVault(owner, code, payload, userId, { byUid: userId, byCode: code });
    let partnerOk = true;
    const puid = pairPartner?.uid;
    if (puid && puid !== userId) {
      try {
        await pushVault(owner, code, payload, puid, { byUid: userId, byCode: code, dataOnly: true });
      } catch (err) {
        partnerOk = false;
        if ((err as { code?: string })?.code === 'permission-denied') {
          await dropPairing('Pasangan mencabut akses berdua. Kembali ke data pribadi.');
        }
      }
    }
    return { updatedAt, partnerOk };
  };

  /** Bersihkan tautan lokal saat akses dicabut sisi pasangan. */
  const dropPairing = async (reason: string) => {
    try {
      const mine = await fetchVaultById(userId);
      const paired = mine && Array.isArray(mine.pairedUids) ? mine.pairedUids : [];
      const next = paired.filter(u => u !== pairPartner?.uid && u !== undefined);
      if (mine && next.length !== paired.length) {
        await setMyPairedUids(vaultOwner(currentEmail()), next);
      }
    } catch {
      /* abaikan */
    }
    persistPartner(null);
    saveSentInvites(loadSentInvites().filter(() => false));
    setSyncNotice({ text: reason, action: null });
    await notifyPairEvent('Keuangan Berdua berakhir', reason);
  };

  const refreshPairing = useCallback(async (): Promise<void> => {
    if (!cloudEnabled || !isCloudCapableUid(userId)) return;
    // Hidrasi status berdua dari CLOUD (sumber kebenaran): vault sendiri yang
    // menautkan pasangan -> tampilkan Berdua walau memori lokal hilang.
    try {
      const mine0 = await fetchVaultById(userId);
      if (mine0) {
        const minePaired = (Array.isArray(mine0.pairedUids) ? mine0.pairedUids : []).filter(u => u !== userId);
        if (minePaired.length > 0) {
          const puid = minePaired[0];
          try {
            const pv = await fetchVaultById(puid);
            if (pv) {
              persistPartner({
                uid: puid,
                email: pv.ownerEmail || pairPartner?.email || null,
                name: pv.displayName || pairPartner?.name || null,
                code: pv.vaultCode || pairPartner?.code || '',
              });
            }
          } catch {
            /* gagal baca pasangan: ditangani pemeriksaan revoked di bawah */
          }
        } else if (pairPartner && loadSentInvites().every(u => u !== pairPartner.uid)) {
          // Cloud tak menautkan siapa pun & tak ada undangan terkirim
          // -> tampilan lokal basi, bersihkan (offline/transien dilewati via catch)
          persistPartner(null);
        }
        if (mine0.vaultCode) setCloudVaultId(mine0.vaultCode);
      }
    } catch {
      /* abaikan: pertahankan tampilan lokal */
    }
    try {
      const { mine, partner, partnerUid, revoked } = await readPairedVaults(userId);
      if (revoked && partnerUid) {
        await dropPairing('Pasangan berhenti berbagi. Kembali ke data pribadi.');
        return;
      }
      if (mine?.vaultCode) setCloudVaultId(mine.vaultCode);
      const newest = pickNewestVault(mine, partner);
      if (newest?.lastUpdatedByCode) setLastUpdatedByCode(newest.lastUpdatedByCode);
      // Segarkan profil pasangan (nama/kode) dari direktori bila email dikenal
      if (pairPartner?.email) {
        try {
          const dir = await lookupVaultByEmail(pairPartner.email);
          if (dir && dir.uid === pairPartner.uid) {
            persistPartner({ ...pairPartner, name: dir.name || pairPartner.name, code: dir.vaultCode || pairPartner.code });
          }
        } catch {
          /* abaikan */
        }
      }
    } catch {
      /* abaikan */
    }
    // Cek undangan masuk (agar muncul juga saat aplikasi dari background)
    try {
      if (navigator.onLine) {
        const inv = await readMyPairInvite(userId);
        if (inv) {
          setPendingInvite(inv);
          const seenKey = `diginote_invite_notified_${userId}_${inv.fromUid}_${inv.createdAt}`;
          let seen = false;
          try {
            seen = !!localStorage.getItem(seenKey);
          } catch {
            /* abaikan */
          }
          if (!seen) {
            try {
              localStorage.setItem(seenKey, '1');
            } catch {
              /* abaikan */
            }
            const fromName = inv.fromName || inv.fromEmail || 'Pasangan';
            await notifyPairEvent(
              'Undangan Catat Berdua',
              `${fromName} mengundang Anda catat berdua. Buka Pengaturan untuk menerima/menolak.`
            );
          }
        }
      }
    } catch {
      /* abaikan */
    }
    await maintainSentInvites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, userId]);

  const sendPairInviteTo = useCallback(async (email: string, code: string): Promise<void> => {
    if (!cloudEnabled || !isCloudCapableUid(userId)) {
      throw new Error('Keuangan Berdua membutuhkan akun cloud (bukan mode lokal).');
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Email pasangan tidak valid.');
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) throw new Error('Masukkan kode vault pasangan.');
    if (cleanEmail === (currentEmail() || '').toLowerCase()) throw new Error('Itu email Anda sendiri.');
    const target = await lookupVaultByEmail(cleanEmail);
    if (!target) {
      throw new Error('Email belum terdaftar / belum pernah sinkron. Minta pasangan buka aplikasi sekali.');
    }
    if ((target.vaultCode || '').toUpperCase() !== cleanCode) {
      throw new Error('Kode vault tidak cocok dengan email tersebut.');
    }
    if (target.uid === userId) throw new Error('Itu akun Anda sendiri.');
    const owner = vaultOwner(currentEmail());
    await sendPairInvite(owner, cloudVaultId || '', cleanEmail, target);
    persistPartner({ uid: target.uid, email: target.email, name: target.name ?? null, code: cleanCode });
    const sent = loadSentInvites();
    if (!sent.includes(target.uid)) saveSentInvites([...sent, target.uid]);
    setSyncNotice({ text: `Undangan terkirim ke ${target.email}. Menunggu pasangan menerima.`, action: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, userId, cloudVaultId]);

  const acceptPairInviteFrom = useCallback(async (): Promise<void> => {
    const inv = pendingInvite;
    if (!inv) throw new Error('Tidak ada undangan.');
    if (!cloudEnabled || !isCloudCapableUid(userId)) throw new Error('Butuh akun cloud.');
    const owner = vaultOwner(currentEmail());
    await acceptPairInvite(owner, inv, cloudVaultId || '');
    persistPartner({ uid: inv.fromUid, email: inv.fromEmail, name: inv.fromName, code: inv.fromCode });
    setPendingInvite(null);
    const { mine, partner } = await readPairedVaults(userId);
    const newest = pickNewestVault(mine, partner);
    if (newest) {
      justAppliedRef.current = true;
      applyCloudVault(newest);
      persistBase(newest.updatedAt || '');
      if (newest.lastUpdatedByCode) setLastUpdatedByCode(newest.lastUpdatedByCode);
    }
    setSyncNotice({ text: 'Terhubung! Data terbaru berdua dimuat.', action: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite, cloudEnabled, userId, cloudVaultId]);

  const declinePairInviteFrom = useCallback(async (): Promise<void> => {
    const inv = pendingInvite;
    if (!inv) return;
    try {
      await declinePairInvite(vaultOwner(currentEmail()), inv);
    } catch {
      /* tetap lanjut */
    }
    setPendingInvite(null);
    setSyncNotice({ text: 'Undangan ditolak dan dihapus.', action: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingInvite, userId]);

  const unpairPartner = useCallback(async (): Promise<void> => {
    const puid = pairPartner?.uid;
    if (!puid) {
      persistPartner(null);
      return;
    }
    try {
      await removePairFromMyVault(vaultOwner(currentEmail()), puid);
    } catch {
      /* lanjut */
    }
    try {
      await cancelPairInvite(puid);
    } catch {
      /* abaikan */
    }
    persistPartner(null);
    saveSentInvites(loadSentInvites().filter(u => u !== puid));
    setSyncNotice({ text: 'Tautan berdua diputus. Kembali ke data pribadi.', action: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairPartner, userId]);

  const rotateMyCode = useCallback(async (): Promise<string> => {
    if (!cloudEnabled || !isCloudCapableUid(userId)) throw new Error('Butuh akun cloud.');
    const code = await rotateMyVaultCode(vaultOwner(currentEmail()));
    setCloudVaultId(code);
    return code;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled, userId]);

  // Otomatis menyimpan ke cloud setiap ada data baru (debounced, pola Fuel-Traxr).
  // Aman dari freeze: payload terstruktur kecil (tanpa foto), tanpa listener realtime.
  // Jeda 800ms agar "selesai simpan -> langsung tersinkron" terasa seketika.
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
        const { updatedAt, partnerOk } = await pushToBoth({
          transactions,
          categories,
          accounts,
          debts,
          bills,
          billPayments,
          reminderSettings,
        }, cloudVaultId);
        persistBase(updatedAt);
        setLastSyncedAt(Date.now());
        setSyncStatus('synced');
        setSyncErrorMsg(null);
        if (!partnerOk) {
          setSyncNotice({ text: 'Tersimpan di vault Anda, tetapi gagal ke vault pasangan.', action: null });
        }
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
    }, 800);
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
      authorUid: data.authorUid || userId,
      authorName: data.authorName || authorName || undefined,
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
      authorUid: userId,
      authorName: authorName || undefined,
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
      authorUid: userId,
      authorName: authorName || undefined,
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
  };const updateSyncSettings = (settings: Partial<SyncSettings>) => {
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
    if (Array.isArray(data.transactions)) setTransactions(stripDigifuelMirror(sanitizeTransactions(data.transactions)));
    if (Array.isArray(data.categories)) setCategories(data.categories as Category[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray((data as any).accounts)) setAccounts((data as any).accounts as Account[]);
    if (Array.isArray(data.debts)) setDebts(sanitizeDebts(data.debts));
    if (Array.isArray(ext.bills)) setBills(ext.bills as Bill[]);
    if (Array.isArray(ext.billPayments)) setBillPayments(ext.billPayments as BillPayment[]);
    if (data.reminderSettings) setReminderSettings(data.reminderSettings as ReminderSettings);
    return true;
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

  const deleteAccountData = async (): Promise<{ warnings: string[] }> => {
    let warnings: string[] = [];
    // 1. Cloud (hanya akun cloud yang online)
    if (cloudEnabled && isCloudCapableUid(userId) && navigator.onLine) {
      try {
        const res = await deleteOwnCloudData(
          vaultOwner(currentEmail()),
          currentEmail() || '',
          pairPartner?.uid || null,
          loadSentInvites()
        );
        warnings = res.warnings;
      } catch (err: unknown) {
        warnings.push((err as Error)?.message || 'Data cloud tidak terhapus.');
      }
    }
    // 2. Lokal perangkat (hanya kunci milik akun ini)
    try {
      const keys = [
        STORAGE_KEYS.TRANSACTIONS,
        STORAGE_KEYS.ACCOUNTS,
        STORAGE_KEYS.DEBTS,
        STORAGE_KEYS.CATEGORIES,
        STORAGE_KEYS.BILLS,
        STORAGE_KEYS.BILL_PAYMENTS,
        STORAGE_KEYS.REMINDERS,
        STORAGE_KEYS.SYNC,
        `diginote_pair_partner_${userId}`,
        `diginote_sent_invites_${userId}`,
      ];
      for (const k of keys) localStorage.removeItem(k);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(`diginote_invite_notified_${userId}_`)) localStorage.removeItem(k);
      }
    } catch (e) {
      console.error(e);
    }
    // 3. Reset state memori
    setTransactions([]);
    setAccounts([]);
    setCategories([...ALL_DEFAULT_CATEGORIES]);
    setDebts([]);
    setBills([]);
    setBillPayments([]);
    persistPartner(null);
    setPendingInvite(null);
    setLastUpdatedByCode(null);
    setCloudVaultId(null);
    return { warnings };
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
        setThemeMode,
        updateReminderSettings,
        updateSyncSettings,
        exportBackupFile,
        importBackupFile,
        clearAllData,
        deleteAccountData,
        syncStatus,
        lastSyncedAt,
        syncNotice,
        clearSyncNotice,
        cloudVaultId,
        pushToVaultNow,
        pullFromVaultNow,
        pairPartner,
        pendingInvite,
        lastUpdatedByCode,
        myVaultCode: cloudVaultId || '',
        sendPairInviteTo,
        acceptPairInviteFrom,
        declinePairInviteFrom,
        unpairPartner,
        rotateMyCode,
        refreshPairing,
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
