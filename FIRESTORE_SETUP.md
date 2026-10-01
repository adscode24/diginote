# Sinkronisasi Cloud DigiNote (Firebase)

DigiNote memakai pola yang sama dengan Fuel-Traxr: **satu email = satu vault**
(`digiVaults/{uid}`). Login dengan email + kata sandi yang sama di perangkat
lain (web, web-mobile, APK Android) membuka data yang sama — tanpa daftar ulang,
tanpa frasa sandi vault.

**Keuangan Berdua**: satu vault bisa dipakai 2 email (pasangan) via kode
undangan — lihat bagian "Keuangan Berdua" di bawah.

## 1. Aktifkan Authentication

Firebase Console → **Build → Authentication → Get started** →
**Sign-in method** → aktifkan **Email/Password** → Save.

## 2. Buat database Firestore

**Build → Firestore Database → Create database** → Production mode →
lokasi `asia-southeast2` (Jakarta) → Enable.

## 3. Tempel Rules

**Firestore Database → Rules** → ganti seluruh isi dengan `firestore.rules`
di repo ini → **Publish**. WAJIB Publish ulang setiap ada perubahan rules
(mis. setelah update mendukung Keuangan Berdua).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Vault: hanya anggota (members) yang bisa baca/tulis.
    // Gabung mandiri hanya boleh menambah UID sendiri.
    // Undangan: dibaca semua yang login, ditulis hanya pemilik vault.
    match /digiVaults/{uid} { ... }   // lihat firestore.rules lengkap
    match /vaultInvites/{code} { ... } // lihat firestore.rules lengkap
  }
}
```
(Lihat `firestore.rules` di repo untuk isi lengkap — tempel seluruh file.)

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

## Keuangan Berdua (1 catatan untuk 2 email, tiap akun tetap punya kode sendiri)

1. Kedua HP login dengan email masing-masing lalu buka aplikasi sekali (agar vault + direktori tercatat di cloud).
2. HP A: **Pengaturan → Keuangan Berdua** → isi **email + kode vault B** → **Kirim Undangan**. Email + kode B tampil di bawah kartu sebagai status terkirim.
3. HP B: dapat notifikasi sistem + banner di aplikasi → **Pengaturan → Keuangan Berdua** → **Terima Undangan** (atau **Tolak** — undangan hilang dari database).
4. Setelah diterima: kedua akun menampilkan data yang **sama dan terbaru** (terbaru menang); tiap akun tetap punya kode vault sendiri, dan kode penulis terakhir tampil sebagai identitas.
5. Memutus: tombol **Putuskan** di kartu; sisi pasangan mendeteksi otomatis dan kembali ke data pribadi.

Batasan yang disengaja:

- Bila keduanya mencatat persis bersamaan, simpanan terakhir yang menang — tunggu notifikasi sinkron sebelum pindah HP.
- Foto struk tidak ikut ke cloud (batas 1 MB/dokumen): pasangan melihat transaksi tanpa foto; foto tetap aman di HP masing-masing.
