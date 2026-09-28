import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { hashPassphrase } from '../services/crypto';
import { isCloudEnabled, getFirebaseAuth } from '../services/firebase';

export interface AppUser {
  id: string;
  name: string; // email pada mode online, nama pada mode offline
  email?: string;
  passwordHash?: string; // hanya mode offline
  photoURL?: string | null; // foto profil (tersinkron antar perangkat di mode cloud)
  createdAt: number;
}

interface AuthContextType {
  mode: 'online' | 'offline';
  currentUser: AppUser | null;
  authReady: boolean;
  users: AppUser[];
  login: (identifier: string, password: string) => Promise<void>;
  register: (identifier: string, password: string) => Promise<AppUser>;
  logout: () => void;
  /** Perbarui nama tampilan dan/atau foto profil (tersinkron antar perangkat). */
  updateProfileInfo: (data: { name?: string; photoURL?: string | null }) => Promise<void>;
  /** Mode online: kirim email reset password ke email akun saat ini. */
  sendPasswordReset: () => Promise<void>;
  /** Mode offline: ubah kata sandi dengan verifikasi kata sandi lama. */
  changeOfflinePassword: (oldPassword: string, newPassword: string) => Promise<void>;
}

const USERS_KEY = 'diginote_users_v2';
const SESSION_KEY = 'diginote_session_v2';
const ACTIVE_EMAIL_KEY = 'diginote_active_email';

export function getActiveEmail(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_EMAIL_KEY) || localStorage.getItem(ACTIVE_EMAIL_KEY);
  } catch {
    return null;
  }
}

function setActiveEmail(email: string | null) {
  try {
    if (email) {
      sessionStorage.setItem(ACTIVE_EMAIL_KEY, email);
      localStorage.setItem(ACTIVE_EMAIL_KEY, email);
    } else {
      sessionStorage.removeItem(ACTIVE_EMAIL_KEY);
      localStorage.removeItem(ACTIVE_EMAIL_KEY);
    }
  } catch (e) {
    console.error(e);
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ---------- Mode offline (perangkat lokal, tanpa Firebase) ----------

function loadLocalUsers(): AppUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return [];
}

function loadLocalSession(users: AppUser[]): AppUser | null {
  try {
    const sessionId = sessionStorage.getItem(SESSION_KEY);
    if (sessionId) {
      return users.find(u => u.id === sessionId) || null;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const online = isCloudEnabled();
  const [localUsers, setLocalUsers] = useState<AppUser[]>(() => (online ? [] : loadLocalUsers()));
  const [localUser, setLocalUser] = useState<AppUser | null>(() =>
    online ? null : loadLocalSession(loadLocalUsers())
  );
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [fbProfile, setFbProfile] = useState<AppUser | null>(null);
  const [authReady, setAuthReady] = useState(!online);

  // Dengarkan status login Firebase (mode online)
  useEffect(() => {
    if (!online) return;
    const auth = getFirebaseAuth();
    if (!auth) {
      setAuthReady(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, fb => {
      setFbUser(fb);
      if (fb) {
        if (fb.email) setActiveEmail(fb.email);
        setFbProfile({
          id: fb.uid,
          name: fb.displayName || fb.email || 'Pengguna',
          email: fb.email || undefined,
          photoURL: fb.photoURL,
          createdAt: Date.now(),
        });
      } else {
        setFbProfile(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, [online]);

  const persistLocalUsers = (next: AppUser[]) => {
    setLocalUsers(next);
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error(e);
    }
  };

  const register = useCallback(
    async (identifier: string, password: string): Promise<AppUser> => {
      if (online) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error('Layanan cloud belum dikonfigurasi');
        const email = identifier.trim();
        if (!isValidEmail(email)) throw new Error('Masukkan alamat email yang valid');
        if (password.length < 6) throw new Error('Kata sandi minimal 6 karakter');
        const cred = await createUserWithEmailAndPassword(auth, email, password).catch(
          (err: { code?: string; message?: string }) => {
            throw new Error(translateFirebaseError(err.code));
          }
        );
        // Kode vault cloud dibuat otomatis saat vault digiVaults pertama dibuat
        // (ensureUserVault) — sama untuk semua perangkat yang login email ini.
        setActiveEmail(email);
        const user: AppUser = {
          id: cred.user.uid,
          name: email,
          email,
          createdAt: Date.now(),
        };
        setFbProfile(user);
        return user;
      }

      const trimmedName = identifier.trim();
      if (!trimmedName) throw new Error('Nama pengguna wajib diisi');
      if (password.length < 4) throw new Error('Kata sandi minimal 4 karakter');
      const latest = loadLocalUsers();
      if (latest.some(u => u.name.toLowerCase() === trimmedName.toLowerCase())) {
        throw new Error('Nama pengguna sudah terdaftar, silakan masuk atau pakai nama lain');
      }
      const passwordHash = await hashPassphrase(password);
      const newUser: AppUser = {
        id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: trimmedName,
        passwordHash,
        createdAt: Date.now(),
      };
      persistLocalUsers([...latest, newUser]);
      try {
        sessionStorage.setItem(SESSION_KEY, newUser.id);
      } catch (e) {
        console.error(e);
      }
      setLocalUser(newUser);
      return newUser;
    },
    [online]
  );

  const login = useCallback(
    async (identifier: string, password: string): Promise<void> => {
      if (online) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error('Layanan cloud belum dikonfigurasi');
        const email = identifier.trim();
        if (!isValidEmail(email)) throw new Error('Masukkan alamat email yang valid');
        if (!password) throw new Error('Kata sandi wajib diisi');
        await signInWithEmailAndPassword(auth, email, password).catch(
          (err: { code?: string; message?: string }) => {
            throw new Error(translateFirebaseError(err.code));
          }
        );
        setActiveEmail(email);
        // Profil dimuat oleh listener onAuthStateChanged
        return;
      }

      const trimmedName = identifier.trim();
      if (!trimmedName) throw new Error('Nama pengguna wajib diisi');
      if (!password) throw new Error('Kata sandi wajib diisi');
      const latest = loadLocalUsers();
      const found = latest.find(u => u.name.toLowerCase() === trimmedName.toLowerCase());
      if (!found) throw new Error('Akun tidak ditemukan, silakan daftar dulu');
      const passwordHash = await hashPassphrase(password);
      if (found.passwordHash !== passwordHash) throw new Error('Kata sandi salah');
      try {
        sessionStorage.setItem(SESSION_KEY, found.id);
      } catch (e) {
        console.error(e);
      }
      setLocalUser(found);
    },
    [online]
  );

  const logout = useCallback(() => {
    setActiveEmail(null);
    if (online) {
      const auth = getFirebaseAuth();
      if (auth) signOut(auth).catch(e => console.error(e));
      setFbUser(null);
      setFbProfile(null);
    } else {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch (e) {
        console.error(e);
      }
      setLocalUser(null);
    }
  }, [online]);

  const sendPasswordReset = useCallback(async (): Promise<void> => {
    if (!online) throw new Error('Hanya tersedia di mode cloud');
    const auth = getFirebaseAuth();
    if (!auth) throw new Error('Layanan cloud belum dikonfigurasi');
    const email = fbProfile?.email || getActiveEmail();
    if (!email) throw new Error('Email akun tidak ditemukan');
    await sendPasswordResetEmail(auth, email).catch((err: { code?: string }) => {
      throw new Error(translateFirebaseError(err.code));
    });
  }, [online, fbProfile]);

  const changeOfflinePassword = useCallback(
    async (oldPassword: string, newPassword: string): Promise<void> => {
      if (online) throw new Error('Gunakan reset via email di mode cloud');
      if (!localUser) throw new Error('Tidak ada pengguna aktif');
      if (newPassword.length < 4) throw new Error('Kata sandi baru minimal 4 karakter');
      const oldHash = await hashPassphrase(oldPassword);
      if (localUser.passwordHash !== oldHash) throw new Error('Kata sandi lama salah');
      const newHash = await hashPassphrase(newPassword);
      const updated: AppUser = { ...localUser, passwordHash: newHash };
      const latest = loadLocalUsers().map(u => (u.id === updated.id ? updated : u));
      persistLocalUsers(latest);
      setLocalUser(updated);
    },
    [online, localUser]
  );

  const updateProfileInfo = useCallback(
    async (data: { name?: string; photoURL?: string | null }): Promise<void> => {
      const trimmedName = data.name !== undefined ? data.name.trim() : undefined;
      if (trimmedName !== undefined && !trimmedName) throw new Error('Nama pengguna wajib diisi');
      if (online) {
        const auth = getFirebaseAuth();
        if (!auth?.currentUser) throw new Error('Tidak ada pengguna aktif');
        const updates: { displayName?: string; photoURL?: string | null } = {};
        if (trimmedName !== undefined) updates.displayName = trimmedName;
        if (data.photoURL !== undefined) updates.photoURL = data.photoURL;
        const { updateProfile } = await import('firebase/auth');
        await updateProfile(auth.currentUser, updates);
        await auth.currentUser.reload().catch(() => {});
        const fb = auth.currentUser;
        setFbProfile({
          id: fb.uid,
          name: fb.displayName || fb.email || 'Pengguna',
          email: fb.email || undefined,
          photoURL: fb.photoURL,
          createdAt: fbProfile?.createdAt || Date.now(),
        });
        if (trimmedName) setActiveEmail(fb.email || trimmedName);
      } else {
        if (!localUser) throw new Error('Tidak ada pengguna aktif');
        const updated: AppUser = {
          ...localUser,
          ...(trimmedName !== undefined ? { name: trimmedName } : {}),
          ...(data.photoURL !== undefined ? { photoURL: data.photoURL } : {}),
        };
        persistLocalUsers(loadLocalUsers().map(u => (u.id === updated.id ? updated : u)));
        setLocalUser(updated);
      }
    },
    [online, localUser, fbProfile]
  );

  return (
    <AuthContext.Provider
      value={{
        mode: online ? 'online' : 'offline',
        currentUser: online ? fbProfile : localUser,
        authReady,
        users: online ? [] : localUsers,
        login,
        register,
        logout,
        sendPasswordReset,
        changeOfflinePassword,
        updateProfileInfo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

function translateFirebaseError(code?: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Email sudah terdaftar, silakan masuk';
    case 'auth/invalid-email':
      return 'Alamat email tidak valid';
    case 'auth/weak-password':
      return 'Kata sandi minimal 6 karakter';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email atau kata sandi salah';
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan, coba lagi nanti';
    case 'auth/network-request-failed':
      return 'Tidak ada koneksi internet';
    default:
      return 'Gagal memproses akun, coba lagi';
  }
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export type { User };
