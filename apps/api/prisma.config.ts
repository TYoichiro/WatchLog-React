import "dotenv/config";
import { defineConfig } from "prisma/config";

process.env.TZ = "Asia/Tokyo";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=source prisma/seed.ts",
  },
  datasource: {
    // generate は DB に接続しないので未設定でもよい。migrate / seed では必須（未設定なら Prisma がエラーにする）
    url: process.env.DATABASE_URL,
  },
});
