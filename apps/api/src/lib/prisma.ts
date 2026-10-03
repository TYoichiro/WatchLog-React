import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { requiredEnv } from "./env.js";
import { POSTGRES_TIME_ZONE_OPTION } from "./server-timezone.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: requiredEnv("DATABASE_URL"),
    options: POSTGRES_TIME_ZONE_OPTION,
  });

  return new PrismaClient({ adapter });
}

// 開発中の再読み込みで接続が増えないよう、本番以外では globalThis に保持する
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
