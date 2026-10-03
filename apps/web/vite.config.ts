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
    // ブラウザで開く URL を Docker と同じ http://localhost:3000 にそろえる
    // （Google OAuth のリダイレクト URI を開発と本番で共通にするため）
    port: 3000,
    strictPort: true,
    // ローカル開発時は API サーバー（npm run dev:api、3001 番）へ転送する
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
