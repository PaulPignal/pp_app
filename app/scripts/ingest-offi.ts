import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { buildWorkUpsert, parseOffiJsonLine, type OffiWorkRecord } from "@/lib/offi";

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

async function readOffiFile(file: string) {
  const records: OffiWorkRecord[] = [];
  const seenUrls = new Set<string>();
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  for await (const rawLine of rl) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line) continue;

    const record = parseOffiJsonLine(line, lineNumber);
    if (seenUrls.has(record.url)) {
      throw new Error(`Line ${lineNumber}: duplicate url ${record.url}`);
    }

    seenUrls.add(record.url);
    records.push(record);
  }

  if (records.length === 0) {
    throw new Error(`No records found in ${file}`);
  }

  return records;
}

async function ingest(file: string) {
  if (!fs.existsSync(file)) {
    throw new Error(`Fichier introuvable: ${file}`);
  }

  const records = await readOffiFile(file);
  console.log(`[ingest:offi] ${records.length} lignes validées depuis ${file}`);

  const { prisma } = await import("@/server/db");

  let count = 0;
  try {
    for (const record of records) {
      const { create, update } = buildWorkUpsert(record);

      await prisma.work.upsert({
        where: { sourceUrl: record.url },
        update,
        create,
      });

      count += 1;
      if (count % 100 === 0) {
        console.log(`[ingest:offi] ${count} lignes importées`);
      }
    }

    await prisma.importJob.create({
      data: {
        source: file,
        imported: count,
      },
    }).catch((error) => {
      console.warn("[ingest:offi] importJob skipped:", error instanceof Error ? error.message : error);
    });
  } finally {
    await prisma.$disconnect();
  }

  console.log(`[ingest:offi] Imported ${count} works from ${file}`);
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
