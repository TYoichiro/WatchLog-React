import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
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

/** QueryClientProvider で包んで描画する */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
  };
}

/** アプリのルート定義を使い、指定したパスの画面を描画する */
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...renderWithProviders(<RouterProvider router={router} />) };
}
