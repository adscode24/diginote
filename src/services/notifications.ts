/**
 * Notifikasi pengingat harian DigiNote.
 *
 * - Android (native/Capacitor): memakai plugin @capacitor/local-notifications
 *   sehingga izin runtime + jadwal harian benar-benar berfungsi di HP
 *   (Web Notification API tidak bisa diandalkan di dalam WebView).
 * - Web/browser: fallback ke Web Notification API seperti sebelumnya.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const DAILY_REMINDER_ID = 1001;
const TEST_NOTIFICATION_ID = 1002;

const REMINDER_TITLE = 'Waktunya Catat Keuangan Hari Ini';
const REMINDER_BODY =
  'Yuk luangkan 1 menit untuk mencatat pengeluaran & pemasukan harian agar arus kas tetap rapi!';

const isNative = () => Capacitor.isNativePlatform();

// ---------- Status & izin ----------

export type NotifyPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export async function getNotificationPermissionStatus(): Promise<NotifyPermission> {
  try {
    if (isNative()) {
      const { display } = await LocalNotifications.checkPermissions();
      if (display === 'granted') return 'granted';
      if (display === 'denied') return 'denied';
      return 'prompt';
    }
    return getWebPermission();
  } catch {
    return 'unknown';
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (isNative()) {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;
      const req = await LocalNotifications.requestPermissions();
      return req.display === 'granted';
    }
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  } catch {
    return false;
  }
}

export function isNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (isNative()) return true;
  return 'Notification' in window;
}

function getWebPermission(): NotifyPermission {
  if (!('Notification' in window)) return 'unknown';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

// ---------- Jadwal harian ----------

function parseTime(time: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{1,2})/.exec(time || '');
  const hour = Math.min(23, Math.max(0, Number(m?.[1]) || 20));
  const minute = Math.min(59, Math.max(0, Number(m?.[2]) || 0));
  return { hour, minute };
}

/** Batasi waktu tunggu operasi plugin (sebagian WebView kadang menggantung). */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Aktifkan pengingat harian pada jam tertentu. Mengembalikan false bila izin ditolak. */
export async function enableDailyReminder(time: string): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;
  try {
    if (isNative()) {
      const { hour, minute } = parseTime(time);
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] }).catch(() => {});
      await LocalNotifications.schedule({
        notifications: [
          {
            id: DAILY_REMINDER_ID,
            title: REMINDER_TITLE,
            body: REMINDER_BODY,
            schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
          },
        ],
      });
    }
  } catch {
    return false;
  }
  return true;
}

/** Matikan pengingat harian (batalkan jadwal native bila ada). */
export async function disableDailyReminder(): Promise<void> {
  try {
    if (isNative()) {
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] }).catch(() => {});
    }
  } catch {
    /* abaikan */
  }
}

/** Kirim notifikasi uji langsung (muncul ~2 detik kemudian di HP). */
export async function sendTestNotification(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;
  try {
    if (isNative()) {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: TEST_NOTIFICATION_ID,
            title: REMINDER_TITLE,
            body: REMINDER_BODY,
            schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true },
          },
        ],
      });
      return true;
    }
    sendDailyReminderNotification();
    return true;
  } catch {
    return false;
  }
}

// ---------- Fallback web ( dipertahankan untuk browser ) ----------

export function sendDailyReminderNotification(): void {
  if (!isNotificationSupported() || getWebPermission() !== 'granted') {
    return;
  }

  try {
    const options: NotificationOptions = {
      body: REMINDER_BODY,
      icon: '/pwa-192x192.png',
      badge: '/favicon.ico',
      tag: 'daily-finance-reminder',
    };

    new Notification(REMINDER_TITLE, options);
  } catch (err) {
    console.warn('Gagal memunculkan notifikasi:', err);
  }
}
