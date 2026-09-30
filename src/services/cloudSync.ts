import { doc, getDoc, setDoc, updateDoc, onSnapshot, deleteDoc } from "firebase/firestore";
import type {
  Account,
  Bill,
  BillPayment,
  Category,
  Debt,
  ReminderSettings,
  Transaction,
} from "../types";
import { db } from "./firebase";

export const VAULT_COLLECTION = "digiVaults";
export const VAULT_SCHEMA_VERSION = 1;

export interface VaultPayload {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  debts: Debt[];
  bills: Bill[];
  billPayments: BillPayment[];
  reminderSettings: ReminderSettings;
}

export interface VaultMember {
  uid: string;
  email?: string | null;
  name?: string | null;
}

export interface CloudVault extends VaultPayload {
  ownerEmail: string | null;
  displayName: string | null;
  vaultCode: string;
  updatedAt: string; // ISO string
  schemaVersion: number;
  members: string[];
  memberProfiles: VaultMember[];
}

/** Identitas minimal pemilik vault (dekopling dari tipe firebase User). */
export interface VaultOwner {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

export type CloudSyncErrorCode =
  | "permission-denied"
  | "unavailable"
  | "not-enabled"
  | "unknown";

export class CloudSyncError extends Error {
  code: CloudSyncErrorCode;
  constructor(message: string, code: CloudSyncErrorCode = "unknown") {
    super(message);
    this.code = code;
  }
}

const VAULT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // tanpa I,O,0,1 agar mudah dibaca

/**
 * Firestore MENOLAK nilai `undefined` (melempar "Unsupported field value").
 * Data aplikasi punya banyak field opsional yang sering `undefined`
 * (mis. receiptImage, accountNumber, notes). Klon JSON menghilangkan semua
 * key undefined secara rekursif sehingga push vault dijamin tidak crash.
 *
 * Foto struk (data: URL base64) juga dibuang dari payload cloud: ukurannya
 * bisa bermegabyte sehingga membekukan UI saat serialize + melampaui batas
 * 1MB per dokumen Firestore. Foto tetap tersimpan lokal di perangkat dan
 * disambung ulang berdasarkan ID saat pull (lihat applyCloudVault).
 */
function sanitizeForFirestore<T>(value: T): T {
  try {
    return JSON.parse(
      JSON.stringify(value ?? null, (k, v) =>
        typeof v === 'string' && v.startsWith('data:') ? undefined : v
      )
    ) as T;
  } catch {
    return value;
  }
}

/** Kode Vault Cloud, mis. "DN-7KQ2XA". Unik per akun, dibuat sekali lalu permanen. */
export function generateVaultCode(): string {
  let suffix = "";
  try {
    const buf = new Uint32Array(6);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 6; i++) {
      suffix += VAULT_CODE_ALPHABET[buf[i] % VAULT_CODE_ALPHABET.length];
    }
  } catch {
    for (let i = 0; i < 6; i++) {
      suffix += VAULT_CODE_ALPHABET[Math.floor(Math.random() * VAULT_CODE_ALPHABET.length)];
    }
  }
  return `DN-${suffix}`;
}

function vaultDocRef(docId: string) {
  return doc(db, VAULT_COLLECTION, docId);
}

function inviteDocRef(code: string) {
  return doc(db, "vaultInvites", code.trim().toUpperCase());
}

/** Ambil vault sekali (untuk tarik manual paksa). */
export async function fetchVault(uid: string): Promise<CloudVault | null> {
  return fetchVaultById(uid);
}

/** Ambil vault berdasarkan ID dokumen (pribadi = uid sendiri, berdua = uid pemilik). */
export async function fetchVaultById(docId: string): Promise<CloudVault | null> {
  try {
    const snap = await getDoc(vaultDocRef(docId));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<CloudVault>;
    return {
      transactions: (data.transactions as Transaction[]) ?? [],
      categories: (data.categories as Category[]) ?? [],
      accounts: (data.accounts as Account[]) ?? [],
      debts: (data.debts as Debt[]) ?? [],
      bills: (data.bills as Bill[]) ?? [],
      billPayments: (data.billPayments as BillPayment[]) ?? [],
      reminderSettings: data.reminderSettings as ReminderSettings,
      ownerEmail: (data.ownerEmail as string | null) ?? null,
      displayName: (data.displayName as string | null) ?? null,
      vaultCode: (data.vaultCode as string) ?? "",
      updatedAt: (data.updatedAt as string) ?? new Date(0).toISOString(),
      schemaVersion: (data.schemaVersion as number) ?? VAULT_SCHEMA_VERSION,
      members: Array.isArray(data.members) ? (data.members as string[]) : [],
      memberProfiles: Array.isArray(data.memberProfiles) ? (data.memberProfiles as VaultMember[]) : [],
    };
  } catch (err) {
    throw toFriendlyError(err);
  }
}

function toFriendlyError(err: unknown): CloudSyncError {
  const code = (err as { code?: string })?.code || "";
  const message = (err as Error)?.message || String(err);
  if (code === "permission-denied") {
    return new CloudSyncError(
      "Akses cloud ditolak. Periksa Firestore Rules (izinkan read/write untuk pemilik uid). Lihat FIRESTORE_SETUP.md.",
      "permission-denied"
    );
  }
  if (code === "unavailable" || /offline|network|unavailable|failed to get document/i.test(message)) {
    return new CloudSyncError(
      "Cloud tidak terjangkau (offline). Data tersimpan lokal dan akan tersinkron otomatis saat online.",
      "unavailable"
    );
  }
  if (code === "failed-precondition" || /database .* does not exist|not been created/i.test(message)) {
    return new CloudSyncError(
      "Database Firestore belum dibuat di Firebase Console. Lihat FIRESTORE_SETUP.md untuk mengaktifkannya.",
      "not-enabled"
    );
  }
  return new CloudSyncError(message || "Gagal sinkronisasi cloud.", "unknown");
}

/**
 * Pastikan dokumen vault milik user ada. Jika belum ada, buat dengan
 * vaultCode baru + data lokal awal (agar HP pertama langsung naik ke cloud).
 */
export async function ensureUserVault(
  user: VaultOwner,
  initialLocal?: VaultPayload,
  docId?: string
): Promise<CloudVault> {
  try {
    const ref = vaultDocRef(docId || user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Partial<CloudVault>;
      // Lengkapi vaultCode lama yang belum punya
      if (!data.vaultCode) {
        const vaultCode = generateVaultCode();
        await setDoc(
          ref,
          {
            vaultCode,
            ownerEmail: user.email ?? data.ownerEmail ?? null,
            displayName: user.displayName ?? data.displayName ?? null,
            schemaVersion: VAULT_SCHEMA_VERSION,
          },
          { merge: true }
        );
        return {
          transactions: (data.transactions as Transaction[]) ?? [],
          categories: (data.categories as Category[]) ?? [],
          accounts: (data.accounts as Account[]) ?? [],
          debts: (data.debts as Debt[]) ?? [],
          bills: (data.bills as Bill[]) ?? [],
          billPayments: (data.billPayments as BillPayment[]) ?? [],
          reminderSettings: data.reminderSettings as ReminderSettings,
          ownerEmail: user.email ?? null,
          displayName: user.displayName ?? null,
          vaultCode,
          updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
          schemaVersion: VAULT_SCHEMA_VERSION,
          members: Array.isArray(data.members) ? (data.members as string[]) : [],
          memberProfiles: Array.isArray(data.memberProfiles) ? (data.memberProfiles as VaultMember[]) : [],
        };
      }
      return {
        transactions: (data.transactions as Transaction[]) ?? [],
        categories: (data.categories as Category[]) ?? [],
        accounts: (data.accounts as Account[]) ?? [],
        debts: (data.debts as Debt[]) ?? [],
        bills: (data.bills as Bill[]) ?? [],
        billPayments: (data.billPayments as BillPayment[]) ?? [],
        reminderSettings: data.reminderSettings as ReminderSettings,
        ownerEmail: (data.ownerEmail as string | null) ?? user.email ?? null,
        displayName: (data.displayName as string | null) ?? user.displayName ?? null,
        vaultCode: data.vaultCode as string,
        updatedAt: (data.updatedAt as string) ?? new Date().toISOString(),
        schemaVersion: VAULT_SCHEMA_VERSION,
        members: Array.isArray(data.members) ? (data.members as string[]) : [],
        memberProfiles: Array.isArray(data.memberProfiles) ? (data.memberProfiles as VaultMember[]) : [],
      };
    }
    // Belum ada -> buat baru, bawa data lokal HP pertama jika ada
    const vaultCode = generateVaultCode();
    const fresh: CloudVault = {
      transactions: sanitizeForFirestore(initialLocal?.transactions ?? []),
      categories: sanitizeForFirestore(initialLocal?.categories ?? []),
      accounts: sanitizeForFirestore(initialLocal?.accounts ?? []),
      debts: sanitizeForFirestore(initialLocal?.debts ?? []),
      bills: sanitizeForFirestore(initialLocal?.bills ?? []),
      billPayments: sanitizeForFirestore(initialLocal?.billPayments ?? []),
      reminderSettings: sanitizeForFirestore(
        initialLocal?.reminderSettings ?? ({ enabled: true, time: "20:00" } as ReminderSettings)
      ),
      ownerEmail: user.email ?? null,
      displayName: user.displayName ?? null,
      vaultCode,
      updatedAt: new Date().toISOString(),
      schemaVersion: VAULT_SCHEMA_VERSION,
      members: [user.uid],
      memberProfiles: [{ uid: user.uid, email: user.email ?? null, name: user.displayName ?? null }],
    };
    await setDoc(ref, fresh);
    return fresh;
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Dorong seluruh state lokal ke cloud (last-write-wins per vault). */
export async function pushVault(
  user: VaultOwner,
  vaultCode: string,
  payload: VaultPayload,
  docId?: string
): Promise<string> {
  try {
    const updatedAt = new Date().toISOString();
    await setDoc(
      vaultDocRef(docId || user.uid),
      {
        transactions: sanitizeForFirestore(payload.transactions),
        categories: sanitizeForFirestore(payload.categories),
        accounts: sanitizeForFirestore(payload.accounts),
        debts: sanitizeForFirestore(payload.debts),
        bills: sanitizeForFirestore(payload.bills),
        billPayments: sanitizeForFirestore(payload.billPayments),
        reminderSettings: sanitizeForFirestore(payload.reminderSettings),
        ownerEmail: user.email ?? null,
        displayName: user.displayName ?? null,
        vaultCode,
        updatedAt,
        schemaVersion: VAULT_SCHEMA_VERSION,
      },
      { merge: true }
    );
    return updatedAt;
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/**
 * Listener realtime lintas perangkat. Setiap edit dari HP/laptop lain
 * langsung memicu onData di perangkat ini.
 */
export function subscribeVault(
  user: VaultOwner,
  onData: (vault: CloudVault | null) => void,
  onError: (err: CloudSyncError) => void,
  docId?: string
): () => void {
  try {
    return onSnapshot(
      vaultDocRef(docId || user.uid),
      (snap) => {
        try {
          if (!snap.exists()) {
            onData(null);
            return;
          }
          const data = snap.data() as Partial<CloudVault>;
          onData({
            transactions: (data.transactions as Transaction[]) ?? [],
            categories: (data.categories as Category[]) ?? [],
            accounts: (data.accounts as Account[]) ?? [],
            debts: (data.debts as Debt[]) ?? [],
            bills: (data.bills as Bill[]) ?? [],
            billPayments: (data.billPayments as BillPayment[]) ?? [],
            reminderSettings: data.reminderSettings as ReminderSettings,
            ownerEmail: (data.ownerEmail as string | null) ?? user.email ?? null,
            displayName: (data.displayName as string | null) ?? user.displayName ?? null,
            vaultCode: (data.vaultCode as string) ?? "",
            updatedAt: (data.updatedAt as string) ?? new Date(0).toISOString(),
            schemaVersion: (data.schemaVersion as number) ?? VAULT_SCHEMA_VERSION,
            members: Array.isArray(data.members) ? (data.members as string[]) : [],
            memberProfiles: Array.isArray(data.memberProfiles) ? (data.memberProfiles as VaultMember[]) : [],
          });
        } catch (err) {
          onError(toFriendlyError(err));
        }
      },
      (err) => onError(toFriendlyError(err))
    );
  } catch (err) {
    onError(toFriendlyError(err));
    return () => {};
  }
}

// =====================================================================
// Keuangan Berdua: berbagi satu vault antar email via kode undangan.
// Alur: pemilik menyalakan undangan (kode = vaultCode) -> pasangan
// memasukkan kode -> UID pasangan masuk `members` -> kedua HP
// baca/tulis dokumen vault yang sama. Foto struk tetap lokal per HP.
// =====================================================================

export interface VaultInvite {
  code: string;
  vaultUid: string;
  ownerName: string | null;
  createdAt: string;
}

function activeVaultKey(appUid: string): string {
  return `diginote_active_vault_${appUid}`;
}

/** ID dokumen vault yang dipakai akun ini (pribadi = uid sendiri). */
export function getActiveVaultUid(appUid: string): string | null {
  try {
    return localStorage.getItem(activeVaultKey(appUid));
  } catch {
    return null;
  }
}

export function setActiveVaultUid(appUid: string, vaultUid: string | null): void {
  try {
    if (vaultUid) localStorage.setItem(activeVaultKey(appUid), vaultUid);
    else localStorage.removeItem(activeVaultKey(appUid));
  } catch {
    /* abaikan */
  }
}

function profileOf(user: VaultOwner): VaultMember {
  return { uid: user.uid, email: user.email ?? null, name: user.displayName ?? null };
}

/** Pemilik menyalakan undangan berdua (kode = vaultCode miliknya). */
export async function publishInvite(owner: VaultOwner, vaultUid: string): Promise<VaultInvite> {
  try {
    const vault = await fetchVaultById(vaultUid);
    if (!vault) throw new CloudSyncError("Vault tidak ditemukan.", "unknown");
    if (!vault.members.includes(owner.uid)) {
      throw new CloudSyncError("Hanya anggota vault yang bisa mengundang.", "permission-denied");
    }
    const code = (vault.vaultCode || "").trim().toUpperCase();
    if (!code) throw new CloudSyncError("Vault belum punya kode undangan.", "unknown");
    const invite: VaultInvite = {
      code,
      vaultUid,
      ownerName: owner.displayName ?? owner.email ?? null,
      createdAt: new Date().toISOString(),
    };
    await setDoc(inviteDocRef(code), sanitizeForFirestore(invite));
    return invite;
  } catch (err) {
    if (err instanceof CloudSyncError) throw err;
    throw toFriendlyError(err);
  }
}

/** Pemilik mencabut undangan (kode lama tak bisa dipakai gabung lagi). */
export async function revokeInvite(code: string): Promise<void> {
  try {
    await deleteDoc(inviteDocRef(code));
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Cari undangan berdasarkan kode (untuk gabung). */
export async function lookupInvite(code: string): Promise<VaultInvite | null> {
  try {
    const snap = await getDoc(inviteDocRef(code));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<VaultInvite>;
    if (!d.vaultUid) return null;
    return {
      code: (d.code as string) || code.trim().toUpperCase(),
      vaultUid: d.vaultUid as string,
      ownerName: (d.ownerName as string | null) ?? null,
      createdAt: (d.createdAt as string) ?? new Date(0).toISOString(),
    };
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/**
 * Gabung ke vault pasangan via kode. Menambah UID sendiri ke members
 * (satu-satunya perubahan yang diizinkan rules untuk non-anggota).
 * Mengembalikan vault gabungan + ID dokumennya.
 */
export async function joinVaultByCode(
  user: VaultOwner,
  code: string
): Promise<{ vault: CloudVault; vaultUid: string }> {
  try {
    const invite = await lookupInvite(code);
    if (!invite) {
      throw new CloudSyncError("Kode undangan tidak ditemukan. Minta kode terbaru dari pasangan.", "unknown");
    }
    const ref = vaultDocRef(invite.vaultUid);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new CloudSyncError("Vault pasangan tidak ditemukan.", "unknown");
    const data = snap.data() as Partial<CloudVault> & { members?: string[] };
    const members = Array.isArray(data.members) ? [...(data.members as string[])] : [];
    const profiles = Array.isArray(data.memberProfiles)
      ? [...(data.memberProfiles as VaultMember[])]
      : [];
    if (!members.includes(user.uid)) {
      members.push(user.uid);
      const mine = profileOf(user);
      const idx = profiles.findIndex(p => p.uid === user.uid);
      if (idx >= 0) profiles[idx] = mine;
      else profiles.push(mine);
      await updateDoc(ref, sanitizeForFirestore({ members, memberProfiles: profiles }));
    }
    const vault = await fetchVaultById(invite.vaultUid);
    if (!vault) throw new CloudSyncError("Gagal memuat vault pasangan.", "unknown");
    return { vault, vaultUid: invite.vaultUid };
  } catch (err) {
    if (err instanceof CloudSyncError) throw err;
    throw toFriendlyError(err);
  }
}

/** Keluar dari vault berdua (kembali ke vault pribadi, keanggotaan dihapus). */
export async function leaveSharedVault(user: VaultOwner, sharedUid: string): Promise<void> {
  try {
    const ref = vaultDocRef(sharedUid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Partial<CloudVault> & { members?: string[] };
    const members = (Array.isArray(data.members) ? [...(data.members as string[])] : []).filter(
      u => u !== user.uid
    );
    const profiles = (Array.isArray(data.memberProfiles) ? [...(data.memberProfiles as VaultMember[])] : []).filter(
      p => p.uid !== user.uid
    );
    await updateDoc(ref, sanitizeForFirestore({ members, memberProfiles: profiles }));
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Keluarkan anggota (kick) dari vault. Bisa dipakai anggota mana pun. */
export async function kickMember(requester: VaultOwner, vaultUid: string, targetUid: string): Promise<void> {
  try {
    if (targetUid === requester.uid) {
      await leaveSharedVault(requester, vaultUid);
      return;
    }
    const ref = vaultDocRef(vaultUid);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new CloudSyncError("Vault tidak ditemukan.", "unknown");
    const data = snap.data() as Partial<CloudVault> & { members?: string[] };
    if (!((data.members as string[]) || []).includes(requester.uid)) {
      throw new CloudSyncError("Anda bukan anggota vault ini.", "permission-denied");
    }
    const members = ((data.members as string[]) || []).filter(u => u !== targetUid);
    const profiles = ((data.memberProfiles as VaultMember[]) || []).filter(p => p.uid !== targetUid);
    await updateDoc(ref, sanitizeForFirestore({ members, memberProfiles: profiles }));
  } catch (err) {
    if (err instanceof CloudSyncError) throw err;
    throw toFriendlyError(err);
  }
}

/** Ganti kode undangan (rotasi): update vaultCode + tulis ulang dokumen invite. */
export async function rotateInviteCode(owner: VaultOwner, vaultUid: string): Promise<VaultInvite> {
  try {
    const oldVault = await fetchVaultById(vaultUid);
    if (!oldVault) throw new CloudSyncError("Vault tidak ditemukan.", "unknown");
    if (!oldVault.members.includes(owner.uid)) {
      throw new CloudSyncError("Hanya anggota vault yang bisa memutar kode.", "permission-denied");
    }
    const newCode = generateVaultCode();
    await updateDoc(vaultDocRef(vaultUid), { vaultCode: newCode });
    const oldCode = (oldVault.vaultCode || "").trim().toUpperCase();
    if (oldCode && oldCode !== newCode) {
      try {
        await deleteDoc(inviteDocRef(oldCode));
      } catch {
        /* abaikan */
      }
    }
    return publishInvite(owner, vaultUid);
  } catch (err) {
    if (err instanceof CloudSyncError) throw err;
    throw toFriendlyError(err);
  }
}

/** Daftarkan profil tampilan sendiri ke vault aktif (nama/avatar pasangan). */
export async function touchOwnProfile(user: VaultOwner, vaultUid: string): Promise<void> {
  try {
    const ref = vaultDocRef(vaultUid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() as Partial<CloudVault>;
    const members = Array.isArray(data.members) ? (data.members as string[]) : [];
    if (!members.includes(user.uid)) return;
    const profiles = Array.isArray(data.memberProfiles) ? [...(data.memberProfiles as VaultMember[])] : [];
    const mine = profileOf(user);
    const idx = profiles.findIndex(p => p.uid === user.uid);
    if (idx >= 0 && profiles[idx].name === mine.name) return;
    if (idx >= 0) profiles[idx] = mine;
    else profiles.push(mine);
    await updateDoc(ref, sanitizeForFirestore({ memberProfiles: profiles }));
  } catch {
    /* abaikan: profil opsional */
  }
}
