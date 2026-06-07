-- Reaction → User / Work : ON DELETE CASCADE (nettoyage automatique des réactions)
ALTER TABLE "Reaction" DROP CONSTRAINT "Reaction_userId_fkey";
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" DROP CONSTRAINT "Reaction_workId_fkey";
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Friendship → User (deux relations) : ON DELETE CASCADE
ALTER TABLE "Friendship" DROP CONSTRAINT "Friendship_userId_fkey";
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Friendship" DROP CONSTRAINT "Friendship_friendId_fkey";
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
