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
- **Sinkronisasi manual**: **Pengaturan → Sinkronisasi Cloud → Sinkronkan ke Cloud**
  (upload) / **Tarik dari Cloud** (download). Tidak ada proses latar.
- **Offline**: cache persisten (IndexedDB) + penyimpanan lokal per akun.
- Foto struk (base64) tidak diunggah ke cloud agar payload kecil dan UI tidak freeze;
  foto tetap aman di masing-masing perangkat dan disambung ulang saat pull.

## Troubleshooting

| Gejala | Penyebab & solusi |
| ------ | ----------------- |
| `permission-denied` | Rules belum di-publish / belum login |
| `Database does not exist` | Database Firestore belum dibuat (langkah 2) |
| `auth/operation-not-allowed` | Provider Email/Password belum diaktifkan |
| Data tidak tersinkron | Periksa status di Pengaturan → Sinkronisasi Cloud |

## Integrasi DigiFuel (catatan BBM & biaya -> transaksi keluar)

Satu arah, project tetap terpisah. Di DigiNote: **Pengaturan → Integrasi DigiFuel** →
masukkan email + kata sandi DigiFuel (akun terdaftar terpisah di sana, idealnya
email yang sama) → pilih sumber dana → **Tarik dari DigiFuel**.

- Catatan bensin (`totalCost > 0`) dan riwayat servis (`cost > 0`) menjadi transaksi
  keluar berlabel **DigiFuel**, idempoten via `sourceId` (edit/hapus di DigiFuel
  menular saat penarikan berikutnya).
- Akun sumber dana pilihan Anda dipertahankan (hanya dipakai saat pembuatan).

Satu langkah wajib di **project Firebase DigiFuel** (Console → Firestore → Rules →
tambahkan blok ini sejajar `match /fuelVaults/{uid}` yang sudah ada, lalu Publish):

```
match /fuelVaults/{uid} {
  allow read: if request.auth != null &&
    (request.auth.uid == uid || resource.data.ownerEmail == request.auth.token.email);
  allow write: if request.auth != null && request.auth.uid == uid;
}
```

Ganti blok `fuelVaults` lama bila isinya hanya `allow read, write: ... uid == uid`.
Tanpa ini DigiNote tidak bisa membaca vault DigiFuel (permission-denied).
