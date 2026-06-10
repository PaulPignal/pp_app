-- Motif d'URL des pages événement du site du lieu (ex. https://x.com/spectacle/{slug}/).
ALTER TABLE "Venue" ADD COLUMN "eventUrlTemplate" TEXT;
