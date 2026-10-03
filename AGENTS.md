# WatchLog-React — Agent Instructions

## What This App Does

WatchLog is a Japanese SHOWROOM live-streaming log tool. Users register a SHOWROOM room via invite code, then the app saves live stream logs (comments, gifts, rankings) and provides dashboards and replays. All times are JST. Most UI text is Japanese.

This repository is a **rewrite of the Next.js version** as a React SPA plus a Hono API server. Migration is in progress.

- `watchlog-original/` is a read-only copy of the Next.js app, kept **for reference only**. It is gitignored. Never edit it, and never import from it. Compatibility with the original app or its database is **not** required; follow this repository's rules when they differ.
- `watchlog-original/CLAUDE.md`, `watchlog-original/AGENTS.md` and `watchlog-original/Vibe/*.md` describe the original app's behavior, data model and API. Read them when porting a feature. Their framework-specific rules (`"use client"`, `proxy.ts`, `app/generated/prisma`, Next.js docs) do NOT apply here.

## Tech Stack

npm workspaces monorepo (Node.js 24, npm 11, TypeScript 6.0 strict):

| Workspace | Path | Stack |
| --- | --- | --- |
| `@watchlog/web` | `apps/web` | Vite 8, React 19, React Router 8 (data mode, `createBrowserRouter`), TanStack Query 5, Tailwind CSS 4, Radix UI / shadcn-style components, Vitest + Testing Library (jsdom) |
| `@watchlog/api` | `apps/api` | Hono 4 on `@hono/node-server`, Prisma 7 + PostgreSQL (`@prisma/adapter-pg`), Auth.js via `@hono/auth-js`, Vitest (node) |
| `@watchlog/shared` | `packages/shared` | Code and types shared by web and api |

PostgreSQL 16, Prisma (TIMESTAMPTZ everywhere) and Auth.js (Google OAuth, database sessions) are wired up. Screens are not ported yet.

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
- **One server in production.** In Docker, the Hono server serves both `/api/*` and the built SPA (`WEB_DIST_DIR`), with an `index.html` fallback for client-side routes. Unknown `/api/*` paths return a JSON 404. In dev, the browser still opens `http://localhost:3000`: Vite listens on 3000 and proxies `/api` to the API server on 3001. Keeping one browser origin means a single Google OAuth redirect URI (`http://localhost:3000/api/auth/callback/google`) works everywhere.
- **shadcn.**
  - The `shadcn` npm package is intentionally NOT installed: its CLI dependencies carry an unfixed `braces` advisory. Its CSS is vendored at `apps/web/src/styles/shadcn-tailwind.css`, pinned to 4.5.0, the version the original app used.
  - Add components with `npx shadcn@4.5.0 add <name>` from `apps/web`.
  - The shadcn registry now emits `import { cn } from "cn"`. Rewrite that import to `import { cn } from "@/lib/utils"`, and do not install the `cn` package.
  - When porting, copy `watchlog-original/components/ui/*.tsx` as-is; they already use `@/lib/utils`.
- **Everything is JST (`Asia/Tokyo`); UTC must never show up for people.**
  - **DB storage:** every timestamp column is `TIMESTAMPTZ(3)` (`@db.Timestamptz(3)`), storing the real instant. Defaults are `now()`, and `updated_at` is set by DB triggers. psql and raw SQL display values as `+09` because the server default timezone is `Asia/Tokyo`. `prisma.test.ts` fails if a `timestamp without time zone` column appears.
  - **In code:** a `Date` is always the real instant; Prisma returns correct instants. Never shift times by 9 hours.
  - **Output:** use `toJstIsoString(date)` from `@watchlog/shared` for every date that leaves the server (API JSON, logs). It produces `2026-01-15T15:00:00.000+09:00`. Never return `Date#toISOString()` or a raw `Date` (both are UTC `Z`).
  - **Input:** use `parseJstDateTime` / `createJstDateTime`. A string without an offset is treated as JST.
  - **Display:** use `formatJstDateTime`, which always formats in `Asia/Tokyo`.
  - **Day boundaries are JST.** Stored values are UTC instants, so anything grouped or filtered by *date* must use the JST day; otherwise data from JST 00:00–08:59 lands on the previous day. Examples: "today's logs", daily aggregates, searching by a date.
    - In JS, use `toJstDateString(date)` for the `YYYY-MM-DD` and `startOfJstDay(date)` for the day's start. Query ranges as `[startOfJstDay(d), startOfJstDay(d) + 24h)`. Never use `toISOString().slice(0, 10)`, `getDate()` or `setHours(0, 0, 0, 0)`.
    - In SQL, convert before truncating: `date_trunc('day', created_at AT TIME ZONE 'Asia/Tokyo')` or `(created_at AT TIME ZONE 'Asia/Tokyo')::date`. Never use `created_at::date` in Prisma raw SQL, because the Prisma session is UTC.
  - **Prisma session is UTC on purpose.** `@prisma/adapter-pg` sends dates as offset-less UTC strings and rewrites returned offsets to `+00:00`, so its session must be UTC (`createPrismaClient` in `lib/prisma.ts` sets `-c timezone=UTC`). With a JST session, values are stored 9 hours off, and Prisma round-trips hide the error. Never change this option. Because of it, text produced inside Prisma raw SQL (`::text`, `to_char`) is UTC, so format in JS instead. Seeds and scripts must create clients through `createPrismaClient`.
  - **DB server and containers:** the default `timezone` and `log_timezone` are `Asia/Tokyo`. compose sets them with `-c` flags and `TZ`; CI sets them through `TZ` at initdb. db, migrate and app run with `TZ=Asia/Tokyo`, and the Node images install `tzdata` so OS clocks are JST. `index.ts` and `prisma.config.ts` set `process.env.TZ`.
  - **Tests:** prove timezone handling by reading Prisma-written values through a separate `pg` connection (see `prisma.test.ts`); a Prisma-only round trip cannot detect a 9-hour shift.
- **Authentication (Auth.js via `@hono/auth-js`).**
  - Config lives in `apps/api/src/auth.ts`: Google only, database sessions (180 days), and `createUser` / `signIn` / `signOut` events that assign the `user` role and write audit logs. It is mounted at `/api/auth/*` in `app.ts`.
  - `AUTH_URL` must be `<origin>/api/auth`; Auth.js derives `basePath` from it. Do not also set `basePath` in the config. `getAuthConfig()` returns a fresh copy per request because Auth.js mutates the config.
  - Protect API routes with `requireUser(c)` / `requirePermission(c, action)` / `requireTopAdminRole(c)` from `lib/authz.ts`. Their errors become JSON 401/403 through `apiErrorHandler`. Banned users get 403.
  - The `session` callback deliberately returns only `user: { id }` and `expires` (a JST `+09:00` string). Do not add name, email or image; Auth.js would otherwise expose `sessionToken` and the full user row to the browser. The session cookie itself holds only the random session token. Server code that needs user details reads them from the DB; `requireUser` does this.
  - Web: `SessionProvider` is set up in `main.tsx`; use `useSession()`, `signIn("google")` and `signOut()` from `@hono/auth-js/react`.
  - Required env (checked at API startup): `DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. In Docker, secrets come from `apps/api/.env` via `env_file`; compose overrides `PORT` and `AUTH_URL`.
- **Logging.** Use `logger` from `lib/logger.ts` (ported from the original, without Axiom). It writes JSON Lines to `logs/YYYY-MM-DD.log` (JST date, `LOG_FLG=skip` disables) and to the console; `LOG_LEVEL` sets the minimum level.
- **Database (Prisma 7 + PostgreSQL 16).**
  - Schema, migrations and seed live in `apps/api/prisma/`. The schema started from the original app, but migrations were restarted as a single `20261004000000_init` (TIMESTAMPTZ, triggers for every `updated_at`). **Never edit a migration once it is committed**; change `schema.prisma` and run `npm run prisma:migrate:dev -w @watchlog/api` to add a new one. Destructive commands (`prisma migrate reset`, `docker compose down -v`) need the user's explicit consent.
  - Prisma Client is generated into `apps/api/src/generated/prisma` (gitignored, ESM with `.js` import extensions). Import it as `../generated/prisma/client.js`, never from `@prisma/client`. tsc compiles it into `dist`, so nothing extra is copied into the Docker image.
  - `prisma generate` runs automatically before the api `dev`, `build`, `typecheck` and `test` scripts. It does not need `DATABASE_URL`.
  - Use the singleton `prisma` from `apps/api/src/lib/prisma.ts`, or `createPrismaClient()` for scripts and seeds. Use transactions for multi-step writes.
  - Local env vars go in `apps/api/.env` (copy `.env.example`). The api `dev` script, Vitest and `prisma.config.ts` all load it.
  - In Docker, the `migrate` compose service runs `prisma migrate deploy` from the `migrator` Dockerfile stage before `app` starts. Seed with `docker compose run --rm migrate npx prisma db seed`.
- **Docker runtime has no npm.** The runtime image removes npm, npx, corepack and yarn, and installs api deps with `npm ci --omit=dev --omit=optional --omit=peer`.
  - If a package works locally but is missing in Docker, it is probably being omitted. Make it a direct `dependencies` entry of `apps/api`.
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

When porting an API route, keep its auth and permission semantics. The original calls `requireUser()` / `requirePermission()` at the top of every route (here they take the Hono context: `requireUser(c)`) and writes audit logs for significant actions. Do not drop those checks.

## Commands

Run from the repository root:

```bash
docker compose up -d db  # PostgreSQL only, on 127.0.0.1:5432 (for local dev)
npm run prisma:migrate -w @watchlog/api   # apply migrations (prisma:seed for initial data)
npm run dev:api          # API server on :3001 (tsx watch, loads apps/api/.env)
npm run dev:web          # Vite dev server on :3000 (open this), proxies /api to :3001
npm run lint             # ESLint (all workspaces)
npm run format           # Prettier --write (format:check verifies only)
npm run typecheck        # tsc --noEmit (all workspaces, includes tests)
npm run test             # Vitest single run (all workspaces)
npm run build            # shared → api → web
docker compose up -d --build   # db → migrate → app, production-like on :3000 (stop it before dev:web: same port)
```

**Validation sequence before committing:** `npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build`. CI (`.github/workflows/ci.yml`) runs the same steps plus a Docker build and smoke test on pushes to `main` / `develop` and on pull requests.

- Formatting is Prettier (`prettier.config.js`, printWidth 100, Tailwind class sorting). Do not hand-format; run `npm run format`. Markdown and the vendored shadcn CSS are excluded.
- Line endings are LF everywhere (`.gitattributes`).

## Testing Conventions

- Colocate tests with the code: `foo.ts` → `foo.test.ts`, `Bar.tsx` → `Bar.test.tsx`.
- Vitest globals are off; import `describe` / `it` / `expect` from `vitest`.
- **api:** call `app.request(...)` on the Hono app. Do not open ports.
- **Database tests:** do not mock Prisma. Hit the real PostgreSQL, and guard the suite with `describe.skipIf(!process.env.DATABASE_URL)`. Importing `lib/prisma.ts` does not require `DATABASE_URL`; the connection opens on the first query. CI provides a PostgreSQL service with migrations applied. Auth tests get dummy `AUTH_*` values from `apps/api/vitest.config.ts`. Pass real `Date` instants to Prisma in tests.
- **Web auth in tests:** pass `{ session }` to `renderWithProviders` / `renderRoute`. It feeds `useSession()` directly and never calls `/api/auth/session`.
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
