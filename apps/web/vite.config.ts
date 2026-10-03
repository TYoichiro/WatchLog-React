import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // tsconfig.json の paths（@/* → src/*）をそのまま使う
    tsconfigPaths: true,
    // ワークスペースのパッケージ（@watchlog/shared など）はビルドせずソースを読む
    conditions: ["source", ...defaultClientConditions],
  },
  server: {
    // ローカル開発時は API サーバー（npm run dev:api）へ転送する
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
