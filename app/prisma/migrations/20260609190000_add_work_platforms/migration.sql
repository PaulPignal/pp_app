-- Plateformes de streaming (abonnement) où le film est dispo + index GIN pour le filtre.
ALTER TABLE "Work" ADD COLUMN "platforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Work_platforms_idx" ON "Work" USING GIN ("platforms");
