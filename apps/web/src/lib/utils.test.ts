import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("偽値を除いてクラスを結合する", () => {
    const isHidden = false;

    expect(cn("px-2", isHidden && "hidden", undefined, "py-1")).toBe("px-2 py-1");
  });

  it("競合する Tailwind のクラスは後のものを優先する", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
  });
});
