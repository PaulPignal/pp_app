import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Ingestion des fiches directes (python3 -m scraper.venues). Même chargement d'environnement
// que ingest-offi.ts.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");

function loadEnvFile(filePath: string, override = false) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7) : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\n/g, "\n");
    }
    if (key && (override || process.env[key] === undefined)) process.env[key] = value;
  }
}

loadEnvFile(path.join(appDir, ".env"));
loadEnvFile(path.join(appDir, ".env.local"), true);

const file = path.resolve(process.cwd(), process.argv[2] ?? path.resolve(appDir, "..", "data", "venues", "events.jsonl"));

try {
  const { ingestDirectFile } = await import("@/features/offi-import/server/ingest-direct");
  const result = await ingestDirectFile(file);
  console.log(
    `[ingest:venues] ${result.imported} fiches directes (${result.venues} lieux) : ${result.created} créées, ${result.merged} fusionnées avec offi, ${result.updated} mises à jour`,
  );
} catch (error) {
  console.error(`[ingest:venues] ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  const { prisma } = await import("@/server/db");
  await prisma.$disconnect();
}
