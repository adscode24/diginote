# DigiNote — Your Digital Note

Aplikasi pencatatan keuangan modern: transaksi, sumber dana, hutang/piutang (termasuk
amortisasi KPR cicilan berjangka), tagihan rutin, kalender, laporan PDF/Excel, dan
sinkronisasi cloud lintas perangkat dengan enkripsi zero-knowledge (AES-GCM 256-bit).

## Teknologi

- React 19 + Vite 8 + Tailwind CSS 4 + PWA
- Firebase Authentication (email/password) + Cloud Firestore (mode cloud)
- Capacitor 8 (APK Android native)
- localStorage per pengguna (mode lokal/offline)

## Mode operasi

| Mode     | Syarat                                              | Data                          |
| -------- | --------------------------------------------------- | ----------------------------- |
| Cloud    | 4 env `VITE_FIREBASE_*` terisi                      | Akun email, vault terenkripsi per akun, realtime antar perangkat |
| Lokal    | Tanpa env Firebase                                  | Akun lokal per perangkat, tanpa sinkron |

Satu email = satu akun = satu Kode Vault Cloud. Login dengan email yang sama di
perangkat lain (web/HP/APK) menampilkan data yang sama setelah membuka vault
dengan frasa sandi vault.

## Pengembangan lokal

```bash
npm install
npm run dev      # server dev + API lokal (tsx server.ts)
npm run lint     # tsc --noEmit
npm run build    # build produksi web (dist/)
```

Mode cloud lokal: salin `.env.example` ke `.env` dan isi kunci Firebase.

## Konfigurasi Firebase (wajib untuk sinkron cloud)

1. Firebase Console → project baru → **Authentication** → aktifkan **Email/Password**.
2. **Firestore Database** → Create database (production mode).
3. **Rules** → tempel aturan per-pengguna (lihat bawah) → Publish.
4. **Project Settings → Your apps (Web)** → salin config.
5. **Vercel** (web): Project → Settings → Environment Variables:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` → Redeploy.
6. **GitHub** (APK): repo → Settings → Secrets and variables → Actions →
   tambah 4 secret `VITE_FIREBASE_*` yang **sama** → jalankan ulang workflow rilis.

### Aturan Firestore

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /vaults/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

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
- `src/context/VaultKeyContext.tsx` — frasa sandi vault (memori + session)
- `src/context/FinanceContext.tsx` — state + mesin auto-sync cloud
- `src/services/onlineSync.ts` — profil & vault Firestore
- `src/services/crypto.ts` — enkripsi AES-GCM + PBKDF2
- `scripts/` — generator ikon, resources Capacitor, injeksi signing rilis
