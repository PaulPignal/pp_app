import { prisma as db } from "@/server/db";
const main = async () => {
  const row = await db.work.findFirst();
  console.log("SMOKE ROW:", row);
};
main().finally(()=>db.$disconnect());
