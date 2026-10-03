import { randomBytes } from "node:crypto";
import { initAuthConfig } from "@hono/auth-js";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { api, apiErrorHandler } from "./app.js";
import { assertAuthUrl, getAuthConfig } from "./auth.js";
import * as authz from "./lib/authz.js";
import { prisma } from "./lib/prisma.js";

// AUTH_* はテスト用のダミー値（vitest.config.ts で設定）
const BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "authjs.session-token";

// 実際の PostgreSQL を使う統合テスト。Google と通信しない範囲で、Auth.js の動作を確かめる
describe.skipIf(!process.env.DATABASE_URL)("認証（Auth.js）", () => {
  const m = { api, apiErrorHandler, getAuthConfig, authz, prisma };
  const createdUserIds: string[] = [];
  const suffix = randomBytes(4).toString("hex");
  const roleName = `test-role-${suffix}`;
  const permissionAction = `test.permission.${suffix}`;

  afterAll(async () => {
    await m.prisma.auditLog.deleteMany({ where: { resourceId: { in: createdUserIds } } });
    await m.prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await m.prisma.role.deleteMany({ where: { name: roleName } });
    await m.prisma.permission.deleteMany({ where: { action: permissionAction } });
    await m.prisma.$disconnect();
  });

  async function createUser(options: { isBanned?: boolean } = {}) {
    const user = await m.prisma.user.create({
      data: {
        email: `test-auth-${suffix}-${createdUserIds.length}@example.com`,
        name: "テストユーザー",
        isBanned: options.isBanned ?? false,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createSession(userId: string, expires = new Date(Date.now() + 86_400_000)) {
    const sessionToken = randomBytes(32).toString("hex");
    await m.prisma.session.create({ data: { sessionToken, userId, expires } });
    return { sessionToken, cookie: `${SESSION_COOKIE}=${sessionToken}` };
  }

  function request(path: string, init?: RequestInit) {
    return m.api.request(`${BASE_URL}${path}`, init);
  }

  async function getCsrf() {
    const res = await request("/api/auth/csrf");
    const { csrfToken } = (await res.json()) as { csrfToken: string };
    const cookies = res.headers.getSetCookie().map((value) => value.split(";")[0]);
    return { csrfToken, cookies };
  }

  // requireUser / requirePermission を試すためのテスト用ルート（本番の API には追加しない）
  function createProtectedApp() {
    return new Hono()
      .use("*", initAuthConfig(m.getAuthConfig))
      .get("/me", async (c) => c.json(await m.authz.requireUser(c)))
      .get("/permitted", async (c) => c.json(await m.authz.requirePermission(c, permissionAction)))
      .onError(m.apiErrorHandler);
  }

  describe("Auth.js のルート", () => {
    it("Google のプロバイダーが登録され、コールバック URL に AUTH_URL を使う", async () => {
      const res = await request("/api/auth/providers");

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        google: {
          id: "google",
          callbackUrl: `${BASE_URL}/api/auth/callback/google`,
        },
      });
    });

    it("Google でのサインインは Google の認可画面へリダイレクトする", async () => {
      const { csrfToken, cookies } = await getCsrf();

      const res = await request("/api/auth/signin/google", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: cookies.join("; "),
        },
        body: new URLSearchParams({ csrfToken, callbackUrl: `${BASE_URL}/` }),
      });

      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location") ?? "");
      expect(location.origin).toBe("https://accounts.google.com");
      expect(location.searchParams.get("client_id")).toBe("test-google-client-id");
      expect(location.searchParams.get("redirect_uri")).toBe(
        `${BASE_URL}/api/auth/callback/google`,
      );
    });

    it("未ログインならセッションは null", async () => {
      const res = await request("/api/auth/session");

      expect(res.status).toBe(200);
      expect(await res.json()).toBeNull();
    });

    it("DB にセッションがあれば、ユーザー ID と有効期限（JST）だけを返す", async () => {
      const user = await createUser();
      const expires = new Date("2027-01-01T00:00:00.000Z");
      const { sessionToken, cookie } = await createSession(user.id, expires);

      const res = await request("/api/auth/session", { headers: { cookie } });
      const body = (await res.json()) as Record<string, unknown>;

      // 名前・メールアドレス・画像は含めない。有効期限は +09:00 付きの JST
      expect(body).toEqual({
        user: { id: user.id },
        expires: "2027-01-01T09:00:00.000+09:00",
      });
      // HttpOnly の Cookie に入っているセッショントークンを、JavaScript から読める形で返さない
      expect(JSON.stringify(body)).not.toContain(sessionToken);
    });

    it("延長したセッションの有効期限は「現在 + 180 日」になる", async () => {
      const user = await createUser();
      // 有効期限が近いので、セッションを取得したときに Auth.js が 180 日後まで延長する
      const { sessionToken, cookie } = await createSession(
        user.id,
        new Date(Date.now() + 3_600_000),
      );

      await request("/api/auth/session", { headers: { cookie } });

      const [row] = await m.prisma.$queryRaw<{ diffSeconds: number }[]>`
        SELECT EXTRACT(EPOCH FROM (expires - (now() + INTERVAL '180 days')))::float AS "diffSeconds"
        FROM sessions WHERE session_token = ${sessionToken}
      `;
      expect(Math.abs(row?.diffSeconds ?? Infinity)).toBeLessThan(60);
    });

    it("サインアウトすると DB のセッションが消え、監査ログが残る", async () => {
      const user = await createUser();
      const { sessionToken, cookie } = await createSession(user.id);
      const { csrfToken, cookies } = await getCsrf();

      const res = await request("/api/auth/signout", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          cookie: [cookie, ...cookies].join("; "),
        },
        body: new URLSearchParams({ csrfToken, callbackUrl: `${BASE_URL}/` }),
      });

      expect(res.status).toBe(302);
      await expect(m.prisma.session.findUnique({ where: { sessionToken } })).resolves.toBeNull();
      await expect(
        m.prisma.auditLog.count({ where: { action: "auth.sign_out", resourceId: user.id } }),
      ).resolves.toBe(1);
    });
  });

  describe("AUTH_URL の検証", () => {
    it("パスが /api/auth なら通す", () => {
      expect(() => assertAuthUrl("http://localhost:3000/api/auth")).not.toThrow();
      expect(() => assertAuthUrl("https://watchlog.example.com/api/auth/")).not.toThrow();
    });

    it("パスが無い・違う場合は、正しい形を示して例外を投げる", () => {
      expect(() => assertAuthUrl("http://localhost:3000")).toThrow("must end with /api/auth");
      expect(() => assertAuthUrl("http://localhost:3000/auth")).toThrow(/must end with/);
    });
  });

  describe("サインイン時のイベント", () => {
    it("監査ログ（auth.sign_in）を残す", async () => {
      const user = await createUser();

      await m.getAuthConfig().events?.signIn?.({
        user,
        account: {
          provider: "google",
          type: "oidc",
          providerAccountId: "google-account-id",
        },
      });

      const logs = await m.prisma.auditLog.findMany({
        where: { action: "auth.sign_in", resourceId: user.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ actorUserId: user.id, detail: { provider: "google" } });
    });
  });

  describe("ユーザー作成時のイベント", () => {
    it("2 回呼んでも user ロールは重複しない", async () => {
      const user = await createUser();

      await m.getAuthConfig().events?.createUser?.({ user });
      await m.getAuthConfig().events?.createUser?.({ user });

      await expect(m.prisma.userRole.count({ where: { userId: user.id } })).resolves.toBe(1);
    });

    it("user ロールを割り当て、監査ログを残す", async () => {
      const user = await createUser();

      await m.getAuthConfig().events?.createUser?.({ user });

      const roles = await m.prisma.userRole.findMany({
        where: { userId: user.id },
        select: { role: { select: { name: true } } },
      });
      expect(roles.map((r) => r.role.name)).toEqual(["user"]);
      await expect(
        m.prisma.auditLog.count({ where: { action: "auth.user.create", resourceId: user.id } }),
      ).resolves.toBe(1);
    });
  });

  describe("requireUser", () => {
    it("未ログインなら JSON の 401 を返す", async () => {
      const res = await createProtectedApp().request("/me");

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    it("有効期限切れのセッションは未ログインとして扱う", async () => {
      const user = await createUser();
      const { cookie } = await createSession(user.id, new Date(Date.now() - 86_400_000));

      const res = await createProtectedApp().request("/me", { headers: { cookie } });

      expect(res.status).toBe(401);
    });

    it("1 分前に切れたセッションも無効（時差でずれない）", async () => {
      const user = await createUser();
      const { cookie } = await createSession(user.id, new Date(Date.now() - 60_000));

      const res = await createProtectedApp().request("/me", { headers: { cookie } });

      expect(res.status).toBe(401);
    });

    it("ユーザーが削除されたセッションは未ログインとして扱う", async () => {
      const user = await createUser();
      const { cookie } = await createSession(user.id);
      await m.prisma.user.delete({ where: { id: user.id } });

      const res = await createProtectedApp().request("/me", { headers: { cookie } });

      expect(res.status).toBe(401);
    });

    it("ログイン中ならユーザーを返す", async () => {
      const user = await createUser();
      const { cookie } = await createSession(user.id);

      const res = await createProtectedApp().request("/me", { headers: { cookie } });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        id: user.id,
        name: "テストユーザー",
        email: user.email,
        image: null,
      });
    });

    it("BAN されたユーザーは JSON の 403 を返す", async () => {
      const user = await createUser({ isBanned: true });
      const { cookie } = await createSession(user.id);

      const res = await createProtectedApp().request("/me", { headers: { cookie } });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    });
  });

  describe("requirePermission", () => {
    it("権限が無ければ 403、ロール経由で権限があれば 200 を返す", async () => {
      const user = await createUser();
      const { cookie } = await createSession(user.id);
      const app = createProtectedApp();

      const denied = await app.request("/permitted", { headers: { cookie } });
      expect(denied.status).toBe(403);

      await m.prisma.role.create({
        data: {
          name: roleName,
          userRoles: { create: { userId: user.id } },
          rolePermissions: {
            create: { permission: { create: { action: permissionAction } } },
          },
        },
      });

      const allowed = await app.request("/permitted", { headers: { cookie } });
      expect(allowed.status).toBe(200);
    });
  });
});
