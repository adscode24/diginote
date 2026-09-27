import { Category, PaymentMethod, Account } from '../types';

// Tidak ada sumber dana bawaan: pengguna membuat sendiri lewat halaman Dana.
export const DEFAULT_ACCOUNTS: Account[] = [];

export const ACCOUNT_TYPES: { id: Account['type']; label: string; icon: string }[] = [
  { id: 'bank', label: 'Rekening Bank', icon: 'Building2' },
  { id: 'ewallet', label: 'Dompet Digital / E-Wallet', icon: 'Smartphone' },
  { id: 'credit_card', label: 'Kartu Kredit', icon: 'CreditCard' },
  { id: 'cash', label: 'Uang Tunai (Cash)', icon: 'Banknote' },
  { id: 'investment', label: 'Investasi & Tabungan', icon: 'TrendingUp' },
  { id: 'other', label: 'Lainnya', icon: 'Wallet' },
];

export const DEFAULT_EXPENSE_CATEGORIES: Category[] = [
  { id: 'cat_food', name: 'Makanan & Minuman', type: 'expense', icon: 'Utensils', color: '#EF4444', isDefault: true },
  { id: 'cat_transport', name: 'Transportasi & Bensin', type: 'expense', icon: 'Car', color: '#F97316', isDefault: true },
  { id: 'cat_shopping', name: 'Belanja Harian', type: 'expense', icon: 'ShoppingBag', color: '#EC4899', isDefault: true },
  { id: 'cat_bills', name: 'Tagihan & Utilitas', type: 'expense', icon: 'Receipt', color: '#8B5CF6', isDefault: true },
  { id: 'cat_housing', name: 'Tempat Tinggal / Sewa', type: 'expense', icon: 'Home', color: '#6366F1', isDefault: true },
  { id: 'cat_entertainment', name: 'Hiburan & Liburan', type: 'expense', icon: 'Film', color: '#3B82F6', isDefault: true },
  { id: 'cat_health', name: 'Kesehatan & Obat', type: 'expense', icon: 'HeartPulse', color: '#10B981', isDefault: true },
  { id: 'cat_education', name: 'Pendidikan & Kursus', type: 'expense', icon: 'GraduationCap', color: '#14B8A6', isDefault: true },
  { id: 'cat_debt_pay', name: 'Pembayaran Hutang', type: 'expense', icon: 'CreditCard', color: '#DC2626', isDefault: true },
  { id: 'cat_charity', name: 'Sedekah & Donasi', type: 'expense', icon: 'Gift', color: '#059669', isDefault: true },
  { id: 'cat_other_exp', name: 'Pengeluaran Lainnya', type: 'expense', icon: 'MoreHorizontal', color: '#64748B', isDefault: true },
];

export const DEFAULT_INCOME_CATEGORIES: Category[] = [
  { id: 'cat_salary', name: 'Gaji Bulanan', type: 'income', icon: 'Briefcase', color: '#10B981', isDefault: true },
  { id: 'cat_business', name: 'Hasil Usaha / Bisnis', type: 'income', icon: 'Store', color: '#059669', isDefault: true },
  { id: 'cat_freelance', name: 'Freelance & Side Job', type: 'income', icon: 'Laptop', color: '#0EA5E9', isDefault: true },
  { id: 'cat_bonus', name: 'Bonus & THR', type: 'income', icon: 'Sparkles', color: '#F59E0B', isDefault: true },
  { id: 'cat_investment', name: 'Investasi & Dividen', type: 'income', icon: 'TrendingUp', color: '#8B5CF6', isDefault: true },
  { id: 'cat_debt_received', name: 'Penerimaan Piutang', type: 'income', icon: 'ArrowDownLeft', color: '#14B8A6', isDefault: true },
  { id: 'cat_cc_payment', name: 'Pelunasan Tagihan Kartu Kredit', type: 'income', icon: 'CreditCard', color: '#10B981', isDefault: true },
  { id: 'cat_other_inc', name: 'Pemasukan Lainnya', type: 'income', icon: 'PlusCircle', color: '#64748B', isDefault: true },
];

export const ALL_DEFAULT_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES];

export const PAYMENT_METHODS: { id: PaymentMethod; name: string; icon: string }[] = [
  { id: 'transfer', name: 'Transfer Bank', icon: 'Building2' },
  { id: 'cash', name: 'Tunai (Cash)', icon: 'Banknote' },
  { id: 'ewallet', name: 'E-Wallet', icon: 'Smartphone' },
  { id: 'credit_card', name: 'Kartu Kredit / Debit', icon: 'CreditCard' },
];

export const CATEGORY_ICON_OPTIONS = [
  'Utensils', 'Car', 'ShoppingBag', 'Receipt', 'Home', 'Film', 'HeartPulse',
  'GraduationCap', 'CreditCard', 'Gift', 'Briefcase', 'Store', 'Laptop',
  'Sparkles', 'TrendingUp', 'ArrowDownLeft', 'Coffee', 'Plane', 'BookOpen',
  'Wifi', 'Smartphone', 'Zap', 'Shield', 'MoreHorizontal', 'Building2', 'Banknote', 'Wallet'
];

export const COLOR_PALETTE = [
  '#005EAD', '#00AED6', '#10B981', '#059669', '#14B8A6', '#F59E0B',
  '#EF4444', '#DC2626', '#8B5CF6', '#6366F1', '#EC4899', '#64748B'
];
