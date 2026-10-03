# WatchLog-React — Agent Instructions

## What This App Does

WatchLog is a Japanese SHOWROOM live-streaming log tool. Users register a SHOWROOM room via invite code, then the app saves live stream logs (comments, gifts, rankings) and provides dashboards and replays. All times are JST. Most UI text is Japanese.

This repository is a **rewrite of the Next.js version** as a React SPA plus a Hono API server. Migration is in progress.

- `watchlog-original/` is a read-only copy of the Next.js app, kept for reference only. It is gitignored. Never edit it, and never import from it.
- `watchlog-original/CLAUDE.md`, `watchlog-original/AGENTS.md` and `watchlog-original/Vibe/*.md` describe the original app's behavior, data model and API. Read them when porting a feature. Their framework-specific rules (`"use client"`, `proxy.ts`, `app/generated/prisma`, Next.js docs) do NOT apply here.

## Tech Stack

npm workspaces monorepo (Node.js 24, npm 11, TypeScript 6.0 strict):

| Workspace | Path | Stack |
| --- | --- | --- |
| `@watchlog/web` | `apps/web` | Vite 8, React 19, React Router 8 (data mode, `createBrowserRouter`), TanStack Query 5, Tailwind CSS 4, Radix UI / shadcn-style components, Vitest + Testing Library (jsdom) |
| `@watchlog/api` | `apps/api` | Hono 4 on `@hono/node-server`, Prisma 7 + PostgreSQL (`@prisma/adapter-pg`), Auth.js via `@hono/auth-js`, Vitest (node) |
| `@watchlog/shared` | `packages/shared` | Code and types shared by web and api |

Prisma, Auth.js and PostgreSQL are installed but **not wired up yet**.

## Critical Non-Obvious Facts

- **Import aliases differ per workspace.**
  - In `apps/web`, `@/` means `apps/web/src/`. It is defined once in `tsconfig.json` `paths`, and Vite reads it via `resolve.tsconfigPaths`.
  - `apps/api` has **no alias**. It is Node ESM with `moduleResolution: nodenext` and is compiled by plain `tsc`, which does not rewrite path aliases. Use relative imports with a `.js` extension, for example `import { api } from "./app.js"`.
- **The `source` export condition.** `@watchlog/shared` and `@watchlog/api` export `source` → `src/*.ts`, so dev, test and typecheck use the TypeScript source without a build. `@watchlog/shared` also exports `default` → `dist/index.js` for the production Node runtime. This condition is enabled in four places; keep them all when editing configs:
  - Vite: `resolve.conditions`
  - api Vitest: `ssr.resolve.conditions`
  - tsx: the `--conditions=source` flag in the api `dev` script
  - tsconfig: `customConditions`
- **API types are shared through Hono RPC.** `apps/api/src/app.ts` exports `AppType`, and web calls the API through `apiClient` (`hc<AppType>`) in `apps/web/src/lib/api-client.ts`. Define routes with method chaining (or `api.route(...)` sub-apps) so the types infer. Never hand-write fetch calls or duplicate response types in web.
- **One server in production.** In Docker, the Hono server serves both `/api/*` and the built SPA (`WEB_DIST_DIR`), with an `index.html` fallback for client-side routes. Unknown `/api/*` paths return a JSON 404. In dev, Vite (port 5173) proxies `/api` to the API server (port 3000).
- **shadcn.**
  - The `shadcn` npm package is intentionally NOT installed: its CLI dependencies carry an unfixed `braces` advisory. Its CSS is vendored at `apps/web/src/styles/shadcn-tailwind.css`, pinned to 4.5.0, the version the original app used.
  - Add components with `npx shadcn@4.5.0 add <name>` from `apps/web`.
  - The shadcn registry now emits `import { cn } from "cn"`. Rewrite that import to `import { cn } from "@/lib/utils"`, and do not install the `cn` package.
  - When porting, copy `watchlog-original/components/ui/*.tsx` as-is; they already use `@/lib/utils`.
- **Timezone is `Asia/Tokyo` everywhere.** Always pass `timeZone: "Asia/Tokyo"` explicitly when formatting dates. Never rely on the runtime default.
- **Docker runtime has no npm.** The runtime image removes npm, npx, corepack and yarn, and installs api deps with `npm ci --omit=dev --omit=optional --omit=peer`.
  - If a package works locally but is missing in Docker, it is probably being omitted. Make it a direct `dependencies` entry of `apps/api`.
  - When Prisma is added, the generated client must also be copied into the runtime image.
- **Keep `npm audit` at 0.**
  - Fix vulnerable transitive deps with root `overrides`.
  - Approve install scripts explicitly with `npm install-scripts approve <pkg>`; they are recorded in root `allowScripts`.
  - Workspace-to-workspace dependencies use `"*"` as the version.
- **No unauthorized destructive refactoring.** Small change requests (add a field, fix a bug) must not trigger layout restructuring or component rewrites.

## Porting from Next.js

| Next.js (`watchlog-original/`) | This repo |
| --- | --- |
| `app/**/page.tsx` | `apps/web/src/pages/<name>-page.tsx`, registered in `apps/web/src/routes.tsx` |
| Server Component data loading (`auth()`, Prisma) | An API route in `apps/api`, fetched from web with TanStack Query and `apiClient` |
| `app/api/**/route.ts` | Hono routes under `/api` in `apps/api/src`, mounted in `app.ts` |
| `next/link`, `next/navigation` | `react-router`: `Link`, `useNavigate`, `useParams`, `useSearchParams` |
| `"use client"` | Remove it; everything in web is client-side |
| `lib/*` used only on the server (Prisma, authz, SHOWROOM API wrappers) | `apps/api/src/lib/` |
| `lib/*` used only in the browser | `apps/web/src/lib/` |
| `lib/*` used by both (e.g. JST helpers, shared types) | `packages/shared/src/` |
| `components/**` | `apps/web/src/components/**` |
| `test-utils/` Next.js mocks | Not needed; use `apps/web/src/test-utils/render.tsx` |

When porting an API route, keep its auth and permission semantics. The original calls `requireUser()` / `requirePermission()` at the top of every route and writes audit logs for significant actions. Do not drop those checks.

## Commands

Run from the repository root:

```bash
npm run dev:api          # API server on :3000 (tsx watch)
npm run dev:web          # Vite dev server on :5173, proxies /api to :3000
npm run lint             # ESLint (all workspaces)
npm run format           # Prettier --write (format:check verifies only)
npm run typecheck        # tsc --noEmit (all workspaces, includes tests)
npm run test             # Vitest single run (all workspaces)
npm run build            # shared → api → web
docker compose up -d --build   # production-like container on :3000
```

**Validation sequence before committing:** `npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build`. CI (`.github/workflows/ci.yml`) runs the same steps plus a Docker build and smoke test on pushes to `main` / `develop` and on pull requests.

- Formatting is Prettier (`prettier.config.js`, printWidth 100, Tailwind class sorting). Do not hand-format; run `npm run format`. Markdown and the vendored shadcn CSS are excluded.
- Line endings are LF everywhere (`.gitattributes`).

## Testing Conventions

- Colocate tests with the code: `foo.ts` → `foo.test.ts`, `Bar.tsx` → `Bar.test.tsx`.
- Vitest globals are off; import `describe` / `it` / `expect` from `vitest`.
- **api:** call `app.request(...)` on the Hono app. Do not open ports.
- **web:**
  - Use `renderWithProviders` (QueryClient) and `renderRoute(path)` (memory router + app routes) from `@/test-utils/render`.
  - Mock the network with `vi.stubGlobal("fetch", ...)`.

## File Naming

- Files: `kebab-case` (e.g. `components/ui/button.tsx`, `pages/home-page.tsx`)
- React components: `PascalCase`
- Functions and variables: `camelCase`

## Commit Messages

- Write commit messages in **Japanese**.
- Start with a concise one-line summary of what changed and why, e.g. `ルーム検索の入力チェックを修正` or `ダッシュボードのお知らせ編集を追加`.
- Add a body only when the reason or impact is not obvious from the summary. Mention any new migrations or environment variables there.
