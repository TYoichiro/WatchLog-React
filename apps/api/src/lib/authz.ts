import { getAuthUser } from "@hono/auth-js";
import type { Context } from "hono";
import { prisma } from "./prisma.js";

export type AuthenticatedUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export class UnauthorizedError extends Error {
  readonly status = 401;

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const TOP_ADMIN_ROLE_NAME = "admin";
export const PREMIUM_ROLE_NAME = "premiumuser";

/**
 * ログイン中のユーザーを返す。未ログインなら UnauthorizedError、BAN 済みなら ForbiddenError を投げる。
 * 投げたエラーは app.ts の apiErrorHandler で JSON の 401 / 403 になる。
 * セッションにはユーザー ID しか入れていないので、名前などは DB から読む。
 */
export async function requireUser(c: Context): Promise<AuthenticatedUser> {
  const authUser = await getAuthUser(c);
  const userId = authUser?.session?.user?.id;

  if (!userId) {
    throw new UnauthorizedError();
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, isBanned: true },
  });

  if (!dbUser) {
    throw new UnauthorizedError();
  }

  if (dbUser.isBanned) {
    throw new ForbiddenError("Banned");
  }

  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    image: dbUser.image,
  };
}

export async function hasPermission(userId: string, action: string): Promise<boolean> {
  const permission = await prisma.permission.findFirst({
    where: {
      action,
      rolePermissions: {
        some: {
          role: {
            userRoles: {
              some: {
                userId,
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
    },
  });

  return permission !== null;
}

export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  const role = await prisma.userRole.findFirst({
    where: {
      userId,
      role: {
        name: roleName,
      },
    },
    select: {
      id: true,
    },
  });

  return role !== null;
}

export async function hasTopAdminRole(userId: string): Promise<boolean> {
  return hasRole(userId, TOP_ADMIN_ROLE_NAME);
}

export async function hasPremiumRole(userId: string): Promise<boolean> {
  return hasRole(userId, PREMIUM_ROLE_NAME);
}

export type UserRoles = {
  isAdmin: boolean;
  isPremium: boolean;
};

export async function getUserRoles(userId: string): Promise<UserRoles> {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      role: { name: { in: [TOP_ADMIN_ROLE_NAME, PREMIUM_ROLE_NAME] } },
    },
    select: { role: { select: { name: true } } },
  });

  const roleNames = new Set(userRoles.map((ur) => ur.role.name));
  return {
    isAdmin: roleNames.has(TOP_ADMIN_ROLE_NAME),
    isPremium: roleNames.has(PREMIUM_ROLE_NAME),
  };
}

export async function requireTopAdminRole(c: Context): Promise<AuthenticatedUser> {
  const user = await requireUser(c);
  const allowed = await hasTopAdminRole(user.id);

  if (!allowed) {
    throw new ForbiddenError();
  }

  return user;
}

export async function requirePermission(c: Context, action: string): Promise<AuthenticatedUser> {
  const user = await requireUser(c);
  const allowed = await hasPermission(user.id, action);

  if (!allowed) {
    throw new ForbiddenError();
  }

  return user;
}

export function authzErrorResponse(error: unknown): Response | null {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: "Unauthorized" }, { status: error.status });
  }

  if (error instanceof ForbiddenError) {
    return Response.json({ error: "Forbidden" }, { status: error.status });
  }

  return null;
}
