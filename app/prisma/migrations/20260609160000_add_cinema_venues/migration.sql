-- Salles de cinéma où un film est programmé (additif, non destructif) :
--  - cinemaVenueCount : nombre de salles uniques
--  - cinemaVenues     : échantillon de noms de salles
ALTER TABLE "Work" ADD COLUMN "cinemaVenueCount" INTEGER;
ALTER TABLE "Work" ADD COLUMN "cinemaVenues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
