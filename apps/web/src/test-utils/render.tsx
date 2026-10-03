import type { Session } from "@auth/core/types";
import { SessionContext } from "@hono/auth-js/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { routes } from "@/routes";

// テストではリトライせず、失敗をすぐ結果に反映させる
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

type SessionContextValue = NonNullable<ComponentProps<typeof SessionContext.Provider>["value"]>;

// SessionProvider は /api/auth/session を取りに行くので、テストでは useSession() の値を直接与える
function createSessionValue(session: Session | null): SessionContextValue {
  const update = async () => session;
  return session
    ? { data: session, status: "authenticated", update }
    : { data: null, status: "unauthenticated", update };
}

type RenderOptions = {
  /** ログイン状態。省略時は未ログイン。/api/auth/session は呼ばない */
  session?: Session | null;
};

/** ログイン状態（useSession）と QueryClientProvider を与えて描画する */
export function renderWithProviders(ui: ReactElement, { session = null }: RenderOptions = {}) {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...render(
      <SessionContext.Provider value={createSessionValue(session)}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </SessionContext.Provider>,
    ),
  };
}

/** アプリのルート定義を使い、指定したパスの画面を描画する */
export function renderRoute(path: string, options?: RenderOptions) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...renderWithProviders(<RouterProvider router={router} />, options) };
}
