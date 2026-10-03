import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, apiErrorHandler } from "./app.js";
import { ForbiddenError, UnauthorizedError } from "./lib/authz.js";
import { logger } from "./lib/logger.js";

describe("GET /api", () => {
  it("空の JSON を返す", async () => {
    const res = await api.request("/api");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({});
  });
});

describe("apiErrorHandler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function appThrowing(error: unknown) {
    return new Hono()
      .get("/boom", () => {
        throw error;
      })
      .onError(apiErrorHandler);
  }

  it("認可エラーは JSON の 401 / 403", async () => {
    const unauthorized = await appThrowing(new UnauthorizedError()).request("/boom");
    const forbidden = await appThrowing(new ForbiddenError()).request("/boom");

    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "Forbidden" });
  });

  it("HTTPException は、そのステータスのレスポンスを返す", async () => {
    const res = await appThrowing(new HTTPException(400, { message: "Bad Request" })).request(
      "/boom",
    );

    expect(res.status).toBe(400);
  });

  it("予期しないエラーは JSON の 500 にし、エラーの中身はレスポンスに含めずログにだけ残す", async () => {
    const logError = vi.spyOn(logger, "error").mockImplementation(() => {});

    const res = await appThrowing(new Error("password=secret at db.internal")).request("/boom");

    expect(res.status).toBe(500);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ error: "Internal Server Error" });
    expect(body).not.toContain("secret");
    expect(logError).toHaveBeenCalledWith(
      "API でエラーが発生しました",
      expect.objectContaining({ method: "GET", path: "/boom" }),
    );
  });
});
