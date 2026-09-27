import React, { createContext, useContext, useState, useCallback } from 'react';
import { hashPassphrase } from '../services/crypto';

export interface AppUser {
  id: string;
  name: string;
  passwordHash: string;
  createdAt: number;
}

interface AuthContextType {
  currentUser: AppUser | null;
  users: AppUser[];
  login: (name: string, password: string) => Promise<void>;
  register: (name: string, password: string) => Promise<AppUser>;
  logout: () => void;
}

const USERS_KEY = 'diginote_users_v2';
const SESSION_KEY = 'diginote_session_v2';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function loadUsers(): AppUser[] {
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

function loadSessionUser(users: AppUser[]): AppUser | null {
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
  const [users, setUsers] = useState<AppUser[]>(loadUsers);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => loadSessionUser(loadUsers()));

  const persistUsers = (next: AppUser[]) => {
    setUsers(next);
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(next));
    } catch (e) {
      console.error(e);
    }
  };

  const register = useCallback(async (name: string, password: string): Promise<AppUser> => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Nama pengguna wajib diisi');
    if (password.length < 4) throw new Error('Kata sandi minimal 4 karakter');
    const latest = loadUsers();
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
    const next = [...latest, newUser];
    persistUsers(next);
    try {
      sessionStorage.setItem(SESSION_KEY, newUser.id);
    } catch (e) {
      console.error(e);
    }
    setCurrentUser(newUser);
    return newUser;
  }, []);

  const login = useCallback(async (name: string, password: string): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Nama pengguna wajib diisi');
    if (!password) throw new Error('Kata sandi wajib diisi');
    const latest = loadUsers();
    const found = latest.find(u => u.name.toLowerCase() === trimmedName.toLowerCase());
    if (!found) throw new Error('Akun tidak ditemukan, silakan daftar dulu');
    const passwordHash = await hashPassphrase(password);
    if (found.passwordHash !== passwordHash) throw new Error('Kata sandi salah');
    try {
      sessionStorage.setItem(SESSION_KEY, found.id);
    } catch (e) {
      console.error(e);
    }
    setCurrentUser(found);
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.error(e);
    }
    setCurrentUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, users, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
