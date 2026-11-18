-- CreateTable
CREATE TABLE "kunjungan_kanvas" (
    "id" SERIAL NOT NULL,
    "nama_toko" TEXT NOT NULL,
    "tanggal_kunjungan" DATE NOT NULL,
    "id_wilayah_kanvas" INTEGER NOT NULL,
    "catatan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DIRENCANAKAN',
    "idempotency_key" TEXT,
    "id_user" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kunjungan_kanvas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kunjungan_kanvas_idempotency_key_key" ON "kunjungan_kanvas"("idempotency_key");

-- CreateIndex
CREATE INDEX "kunjungan_kanvas_tanggal_kunjungan_idx" ON "kunjungan_kanvas"("tanggal_kunjungan");

-- CreateIndex
CREATE INDEX "kunjungan_kanvas_id_wilayah_kanvas_idx" ON "kunjungan_kanvas"("id_wilayah_kanvas");

-- CreateIndex
CREATE INDEX "kunjungan_kanvas_status_idx" ON "kunjungan_kanvas"("status");

-- AddForeignKey
ALTER TABLE "kunjungan_kanvas" ADD CONSTRAINT "kunjungan_kanvas_id_wilayah_kanvas_fkey" FOREIGN KEY ("id_wilayah_kanvas") REFERENCES "wilayah_kanvas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
