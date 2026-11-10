-- CreateEnum
CREATE TYPE "SalesKanvasPlanStatus" AS ENUM ('AKTIF', 'BATAL');

-- AlterTable
ALTER TABLE "rencana_kanvas" ADD COLUMN     "status" "SalesKanvasPlanStatus" NOT NULL DEFAULT 'AKTIF',
ADD COLUMN     "tgl_dibatalkan" TIMESTAMP(3);
