import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist", "**/coverage", "watchlog-original", "apps/api/src/generated"]),
  {
    files: ["**/*.{js,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // テストファイル・テスト用ユーティリティ・shadcn の UI コンポーネント（buttonVariants なども export する）は
    // react-refresh の対象外
    files: [
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/test-utils/**",
      "apps/web/src/components/ui/**",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["apps/api/**/*.ts", "packages/**/*.ts", "**/*.config.{js,ts}", "**/vitest.setup.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
