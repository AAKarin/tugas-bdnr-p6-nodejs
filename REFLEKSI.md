# Laporan & Refleksi Praktikum: Document Store dalam Aplikasi (Pertemuan 06)

* **Mata Kuliah:** Basis Data Non Relasional (IF611344)
* **Topik:** Menghubungkan MongoDB dan Firebase ke Aplikasi Laravel dan Node.js
* **Studi Kasus:** API Toko & API Perpustakaan Buku

---

## 1. Pembagian Tugas & Arsitektur Sistem

Sesuai ketentuan pada slide pertemuan 6 (Slide 29), implementasi tugas dibagi ke dalam dua bahasa dan database yang berbeda:

| Tugas | Bahasa / Framework | Database | Fitur Utama |
|:---|:---|:---|:---|
| **Tugas 1: API Perpustakaan Buku** | **Laravel 13 (PHP 8.5)** | **MongoDB** | CRUD, Filter (`kategori`, `pengarang`), `$push` (peminjam & ulasan), Agregasi `$group` |
| **Tugas 2: API Perpustakaan Buku** | **Node.js (Express)** | **Firebase Firestore** | CRUD, Filter (`kategori`), `FieldValue.arrayUnion` (peminjam & ulasan), Laporan per kategori |

---

## 2. Refleksi Implementasi & Perbandingan Teknologi

### A. Driver, ODM, dan SDK
* **Laravel MongoDB (Eloquent ODM):**
  Menggunakan package `mongodb/laravel-mongodb`. Keuntungannya adalah sintaks yang sangat familiar bagi pengembang Laravel karena memanfaatkan Active Record (Eloquent). Model `Buku` mewarisi fungsi-fungsi seperti `create()`, `find()`, `update()`, dan `delete()`. Operasi array embedding dapat dilakukan melalui metode `$buku->push('peminjam', $data)`.
* **Node.js Firebase Admin SDK:**
  Menggunakan library resmi `firebase-admin`. Inisialisasi menggunakan kredensial *Service Account* (`serviceAccountKey.json`). Pendekatannya berbasis promise/asinkron (`async/await`). Pengelolaan dokumen sangat eksplisit dengan method `collection()`, `doc()`, `get()`, `set({ merge: true })`, dan `update()`.

### B. Manipulasi Array Dokumen: `$push` vs `arrayUnion`
* **MongoDB (`$push`):**
  MongoDB memungkinkan penambahan elemen baru ke dalam array secara langsung pada dokumen yang ada. Keuntungan `$push` adalah fleksibel dan mendukung penambahan objek riwayat peminjaman maupun ulasan.
* **Firestore (`FieldValue.arrayUnion`):**
  Firestore menyediakan operator atomic `arrayUnion()`. Operator ini memiliki sifat *idempotent* dan *set-like*: hanya menambahkan elemen yang belum ada dalam array sehingga mencegah terjadinya duplikasi data peminjam/ulasan yang identik.

### C. Agregasi & Analitik: `$group` vs Pengelompokan Firestore
* **MongoDB Aggregation Pipeline (`$group`):**
  Sangat unggul untuk query analitik kompleks. Pipeline agregasi diproses langsung di level engine database server MongoDB, sehingga penggunaan memori di backend aplikasi tetap hemat. Tahapan `$group` memungkinkan perhitungan `$sum` stok, `$sum` judul, dan `$avg` tahun secara simultan dengan efisiensi tinggi.
* **Firestore Data Aggregation:**
  Firestore dirancang untuk query transaksional dan real-time yang sederhana. Untuk analitik multi-properti, agregasi dilakukan dengan mengambil snapshot dokumen atau memanfaatkan method `count()` dan memproses pengelompokan kategori secara terstruktur di sisi aplikasi.

---

## 3. Kendala dan Solusi Selama Pengerjaan

1. **Kendala Tipe Data `_id` MongoDB di Node.js (Bug 1 di Slide):**
   * *Kendala:* Pemanggilan `findOne({ _id: req.params.id })` menghasilkan `null` meskipun data ada.
   * *Penyebab:* Parameter URL bertipe string, sedangkan field `_id` di MongoDB bertipe `ObjectId`.
   * *Solusi:* Membungkus parameter dengan `new ObjectId(req.params.id)` dan menambahkan validasi `ObjectId.isValid()`.

2. **Kendala Sesi Database Laravel saat Menggunakan MongoDB (Bug 2 di Slide):**
   * *Kendala:* Error tabel `sessions` tidak ditemukan ketika `DB_CONNECTION=mongodb`.
   * *Penyebab:* Laravel menggunakan tabel database SQL relasional untuk menyimpan data sesi pengguna.
   * *Solusi:* Menjaga koneksi default Laravel tetap menggunakan SQLite/MySQL, lalu menentukan koneksi `mongodb` secara eksplisit hanya pada Model data terkait (`protected $connection = 'mongodb';`).

3. **Kendala Intersepsi SSL/TLS pada Windows:**
   * *Kendala:* Terjadi error `cURL error 60: SSL certificate unable to get local issuer certificate` saat aplikasi mengakses REST API Google Firestore.
   * *Penyebab:* Antivirus lokal (Avast Web/Mail Shield) melakukan SSL/TLS scanning dengan menyisipkan Root Certificate lokal.
   * *Solusi:* Mengekspor sertifikat Root Avast dari Windows Certificate Store dan menyematkannya ke dalam bundle `cacert.pem` PHP.

4. **Kendala Driver gRPC PHP di Windows:**
   * *Kendala:* Ekstensi C `grpc.dll` pada PHP 8.5 ZTS Windows menyebabkan aplikasi crash saat memanggil Firestore.
   * *Solusi:* Menonaktifkan ekstensi `grpc` di `php.ini` sehingga client Firestore otomatis dan stabil menggunakan **REST Transport** bawaan.

---

## 4. Kesimpulan

* **MongoDB** sangat cocok digunakan sebagai database operasional utama aplikasi (*core data*) yang membutuhkan kueri relasi kompleks, indexing beragam, serta laporan analitik/agregasi harian.
* **Firebase Firestore** sangat optimal digunakan untuk aplikasi dengan kebutuhan sinkronisasi real-time (seperti notifikasi ketersediaan buku/tiket), aplikasi mobile/serverless, dan prototipe cepat tanpa perlu manajemen server database mandiri.
