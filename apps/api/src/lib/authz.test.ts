import { randomBytes } from "node:crypto";
import { initAuthConfig } from "@hono/auth-js";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { apiErrorHandler } from "../app.js";
import { getAuthConfig } from "../auth.js";
import {
  ForbiddenError,
  PREMIUM_ROLE_NAME,
  TOP_ADMIN_ROLE_NAME,
  UnauthorizedError,
  authzErrorResponse,
  getUserRoles,
  hasPermission,
  hasPremiumRole,
  hasRole,
  hasTopAdminRole,
  requireTopAdminRole,
} from "./authz.js";
import { prisma } from "./prisma.js";

describe("authzErrorResponse", () => {
  it("UnauthorizedError は JSON の 401", async () => {
    const res = authzErrorResponse(new UnauthorizedError());

    expect(res?.status).toBe(401);
    expect(await res?.json()).toEqual({ error: "Unauthorized" });
  });

  it("ForbiddenError は JSON の 403（理由のメッセージは返さない）", async () => {
    const res = authzErrorResponse(new ForbiddenError("Banned"));

    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Forbidden" });
  });

  it("それ以外のエラーは null", () => {
    expect(authzErrorResponse(new Error("other"))).toBeNull();
  });
});

// 実際の PostgreSQL を使う統合テスト
describe.skipIf(!process.env.DATABASE_URL)("ロールと権限の判定", () => {
  const suffix = randomBytes(4).toString("hex");
  const createdUserIds: string[] = [];
  const createdRoleNames: string[] = [];
  const permissionAction = `test.authz.${suffix}`;

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.role.deleteMany({ where: { name: { in: createdRoleNames } } });
    await prisma.permission.deleteMany({ where: { action: permissionAction } });
    await prisma.$disconnect();
  });

  async function createUser() {
    const user = await prisma.user.create({
      data: { email: `test-authz-${suffix}-${createdUserIds.length}@example.com` },
    });
    createdUserIds.push(user.id);
    return user;
  }

  // admin・premiumuser はシードで入る前提にせず、無ければ作る（テストで作ったものだけ消す）
  async function assignRole(userId: string, roleName: string) {
    const existing = await prisma.role.findUnique({ where: { name: roleName } });
    const role = existing ?? (await prisma.role.create({ data: { name: roleName } }));
    if (!existing) createdRoleNames.push(roleName);
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  }

  async function createSessionCookie(userId: string) {
    const sessionToken = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: { sessionToken, userId, expires: new Date(Date.now() + 86_400_000) },
    });
    return `authjs.session-token=${sessionToken}`;
  }

  it("hasRole は、そのロールを持っているときだけ true", async () => {
    const user = await createUser();
    const roleName = `test-role-${suffix}`;

    await expect(hasRole(user.id, roleName)).resolves.toBe(false);
    await assignRole(user.id, roleName);
    await expect(hasRole(user.id, roleName)).resolves.toBe(true);
  });

  it("hasTopAdminRole / hasPremiumRole / getUserRoles は admin・premiumuser を判定する", async () => {
    const plain = await createUser();
    const admin = await createUser();
    const premium = await createUser();
    await assignRole(admin.id, TOP_ADMIN_ROLE_NAME);
    await assignRole(premium.id, PREMIUM_ROLE_NAME);

    await expect(hasTopAdminRole(plain.id)).resolves.toBe(false);
    await expect(hasTopAdminRole(admin.id)).resolves.toBe(true);
    await expect(hasPremiumRole(premium.id)).resolves.toBe(true);
    await expect(hasPremiumRole(admin.id)).resolves.toBe(false);
    await expect(getUserRoles(plain.id)).resolves.toEqual({ isAdmin: false, isPremium: false });
    await expect(getUserRoles(admin.id)).resolves.toEqual({ isAdmin: true, isPremium: false });
    await expect(getUserRoles(premium.id)).resolves.toEqual({ isAdmin: false, isPremium: true });
  });

  it("hasPermission は、ロールに紐づく権限だけを判定する（他のユーザーの権限は見ない）", async () => {
    const owner = await createUser();
    const other = await createUser();
    const roleName = `test-perm-role-${suffix}`;
    createdRoleNames.push(roleName);
    await prisma.role.create({
      data: {
        name: roleName,
        userRoles: { create: { userId: owner.id } },
        rolePermissions: { create: { permission: { create: { action: permissionAction } } } },
      },
    });

    await expect(hasPermission(owner.id, permissionAction)).resolves.toBe(true);
    await expect(hasPermission(other.id, permissionAction)).resolves.toBe(false);
    await expect(hasPermission(owner.id, `${permissionAction}.other`)).resolves.toBe(false);
  });

  it("requireTopAdminRole は admin 以外を 403、admin を通す", async () => {
    const app = new Hono()
      .use("*", initAuthConfig(getAuthConfig))
      .get("/admin", async (c) => c.json(await requireTopAdminRole(c)))
      .onError(apiErrorHandler);
    const plain = await createUser();
    const admin = await createUser();
    await assignRole(admin.id, TOP_ADMIN_ROLE_NAME);

    const unauthenticated = await app.request("/admin");
    const denied = await app.request("/admin", {
      headers: { cookie: await createSessionCookie(plain.id) },
    });
    const allowed = await app.request("/admin", {
      headers: { cookie: await createSessionCookie(admin.id) },
    });

    expect(unauthenticated.status).toBe(401);
    expect(denied.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ id: admin.id });
  });
});
