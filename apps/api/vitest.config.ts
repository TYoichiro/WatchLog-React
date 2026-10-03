import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

// ワークスペースのパッケージ（@watchlog/shared など）はビルドせずソースを読む
const conditions = ["source", ...defaultServerConditions];

export default defineConfig({
  ssr: {
    resolve: {
      conditions,
    },
  },
  test: {
    environment: "node",
    env: {
      TZ: "Asia/Tokyo",
    },
  },
});
