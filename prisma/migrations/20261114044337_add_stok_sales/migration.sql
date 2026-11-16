-- CreateTable
CREATE TABLE "stok_sales" (
    "id" SERIAL NOT NULL,
    "id_rencana_kanvas" INTEGER NOT NULL,
    "id_produk" INTEGER NOT NULL,
    "batch" TEXT NOT NULL,
    "tgl_exp" DATE NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stok_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stok_sales_id_rencana_kanvas_id_produk_batch_key" ON "stok_sales"("id_rencana_kanvas", "id_produk", "batch");

-- AddForeignKey
ALTER TABLE "stok_sales" ADD CONSTRAINT "stok_sales_id_rencana_kanvas_fkey" FOREIGN KEY ("id_rencana_kanvas") REFERENCES "rencana_kanvas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stok_sales" ADD CONSTRAINT "stok_sales_id_produk_fkey" FOREIGN KEY ("id_produk") REFERENCES "produk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stok tidak boleh negatif
ALTER TABLE "stok_sales" ADD CONSTRAINT "stok_sales_qty_nonneg" CHECK (qty >= 0);