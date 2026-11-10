
BEGIN;

-- 1. MASTER KARYAWAN
INSERT INTO karyawan (kode, nama, jabatan, no_hp, aktif)
VALUES
('KRY001', 'Budi Santoso', 'Sales', '081234560001', true),
('KRY002', 'Andi Pratama', 'Sales', '081234560002', true),
('KRY003', 'Dedi Saputra', 'Supir', '081234560003', true),
('KRY004', 'Rina Anggraini', 'Supervisor', '081234560004', true),
('KRY005', 'Agus Setiawan', 'Admin Gudang', '081234560005', true)
ON CONFLICT (kode) DO NOTHING;

-- 2. MASTER WILAYAH KANVAS
INSERT INTO wilayah_kanvas (kode, nama, keterangan)
VALUES
('WK001', 'Kudus Kota', 'Wilayah distribusi Kudus Kota'),
('WK002', 'Jati', 'Wilayah distribusi Kecamatan Jati'),
('WK003', 'Bae', 'Wilayah distribusi Kecamatan Bae'),
('WK004', 'Gebog', 'Wilayah distribusi Kecamatan Gebog')
ON CONFLICT (kode) DO NOTHING;

-- 3. MASTER KENDARAAN
INSERT INTO kendaraan (plat_nomor, jenis, keterangan, aktif)
VALUES
('K 1234 AA', 'Pickup', 'Kendaraan distribusi 1', true),
('K 2345 BB', 'Pickup', 'Kendaraan distribusi 2', true),
('K 3456 CC', 'Blind Van', 'Kendaraan distribusi 3', true)
ON CONFLICT (plat_nomor) DO NOTHING;

-- 4. MASTER TIPE HARGA
INSERT INTO tipe_harga (nama, keterangan)
SELECT v.nama, v.keterangan
FROM (VALUES
    ('Harga Umum', 'Harga penjualan umum'),
    ('Harga Grosir', 'Harga untuk pembelian grosir'),
    ('Harga Khusus', 'Harga khusus pelanggan tertentu')
) AS v(nama, keterangan)
WHERE NOT EXISTS (
    SELECT 1 FROM tipe_harga t WHERE t.nama = v.nama
);

-- 5. MASTER PRODUK
INSERT INTO produk (kode, nama, satuan, aktif)
VALUES
('PRD001', 'Beras Premium 5 Kg', 'Sak', true),
('PRD002', 'Gula Pasir 1 Kg', 'Pcs', true),
('PRD003', 'Minyak Goreng 1 L', 'Botol', true),
('PRD004', 'Tepung Terigu 1 Kg', 'Pcs', true),
('PRD005', 'Mi Instan Goreng', 'Dus', true),
('PRD006', 'Air Mineral 600 ml', 'Dus', true),
('PRD007', 'Kopi Sachet', 'Dus', true),
('PRD008', 'Teh Celup', 'Kotak', true),
('PRD009', 'Susu UHT 1 L', 'Kotak', true),
('PRD010', 'Biskuit', 'Dus', true)
ON CONFLICT (kode) DO NOTHING;

-- 6. MASTER GUDANG
INSERT INTO gudang (kode, nama, tipe, keterangan)
VALUES
('GDG001', 'Gudang Distribusi Utama', 'DISTRIBUSI',
 'Gudang utama barang distribusi'),
('GDG002', 'Gudang Retur', 'RETUR',
 'Gudang penampungan barang retur')
ON CONFLICT (kode) DO NOTHING;

-- 7. MASTER TIPE SUMBER TRANSAKSI
INSERT INTO tipe_sumber (kode, nama, arah, aktif)
VALUES
('PRODUKSI', 'Penerimaan Produksi', 'IN', true),
('TOKO_IN', 'Penerimaan dari Toko', 'IN', true),
('KANVAS_IN', 'Retur Sales Kanvas', 'IN', true),
('TOKO_OUT', 'Pengeluaran ke Toko', 'OUT', true),
('COUNTER_OUT', 'Penjualan Counter', 'OUT', true),
('KANVAS_OUT', 'Pengeluaran Sales Kanvas', 'OUT', true)
ON CONFLICT (arah, kode) DO NOTHING;

-- 8. MASTER OUTLET
-- Gunakan tipe harga Harga Umum dan wilayah yang tersedia.
INSERT INTO outlet
    (kode, nama, alamat, no_hp, id_wilayah_kanvas,
     id_tipe_harga, limit_piutang, aktif)
SELECT
    v.kode, v.nama, v.alamat, v.no_hp,
    w.id, t.id, v.limit_piutang, true
FROM (VALUES
    ('OUT001', 'Toko Maju Jaya', 'Kudus Kota', '081111110001', 'WK001', 2000000::numeric),
    ('OUT002', 'Toko Sumber Rejeki', 'Kudus Kota', '081111110002', 'WK001', 1500000::numeric),
    ('OUT003', 'Toko Berkah', 'Kudus Kota', '081111110003', 'WK001', 1000000::numeric),
    ('OUT004', 'Toko Sejahtera', 'Jati', '081111110004', 'WK002', 2000000::numeric),
    ('OUT005', 'Toko Makmur', 'Jati', '081111110005', 'WK002', 1000000::numeric),
    ('OUT006', 'Toko Barokah', 'Bae', '081111110006', 'WK003', 1500000::numeric),
    ('OUT007', 'Toko Amanah', 'Bae', '081111110007', 'WK003', 1000000::numeric),
    ('OUT008', 'Toko Sentosa', 'Gebog', '081111110008', 'WK004', 2000000::numeric),
    ('OUT009', 'Toko Jaya Abadi', 'Gebog', '081111110009', 'WK004', 1000000::numeric),
    ('OUT010', 'Toko Mitra Usaha', 'Kudus Kota', '081111110010', 'WK001', 1500000::numeric)
) AS v(kode, nama, alamat, no_hp, kode_wilayah, limit_piutang)
JOIN wilayah_kanvas w ON w.kode = v.kode_wilayah
JOIN tipe_harga t ON t.nama = 'Harga Umum'
WHERE NOT EXISTS (
    SELECT 1 FROM outlet o WHERE o.kode = v.kode
);

-- 9. MASTER HARGA PRODUK
-- Harga contoh/dummy, bukan harga resmi perusahaan.
WITH harga(kode_produk, nama_tipe, harga) AS (
    VALUES
    ('PRD001', 'Harga Umum', 75000::numeric),
    ('PRD001', 'Harga Grosir', 72000::numeric),
    ('PRD001', 'Harga Khusus', 70000::numeric),
    ('PRD002', 'Harga Umum', 16000::numeric),
    ('PRD002', 'Harga Grosir', 15000::numeric),
    ('PRD002', 'Harga Khusus', 14500::numeric),
    ('PRD003', 'Harga Umum', 18000::numeric),
    ('PRD003', 'Harga Grosir', 17000::numeric),
    ('PRD003', 'Harga Khusus', 16500::numeric),
    ('PRD004', 'Harga Umum', 12000::numeric),
    ('PRD004', 'Harga Grosir', 11000::numeric),
    ('PRD004', 'Harga Khusus', 10500::numeric),
    ('PRD005', 'Harga Umum', 110000::numeric),
    ('PRD005', 'Harga Grosir', 105000::numeric),
    ('PRD005', 'Harga Khusus', 102000::numeric),
    ('PRD006', 'Harga Umum', 40000::numeric),
    ('PRD006', 'Harga Grosir', 37000::numeric),
    ('PRD006', 'Harga Khusus', 35000::numeric),
    ('PRD007', 'Harga Umum', 95000::numeric),
    ('PRD007', 'Harga Grosir', 90000::numeric),
    ('PRD007', 'Harga Khusus', 87000::numeric),
    ('PRD008', 'Harga Umum', 12000::numeric),
    ('PRD008', 'Harga Grosir', 11000::numeric),
    ('PRD008', 'Harga Khusus', 10500::numeric),
    ('PRD009', 'Harga Umum', 20000::numeric),
    ('PRD009', 'Harga Grosir', 19000::numeric),
    ('PRD009', 'Harga Khusus', 18000::numeric),
    ('PRD010', 'Harga Umum', 85000::numeric),
    ('PRD010', 'Harga Grosir', 80000::numeric),
    ('PRD010', 'Harga Khusus', 78000::numeric)
)
INSERT INTO produk_harga (id_produk, id_tipe_harga, harga)
SELECT p.id, t.id, h.harga
FROM harga h
JOIN produk p ON p.kode = h.kode_produk
JOIN tipe_harga t ON t.nama = h.nama_tipe
ON CONFLICT (id_produk, id_tipe_harga) DO NOTHING;

COMMIT;
