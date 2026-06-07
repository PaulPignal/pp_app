import "dotenv/config";
import { defineConfig } from "prisma/config";

// On lit `process.env.DATABASE_URL` directement (et non `env()` de prisma/config,
// qui throw immédiatement si la variable manque). Ainsi `prisma generate` — qui
// n'a pas besoin d'une vraie URL — fonctionne sans DATABASE_URL (CI, clone neuf
// sans .env). Les commandes DB réelles (migrate deploy) reçoivent la vraie URL
// via l'environnement ; le placeholder ne sert que de repli inoffensif.
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: DATABASE_URL,
  },
});
