-- Consentement côté amitiés (additif, non destructif).
-- Les amitiés existantes sont déjà mutuelles → ACCEPTED par défaut.
-- Une demande par email crée désormais une arête PENDING (requester→target)
-- que le destinataire doit accepter avant que l'amitié ne devienne mutuelle.
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED');
ALTER TABLE "Friendship" ADD COLUMN "status" "FriendshipStatus" NOT NULL DEFAULT 'ACCEPTED';
