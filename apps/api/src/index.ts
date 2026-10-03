import { serve } from "@hono/node-server";
import { AUTH_REQUIRED_ENV } from "./auth.js";
import { assertRequiredEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { createServer } from "./server.js";

process.env.TZ = "Asia/Tokyo";

// 必須の環境変数が無ければ起動しない（リクエストが来てから失敗するのを防ぐ）
assertRequiredEnv(["DATABASE_URL", ...AUTH_REQUIRED_ENV]);

const port = Number(process.env.PORT ?? 3000);
// Docker では設定され、ローカル開発では Vite が配信するので未設定。
const app = createServer({ webDistDir: process.env.WEB_DIST_DIR });

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info("サーバーを起動しました", { port: info.port });
});

// Docker で PID 1 として動くとき、シグナルで正しく停止するようにする
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
