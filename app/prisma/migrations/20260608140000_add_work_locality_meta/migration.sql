-- Métadonnées additionnelles sur les œuvres (additif, non destructif) :
--  - arrondissement : ville/arrondissement (théâtre), ex. "Paris 10e"
--  - country        : nationalité (cinéma), ex. "États-Unis"
--  - year           : année de production (cinéma)
ALTER TABLE "Work" ADD COLUMN "arrondissement" TEXT;
ALTER TABLE "Work" ADD COLUMN "country" TEXT;
ALTER TABLE "Work" ADD COLUMN "year" INTEGER;
