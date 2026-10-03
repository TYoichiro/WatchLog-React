import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";

const INDEX_HTML = '<!doctype html><div id="root"></div>';
const APP_JS = 'console.log("app");';

describe("createServer", () => {
  describe("webDistDir を指定しない場合", () => {
    const app = createServer();

    it("GET /api は空の JSON を返す", async () => {
      const res = await app.request("/api");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({});
    });

    it("存在しない API は JSON の 404 を返す", async () => {
      const res = await app.request("/api/unknown");

      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toMatch(/^application\/json/);
      expect(await res.json()).toEqual({ error: "Not Found" });
    });

    it("API 以外のパスは配信しない", async () => {
      const res = await app.request("/");

      expect(res.status).toBe(404);
    });
  });

  describe("webDistDir を指定した場合", () => {
    let webDistDir: string;
    let app: ReturnType<typeof createServer>;

    beforeAll(async () => {
      webDistDir = await mkdtemp(join(tmpdir(), "watchlog-web-dist-"));
      await writeFile(join(webDistDir, "index.html"), INDEX_HTML);
      await mkdir(join(webDistDir, "assets"));
      await writeFile(join(webDistDir, "assets", "app.js"), APP_JS);
      app = createServer({ webDistDir });
    });

    afterAll(async () => {
      await rm(webDistDir, { recursive: true, force: true });
    });

    it("GET / は index.html を返す", async () => {
      const res = await app.request("/");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^text\/html/);
      expect(await res.text()).toBe(INDEX_HTML);
    });

    it("静的ファイルをそのまま返す", async () => {
      const res = await app.request("/assets/app.js");

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/javascript/);
      expect(await res.text()).toBe(APP_JS);
    });

    it("未知のパスは SPA ルーティング用に index.html を返す", async () => {
      const res = await app.request("/logs/123");

      expect(res.status).toBe(200);
      expect(await res.text()).toBe(INDEX_HTML);
    });

    it("GET /api は SPA より優先して空の JSON を返す", async () => {
      const res = await app.request("/api");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({});
    });

    it("存在しない API には index.html ではなく JSON の 404 を返す", async () => {
      const res = await app.request("/api/unknown");

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not Found" });
    });
  });
});
