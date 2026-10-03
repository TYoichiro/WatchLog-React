import { useSession } from "@hono/auth-js/react";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "./render";

function SessionStatus() {
  const { data, status } = useSession();
  return <p>{status === "authenticated" ? `ログイン中: ${data.user.id}` : status}</p>;
}

describe("renderWithProviders", () => {
  it("session を渡すと、useSession() でログイン中のユーザーを参照できる", () => {
    renderWithProviders(<SessionStatus />, {
      session: {
        user: { id: "user-1" },
        expires: "2027-01-01T09:00:00.000+09:00",
      },
    });

    expect(screen.getByText("ログイン中: user-1")).toBeDefined();
  });

  it("session を省略すると未ログインになる", () => {
    renderWithProviders(<SessionStatus />);

    expect(screen.getByText("unauthenticated")).toBeDefined();
  });
});
