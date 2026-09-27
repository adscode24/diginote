export type TransactionType = 'income' | 'expense';

export type PaymentMethod = 'cash' | 'transfer' | 'ewallet' | 'credit_card';

export type AccountType = 'bank' | 'ewallet' | 'credit_card' | 'cash' | 'investment' | 'other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  initialBalance: number;
  accountNumber?: string;
  color: string;
  icon: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
  isDefault?: boolean;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  categoryName: string;
  accountId?: string; // Sumber Dana
  accountName?: string;
  date: string; // YYYY-MM-DD
  description: string;
  paymentMethod: PaymentMethod;
  debtPaymentId?: string;
  receiptUrl?: string; // base64 or image url
  createdAt: number;
  updatedAt: number;
}

export type DebtType = 'payable' | 'receivable'; // payable = Hutang Saya, receivable = Piutang Orang Lain
export type DebtStatus = 'unpaid' | 'partial' | 'paid';
export type InstallmentCategory = 'non_installment' | 'fixed_installment' | 'tiered_installment';

export interface TieredPeriod {
  id: string;
  name: string; // e.g. "Tahun 1-3 (Fixed 3.75%)", "Floating Rate"
  durationMonths: number;
  monthlyAmount: number;
  interestRate?: number; // % p.a.
  isFloating?: boolean;
}

export interface DebtPayment {
  id: string;
  debtId: string;
  amount: number;
  accountId?: string; // Sumber dana yang digunakan untuk bayar
  accountName?: string;
  paymentDate: string; // YYYY-MM-DD
  notes: string;
  receiptImage?: string; // base64 image receipt / bukti transfer
  transactionId?: string; // linked transaction id
  createdAt: number;
  // Rincian amortisasi cicilan berjangka (KPR): porsi bunga vs pokok
  interestPortion?: number; // porsi cicilan untuk bunga bulan berjalan (Rp)
  principalPortion?: number; // porsi cicilan yang memotong pokok (Rp)
  annualRateApplied?: number; // suku bunga periode aktif saat bayar (% p.a.)
}

export interface Debt {
  id: string;
  type: DebtType;
  counterparty: string; // Nama Orang / Pihak / Bank
  totalAmount: number;
  remainingAmount: number;
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD (jatuh tempo)
  dueDayOfMonth?: number; // 1-31 jika jatuh tempo bulanan rutin
  notes: string;
  status: DebtStatus;
  payments: DebtPayment[];
  createdAt: number;
  updatedAt: number;

  // Fitur Cicilan Tetap & Cicilan Berjangka (KPR)
  installmentCategory?: InstallmentCategory;
  monthlyInstallment?: number; // nominal cicilan per bulan
  remainingTenor?: number; // sisa berapa kali lagi cicilan harus dibayar (bulan)
  totalTenor?: number; // total jangka waktu cicilan awal (bulan)
  estimatedPayoffDate?: string; // estimasi tanggal lunas terformat
  tieredPeriods?: TieredPeriod[]; // skema KPR / cicilan berjangka (bunga fix & floating)
  currentTierIndex?: number;
}

export interface ReminderSettings {
  enabled: boolean;
  time: string; // "20:00"
  lastPromptedDate?: string;
}

export interface SyncSettings {
  vaultId: string; // Cloud sync identifier (e.g. DN-7839-4412)
  isEncrypted: boolean;
  passphraseHash?: string;
  lastSyncedAt?: number;
  autoSync: boolean;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type ActiveTab = 'dashboard' | 'transactions' | 'accounts' | 'debts' | 'summary' | 'settings' | 'profile';

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalAccountBalance: number; // total saldo bersih dari semua sumber dana
  totalAssetBalance: number; // total saldo kas, tabungan, rekening & kartu kredit
  totalPayableDebt: number; // total hutang yang harus dibayar (catatan hutang)
  totalReceivableDebt: number; // total piutang yang akan diterima
  monthlyIncome: number;
  monthlyExpense: number;
  monthlyBalance: number;
  savingsRate: number; // percentage
}

export interface Bill {
  id: string;
  name: string; // mis. "WiFi IndiHome", "Listrik PLN"
  amount: number; // nominal tagihan per bulan (Rp)
  dueDayOfMonth: number; // tanggal jatuh tempo tiap bulan (1-31)
  categoryId?: string; // kategori pengeluaran default
  categoryName?: string;
  accountId?: string; // sumber dana default untuk bayar
  notes: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BillPayment {
  id: string;
  billId: string;
  monthKey: string; // periode tagihan "YYYY-MM" (dari tanggal bayar)
  amount: number;
  accountId?: string;
  accountName?: string;
  categoryId: string;
  categoryName: string;
  paymentDate: string; // YYYY-MM-DD
  transactionId?: string; // id transaksi pengeluaran terkait
  createdAt: number;
}
