BEGIN;

ALTER TABLE "kasbon_produk"      ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "kasbon_operasional" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "kasbon_produk"      ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "kasbon_operasional" ALTER COLUMN "status" TYPE TEXT USING "status"::text;

-- Bon barang yang sudah punya Product Out = ONLOADING, sisanya DRAFT.
UPDATE "kasbon_produk" k
SET "status" = CASE
  WHEN k."status" = 'BATAL' THEN 'BATAL'
  WHEN EXISTS (
    SELECT 1 FROM "produk_out" po WHERE po."id_kasbon_produk" = k."id"
  ) THEN 'ONLOADING'
  ELSE 'DRAFT'
END;

UPDATE "kasbon_operasional"
SET "status" = CASE WHEN "status" = 'BATAL' THEN 'BATAL' ELSE 'DRAFT' END;

DROP TYPE "KasbonStatus";
CREATE TYPE "KasbonStatus" AS ENUM ('DRAFT', 'ONLOADING', 'BATAL');

ALTER TABLE "kasbon_produk"
  ALTER COLUMN "status" TYPE "KasbonStatus" USING "status"::"KasbonStatus";
ALTER TABLE "kasbon_operasional"
  ALTER COLUMN "status" TYPE "KasbonStatus" USING "status"::"KasbonStatus";

ALTER TABLE "kasbon_produk"      ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "kasbon_operasional" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

COMMIT;