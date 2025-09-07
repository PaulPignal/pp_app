import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const main = async () => {
  const row = await db.work.findFirst();
  console.log("SMOKE ROW:", row);
};
main().finally(()=>db.$disconnect());
