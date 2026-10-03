import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

/*
 * Prisma の接続だけは、DB セッションのタイムゾーンを UTC にする。
 *
 * @prisma/adapter-pg は「セッションが UTC」である前提で日時を変換する。
 *   - 書き込み: Date を UTC の日時の文字列（オフセットなし）で送る
 *   - 読み込み: DB が返すオフセット（+09 など）を +00:00 に置き換えて読む
 * DB サーバーの既定は JST なので、何も指定しないとオフセットなしの UTC の値が JST とみなされ、9 時間ずれて保存される。
 *
 * 列は TIMESTAMPTZ（正しい時刻を保存する）なので、保存される値に UTC と JST の混在は起きない。
 * psql などで見ると、DB サーバーの既定（Asia/Tokyo）で +09 として表示される。
 */
const PRISMA_SESSION_OPTIONS = "-c timezone=UTC";

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  // DB に接続するのは最初のクエリのときなので、import しただけでは DATABASE_URL を要求しない
  // （必須かどうかはサーバー起動時に index.ts の assertRequiredEnv で検証する）
  const adapter = new PrismaPg({
    connectionString,
    options: PRISMA_SESSION_OPTIONS,
  });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// 開発中の再読み込みで接続が増えないよう、本番以外では globalThis に保持する
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
