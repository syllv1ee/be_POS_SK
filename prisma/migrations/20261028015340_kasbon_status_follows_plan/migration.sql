BEGIN;

ALTER TABLE "kasbon_produk"      ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "kasbon_operasional" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "kasbon_produk"      ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "kasbon_operasional" ALTER COLUMN "status" TYPE TEXT USING "status"::text;

UPDATE "kasbon_produk" k
SET "status" = CASE r."status"::text
  WHEN 'BATAL'  THEN 'BATAL'
  WHEN 'DRAFT'  THEN 'DRAFT'
  WHEN 'REVISI' THEN 'DRAFT'
  ELSE 'ACC'
END
FROM "rencana_kanvas" r
WHERE r."id" = k."id_rencana_kanvas";

UPDATE "kasbon_operasional" k
SET "status" = CASE r."status"::text
  WHEN 'BATAL'  THEN 'BATAL'
  WHEN 'DRAFT'  THEN 'DRAFT'
  WHEN 'REVISI' THEN 'DRAFT'
  ELSE 'ACC'
END
FROM "rencana_kanvas" r
WHERE r."id" = k."id_rencana_kanvas";

DROP TYPE "KasbonStatus";
CREATE TYPE "KasbonStatus" AS ENUM ('DRAFT', 'ACC', 'BATAL');

ALTER TABLE "kasbon_produk"
  ALTER COLUMN "status" TYPE "KasbonStatus" USING "status"::"KasbonStatus";
ALTER TABLE "kasbon_operasional"
  ALTER COLUMN "status" TYPE "KasbonStatus" USING "status"::"KasbonStatus";

ALTER TABLE "kasbon_produk"      ALTER COLUMN "status" SET DEFAULT 'DRAFT';
ALTER TABLE "kasbon_operasional" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

COMMIT;