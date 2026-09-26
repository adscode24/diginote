/**
 * Notification Service for Daily Finance Logging Reminders
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function sendDailyReminderNotification(): void {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  try {
    const title = '⏰ Waktunya Catat Keuangan Hari Ini';
    const options: NotificationOptions = {
      body: 'Yuk luangkan 1 menit untuk mencatat pengeluaran & pemasukan harian agar arus kas tetap rapi!',
      icon: '/pwa-192x192.png',
      badge: '/favicon.ico',
      tag: 'daily-finance-reminder',
    };

    new Notification(title, options);
  } catch (err) {
    console.warn('Gagal memunculkan notifikasi:', err);
  }
}
