# Sinkronisasi Cloud DigiNote (Firebase)

DigiNote memakai pola yang sama dengan Fuel-Traxr: **satu email = satu vault**
(`digiVaults/{uid}`). Login dengan email + kata sandi yang sama di perangkat
lain (web, web-mobile, APK Android) membuka data yang sama — tanpa daftar ulang,
tanpa frasa sandi vault.

## 1. Aktifkan Authentication

Firebase Console → **Build → Authentication → Get started** →
**Sign-in method** → aktifkan **Email/Password** → Save.

## 2. Buat database Firestore

**Build → Firestore Database → Create database** → Production mode →
lokasi `asia-southeast2` (Jakarta) → Enable.

## 3. Tempel Rules

**Firestore Database → Rules** → ganti seluruh isi dengan `firestore.rules`
di repo ini → **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /digiVaults/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

## 4. Config sudah di dalam repo

`firebase-applet-config.json` berisi kunci klien publik (disengaja publik —
keamanan ditegakkan oleh Auth + Rules). Tidak perlu env manual; web, PWA,
dan APK langsung mode Cloud setelah deploy.

## Cara kerja sinkronisasi

- **Daftar sekali** di perangkat mana pun → vault `digiVaults/{uid}` dibuat
  otomatis dengan Kode Vault (mis. `DN-XXXXXX`) + data lokal perangkat itu.
- **Login di perangkat lain** → vault yang sama ditarik otomatis bila lokal kosong.
- **Setiap edit** → push debounced (~900ms) ke cloud (last-write-wins per vault).
- **Realtime**: edit di satu perangkat langsung diterapkan di perangkat lain
  yang terbuka (dengan guard anti-gema ala Fuel-Traxr).
- **Offline**: cache persisten (IndexedDB) + penyimpanan lokal per akun;
  sinkron saat online kembali.
- Tombol manual tetap ada: **Sinkronkan ke Cloud** (Beranda/Pengaturan) dan
  **Tarik dari Cloud**.

## Troubleshooting

| Gejala | Penyebab & solusi |
| ------ | ----------------- |
| `permission-denied` | Rules belum di-publish / belum login |
| `Database does not exist` | Database Firestore belum dibuat (langkah 2) |
| `auth/operation-not-allowed` | Provider Email/Password belum diaktifkan |
| Data tidak tersinkron | Periksa status di Pengaturan → Sinkronisasi Cloud |
