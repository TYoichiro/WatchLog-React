import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePage } from "./home-page";

describe("HomePage", () => {
  it("空の main 要素を描画する", () => {
    render(<HomePage />);

    const main = screen.getByRole("main");
    expect(main.childNodes).toHaveLength(0);
  });
});
