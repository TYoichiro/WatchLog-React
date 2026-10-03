import { serve } from "@hono/node-server";
import { createServer } from "./server.js";

process.env.TZ = "Asia/Tokyo";

const port = Number(process.env.PORT ?? 3000);
// Docker では設定され、ローカル開発では Vite が配信するので未設定。
const app = createServer({ webDistDir: process.env.WEB_DIST_DIR });

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});

// Docker で PID 1 として動くとき、シグナルで正しく停止するようにする
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
