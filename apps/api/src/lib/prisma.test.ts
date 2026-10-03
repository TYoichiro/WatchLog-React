import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type PrismaModule = typeof import("./prisma.js");

// 実際の PostgreSQL に接続する統合テスト。DATABASE_URL が無い環境ではスキップする
describe.skipIf(!process.env.DATABASE_URL)("prisma", () => {
  let prisma: PrismaModule["prisma"];

  beforeAll(async () => {
    // import 時に DATABASE_URL を検証するので、スキップされる場合に読み込まないよう遅延させる
    ({ prisma } = await import("./prisma.js"));
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("Prisma の接続ではセッションのタイムゾーンが Asia/Tokyo になる", async () => {
    const rows = await prisma.$queryRaw<{ timezone: string }[]>`
      SELECT current_setting('TimeZone') AS timezone
    `;

    expect(rows[0]?.timezone).toBe("Asia/Tokyo");
  });

  it("マイグレーション済みのテーブルを参照できる", async () => {
    await expect(prisma.role.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});

// psql や生の SQL など、接続オプションを付けない接続でも UTC が混ざらないことを確かめる
describe.skipIf(!process.env.DATABASE_URL)("PostgreSQL サーバーの設定", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("既定のタイムゾーンが Asia/Tokyo になっている", async () => {
    const { rows } = await client.query<{ timezone: string }>(
      "SELECT current_setting('TimeZone') AS timezone",
    );

    expect(rows[0]?.timezone).toBe("Asia/Tokyo");
  });

  it("ログの時刻のタイムゾーンが Asia/Tokyo になっている", async () => {
    const { rows } = await client.query<{ timezone: string }>(
      "SELECT current_setting('log_timezone') AS timezone",
    );

    expect(rows[0]?.timezone).toBe("Asia/Tokyo");
  });
});
