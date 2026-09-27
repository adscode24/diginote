import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

function readConfig(): FirebaseConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID as string | undefined;
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}

/**
 * Mode cloud aktif hanya bila konfigurasi Firebase lengkap.
 * Tanpa konfigurasi, aplikasi berjalan mode lokal (offline) seperti semula.
 */
export function isCloudEnabled(): boolean {
  return readConfig() !== null;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function ensureApp(): FirebaseApp | null {
  const config = readConfig();
  if (!config) return null;
  if (!app) {
    app = getApps().length > 0 ? getApps()[0]! : initializeApp(config);
  }
  return app;
}

export function getFirebaseAuth(): Auth | null {
  const a = ensureApp();
  if (!a) return null;
  if (!auth) auth = getAuth(a);
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  const a = ensureApp();
  if (!a) return null;
  if (!db) db = getFirestore(a);
  return db;
}
