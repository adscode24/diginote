import { doc, getDoc, setDoc, updateDoc, onSnapshot, deleteDoc, arrayUnion } from "firebase/firestore";
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

export interface DirectoryEntry {
  uid: string;
  email: string;
  vaultCode: string;
  name?: string | null;
  updatedAt: string;
}

export interface PairInvite {
  fromUid: string;
  fromEmail: string | null;
  fromName: string | null;
  fromCode: string;
  toUid: string;
  toEmail: string;
  status: "pending";
  createdAt: string;
}

export interface CloudVault extends VaultPayload {
  ownerEmail: string | null;
  displayName: string | null;
  vaultCode: string;
  updatedAt: string; // ISO string
  schemaVersion: number;
  members: string[];
  memberProfiles: VaultMember[];
  pairedUids: string[];
  lastUpdatedBy?: string | null;
  lastUpdatedByCode?: string | null;
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

function directoryDocRef(email: string) {
  return doc(db, "vaultDirectory", email.trim().toLowerCase());
}

function pairInviteDocRef(toUid: string) {
  return doc(db, "coupleInvites", toUid);
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
      pairedUids: Array.isArray(data.pairedUids) ? (data.pairedUids as string[]) : [],
      lastUpdatedBy: (data.lastUpdatedBy as string | null) ?? null,
      lastUpdatedByCode: (data.lastUpdatedByCode as string | null) ?? null,
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
      pairedUids: Array.isArray(data.pairedUids) ? (data.pairedUids as string[]) : [],
      lastUpdatedBy: (data.lastUpdatedBy as string | null) ?? null,
      lastUpdatedByCode: (data.lastUpdatedByCode as string | null) ?? null,
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
      pairedUids: Array.isArray(data.pairedUids) ? (data.pairedUids as string[]) : [],
      lastUpdatedBy: (data.lastUpdatedBy as string | null) ?? null,
      lastUpdatedByCode: (data.lastUpdatedByCode as string | null) ?? null,
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
      pairedUids: [],
      lastUpdatedBy: user.uid,
      lastUpdatedByCode: vaultCode,
    };
    await setDoc(ref, fresh);
    return fresh;
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Dorong seluruh state lokal ke cloud (last-write-wins per vault).
 *  dataOnly=true untuk tulis ke vault pasangan (rules hanya mengizinkan
 *  field data + cap waktu + identitas penulis, bukan identitas pemilik). */
export async function pushVault(
  user: VaultOwner,
  vaultCode: string,
  payload: VaultPayload,
  docId?: string,
  meta?: { byUid?: string | null; byCode?: string | null; dataOnly?: boolean }
): Promise<string> {
  try {
    const updatedAt = new Date().toISOString();
    const base = {
      transactions: sanitizeForFirestore(payload.transactions),
      categories: sanitizeForFirestore(payload.categories),
      accounts: sanitizeForFirestore(payload.accounts),
      debts: sanitizeForFirestore(payload.debts),
      bills: sanitizeForFirestore(payload.bills),
      billPayments: sanitizeForFirestore(payload.billPayments),
      reminderSettings: sanitizeForFirestore(payload.reminderSettings),
      updatedAt,
      lastUpdatedBy: meta?.byUid ?? user.uid,
      lastUpdatedByCode: meta?.byCode ?? vaultCode,
      schemaVersion: VAULT_SCHEMA_VERSION,
    };
    await setDoc(
      vaultDocRef(docId || user.uid),
      meta?.dataOnly
        ? base
        : {
            ...base,
            ownerEmail: user.email ?? null,
            displayName: user.displayName ?? null,
            vaultCode,
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
      pairedUids: Array.isArray(data.pairedUids) ? (data.pairedUids as string[]) : [],
      lastUpdatedBy: (data.lastUpdatedBy as string | null) ?? null,
      lastUpdatedByCode: (data.lastUpdatedByCode as string | null) ?? null,
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
// =====================================================================
// Keuangan Berdua model TAUTAN (pairing): tiap akun tetap punya vault +
// kode sendiri; data disamakan dua arah (tulis ke dua dokumen, baca yang
// terbaru). lastUpdatedBy/Code = identitas penulis terakhir.
// Foto struk tetap lokal per HP.
// =====================================================================

export interface PairPartner {
  uid: string;
  email: string | null;
  name: string | null;
  code: string;
}

/** Catat/segarkan direktori vault saya (untuk verifikasi undangan pasangan). */
export async function upsertDirectoryEntry(owner: VaultOwner, vaultCode: string): Promise<void> {
  const email = (owner.email || "").trim().toLowerCase();
  if (!email) return;
  try {
    await setDoc(
      directoryDocRef(email),
      sanitizeForFirestore({
        uid: owner.uid,
        email,
        vaultCode: (vaultCode || "").trim().toUpperCase(),
        name: owner.displayName ?? null,
        updatedAt: new Date().toISOString(),
      }),
      { merge: true }
    );
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Cari vault pasangan via email + cocokkan kode (langkah verifikasi undangan). */
export async function lookupVaultByEmail(email: string): Promise<DirectoryEntry | null> {
  try {
    const snap = await getDoc(directoryDocRef(email));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<DirectoryEntry>;
    if (!d.uid) return null;
    return {
      uid: d.uid as string,
      email: (d.email as string) || email.trim().toLowerCase(),
      vaultCode: (d.vaultCode as string) || "",
      name: (d.name as string | null) ?? null,
      updatedAt: (d.updatedAt as string) ?? new Date(0).toISOString(),
    };
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/**
 * A mengirim undangan ke B (email + kode B terverifikasi cocok).
 * Sekaligus menautkan B di vault A (pra-otorisasi agar B bisa baca).
 */
export async function sendPairInvite(
  fromOwner: VaultOwner,
  fromCode: string,
  toEmail: string,
  toVault: DirectoryEntry
): Promise<void> {
  try {
    const mine = await fetchVaultById(fromOwner.uid);
    if (!mine) {
      throw new CloudSyncError(
        "Vault Anda belum ada di cloud. Tarik/dorong sinkron sekali dulu, lalu undang lagi.",
        "unknown"
      );
    }
    await updateDoc(vaultDocRef(fromOwner.uid), {
      pairedUids: arrayUnion(toVault.uid),
    });
    await setDoc(
      pairInviteDocRef(toVault.uid),
      sanitizeForFirestore({
        fromUid: fromOwner.uid,
        fromEmail: fromOwner.email ?? null,
        fromName: fromOwner.displayName ?? null,
        fromCode: (fromCode || "").trim().toUpperCase(),
        toUid: toVault.uid,
        toEmail: toVault.email,
        status: "pending",
        createdAt: new Date().toISOString(),
      })
    );
  } catch (err) {
    if (err instanceof CloudSyncError) throw err;
    throw toFriendlyError(err);
  }
}

/** Baca undangan tertunda untuk saya (dipanggil saat aplikasi dibuka). */
export async function readMyPairInvite(myUid: string): Promise<PairInvite | null> {
  try {
    const snap = await getDoc(pairInviteDocRef(myUid));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<PairInvite>;
    if (!d.fromUid || d.status !== "pending") return null;
    return {
      fromUid: d.fromUid as string,
      fromEmail: (d.fromEmail as string | null) ?? null,
      fromName: (d.fromName as string | null) ?? null,
      fromCode: (d.fromCode as string) ?? "",
      toUid: d.toUid as string,
      toEmail: (d.toEmail as string) ?? "",
      status: "pending",
      createdAt: (d.createdAt as string) ?? new Date(0).toISOString(),
    };
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Batalkan undangan yang saya kirim (pengirim). */
export async function cancelPairInvite(toUid: string): Promise<void> {
  try {
    await deleteDoc(pairInviteDocRef(toUid));
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/**
 * Terima undangan: tautkan pengirim di vault saya + hapus undangan.
 * Vault saya dibuat dulu bila belum ada (user baru).
 */
export async function acceptPairInvite(
  me: VaultOwner,
  invite: PairInvite,
  myVaultCode: string
): Promise<void> {
  try {
    await ensureUserVault(me);
    await updateDoc(vaultDocRef(me.uid), { pairedUids: arrayUnion(invite.fromUid) });
    await upsertDirectoryEntry(me, myVaultCode);
    await deleteDoc(pairInviteDocRef(me.uid));
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/**
 * Tolak undangan: putus tautan di vault sendiri + hapus undangan.
 * Undangan nonaktif dan hilang dari database. Pengirim mendeteksi
 * otomatis (baca vault ini ditolak -> bersih-bersih).
 */
export async function declinePairInvite(me: VaultOwner, invite: PairInvite): Promise<void> {
  try {
    await removePairFromMyVault(me, invite.fromUid);
  } catch {
    /* abaikan */
  }
  try {
    await deleteDoc(pairInviteDocRef(me.uid));
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Putuskan tautan dari sisi saya (kick/keluar): hapus pasangan dari vault saya.
 *  Pasangan mendeteksinya otomatis saat buka aplikasi (baca vault saya
 *  ditolak -> bersih-bersih + notifikasi). */
export async function removePairFromMyVault(me: VaultOwner, partnerUid: string): Promise<void> {
  try {
    const myRef = vaultDocRef(me.uid);
    const mySnap = await getDoc(myRef);
    if (mySnap.exists()) {
      const data = mySnap.data() as Partial<CloudVault>;
      const paired = Array.isArray(data.pairedUids) ? [...(data.pairedUids as string[])] : [];
      const next = paired.filter(u => u !== partnerUid);
      if (next.length !== paired.length) {
        await updateDoc(myRef, { pairedUids: next });
      }
    }
  } catch (err) {
    throw toFriendlyError(err);
  }
  try {
    await deleteDoc(pairInviteDocRef(partnerUid));
  } catch {
    /* abaikan */
  }
}

/** Ganti kode vault saya (Acak) + segarkan direktori. */
export async function rotateMyVaultCode(owner: VaultOwner): Promise<string> {
  try {
    const newCode = generateVaultCode();
    await updateDoc(vaultDocRef(owner.uid), { vaultCode: newCode });
    await upsertDirectoryEntry(owner, newCode);
    return newCode;
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Baca undangan yang pernah saya kirim (untuk status Hermann/penerima). */
export async function readSentInvite(toUid: string): Promise<PairInvite | null> {
  try {
    const snap = await getDoc(pairInviteDocRef(toUid));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<PairInvite>;
    if (!d.fromUid) return null;
    return {
      fromUid: d.fromUid as string,
      fromEmail: (d.fromEmail as string | null) ?? null,
      fromName: (d.fromName as string | null) ?? null,
      fromCode: (d.fromCode as string) ?? "",
      toUid: d.toUid as string,
      toEmail: (d.toEmail as string) ?? "",
      status: "pending",
      createdAt: (d.createdAt as string) ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Setel daftar pasangan di vault sendiri (pemilik). */
export async function setMyPairedUids(owner: VaultOwner, uids: string[]): Promise<void> {
  try {
    await updateDoc(vaultDocRef(owner.uid), { pairedUids: uids });
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Baca vault saya + vault pasangan (bila tertaut).
 *  revoked=true bila pasangan mencabut akses (permission-denied),
 *  gone=true bila dokumen vault pasangan sudah tidak ada (akun dihapus),
 *  keduanya dibedakan dari offline/transien (diabaikan diam-diam). */
export async function readPairedVaults(
  myUid: string
): Promise<{ mine: CloudVault | null; partner: CloudVault | null; partnerUid: string | null; revoked: boolean; gone: boolean }> {
  const mine = await fetchVaultById(myUid).catch(() => null);
  const paired = (mine && Array.isArray(mine.pairedUids) ? mine.pairedUids : []).filter(u => u !== myUid);
  const partnerUid = paired[0] || null;
  let partner: CloudVault | null = null;
  let revoked = false;
  let gone = false;
  if (partnerUid) {
    try {
      partner = await fetchVaultById(partnerUid);
      if (!partner) gone = true;
    } catch (err) {
      const code = (err as { code?: string })?.code || "";
      if (code === "permission-denied") revoked = true;
      partner = null;
    }
  }
  return { mine, partner, partnerUid, revoked, gone };
}

/** Tulis payload ke vault saya + vault pasangan (best-effort sisi pasangan). */
export async function pushPairedVaults(  me: VaultOwner,
  myVaultCode: string,
  partnerUid: string | null,
  payload: VaultPayload
): Promise<{ updatedAt: string; partnerOk: boolean }> {
  const updatedAt = await pushVault(me, myVaultCode, payload, me.uid, {
    byUid: me.uid,
    byCode: myVaultCode,
  });
  let partnerOk = true;
  if (partnerUid && partnerUid !== me.uid) {
    try {
      await pushVault(me, myVaultCode, payload, partnerUid, {
        byUid: me.uid,
        byCode: myVaultCode,
        dataOnly: true,
      });
    } catch {
      partnerOk = false;
    }
  }
  return { updatedAt, partnerOk };
}

// =====================================================================
// Hapus Akun: hapus seluruh data login pengguna dari database.
// Urutan: lepas tautan berdua -> hapus undangan terkirim -> hapus direktori
// -> hapus vault. Best-effort per langkah, kegagalan dikumpulkan.
// =====================================================================

export interface DeleteAccountResult {
  warnings: string[];
}

/** Hapus dokumen vault milik UID ini (rules: hanya pemilik). */
export async function deleteVaultDoc(uid: string): Promise<void> {
  try {
    await deleteDoc(vaultDocRef(uid));
  } catch (err) {
    throw toFriendlyError(err);
  }
}

/** Hapus entri direktori email ini (rules: hanya pemilik UID tercantum). */
export async function deleteDirectoryEntry(email: string): Promise<void> {
  try {
    await deleteDoc(directoryDocRef(email));
  } catch (err) {
    throw toFriendlyError(err);
  }
}

export async function deleteOwnCloudData(
  owner: VaultOwner,
  email: string,
  partnerUid: string | null,
  sentInviteUids: string[]
): Promise<DeleteAccountResult> {
  const warnings: string[] = [];
  // 1. Lepas tautan berdua (sisi saya) agar pasangan auto-bersih
  if (partnerUid && partnerUid !== owner.uid) {
    try {
      await removePairFromMyVault(owner, partnerUid);
    } catch {
      warnings.push("Tautan berdua tidak terhapus di cloud.");
    }
  }
  // 2. Hapus undangan yang pernah saya kirim
  for (const toUid of sentInviteUids) {
    try {
      await deleteDoc(pairInviteDocRef(toUid));
    } catch {
      /* abaikan per item */
    }
  }
  // 3. Hapus direktori email saya
  if (email.trim()) {
    try {
      await deleteDirectoryEntry(email);
    } catch {
      warnings.push("Entri direktori tidak terhapus.");
    }
  }
  // 4. Hapus vault saya
  try {
    await deleteVaultDoc(owner.uid);
  } catch (err) {
    throw err instanceof CloudSyncError
      ? err
      : new CloudSyncError("Vault cloud tidak terhapus: " + ((err as Error)?.message || "unknown"), "unknown");
  }
  return { warnings };
}

