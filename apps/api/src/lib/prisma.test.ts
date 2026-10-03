import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";

// 実際の PostgreSQL に接続する統合テスト。DATABASE_URL が無い環境ではスキップする
describe.skipIf(!process.env.DATABASE_URL)("prisma", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Prisma の接続はセッションを UTC にする（@prisma/adapter-pg の前提）", async () => {
    const rows = await prisma.$queryRaw<{ timezone: string }[]>`
      SELECT current_setting('TimeZone') AS timezone
    `;

    expect(rows[0]?.timezone).toBe("UTC");
  });

  it("マイグレーション済みのテーブルを参照できる", async () => {
    await expect(prisma.role.count()).resolves.toBeGreaterThanOrEqual(0);
  });

  it("日時の列はすべてタイムゾーン付き（TIMESTAMPTZ）", async () => {
    const columns = await prisma.$queryRaw<{ column: string }[]>`
      SELECT table_name || '.' || column_name AS column
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name <> '_prisma_migrations'
        AND data_type = 'timestamp without time zone'
    `;

    expect(columns.map((c) => c.column)).toEqual([]);
  });

  it("Prisma で保存した日時を、JST の接続（psql など）で読んでも同じ時刻になる", async () => {
    const before = Date.now();
    const publishedAt = new Date("2026-01-15T06:00:00.000Z"); // JST 15:00
    const role = await prisma.role.create({ data: { name: `test-tz-${before}` } });
    const notice = await prisma.dashboardNotice.create({
      data: { title: "test", content: "test", publishedAt },
    });
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
      // Prisma で書いて Prisma で読むと、ずれていても打ち消し合って気づけないので、別の接続で読む
      const { rows } = await client.query<{ createdAt: Date; createdAtText: string }>(
        'SELECT created_at AS "createdAt", created_at::text AS "createdAtText" FROM roles WHERE id = $1',
        [role.id],
      );
      expect(rows[0]?.createdAt.getTime()).toBe(role.createdAt.getTime());
      // DB の既定（JST）で +09 として表示され、時刻も現在と数秒以内（9 時間ずれていない）
      expect(rows[0]?.createdAtText).toMatch(/\+09$/);
      expect(Math.abs(role.createdAt.getTime() - before)).toBeLessThan(60_000);

      const notices = await client.query<{ publishedAt: string }>(
        'SELECT published_at::text AS "publishedAt" FROM dashboard_notices WHERE id = $1',
        [notice.id],
      );
      expect(notices.rows[0]?.publishedAt).toBe("2026-01-15 15:00:00+09");
    } finally {
      await client.end();
      await prisma.dashboardNotice.delete({ where: { id: notice.id } });
      await prisma.role.delete({ where: { id: role.id } });
    }
  });

  it("SQL で日付を区切るときは AT TIME ZONE 'Asia/Tokyo' で JST の日付にする", async () => {
    // JST 2026-01-15 08:30 = UTC 2026-01-14 23:30
    const publishedAt = new Date("2026-01-14T23:30:00.000Z");
    const notice = await prisma.dashboardNotice.create({
      data: { title: "test", content: "test", publishedAt },
    });

    try {
      const [row] = await prisma.$queryRaw<{ jstDate: string; naiveDate: string }[]>`
        SELECT
          (published_at AT TIME ZONE 'Asia/Tokyo')::date::text AS "jstDate",
          published_at::date::text AS "naiveDate"
        FROM dashboard_notices WHERE id = ${notice.id}
      `;

      expect(row?.jstDate).toBe("2026-01-15");
      // AT TIME ZONE を付けないと、Prisma の接続（UTC）の日付になって前日に入ってしまう
      expect(row?.naiveDate).toBe("2026-01-14");
    } finally {
      await prisma.dashboardNotice.delete({ where: { id: notice.id } });
    }
  });

  it("更新すると updated_at が DB のトリガーで更新される", async () => {
    const role = await prisma.role.create({ data: { name: `test-trigger-${Date.now()}` } });

    try {
      // updated_at はミリ秒の精度なので、作成と同じミリ秒に更新すると値が変わらない。少し間を空ける
      await new Promise((resolve) => setTimeout(resolve, 20));
      await prisma.$executeRaw`UPDATE roles SET description = 'x' WHERE id = ${role.id}`;
      const updated = await prisma.role.findUniqueOrThrow({ where: { id: role.id } });
      expect(updated.updatedAt.getTime()).toBeGreaterThan(role.updatedAt.getTime());
    } finally {
      await prisma.role.delete({ where: { id: role.id } });
    }
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
