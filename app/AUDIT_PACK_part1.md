# Audit Pack (part 1)

- Généré le: 2025-08-31T16:28:01+02:00
- Racine: /Users/paulpignal/Desktop/offi-app/app

## Arborescence (filtrée)
.
pnpm-lock.yaml
.DS_Store
AUDIT_PACK_part1.md
postcss.config.mjs
next.config.mjs
node_modules
prisma
prisma/dev.db-shm
prisma/dev.db-wal
prisma/migrations
prisma/migrations/migration_lock.toml
prisma/migrations/20250831132636_init
prisma/migrations/20250831132636_init/migration.sql
prisma/schema.prisma
prisma/seed.ts
prisma/dev.db
tests
tests/like.test.tsx
.next
next-env.d.ts
.editorconfig
README.md
tailwind.config.ts
public
public/file.svg
public/vercel.svg
public/next.svg
public/globe.svg
public/window.svg
.gitignore
package.json
.env
make_audit_pack.sh
.nvmrc
scripts
scripts/ingest-offi.ts
scripts/smoke-db.ts
tsconfig.json
.env.example
.git
eslint.config.mjs
src
src/.DS_Store
src/app
src/app/favicon.ico
src/app/discover
src/app/discover/error.tsx
src/app/discover/loading.tsx
src/app/discover/page.tsx
src/app/.DS_Store
src/app/likes
src/app/likes/page.tsx
src/app/layout.tsx
src/app/new
src/app/new/page.tsx
src/app/error.tsx
src/app/api
src/app/api/ping
src/app/api/ping/route.ts
src/app/api/likes
src/app/api/likes/route.ts
src/app/api/auth
src/app/api/auth/[...nextauth]
src/app/api/auth/[...nextauth]/route.ts
src/app/api/common
src/app/api/common/route.ts
src/app/api/works
src/app/api/works/route.ts
src/app/api/friends
src/app/api/friends/route.ts
src/app/friends
src/app/friends/page.tsx
src/app/(auth)
src/app/(auth)/signin
src/app/(auth)/signin/page.tsx
src/app/page.tsx
src/app/globals.css
src/app/not-found.tsx
src/server
src/server/db.ts
src/server/auth.ts
src/components
src/components/CardWork.tsx
src/components/SwipeDeck.tsx
src/components/BadgeCategory.tsx

## Versions
Node: v22.19.0
pnpm: 10.15.0
Prisma: Environment variables loaded from .env
Prisma: prisma                : 5.18.0
Prisma: @prisma/client        : 5.18.0
Prisma: Computed binaryTarget : darwin-arm64
Prisma: Operating System      : darwin
Prisma: Architecture          : arm64
Prisma: Node.js               : v22.19.0
Prisma: Query Engine (Binary) : query-engine 4c784e32044a8a016d99474bd02a3b6123742169 (at node_modules/.pnpm/@prisma+engines@5.18.0/node_modules/@prisma/engines/query-engine-darwin-arm64)
Prisma: Schema Engine         : schema-engine-cli 4c784e32044a8a016d99474bd02a3b6123742169 (at node_modules/.pnpm/@prisma+engines@5.18.0/node_modules/@prisma/engines/schema-engine-darwin-arm64)
Prisma: Schema Wasm           : @prisma/prisma-schema-wasm 5.18.0-25.4c784e32044a8a016d99474bd02a3b6123742169
Prisma: Default Engines Hash  : 4c784e32044a8a016d99474bd02a3b6123742169
Prisma: Studio                : 0.502.0
Next: 14.2.5

## Fichiers

=== FILE: README.md ===

```md
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

```
