-- Sources directes (07/11/2026) : migration ADDITIVE uniquement.
-- Quatre colonnes facultatives sur "Work" et deux index. Aucune réécriture, aucune suppression,
-- aucune valeur par défaut : les fiches existantes gardent NULL partout.
-- "directKey" (lieu:slug du titre) est unique ; Postgres accepte plusieurs NULL dans un index unique.

-- AlterTable
ALTER TABLE "Work" ADD COLUMN     "bookingUrl" TEXT,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "directKey" TEXT,
ADD COLUMN     "performances" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "Work_directKey_key" ON "Work"("directKey");

-- CreateIndex
CREATE INDEX "Work_dataSource_idx" ON "Work"("dataSource");
