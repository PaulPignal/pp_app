import fs from "fs";
import readline from "readline";
// import compatible ESM/CJS
import pkg from "@prisma/client";
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

async function ingest(file = "../data/offi.jsonl") {
  if (!fs.existsSync(file)) {
    console.error("Fichier introuvable:", file);
    process.exit(1);
  }
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let count = 0;
  for await (const line of rl) {
    const l = line.trim();
    if (!l) continue;
    const obj = JSON.parse(l);

    await prisma.work.upsert({
      where: { sourceUrl: obj.url },
      update: {
        title: obj.title ?? "Sans titre",
        category: obj.category ?? null,
        venue: obj.venue ?? null,
        startDate: obj.date_start ? new Date(obj.date_start) : null,
        endDate: obj.date_end ? new Date(obj.date_end) : null,
        priceMin: obj.price_min_eur ?? null,
        priceMax: obj.price_max_eur ?? null,
        imageUrl: obj.image ?? null,
      },
      create: {
        title: obj.title ?? "Sans titre",
        category: obj.category ?? null,
        venue: obj.venue ?? null,
        startDate: obj.date_start ? new Date(obj.date_start) : null,
        endDate: obj.date_end ? new Date(obj.date_end) : null,
        priceMin: obj.price_min_eur ?? null,
        priceMax: obj.price_max_eur ?? null,
        imageUrl: obj.image ?? null,
        sourceUrl: obj.url,
      },
    });
    count++;
    if (count % 100 === 0) console.log(`...${count} lignes traitées`);
  }
  await prisma.importJob.create({ data: { source: file, imported: count } }).catch(()=>{});
  console.log(`Imported ${count} works from ${file}`);
}

const cliArg = process.argv[2];                      // n'utilise que l'argument CLI si fourni
await ingest(cliArg || "../data/offi.jsonl");
await prisma.$disconnect();
