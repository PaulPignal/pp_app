/*
  Warnings:

  - You are about to drop the `Like` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."ReactionStatus" AS ENUM ('LIKE', 'DISLIKE', 'SEEN');

-- DropForeignKey
ALTER TABLE "public"."Like" DROP CONSTRAINT "Like_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Like" DROP CONSTRAINT "Like_workId_fkey";

-- DropTable
DROP TABLE "public"."Like";

-- CreateTable
CREATE TABLE "public"."Reaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "status" "public"."ReactionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reaction_userId_status_idx" ON "public"."Reaction"("userId", "status");

-- CreateIndex
CREATE INDEX "Reaction_workId_status_idx" ON "public"."Reaction"("workId", "status");

-- CreateIndex
CREATE INDEX "Reaction_createdAt_idx" ON "public"."Reaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_userId_workId_key" ON "public"."Reaction"("userId", "workId");

-- AddForeignKey
ALTER TABLE "public"."Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reaction" ADD CONSTRAINT "Reaction_workId_fkey" FOREIGN KEY ("workId") REFERENCES "public"."Work"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
