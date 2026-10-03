import Google from "@auth/core/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { AuthConfig } from "@hono/auth-js";
import { toJstIsoString } from "@watchlog/shared";
import { writeAuditLog } from "./lib/audit.js";
import { requiredEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

declare module "@auth/core/types" {
  // ブラウザに渡すセッションはユーザー ID だけ（名前・メールアドレス・画像は含めない）
  interface Session {
    user: {
      id: string;
    };
  }
}

// Auth.js のルート（/api/auth/signin、/api/auth/callback/google、/api/auth/session など）。
// basePath は AUTH_URL のパスから Auth.js が決めるので、AUTH_URL は "<オリジン>/api/auth" にする
export const AUTH_BASE_PATH = "/api/auth";

export const SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

/** 起動時に検証する、認証に必要な環境変数 */
export const AUTH_REQUIRED_ENV = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_URL",
] as const;

let authConfig: AuthConfig | undefined;

// 最初のリクエストで一度だけ作る（import しただけでは環境変数を要求しない）。
// Auth.js はリクエストごとに設定へ basePath などを書き込むので、使い回さずにコピーを渡す
// （同じオブジェクトだと 2 回目以降に env-url-basepath-redundant の警告が出る）
export function getAuthConfig(): AuthConfig {
  authConfig ??= createAuthConfig();
  return { ...authConfig };
}

// AUTH_URL のパスが /api/auth でないと、Auth.js のルートがずれて動かない
export function assertAuthUrl(authUrl: string) {
  const { pathname } = new URL(authUrl);
  if (pathname.replace(/\/$/, "") !== AUTH_BASE_PATH) {
    throw new Error(
      `AUTH_URL must end with ${AUTH_BASE_PATH} (e.g. http://localhost:3000${AUTH_BASE_PATH}): ${authUrl}`,
    );
  }
}

function createAuthConfig(): AuthConfig {
  assertAuthUrl(requiredEnv("AUTH_URL"));

  return {
    adapter: PrismaAdapter(prisma as unknown as Parameters<typeof PrismaAdapter>[0]),
    secret: requiredEnv("AUTH_SECRET"),
    trustHost: true,
    session: {
      strategy: "database",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
    providers: [
      Google({
        clientId: requiredEnv("AUTH_GOOGLE_ID"),
        clientSecret: requiredEnv("AUTH_GOOGLE_SECRET"),
      }),
    ],
    callbacks: {
      // /api/auth/session でブラウザに返す内容。既定ではセッションの行（sessionToken を含む）と
      // users の行がそのまま返るので、ユーザー ID と有効期限（JST）だけに絞る
      session({ session, user }) {
        return {
          user: { id: user.id },
          expires: toJstIsoString(new Date(session.expires)),
        } as typeof session;
      },
    },
    events: {
      async createUser({ user }) {
        const userId = user.id;

        if (!userId) {
          return;
        }

        logger.info("ユーザーが作成されました", { userId, email: user.email, provider: "google" });

        await prisma.$transaction(async (tx) => {
          const defaultRole = await tx.role.upsert({
            where: {
              name: "user",
            },
            update: {},
            create: {
              name: "user",
              description: "Default authenticated user",
            },
            select: {
              id: true,
            },
          });

          logger.debug("デフォルトロールが割り当てられました", { userId, roleId: defaultRole.id });

          await tx.userRole.upsert({
            where: {
              userId_roleId: {
                userId,
                roleId: defaultRole.id,
              },
            },
            update: {},
            create: {
              userId,
              roleId: defaultRole.id,
            },
          });

          await writeAuditLog(
            {
              actorUserId: userId,
              action: "auth.user.create",
              resource: "user",
              resourceId: userId,
              detail: {
                email: user.email ?? null,
                provider: "google",
              },
            },
            tx,
          );
        });
      },
      async signIn({ user, account }) {
        const userId = user.id;

        if (!userId) {
          return;
        }

        logger.info("ユーザーがサインインしました", {
          userId,
          provider: account?.provider ?? "unknown",
        });

        await writeAuditLog({
          actorUserId: userId,
          action: "auth.sign_in",
          resource: "user",
          resourceId: userId,
          detail: {
            provider: account?.provider ?? null,
          },
        });
      },
      async signOut(message) {
        if (!("session" in message) || !message.session?.userId) {
          return;
        }

        const userId = message.session.userId;
        logger.info("ユーザーがサインアウトしました", { userId });

        await writeAuditLog({
          actorUserId: userId,
          action: "auth.sign_out",
          resource: "user",
          resourceId: userId,
          detail: {
            sessionDeleted: true,
          },
        });
      },
    },
  };
}
