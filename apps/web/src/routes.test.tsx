import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRoute } from "@/test-utils/render";

describe("routes", () => {
  it("/ でホーム画面を表示する", () => {
    const { router } = renderRoute("/");

    expect(router.state.matches.at(-1)?.route.path).toBe("/");
    expect(screen.getByRole("main")).toBeDefined();
  });
});
