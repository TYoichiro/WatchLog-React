import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { api } from "./app.js";

type CreateServerOptions = {
  // ビルド済み SPA のディレクトリ。未指定なら API だけを配信する。
  webDistDir?: string;
};

export function createServer({ webDistDir }: CreateServerOptions = {}) {
  const app = new Hono();

  app.route("/", api);
  app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

  if (webDistDir) {
    app.use("*", serveStatic({ root: webDistDir }));
    // SPA のクライアントルーティング用に、未知のパスは index.html を返す
    app.get("*", serveStatic({ root: webDistDir, path: "index.html" }));
  }

  return app;
}
