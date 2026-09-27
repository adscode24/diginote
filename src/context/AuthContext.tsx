import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { hashPassphrase } from '../services/crypto';
import { isCloudEnabled, getFirebaseAuth } from '../services/firebase';
import { ensureUserProfile } from '../services/onlineSync';
import { generateVaultId } from '../services/crypto';

export interface AppUser {
  id: string;
  name: string; // email pada mode online, nama pada mode offline
  email?: string;
  passwordHash?: string; // hanya mode offline
  vaultId?: string; // kode vault cloud (mode online)
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
}

const USERS_KEY = 'diginote_users_v2';
const SESSION_KEY = 'diginote_session_v2';

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
    const unsub = onAuthStateChanged(auth, async fb => {
      setFbUser(fb);
      if (fb) {
        try {
          const { getUserProfile } = await import('../services/onlineSync');
          const profile = await getUserProfile(fb.uid);
          setFbProfile({
            id: fb.uid,
            name: fb.email || 'Pengguna',
            email: fb.email || undefined,
            vaultId: profile?.vaultId,
            createdAt: profile ? profile.createdAt : Date.now(),
          });
        } catch (e) {
          console.error(e);
          setFbProfile({
            id: fb.uid,
            name: fb.email || 'Pengguna',
            email: fb.email || undefined,
            createdAt: Date.now(),
          });
        }
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
        // Buatkan profil + kode vault cloud sendiri untuk akun ini
        const profile = await ensureUserProfile(cred.user.uid, email, generateVaultId());
        const user: AppUser = {
          id: cred.user.uid,
          name: email,
          email,
          vaultId: profile.vaultId,
          createdAt: profile.createdAt,
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
