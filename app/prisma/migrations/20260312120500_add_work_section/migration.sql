ALTER TABLE "Work"
ADD COLUMN "section" TEXT NOT NULL DEFAULT 'theatre';

CREATE INDEX "Work_section_createdAt_idx" ON "Work"("section", "createdAt");
