-- Note publique du film (TMDB /10) + nombre de votes. Films uniquement (ciné + streaming).
ALTER TABLE "Work" ADD COLUMN "rating" DOUBLE PRECISION;
ALTER TABLE "Work" ADD COLUMN "ratingCount" INTEGER;
