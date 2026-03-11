# Offi App

App Next.js pour le prototype "Tinder for theatre plays in Paris".

## Stack

- Next.js 16 + React 19
- Prisma 7 avec client généré dans `src/generated/prisma`
- Tailwind CSS 4
- NextAuth credentials-only
- Vitest 4

## Prérequis locaux

- Node.js 20.x
- `pnpm` 10+
- une base PostgreSQL accessible via `DATABASE_URL` (Neon en cible principale)

Le projet tourne actuellement sous Node 20. Lancer les commandes sous Node 22 affiche des warnings d'engine et n'est pas la cible supportée.

## Installation

```bash
pnpm install
cp .env.example .env.local
pnpm prisma:generate
pnpm build
pnpm dev
```

L'app écoute par défaut sur [http://localhost:3000](http://localhost:3000).

## Variables d'environnement requises

Copier `app/.env.example` vers `app/.env.local` puis renseigner :

- `DATABASE_URL`: URL PostgreSQL/Neon.
- `NEXTAUTH_SECRET`: secret long et aléatoire pour signer les sessions.
- `INVITE_TOKEN_SECRET`: secret long et aléatoire pour signer les invitations amis. Si absent, le code retombe sur `NEXTAUTH_SECRET`, mais ce n'est pas recommandé.
- `NEXTAUTH_URL`: URL canonique de l'app.
- `NEXT_PUBLIC_APP_URL`: URL publique utilisée côté serveur pour certaines requêtes internes.

## Scripts utiles

- `pnpm dev`: lance Next.js en développement.
- `pnpm build`: build de production avec Turbopack.
- `pnpm test`: lance la suite Vitest.
- `pnpm prisma:generate`: régénère le client Prisma.
- `pnpm db:deploy`: applique les migrations Prisma.
- `pnpm db:seed`: seed manuel de dev.
- `pnpm ingest:offi`: ingestion des données Offi.

## Prisma généré

Le dossier `src/generated/prisma` est un artefact généré. Il ne doit pas être versionné.

Le client est produit par :

```bash
pnpm prisma:generate
```

Le `postinstall` du package le régénère également après installation.

## Build et déploiement

- `pnpm build` fonctionne localement avec Turbopack.
- `pnpm db:deploy` doit rester séparé du build applicatif.
- les secrets locaux existants doivent être rotés hors git avant tout déploiement si leur historique est douteux.

## Notes de sécurité

- `app/.env.local` et `app/.env.production.local` ne sont pas versionnés ; ils peuvent toutefois contenir des secrets réels sur la machine locale.
- `/api/debug-session` reste disponible uniquement hors production. Si vous n'en avez plus besoin pour le diagnostic auth, supprimez la route.
