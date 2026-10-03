import { describe, expect, it } from "vitest";
import { api } from "./app.js";

describe("GET /api", () => {
  it("空の JSON を返す", async () => {
    const res = await api.request("/api");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({});
  });
});
