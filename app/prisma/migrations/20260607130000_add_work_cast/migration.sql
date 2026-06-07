-- Casting + réalisateur/metteur en scène sur les œuvres (additif, non destructif).
ALTER TABLE "Work" ADD COLUMN "director" TEXT;
ALTER TABLE "Work" ADD COLUMN "cast" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
