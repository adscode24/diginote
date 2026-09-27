import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
// Konfigurasi klien publik (disengaja di-commit agar web + APK langsung cloud).
// Env var selalu menang bila diisi (mis. rotasi kunci tanpa rilis baru).
import appletConfig from "../../firebase-applet-config.json";

interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

function readConfig(): FirebaseClientConfig {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return {
    apiKey: env?.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
    authDomain: env?.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
    projectId: env?.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
    appId: env?.VITE_FIREBASE_APP_ID || appletConfig.appId,
  };
}

// Singleton Firebase app (aman untuk Web + Capacitor native)
export const firebaseApp = !getApps().length ? initializeApp(readConfig()) : getApp();

export const auth = getAuth(firebaseApp);

/** Getter auth (kompatibilitas dengan pemanggil lama). */
export function getFirebaseAuth(): Auth {
  return auth;
}

// Persistensi auth eksplisit agar tahan restart di WebView Android/iOS.
// Capacitor tetap memakai localStorage di dalam WebView, jadi ini kompatibel native.
try {
  // Fire-and-forget: jangan blokir startup aplikasi.
  setPersistence(auth, browserLocalPersistence).catch(() => {});
} catch {
  // abaikan — Firebase tetap fallback ke default persistence
}

// Firestore dengan cache lokal persisten (offline-first).
// Di Android WebView ini memakai IndexedDB sehingga tetap bisa baca/tulis offline.
let _db: Firestore;
try {
  _db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({}),
  });
} catch {
  // Sudah diinisialisasi (hot-reload / double import) -> pakai instance existing
  _db = getFirestore(firebaseApp);
}
export const db = _db;

/** True bila berjalan di dalam wrapper native Capacitor (Android/iOS). */
export function isNativePlatform(): boolean {
  try {
    const w = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    };
    if (w.Capacitor?.isNativePlatform) return w.Capacitor.isNativePlatform();
    if (w.Capacitor?.getPlatform) {
      const p = w.Capacitor.getPlatform();
      return p === "android" || p === "ios";
    }
  } catch {
    // abaikan
  }
  return false;
}

/**
 * UID lokal/offline (awalan "user_") tidak punya otorisasi cloud.
 * Hanya UID Firebase asli yang boleh sync — akun lokal diam-diam adalah
 * penyebab "sudah daftar di web tapi harus daftar lagi di HP".
 */
export function isCloudCapableUid(uid?: string | null): boolean {
  if (!uid) return false;
  if (uid.startsWith("user_")) return false;
  return true;
}

/** True bila aplikasi dikonfigurasi untuk mode cloud (selalu true bila config ada). */
export function isCloudEnabled(): boolean {
  try {
    const cfg = readConfig();
    return !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
  } catch {
    return false;
  }
}
