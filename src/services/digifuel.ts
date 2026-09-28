import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  type Firestore,
} from 'firebase/firestore';

// Konfigurasi klien PUBLIK project DigiFuel (Fuel-Traxr) — disengaja publik,
// keamanan ditegakkan oleh Auth + Firestore Rules di project tersebut.
const DIGIFUEL_CONFIG = {
  apiKey: 'AIzaSyBk5Iuq1RdX2YFU6pYAYpFy0dYNKhc3-Rw',
  authDomain: 'gen-lang-client-0414609237.firebaseapp.com',
  projectId: 'gen-lang-client-0414609237',
  appId: '1:175998157659:web:afa18f5412d5c7d016507e',
};

export interface DigifuelFuelRecord {
  id: string;
  vehicleId: string;
  date: string;
  fuelType: string;
  liters: number;
  totalCost: number;
  stationName: string;
  notes?: string;
  receiptImage?: string;
}

export interface DigifuelServiceEntry {
  id: string;
  vehicleId: string;
  title: string;
  date: string;
  cost?: number;
  workshop?: string;
  notes?: string;
}

export interface DigifuelVault {
  vehicles: { id: string; name: string }[];
  fuelRecords: DigifuelFuelRecord[];
  serviceHistory: DigifuelServiceEntry[];
  vaultCode: string;
  updatedAt: string;
}

export interface DigifuelLink {
  email: string;
  accountId?: string;
  lastPulledAt: number | null;
  mirroredCount: number;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function ensureApp(): FirebaseApp {
  if (!app) {
    app = getApps().find(a => a.name === 'digifuel') ?? initializeApp(DIGIFUEL_CONFIG, 'digifuel');
  }
  return app;
}

export function getDigifuelAuth(): Auth {
  const a = ensureApp();
  if (!auth) {
    auth = getAuth(a);
    try {
      setPersistence(auth, browserLocalPersistence).catch(() => {});
    } catch {
      /* abaikan */
    }
  }
  return auth;
}

export function getDigifuelDb(): Firestore {
  const a = ensureApp();
  if (!db) {
    try {
      db = initializeFirestore(a, { localCache: persistentLocalCache({}) });
    } catch {
      db = getFirestore(a);
    }
  }
  return db;
}

function linkKey(uid: string) {
  return `diginote_dfuel_link_${uid}`;
}

export function getDigifuelLink(uid: string): DigifuelLink | null {
  try {
    const raw = localStorage.getItem(linkKey(uid));
    if (raw) return JSON.parse(raw) as DigifuelLink;
  } catch {
    /* abaikan */
  }
  return null;
}

function saveDigifuelLink(uid: string, link: DigifuelLink) {
  try {
    localStorage.setItem(linkKey(uid), JSON.stringify(link));
  } catch (e) {
    console.error(e);
  }
}

export function clearDigifuelLink(uid: string) {
  try {
    localStorage.removeItem(linkKey(uid));
  } catch {
    /* abaikan */
  }
}

/** Login ke project DigiFuel dengan email yang sama (akun terpisah per project). */
export async function linkDigifuelAccount(email: string, password: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) throw new Error('Alamat email tidak valid');
  if (!password) throw new Error('Kata sandi wajib diisi');
  const auth = getDigifuelAuth();
  await signInWithEmailAndPassword(auth, cleanEmail, password).catch((err: { code?: string }) => {
    if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
      throw new Error('Email atau kata sandi DigiFuel salah. Pastikan akun sudah terdaftar di DigiFuel.');
    }
    if (err.code === 'auth/user-not-found') {
      throw new Error('Email belum terdaftar di DigiFuel. Daftar dulu di aplikasi DigiFuel.');
    }
    if (err.code === 'auth/network-request-failed') throw new Error('Tidak ada koneksi internet');
    throw new Error('Gagal masuk ke DigiFuel. Coba lagi.');
  });
}

export async function unlinkDigifuelAccount(): Promise<void> {
  try {
    await signOut(getDigifuelAuth());
  } catch {
    /* abaikan */
  }
}

/**
 * Ambil vault DigiFuel milik email ini. Membutuhkan Rules di project DigiFuel:
 *   match /fuelVaults/{uid} {
 *     allow read: if request.auth != null &&
 *       (request.auth.uid == uid || resource.data.ownerEmail == request.auth.token.email);
 *   }
 */
export async function fetchDigifuelVault(email: string): Promise<DigifuelVault | null> {
  const db = getDigifuelDb();
  const cleanEmail = email.trim().toLowerCase();
  const q = query(collection(db, 'fuelVaults'), where('ownerEmail', '==', cleanEmail));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  // Bila ada lebih dari satu (seharusnya tidak), pakai yang terbaru
  let best: DigifuelVault | null = null;
  snap.forEach(d => {
    const v = d.data() as DigifuelVault;
    if (!best || (v.updatedAt || '') > (best.updatedAt || '')) best = v;
  });
  return best;
}

export function persistDigifuelLink(uid: string, patch: Partial<DigifuelLink>) {
  const current = getDigifuelLink(uid) || { email: '', lastPulledAt: null, mirroredCount: 0 };
  saveDigifuelLink(uid, { ...current, ...patch });
}
