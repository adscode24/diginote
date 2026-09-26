import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  Transaction,
  Category,
  Account,
  Debt,
  DebtStatus,
  DebtPayment,
  FinanceSummary,
  ReminderSettings,
  SyncSettings,
  ThemeMode,
} from '../types';
import { ALL_DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS } from '../utils/constants';
import { getTodayString, calculatePayoffDate, getNextDueDate } from '../utils/formatters';
import { generateVaultId, hashPassphrase } from '../services/crypto';
import { pushToCloudVault, pullFromCloudVault, exportEncryptedBackup, importEncryptedBackup, SyncPayload } from '../services/sync';

interface FinanceContextType {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  debts: Debt[];
  summary: FinanceSummary;
  reminderSettings: ReminderSettings;
  syncSettings: SyncSettings;
  themeMode: ThemeMode;
  isSyncing: boolean;
  syncError: string | null;

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
  ) => { payment: DebtPayment; transaction: Transaction };
  deleteDebtPayment: (debtId: string, paymentId: string) => void;

  // Settings & Theme
  setThemeMode: (mode: ThemeMode) => void;
  updateReminderSettings: (settings: Partial<ReminderSettings>) => void;
  updateSyncSettings: (settings: Partial<SyncSettings>) => void;

  // Cloud Sync & Backup
  syncToCloud: (passphrase: string) => Promise<boolean>;
  pullFromCloud: (vaultId: string, passphrase: string) => Promise<boolean>;
  exportBackupFile: (passphrase: string) => Promise<void>;
  importBackupFile: (file: File, passphrase: string) => Promise<boolean>;
  resetToDefaultData: () => void;
  clearAllData: () => void;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

const STORAGE_KEYS = {
  TRANSACTIONS: 'notaku_transactions_v2',
  CATEGORIES: 'notaku_categories_v2',
  ACCOUNTS: 'notaku_accounts_v2',
  DEBTS: 'notaku_debts_v2',
  REMINDERS: 'notaku_reminders_v2',
  SYNC: 'notaku_sync_v2',
  THEME: 'notaku_theme_v2',
};

// Initial sample data
function getInitialSampleData() {
  const sampleCategories = [...ALL_DEFAULT_CATEGORIES];
  const sampleAccounts = DEFAULT_ACCOUNTS.map(a =>
    a.id === 'acc_credit' ? { ...a, balance: -650000, initialBalance: 0 } : a
  );
  const today = getTodayString();
  const [year, month] = today.split('-');

  const sampleTransactions: Transaction[] = [
    {
      id: 'tx_sample_1',
      type: 'income',
      amount: 9500000,
      categoryId: 'cat_salary',
      categoryName: 'Gaji Bulanan',
      accountId: 'acc_bca',
      accountName: 'Rekening BCA',
      date: `${year}-${month}-01`,
      description: 'Gaji Bulanan Kantor',
      paymentMethod: 'transfer',
      createdAt: Date.now() - 20 * 86400000,
      updatedAt: Date.now() - 20 * 86400000,
    },
    {
      id: 'tx_sample_2',
      type: 'income',
      amount: 2200000,
      categoryId: 'cat_freelance',
      categoryName: 'Freelance & Side Job',
      accountId: 'acc_bca',
      accountName: 'Rekening BCA',
      date: `${year}-${month}-12`,
      description: 'Proyek Desain Web Klien',
      paymentMethod: 'transfer',
      createdAt: Date.now() - 12 * 86400000,
      updatedAt: Date.now() - 12 * 86400000,
    },
    {
      id: 'tx_sample_3',
      type: 'expense',
      amount: 1450000,
      categoryId: 'cat_housing',
      categoryName: 'Tempat Tinggal / Sewa',
      accountId: 'acc_bca',
      accountName: 'Rekening BCA',
      date: `${year}-${month}-03`,
      description: 'Sewa Kos & Uang Kas',
      paymentMethod: 'transfer',
      createdAt: Date.now() - 18 * 86400000,
      updatedAt: Date.now() - 18 * 86400000,
    },
    {
      id: 'tx_sample_4',
      type: 'expense',
      amount: 850000,
      categoryId: 'cat_food',
      categoryName: 'Makanan & Minuman',
      accountId: 'acc_gopay',
      accountName: 'E-Wallet GoPay / OVO',
      date: `${year}-${month}-08`,
      description: 'Belanja Mingguan Supermarket',
      paymentMethod: 'ewallet',
      createdAt: Date.now() - 14 * 86400000,
      updatedAt: Date.now() - 14 * 86400000,
    },
    {
      id: 'tx_sample_5',
      type: 'expense',
      amount: 475000,
      categoryId: 'cat_bills',
      categoryName: 'Tagihan & Utilitas',
      accountId: 'acc_bca',
      accountName: 'Rekening BCA',
      date: `${year}-${month}-15`,
      description: 'Token Listrik PLN & Tagihan Wifi',
      paymentMethod: 'transfer',
      createdAt: Date.now() - 10 * 86400000,
      updatedAt: Date.now() - 10 * 86400000,
    },
    {
      id: 'tx_sample_6',
      type: 'expense',
      amount: 120000,
      categoryId: 'cat_food',
      categoryName: 'Makanan & Minuman',
      accountId: 'acc_cash',
      accountName: 'Uang Tunai (Cash)',
      date: `${year}-${month}-18`,
      description: 'Makan Siang & Kopi Santai',
      paymentMethod: 'cash',
      createdAt: Date.now() - 7 * 86400000,
      updatedAt: Date.now() - 7 * 86400000,
    },
    {
      id: 'tx_sample_7',
      type: 'expense',
      amount: 650000,
      categoryId: 'cat_shopping',
      categoryName: 'Belanja Harian',
      accountId: 'acc_credit',
      accountName: 'Kartu Kredit Mandiri',
      date: `${year}-${month}-19`,
      description: 'Belanja Elektronik & Gadget (Kartu Kredit)',
      paymentMethod: 'credit_card',
      createdAt: Date.now() - 6 * 86400000,
      updatedAt: Date.now() - 6 * 86400000,
    },
  ];

  const sampleDebts: Debt[] = [
    {
      id: 'debt_sample_1',
      type: 'payable',
      counterparty: 'BCA (Cicilan Laptop)',
      totalAmount: 9000000,
      remainingAmount: 3000000,
      startDate: `${year}-${month}-01`,
      dueDate: `${year}-${month}-28`,
      dueDayOfMonth: 28,
      notes: 'Cicilan per bulan Rp 1.500.000',
      status: 'partial',
      payments: [
        {
          id: 'pay_sample_1',
          debtId: 'debt_sample_1',
          amount: 6000000,
          accountId: 'acc_bca',
          accountName: 'Rekening BCA',
          paymentDate: `${year}-${month}-02`,
          notes: 'Pembayaran bulan 1 s/d 4',
          createdAt: Date.now() - 15 * 86400000,
        },
      ],
      createdAt: Date.now() - 25 * 86400000,
      updatedAt: Date.now() - 15 * 86400000,
    },
    {
      id: 'debt_sample_2',
      type: 'payable',
      counterparty: 'Budi Santoso',
      totalAmount: 1500000,
      remainingAmount: 1500000,
      startDate: `${year}-${month}-10`,
      dueDate: `${year}-${month}-30`,
      dueDayOfMonth: 30,
      notes: 'Pinjaman dana servis motor',
      status: 'unpaid',
      payments: [],
      createdAt: Date.now() - 14 * 86400000,
      updatedAt: Date.now() - 14 * 86400000,
    },
    {
      id: 'debt_sample_3',
      type: 'receivable',
      counterparty: 'Rina (Proyek Katering)',
      totalAmount: 3500000,
      remainingAmount: 1500000,
      startDate: `${year}-${month}-05`,
      dueDate: `${year}-${month}-27`,
      dueDayOfMonth: 27,
      notes: 'Sisa pembayaran pesanan katering nasi box',
      status: 'partial',
      payments: [
        {
          id: 'pay_sample_2',
          debtId: 'debt_sample_3',
          amount: 2000000,
          accountId: 'acc_bca',
          accountName: 'Rekening BCA',
          paymentDate: `${year}-${month}-16`,
          notes: 'DP Katering 60%',
          createdAt: Date.now() - 9 * 86400000,
        },
      ],
      createdAt: Date.now() - 20 * 86400000,
      updatedAt: Date.now() - 9 * 86400000,
    },
  ];

  return { sampleCategories, sampleAccounts, sampleTransactions, sampleDebts };
}

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Accounts / Sumber Dana State
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return getInitialSampleData().sampleAccounts;
  });

  // 2. Transactions State
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return getInitialSampleData().sampleTransactions;
  });

  // 3. Categories State
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return getInitialSampleData().sampleCategories;
  });

  // 4. Debts State
  const [debts, setDebts] = useState<Debt[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DEBTS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return getInitialSampleData().sampleDebts;
  });

  // 5. Reminder Settings
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.REMINDERS);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return { enabled: true, time: '20:00' };
  });

  // 6. Sync Settings
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SYNC);
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

  // 7. Theme State
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THEME);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch (e) {
      console.error(e);
    }
    return 'system';
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    } catch (e) {
      console.error(e);
    }
  }, [accounts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    } catch (e) {
      console.error(e);
    }
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
    } catch (e) {
      console.error(e);
    }
  }, [categories]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DEBTS, JSON.stringify(debts));
    } catch (e) {
      console.error(e);
    }
  }, [debts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(reminderSettings));
    } catch (e) {
      console.error(e);
    }
  }, [reminderSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SYNC, JSON.stringify(syncSettings));
    } catch (e) {
      console.error(e);
    }
  }, [syncSettings]);

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

    // Total balance of all active accounts (Aset dikurangi beban kartu kredit)
    const totalAccountBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    const totalAssetBalance = accounts
      .filter(a => a.type !== 'credit_card')
      .reduce((sum, a) => sum + Math.max(0, a.balance || 0), 0);
    const totalCreditCardDebt = accounts
      .filter(a => a.type === 'credit_card' && a.balance < 0)
      .reduce((sum, a) => sum + Math.abs(a.balance), 0);

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

    // Total payable debt includes unpaid loan notes plus current credit card debt burden
    const totalPayableDebt = totalDirectDebt + totalCreditCardDebt;

    return {
      totalIncome,
      totalExpense,
      netBalance,
      totalAccountBalance,
      totalAssetBalance,
      totalCreditCardDebt,
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
    // For credit card, balance is a debt burden (minus)
    let initialBal = data.initialBalance || 0;
    if (data.type === 'credit_card' && initialBal > 0) {
      initialBal = -initialBal;
    }

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
        // If credit card and user entered positive number for debt, store as negative balance
        const finalBal = a.type === 'credit_card' && newBalance > 0 ? -newBalance : newBalance;
        return {
          ...a,
          balance: finalBal,
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
    const newTx: Transaction = {
      ...data,
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Automatically update account balance
    if (data.accountId) {
      setAccounts(prev =>
        prev.map(acc => {
          if (acc.id !== data.accountId) return acc;
          const delta = data.type === 'income' ? data.amount : -data.amount;
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
    const oldAmount = oldTx.amount;
    const newAmount = updatedData.amount !== undefined ? updatedData.amount : oldAmount;

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
      dueDate: effectiveDueDate,
      estimatedPayoffDate: estimatedPayoff,
      id: `debt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      remainingAmount: data.totalAmount,
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
        const updated = { ...d, ...data, updatedAt: Date.now() };

        if (updated.installmentCategory && updated.installmentCategory !== 'non_installment') {
          if (updated.dueDayOfMonth) {
            updated.dueDate = getNextDueDate(updated.dueDayOfMonth);
            if (updated.remainingTenor && updated.remainingTenor > 0) {
              updated.estimatedPayoffDate = calculatePayoffDate(updated.dueDayOfMonth, updated.remainingTenor).formatted;
            }
          }
        }

        const totalPaid = (updated.payments || []).reduce((sum, p) => sum + p.amount, 0);
        const remaining = Math.max(0, updated.totalAmount - totalPaid);
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
    if (amount <= 0) throw new Error('Nominal pembayaran harus lebih dari 0');

    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newRemaining = Math.max(0, targetDebt.remainingAmount - amount);
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
      if (newRemainingTenor === 0) {
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

    return { payment: newPayment, transaction: newTx };
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
        const newRemaining = Math.max(0, d.totalAmount - totalPaid);
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

  const updateReminderSettings = (settings: Partial<ReminderSettings>) => {
    setReminderSettings(prev => ({ ...prev, ...settings }));
  };

  const updateSyncSettings = (settings: Partial<SyncSettings>) => {
    setSyncSettings(prev => ({ ...prev, ...settings }));
  };

  // Cloud Sync
  const syncToCloud = async (passphrase: string): Promise<boolean> => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const payload: SyncPayload = {
        transactions,
        categories,
        accounts,
        debts,
        reminderSettings,
        timestamp: Date.now(),
      };

      const result = await pushToCloudVault(syncSettings.vaultId, passphrase, payload);
      const hash = await hashPassphrase(passphrase);

      setSyncSettings(prev => ({
        ...prev,
        lastSyncedAt: result.updatedAt,
        passphraseHash: hash,
      }));

      setIsSyncing(false);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal sinkronisasi';
      setSyncError(msg);
      setIsSyncing(false);
      throw err;
    }
  };

  const pullFromCloud = async (vaultId: string, passphrase: string): Promise<boolean> => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const data = await pullFromCloudVault(vaultId, passphrase);

      if (Array.isArray(data.transactions)) {
        setTransactions(data.transactions as Transaction[]);
      }
      if (Array.isArray(data.categories)) {
        setCategories(data.categories as Category[]);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (Array.isArray((data as any).accounts)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAccounts((data as any).accounts as Account[]);
      }
      if (Array.isArray(data.debts)) {
        setDebts(data.debts as Debt[]);
      }
      if (data.reminderSettings) {
        setReminderSettings(data.reminderSettings as ReminderSettings);
      }

      const hash = await hashPassphrase(passphrase);
      setSyncSettings(prev => ({
        ...prev,
        vaultId,
        lastSyncedAt: Date.now(),
        passphraseHash: hash,
      }));

      setIsSyncing(false);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memulihkan data dari Cloud';
      setSyncError(msg);
      setIsSyncing(false);
      throw err;
    }
  };

  const exportBackupFile = async (passphrase: string) => {
    const payload: SyncPayload = {
      transactions,
      categories,
      accounts,
      debts,
      reminderSettings,
      timestamp: Date.now(),
    };
    await exportEncryptedBackup(payload, passphrase, `notaku_backup_${getTodayString()}.enc.json`);
  };

  const importBackupFile = async (file: File, passphrase: string): Promise<boolean> => {
    const data = await importEncryptedBackup(file, passphrase);
    if (Array.isArray(data.transactions)) setTransactions(data.transactions as Transaction[]);
    if (Array.isArray(data.categories)) setCategories(data.categories as Category[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (Array.isArray((data as any).accounts)) setAccounts((data as any).accounts as Account[]);
    if (Array.isArray(data.debts)) setDebts(data.debts as Debt[]);
    if (data.reminderSettings) setReminderSettings(data.reminderSettings as ReminderSettings);
    return true;
  };

  const resetToDefaultData = () => {
    const initial = getInitialSampleData();
    setCategories(initial.sampleCategories);
    setAccounts(initial.sampleAccounts);
    setTransactions(initial.sampleTransactions);
    setDebts(initial.sampleDebts);
  };

  const clearAllData = () => {
    setTransactions([]);
    setDebts([]);
    setCategories(ALL_DEFAULT_CATEGORIES);
    setAccounts(
      DEFAULT_ACCOUNTS.map(a => ({
        ...a,
        balance: 0,
        initialBalance: 0,
      }))
    );
    try {
      localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
      localStorage.removeItem(STORAGE_KEYS.DEBTS);
      localStorage.removeItem(STORAGE_KEYS.ACCOUNTS);
      localStorage.removeItem(STORAGE_KEYS.CATEGORIES);
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
        summary,
        reminderSettings,
        syncSettings,
        themeMode,
        isSyncing,
        syncError,
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
        setThemeMode,
        updateReminderSettings,
        updateSyncSettings,
        syncToCloud,
        pullFromCloud,
        exportBackupFile,
        importBackupFile,
        resetToDefaultData,
        clearAllData,
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
