/*
  Warnings:

  - Added the required column `tgl_kedaluwarsa` to the `detail_produk_in` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tgl_kedaluwarsa` to the `mutasi_batch` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "detail_produk_in" ADD COLUMN     "tgl_kedaluwarsa" DATE NOT NULL;

-- AlterTable
ALTER TABLE "mutasi_batch" ADD COLUMN     "tgl_kedaluwarsa" DATE NOT NULL;

-- CreateIndex
CREATE INDEX "mutasi_batch_id_produk_id_gudang_tgl_kedaluwarsa_idx" ON "mutasi_batch"("id_produk", "id_gudang", "tgl_kedaluwarsa");
