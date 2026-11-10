-- CreateEnum
CREATE TYPE "StockDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "produk_in" ADD COLUMN     "id_tipe_sumber" INTEGER;

-- AlterTable
ALTER TABLE "produk_out" ADD COLUMN     "id_tipe_sumber" INTEGER;

-- CreateTable
CREATE TABLE "tipe_sumber" (
    "id" SERIAL NOT NULL,
    "kode" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "arah" "StockDirection" NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipe_sumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipe_sumber_arah_kode_key" ON "tipe_sumber"("arah", "kode");

-- CreateIndex
CREATE INDEX "produk_in_id_tipe_sumber_idx" ON "produk_in"("id_tipe_sumber");

-- CreateIndex
CREATE INDEX "produk_out_id_tipe_sumber_idx" ON "produk_out"("id_tipe_sumber");

-- AddForeignKey
ALTER TABLE "produk_out" ADD CONSTRAINT "produk_out_id_tipe_sumber_fkey" FOREIGN KEY ("id_tipe_sumber") REFERENCES "tipe_sumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produk_in" ADD CONSTRAINT "produk_in_id_tipe_sumber_fkey" FOREIGN KEY ("id_tipe_sumber") REFERENCES "tipe_sumber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
