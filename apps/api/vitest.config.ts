import { defaultServerConditions, loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// ワークスペースのパッケージ（@watchlog/shared など）はビルドせずソースを読む
const conditions = ["source", ...defaultServerConditions];

export default defineConfig(({ mode }) => ({
  ssr: {
    resolve: {
      conditions,
    },
  },
  test: {
    environment: "node",
    env: {
      // apps/api/.env（DATABASE_URL など）を読み込む。CI では環境変数で渡す
      ...loadEnv(mode, process.cwd(), ""),
      TZ: "Asia/Tokyo",
    },
  },
}));
