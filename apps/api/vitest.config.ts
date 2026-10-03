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
      // テストでは本物の認証情報を使わない（apps/api/.env の値より優先する）
      AUTH_SECRET: "test-auth-secret",
      AUTH_GOOGLE_ID: "test-google-client-id",
      AUTH_GOOGLE_SECRET: "test-google-client-secret",
      AUTH_URL: "http://localhost:3000/api/auth",
    },
  },
}));
