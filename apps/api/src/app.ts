import { authHandler, initAuthConfig } from "@hono/auth-js";
import { Hono, type ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { getAuthConfig } from "./auth.js";
import { authzErrorResponse } from "./lib/authz.js";
import { logger } from "./lib/logger.js";

// requireUser / requirePermission が投げた認可エラーは JSON の 401 / 403 にする
export const apiErrorHandler: ErrorHandler = (error, c) => {
  const authzResponse = authzErrorResponse(error);
  if (authzResponse) {
    return authzResponse;
  }

  if (error instanceof HTTPException) {
    return error.getResponse();
  }

  logger.error("API でエラーが発生しました", {
    method: c.req.method,
    path: c.req.path,
    error: error instanceof Error ? error.message : String(error),
  });
  return c.json({ error: "Internal Server Error" }, 500);
};

// API ルート。フロントエンドは AppType を hc クライアントの型として使う。
export const api = new Hono()
  .basePath("/api")
  .use("*", initAuthConfig(getAuthConfig))
  // Auth.js（ログイン・コールバック・セッション取得など）
  .use("/auth/*", authHandler())
  .get("/", (c) => c.json({}));

api.onError(apiErrorHandler);

export type AppType = typeof api;
