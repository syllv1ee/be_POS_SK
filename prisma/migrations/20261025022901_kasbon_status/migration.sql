-- CreateEnum
CREATE TYPE "KasbonStatus" AS ENUM ('PENGAJUAN', 'ACC', 'REVISI');

-- AlterTable
ALTER TABLE "kasbon_operasional" ADD COLUMN     "catatan_revisi" TEXT,
ADD COLUMN     "status" "KasbonStatus" NOT NULL DEFAULT 'PENGAJUAN',
ADD COLUMN     "tgl_acc" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "kasbon_produk" ADD COLUMN     "catatan_revisi" TEXT,
ADD COLUMN     "status" "KasbonStatus" NOT NULL DEFAULT 'PENGAJUAN',
ADD COLUMN     "tgl_acc" TIMESTAMP(3);
