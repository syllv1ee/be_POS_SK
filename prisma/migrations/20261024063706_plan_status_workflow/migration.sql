BEGIN;

CREATE TYPE "SalesKanvasPlanStatus_new" AS ENUM
  ('DRAFT', 'DISETUJUI', 'LOADING', 'KOMPLIT', 'BATAL', 'REVISI');

ALTER TABLE "rencana_kanvas" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "rencana_kanvas"
  ALTER COLUMN "status" TYPE "SalesKanvasPlanStatus_new"
  USING (
    CASE WHEN "status"::text = 'AKTIF' THEN 'DRAFT' ELSE "status"::text END
  )::"SalesKanvasPlanStatus_new";

ALTER TYPE "SalesKanvasPlanStatus" RENAME TO "SalesKanvasPlanStatus_old";
ALTER TYPE "SalesKanvasPlanStatus_new" RENAME TO "SalesKanvasPlanStatus";
DROP TYPE "SalesKanvasPlanStatus_old";

ALTER TABLE "rencana_kanvas" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

COMMIT;