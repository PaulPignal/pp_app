-- Catalogue des lieux (théâtres + cinémas) + lien optionnel Work → Venue (additif).
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "offiId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "streetAddress" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "metro" TEXT,
    "access" TEXT,
    "imageUrl" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Venue_offiId_key" ON "Venue"("offiId");
CREATE UNIQUE INDEX "Venue_sourceUrl_key" ON "Venue"("sourceUrl");
CREATE INDEX "Venue_kind_idx" ON "Venue"("kind");

ALTER TABLE "Work" ADD COLUMN "venueId" TEXT;
CREATE INDEX "Work_venueId_idx" ON "Work"("venueId");
ALTER TABLE "Work" ADD CONSTRAINT "Work_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
