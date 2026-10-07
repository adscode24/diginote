import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.diginote.app',
  appName: 'DigiNote',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    // WebView debugging SENGAJA mati: standar keamanan rilis Play Store
    // (hindari inspeksi konten aplikasi via USB di APK produksi).
    // Nyalakan manual (true) hanya saat butuh debug lokal.
    webContentsDebuggingEnabled: false,
  },
};

export default config;
