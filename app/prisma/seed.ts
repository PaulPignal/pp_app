import { prisma } from "@/server/db";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed in production");
  }

  const seeds = [
    { title: "Le Cid",          category: "théâtre", sourceUrl: "seed://le-cid" },
    { title: "Dom Juan",        category: "théâtre", sourceUrl: "seed://dom-juan" },
    { title: "Le Misanthrope",  category: "théâtre", sourceUrl: "seed://misanthrope" },
  ];

  for (const w of seeds) {
    await prisma.work.upsert({
      where: { sourceUrl: w.sourceUrl },
      update: { title: w.title, category: w.category },
      create: { title: w.title, category: w.category, sourceUrl: w.sourceUrl },
    });
  }

  const count = await prisma.work.count();
  console.log("Seed OK. Work count =", count);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
