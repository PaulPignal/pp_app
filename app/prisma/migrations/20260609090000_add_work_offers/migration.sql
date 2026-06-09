-- Offre billetterie structurée sur les œuvres (additif, non destructif) :
--  - availability : disponibilité (schema.org), ex. "InStock", "SoldOut"
--  - currency     : devise du prix, ex. "EUR"
ALTER TABLE "Work" ADD COLUMN "availability" TEXT;
ALTER TABLE "Work" ADD COLUMN "currency" TEXT;
