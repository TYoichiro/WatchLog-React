import { Hono } from "hono";

// API ルート。フロントエンドは AppType を hc クライアントの型として使う。
export const api = new Hono().basePath("/api").get("/", (c) => c.json({}));

export type AppType = typeof api;
