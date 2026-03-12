import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");

function parseEnvValue(raw: string) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n");
  }

  return trimmed;
}

function loadEnvFile(filePath: string, override = false) {
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7) : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    const value = parseEnvValue(normalized.slice(separator + 1));

    if (!key) continue;
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveInputPath(arg?: string) {
  if (!arg) return path.resolve(appDir, "..", "data", "offi.jsonl");
  return path.resolve(process.cwd(), arg);
}

async function ingest(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier introuvable: ${file}`);
  }

  const { ingestOffiFile } = await import("@/features/offi-import/server/ingest");
  const { imported, validated } = await ingestOffiFile(file);
  console.log(`[ingest:offi] ${validated} lignes validées depuis ${file}`);
  console.log(`[ingest:offi] Imported ${imported} works from ${file}`);
}

loadEnvFile(path.join(appDir, ".env"));
loadEnvFile(path.join(appDir, ".env.local"), true);

const cliArg = process.argv[2];
const inputFile = resolveInputPath(cliArg);

try {
  await ingest(inputFile);
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`[ingest:offi] ${message}`);
  process.exitCode = 1;
}
