import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { toJstDateString } from "@watchlog/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// logger はモジュールを読み込んだ時点の環境変数で設定が決まるので、環境変数を変えてから読み込み直す
async function loadLogger(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  vi.resetModules();
  return (await import("./logger.js")).logger;
}

describe("logger", () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(path.join(tmpdir(), "watchlog-logs-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(logDir, { recursive: true, force: true });
  });

  function logFile() {
    return path.join(logDir, `${toJstDateString()}.log`);
  }

  // ファイルへの書き込みは非同期なので、中身が入るまで待ってから読む
  async function readLogLines() {
    return vi.waitFor(() => {
      const text = existsSync(logFile()) ? readFileSync(logFile(), "utf8").trim() : "";
      expect(text).not.toBe("");
      return text.split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    });
  }

  it("JST の日付のファイルに、JST の時刻付きの JSON Lines で書き込む", async () => {
    const logger = await loadLogger({ LOG_DIR: logDir, LOG_FLG: undefined, LOG_LEVEL: "debug" });

    logger.info("テスト", { userId: "user-1" });

    const [entry] = await readLogLines();
    expect(entry).toMatchObject({ level: "info", msg: "テスト", userId: "user-1" });
    expect(entry?.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\+09:00$/);
  });

  it("LOG_LEVEL より低いレベルは出力しない", async () => {
    const logger = await loadLogger({ LOG_DIR: logDir, LOG_FLG: undefined, LOG_LEVEL: "warn" });

    logger.info("出さない");
    logger.warn("出す");

    await vi.waitFor(async () => {
      const lines = await readLogLines();
      expect(lines.map((line) => line.msg)).toEqual(["出す"]);
    });
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it("LOG_FLG=skip ならファイルに書き込まない", async () => {
    const logger = await loadLogger({ LOG_DIR: logDir, LOG_FLG: "skip", LOG_LEVEL: "debug" });

    logger.error("コンソールだけ");

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(existsSync(logFile())).toBe(false);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("本番ではコンソールにも JSON を 1 行で出す", async () => {
    const logger = await loadLogger({
      LOG_DIR: logDir,
      LOG_FLG: "skip",
      LOG_LEVEL: undefined,
      NODE_ENV: "production",
    });

    logger.info("本番");
    logger.debug("本番では出さない");

    expect(console.log).toHaveBeenCalledTimes(1);
    const line = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(JSON.parse(line)).toMatchObject({ level: "info", msg: "本番" });
  });
});
