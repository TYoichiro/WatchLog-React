import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "./api-client";

describe("apiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET /api を呼び、レスポンスを JSON で返す", async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);

    const res = await apiClient.api.$get();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url, "http://localhost").pathname).toBe("/api");
    expect(init.method).toBe("GET");
    expect(await res.json()).toEqual({});
  });
});
