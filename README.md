# DigiNote — Your Digital Note

Aplikasi pencatatan keuangan modern: transaksi, sumber dana, hutang/piutang (termasuk
amortisasi KPR cicilan berjangka), tagihan rutin, kalender, laporan PDF/Excel, dan
sinkronisasi cloud lintas perangkat (vault terstruktur per akun, realtime).

## Teknologi

- React 19 + Vite 8 + Tailwind CSS 4 + PWA
- Firebase Authentication (email/password) + Cloud Firestore (mode cloud)
- Capacitor 8 (APK Android native)
- localStorage per pengguna (mode lokal/offline)

## Mode operasi

| Mode     | Syarat                                              | Data                          |
| -------- | --------------------------------------------------- | ----------------------------- |
| Cloud    | Firebase aktif (config sudah di repo)               | Akun email, vault terstruktur per akun, realtime antar perangkat |
| Lokal    | Akun offline (nama, tanpa email)                    | Data per perangkat, tanpa sinkron |

Satu email = satu akun = satu Kode Vault Cloud (`digiVaults/{uid}`). Login dengan
email yang sama di perangkat lain (web/HP/APK) menampilkan data yang sama —
tanpa daftar ulang, tanpa frasa sandi. Setiap edit tersinkron otomatis
(debounced) + realtime antar perangkat terbuka. Tombol manual tetap ada:
**Sinkronkan ke Cloud** (Beranda/Pengaturan) dan **Tarik dari Cloud**.
Lihat `FIRESTORE_SETUP.md` untuk aktivasi Firebase.

## Pengembangan lokal

```bash
npm install
npm run dev      # server dev + API lokal (tsx server.ts)
npm run lint     # tsc --noEmit
npm run build    # build produksi web (dist/)
```

Mode cloud lokal: salin `.env.example` ke `.env` dan isi kunci Firebase.

## Konfigurasi Firebase (satu kali, lihat FIRESTORE_SETUP.md)

1. Firebase Console → project → **Authentication** → aktifkan **Email/Password**.
2. **Firestore Database** → Create database (production mode).
3. **Rules** → tempel isi `firestore.rules` → Publish.
4. Config klien (`firebase-applet-config.json`) sudah di repo — tidak perlu env manual.
   Web (Vercel) dan APK langsung mode Cloud setelah deploy.

## Rilis Android

- Debug (testing): workflow **Build Android APK** berjalan otomatis tiap push
  `main` → artefak `diginote-debug-apk`.
- Play Store: tambah secrets `ANDROID_KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`,
  `KEY_ALIAS`, `KEY_PASSWORD` + variable `APP_VERSION_NAME`, lalu jalankan workflow
  **Build Release (Play Store)** (atau push tag `v*`) → AAB + APK signed.
- Keystore upload tersimpan di luar repo (jangan pernah hilang — tanpanya update
  Play Store mustahil). Detail: lihat catatan rilis repo.

## Struktur penting

- `src/context/AuthContext.tsx` — login/daftar lokal + Firebase
- `src/context/FinanceContext.tsx` — state + mesin sinkronisasi vault cloud
- `src/services/cloudSync.ts` — vault Firestore `digiVaults/{uid}` (pola Fuel-Traxr)
- `src/services/firebase.ts` — init Firebase + persistence WebView
- `src/services/crypto.ts` — enkripsi AES-GCM + PBKDF2 (cadangan berkas)
- `scripts/` — generator ikon, resources Capacitor, injeksi signing rilis
