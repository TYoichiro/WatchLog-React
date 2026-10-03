import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiDir = fileURLToPath(new URL("..", import.meta.url));

// サーバーの起動処理（src/index.ts）を別プロセスで実行する
function startServer(env: Record<string, string | undefined>) {
  return spawnSync(process.execPath, ["--conditions=source", "--import", "tsx", "src/index.ts"], {
    cwd: apiDir,
    env: { ...process.env, LOG_FLG: "skip", PORT: "0", ...env },
    encoding: "utf8",
    // 起動してしまった場合に止めるための上限（期待どおりなら即座に終了する）
    timeout: 15_000,
  });
}

describe("サーバーの起動", () => {
  it.each(["DATABASE_URL", "AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_URL"])(
    "%s が無ければ、起動せずにエラーで終了する",
    (name) => {
      const result = startServer({
        DATABASE_URL: "postgresql://test:test@localhost:5432/test",
        [name]: "",
      });

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`Missing required environment variable: ${name}`);
    },
    20_000,
  );
});
