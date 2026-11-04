import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, AggregateField } from 'firebase-admin/firestore';

dotenv.config();

const app = express();
app.use(express.json()); // Menerima payload JSON dari body request

// ==============================================================================
// 1. KONEKSI & OPERASI MONGODB (LATIHAN 2)
// ==============================================================================
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(mongoUri);
let col;

async function connectMongoDB() {
    try {
        await client.connect();
        const db = client.db('toko');
        col = db.collection('produk');
        console.log('✅ Terhubung ke MongoDB (database: toko, collection: produk)');
    } catch (err) {
        console.error('❌ Gagal terhubung ke MongoDB:', err.message);
    }
}
connectMongoDB();

// GET /produk (Lihat semua data MongoDB + filter query kategori)
app.get('/produk', async (req, res) => {
    try {
        const filter = {};
        if (req.query.kategori) {
            filter.kategori = req.query.kategori;
        }
        const data = await col.find(filter).toArray();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /produk/:id (Detail data MongoDB - Perbaikan BUG 1: ObjectId)
app.get('/produk/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Format ID MongoDB tidak valid' });
        }
        const doc = await col.findOne({ _id: new ObjectId(req.params.id) });
        if (!doc) return res.status(404).json({ message: 'Data tidak ditemukan' });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /produk (Tambah data ke MongoDB dengan timestamp dibuat)
app.post('/produk', async (req, res) => {
    try {
        const hasil = await col.insertOne({
            ...req.body,
            dibuat: new Date()
        });
        res.status(201).json(hasil);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /produk/:id (Ubah data di MongoDB dengan whitelist field dan ObjectId)
app.put('/produk/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Format ID MongoDB tidak valid' });
        }
        const perubahan = { ...req.body };
        delete perubahan._id; // Whitelist field: cegah manipulasi _id bawaan

        const hasil = await col.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: perubahan }
        );

        if (hasil.matchedCount === 0) {
            return res.status(404).json({ message: 'Data tidak ditemukan' });
        }
        res.json(hasil);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /produk/:id (Hapus data dari MongoDB)
app.delete('/produk/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Format ID MongoDB tidak valid' });
        }
        const hasil = await col.deleteOne({ _id: new ObjectId(req.params.id) });
        if (hasil.deletedCount === 0) {
            return res.status(404).json({ message: 'Data tidak ditemukan' });
        }
        res.json({ message: 'Data berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /laporan/kategori (Agregasi MongoDB: $group, $sum, $avg)
app.get('/laporan/kategori', async (req, res) => {
    try {
        const hasil = await col.aggregate([
            {
                $group: {
                    _id: "$kategori",
                    totalStok: { $sum: "$stok" },
                    rataHarga: { $avg: "$harga" }
                }
            }
        ]).toArray();
        res.json(hasil);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ==============================================================================
// 2. KONEKSI & OPERASI FIREBASE FIRESTORE (LATIHAN 4)
// ==============================================================================
let firestoreCol;
try {
    const credPath = process.env.FIREBASE_CREDENTIALS 
        ? path.resolve(process.env.FIREBASE_CREDENTIALS) 
        : path.resolve('../toko-api/storage/app/firebase/serviceAccountKey.json');
        
    const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));

    initializeApp({
        credential: cert(serviceAccount)
    });

    const firestoreDb = getFirestore();
    firestoreCol = firestoreDb.collection('produk');
    console.log('✅ Terhubung ke Firebase Firestore (collection: produk)');
} catch (err) {
    console.error('❌ Gagal inisialisasi Firebase Admin SDK:', err.message);
}

// Helper: gabungkan id dokumen ke atribut data
const formatDoc = (doc) => ({ id: doc.id, ...doc.data() });

// GET /firestore/produk (Ambil data Firestore + filter query kategori)
app.get('/firestore/produk', async (req, res) => {
    try {
        let q = firestoreCol;
        if (req.query.kategori) {
            q = q.where('kategori', '==', req.query.kategori);
        }
        const snap = await q.get();
        res.json(snap.docs.map(formatDoc));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /firestore/produk/:id (Detail satu dokumen Firestore)
app.get('/firestore/produk/:id', async (req, res) => {
    try {
        const doc = await firestoreCol.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ message: 'Dokumen tidak ditemukan di Firestore' });
        }
        res.json(formatDoc(doc));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /firestore/produk (Tambah dokumen dengan serverTimestamp)
app.post('/firestore/produk', async (req, res) => {
    try {
        const ref = await firestoreCol.add({
            ...req.body,
            dibuat: FieldValue.serverTimestamp()
        });
        res.status(201).json({
            id: ref.id,
            message: 'Dokumen berhasil ditambahkan ke Firestore'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /firestore/produk/:id (Ubah dokumen Firestore dengan merge: true)
app.put('/firestore/produk/:id', async (req, res) => {
    try {
        const docRef = firestoreCol.doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ message: 'Dokumen tidak ditemukan di Firestore' });
        }

        const perubahan = { ...req.body };
        delete perubahan.id;
        delete perubahan._id;

        await docRef.set(perubahan, { merge: true });
        res.json({ message: 'Dokumen berhasil diperbarui di Firestore' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /firestore/produk/:id (Hapus dokumen dari Firestore)
app.delete('/firestore/produk/:id', async (req, res) => {
    try {
        const docRef = firestoreCol.doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ message: 'Dokumen tidak ditemukan di Firestore' });
        }

        await docRef.delete();
        res.json({ message: 'Dokumen berhasil dihapus dari Firestore' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /firestore/ringkasan (Tantangan Slide 28: Agregasi Ringkasan Data)
app.get('/firestore/ringkasan', async (req, res) => {
    try {
        // Menghitung total dokumen menggunakan count() aggregate resmi Firestore
        const countSnap = await firestoreCol.count().get();
        const totalProduk = countSnap.data().count;

        // Menghitung total stok dan rata-rata harga
        const snap = await firestoreCol.get();
        let totalStok = 0;
        let totalHarga = 0;
        snap.docs.forEach(doc => {
            const data = doc.data();
            totalStok += Number(data.stok || 0);
            totalHarga += Number(data.harga || 0);
        });

        res.json({
            totalProduk,
            totalStok,
            rataHarga: totalProduk > 0 ? Math.round(totalHarga / totalProduk) : 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
