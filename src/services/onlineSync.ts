import { doc, getDoc, setDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import type { Account, Bill, BillPayment, Category, Debt, ReminderSettings, Transaction } from '../types';

export interface VaultData {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  debts: Debt[];
  bills: Bill[];
  billPayments: BillPayment[];
  reminderSettings: ReminderSettings;
  vaultUpdatedAt: number;
}

export interface VaultDoc {
  vaultId: string;
  payload: string; // ciphertext AES-GCM (JSON dari VaultData)
  updatedAt: number;
  updatedBy: string; // device id
}

export interface UserProfile {
  email: string;
  vaultId: string;
  createdAt: number;
}

function requireDb() {
  const db = getFirebaseDb();
  if (!db) throw new Error('Layanan cloud belum dikonfigurasi');
  return db;
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('diginote_device_id');
    if (!id) {
      id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      localStorage.setItem('diginote_device_id', id);
    }
    return id;
  } catch {
    return `dev_${Math.random().toString(36).substring(2, 10)}`;
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function ensureUserProfile(uid: string, email: string, vaultId: string): Promise<UserProfile> {
  const db = requireDb();
  const existing = await getUserProfile(uid);
  if (existing) return existing;
  const profile: UserProfile = { email, vaultId, createdAt: Date.now() };
  await setDoc(doc(db, 'users', uid), profile);
  return profile;
}

export async function getVaultDoc(uid: string): Promise<VaultDoc | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, 'vaults', uid));
  return snap.exists() ? (snap.data() as VaultDoc) : null;
}

export async function pushVaultDoc(uid: string, vault: VaultDoc): Promise<void> {
  const db = requireDb();
  await setDoc(doc(db, 'vaults', uid), vault);
}

export function subscribeVaultDoc(uid: string, onChange: (vault: VaultDoc | null) => void): Unsubscribe {
  const db = requireDb();
  return onSnapshot(
    doc(db, 'vaults', uid),
    snap => {
      onChange(snap.exists() ? (snap.data() as VaultDoc) : null);
    },
    err => {
      console.error('Vault subscribe error:', err);
    }
  );
}
