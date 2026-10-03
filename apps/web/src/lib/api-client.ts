import type { AppType } from "@watchlog/api";
import { hc } from "hono/client";

// 同一オリジンの /api を呼ぶ型付きクライアント。開発時は Vite が API サーバーへプロキシする。
export const apiClient = hc<AppType>("/");
