# WatchLog-React

SHOWROOM 配信ログツール「WatchLog」（Next.js 16 / App Router）を、React SPA と Hono API サーバーの構成で作り直すプロジェクトです。

> **現在の状態**: Docker で起動できます。画面は空ページで、API（`GET /api`）は空の JSON（`{}`）を返すだけです。移植の準備（`@/` エイリアス、shadcn の設定とテーマ、API の型共有、TanStack Query）と、PostgreSQL・Prisma の導入（スキーマ・マイグレーション・シードを元のアプリから移植）までは済んでいます。認証（Auth.js）はまだありません。
>
> AI エージェント（Claude Code・Codex など）向けの開発ルールと移植の対応表は [AGENTS.md](AGENTS.md) にあります。

## 構成方針

Next.js では Server Components・API Routes・NextAuth が 1 つのアプリにまとまっていました。素の React はブラウザで動く SPA なので、サーバー側の処理は別の API サーバーに分けます。

| 項目 | 方針 |
| --- | --- |
| フロントエンド | Vite + React SPA |
| バックエンド | Hono（Node.js）の API サーバーを新設する |
| 認証 | Auth.js（`@hono/auth-js`）。Google OAuth と DB セッションは元のアプリと同じ |
| DB | Prisma 7 + PostgreSQL。スキーマと `lib/` のロジックは元のアプリから移植する |
| ルーティング | React Router |
| データ取得 | TanStack Query。Server Components でやっていたデータ取得をここに置き換える |
| API 呼び出し | Hono の `hc` クライアントで、API の型をフロントエンドと共有する |
| リポジトリ | npm workspaces のモノレポ |

## ディレクトリ構成

```
WatchLog-React/
├─ AGENTS.md             # AI エージェント向けの開発ルール・移植ガイド（本体）
├─ CLAUDE.md             # Claude Code 用。@AGENTS.md で AGENTS.md を読み込む
├─ package.json          # workspaces / ESLint / overrides / allowScripts
├─ eslint.config.js      # すべてのワークスペースで共通の ESLint 設定
├─ prettier.config.js    # Prettier の設定（Tailwind のクラス並べ替えを含む）
├─ .gitattributes        # 改行コードを LF に統一
├─ .github/workflows/ci.yml  # CI（GitHub Actions）
├─ .vscode/extensions.json   # 推奨する VS Code 拡張機能
├─ Dockerfile            # shared・web・api をビルドし、1 つのコンテナで配信する
├─ compose.yml
├─ apps/
│  ├─ web/               # @watchlog/web    Vite + React SPA
│  │  ├─ index.html
│  │  ├─ components.json # shadcn の設定
│  │  ├─ vite.config.ts  # @/ エイリアス、source 条件、/api のプロキシ
│  │  ├─ vitest.config.ts  # vite.config を引き継ぎ、jsdom で実行する
│  │  └─ src/
│  │     ├─ main.tsx     # エントリーポイント（QueryClientProvider + RouterProvider）
│  │     ├─ routes.tsx   # ルート定義
│  │     ├─ index.css    # Tailwind とテーマ（元のアプリの globals.css を移植）
│  │     ├─ styles/      # shadcn/tailwind.css（4.5.0）を取り込んだもの
│  │     ├─ pages/       # 画面コンポーネント
│  │     ├─ lib/         # cn()、apiClient（hc<AppType>）、QueryClient
│  │     └─ test-utils/  # renderWithProviders / renderRoute
│  └─ api/               # @watchlog/api    Hono API サーバー
│     ├─ .env.example    # ローカル開発用の環境変数（.env にコピーして使う）
│     ├─ prisma.config.ts  # Prisma の設定（スキーマ・マイグレーション・シードの場所）
│     ├─ tsconfig.build.json  # ビルド用。テストファイルを出力から外す
│     ├─ prisma/
│     │  ├─ schema.prisma  # 元のアプリから移植（生成先だけ変更）
│     │  ├─ migrations/  # 元のアプリのマイグレーションをそのままコピー
│     │  └─ seed.ts      # ロール・権限などの初期データ
│     └─ src/
│        ├─ app.ts       # /api のルート定義（AppType を export し、web が型として使う）
│        ├─ server.ts    # API と SPA を配信するアプリを組み立てる
│        ├─ index.ts     # サーバーの起動（ポート待ち受けとシグナル処理）
│        ├─ lib/         # prisma（DB 接続）、env（必須の環境変数）、server-timezone
│        └─ generated/prisma/  # prisma generate の出力（git 管理外）
├─ packages/
│  └─ shared/            # @watchlog/shared 共有する型・JST ヘルパーなど
│     └─ src/
│        ├─ index.ts     # ここから export する
│        └─ jst.ts       # JST の日時ヘルパー（元のアプリの lib/jst.ts）
└─ watchlog-original/    # 移植元の Next.js 版（参照用、.gitignore 対象）
```

### ワークスペース間の参照（@watchlog/shared）

`packages/shared` の `exports` には、読み込み先を2つ用意しています。

| 条件 | 読み込み先 | 使う場面 |
| --- | --- | --- |
| `source` | `src/index.ts` | 開発・テスト・型チェック。ビルドしなくても読める |
| `default` | `dist/index.js` | 本番。tsc でビルドした api を Node.js で動かすとき |

各ツールで `source` 条件を有効にする設定は次のとおりです。

| ツール | 設定箇所 |
| --- | --- |
| Vite | `apps/web/vite.config.ts` の `resolve.conditions` |
| Vitest（api） | `apps/api/vitest.config.ts` の `ssr.resolve.conditions`（node 環境は SSR 側の設定を使う） |
| tsx | `apps/api` の `dev` スクリプトの `--conditions=source` |
| TypeScript | 各 tsconfig の `customConditions` |

ワークスペースは `packages/*` → `apps/*` の順に並べています。こうすると `npm run build` で shared が先にビルドされます。

`@watchlog/api` も `exports` の `source` 条件で `src/app.ts` を公開しています。web はここから `AppType` を型としてだけ import します（実行時には読み込みません）。

## 移植のための準備

### import のエイリアス

| ワークスペース | エイリアス | 理由 |
| --- | --- | --- |
| `apps/web` | `@/` → `apps/web/src/` | 元のアプリと同じ書き方で移植できる。tsconfig の `paths` に定義し、Vite は `resolve.tsconfigPaths` でそれを読む |
| `apps/api` | なし（相対パス＋`.js` 拡張子） | tsc はエイリアスを書き換えないので、ビルドした JS が Node.js で動かなくなる |

### API の型共有（Hono RPC）

`apps/web/src/lib/api-client.ts` の `apiClient`（`hc<AppType>("/")`）から API を呼びます。API にルートを追加すると web 側で補完が効き、存在しないルートを呼ぶと型エラーになります。型を正しく推論させるため、ルートはメソッドチェーン（または `api.route()`）でつないで定義します。

### TanStack Query

`main.tsx` で `QueryClientProvider` を設定しています。テストでは `@/test-utils/render` の `renderWithProviders`（リトライなしの QueryClient で包む）と `renderRoute(path)`（アプリのルート定義をメモリールーターで描画する）を使います。

### shadcn / テーマ

- `apps/web/components.json` は、元のアプリと同じ設定（`radix-nova`、`neutral`、`lucide`）にしています。`rsc` は `false` です。
- テーマの CSS 変数は、元のアプリの `globals.css` から `src/index.css` に移しました。フォントは `@fontsource-variable/geist` を使います。
- `shadcn` パッケージは入れていません。CLI の依存に、修正版のない脆弱性（`braces`）があるためです。必要な `shadcn/tailwind.css` だけを、元のアプリと同じ 4.5.0 から `src/styles/shadcn-tailwind.css` に取り込んでいます。
- コンポーネントを追加するときは、`apps/web` で `npx shadcn@4.5.0 add <name>` を実行します。
- 現在の shadcn のレジストリは `import { cn } from "cn"`（npm の `cn` パッケージ）を出力します。`cn` の実装を1つにそろえるため、`@/lib/utils` に書き換えてください。`cn` パッケージは入れません。
- 元のアプリの `components/ui/*.tsx` は `@/lib/utils` を使っているので、そのままコピーすれば動きます（`button.tsx` で確認済み）。
- `components/ui/` は、ESLint の react-refresh ルールの対象から外しています。`buttonVariants` などもあわせて export するためです。

## パッケージ

### apps/web

| 用途 | パッケージ |
| --- | --- |
| 基盤 | `react` / `react-dom` 19.3、`vite` 8、`@vitejs/plugin-react` |
| ルーティング | `react-router` 8 |
| データ取得 | `@tanstack/react-query` |
| API クライアント | `hono`（`hc` を使う） |
| 認証 | `@hono/auth-js`（`@hono/auth-js/react` の `useSession` / `signIn` など）、`@auth/core` |
| UI | `radix-ui`、`class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react`、`tw-animate-css` |
| スタイル | `tailwindcss` 4、`@tailwindcss/vite` |
| フォント | `@fontsource-variable/geist`（Next.js 専用の `geist` の代わり） |
| 動画 | `hls.js` |
| テスト | `vitest` 5、`@testing-library/react`、`@testing-library/dom`、`jsdom` |

### apps/api

| 用途 | パッケージ |
| --- | --- |
| サーバー | `hono`、`@hono/node-server` |
| 認証 | `@hono/auth-js`、`@auth/core`、`@auth/prisma-adapter` |
| DB | `@prisma/client` / `@prisma/adapter-pg` / `prisma` 7.10.0、`pg` |
| その他 | `fflate`（ログの一括ダウンロード）、`dotenv`、`tsx` |
| テスト | `vitest` 5 |

### ルート（共通の開発ツール）

`eslint` 10、`@eslint/js`、`typescript-eslint`、`eslint-plugin-react-hooks`、`eslint-plugin-react-refresh`、`globals`、`typescript` 6.0

## バージョンについて

| パッケージ | 採用したバージョン | 理由 |
| --- | --- | --- |
| `react-router` | 8 | 最新の安定版。新しく作るので最新を使う |
| `typescript` | 6.0 系（`~6.0.3`） | 最新は 7.0 だが、`typescript-eslint` が 6.0 系までしか対応していない |
| `prisma` / `@prisma/client` | 7.10.0 | npm の `latest` タグが 8.0 の RC を指しているため、安定版の 7 系に揃えた |

### overrides

Prisma CLI が間接的に依存している次のパッケージに、high の脆弱性があります。そのためルートの `package.json` で修正版に固定しています。

- `deepmerge-ts` → `>=8.0.2`
- `mysql2` → `>=3.24.5`

> このアプリの DB は PostgreSQL です（接続には `pg` と `@prisma/adapter-pg` を使います）。`mysql2` は、複数の DB に対応する Prisma CLI が同梱している依存で、アプリからは使いません。Prisma CLI は devDependency なので、Docker の実行用イメージにも入りません。

### allowScripts

npm 11 の `allowScripts` では、次のパッケージだけにインストールスクリプトの実行を許可しています。元のアプリと同じ対象です。

- `prisma`、`@prisma/engines`、`esbuild`

バージョンを上げたら、`npm install-scripts ls` でまだ許可していないパッケージがないか確認し、問題がなければ `npm install-scripts approve <pkg>` で許可してください。

## 元のアプリから引き継がないパッケージ

| パッケージ | 理由 |
| --- | --- |
| `next`、`eslint-config-next` | Next.js を使わなくなるため |
| `next-auth` | `@auth/core` と `@hono/auth-js` に置き換える |
| `next-axiom` | Next.js 専用。ログは自前の logger で出す |
| `geist` | `next/font` 前提。`@fontsource-variable/geist` に置き換える |
| `@vercel/analytics`、`@vercel/speed-insights` | Vercel にはデプロイしない（自前の Docker で運用する）ため |
| `shadcn` | CLI の依存に修正版のない脆弱性があるため入れない。CSS だけを取り込み、CLI は `npx shadcn@4.5.0` で実行する（「shadcn / テーマ」を参照） |

## データベース（PostgreSQL / Prisma）

| 項目 | 内容 |
| --- | --- |
| DB | PostgreSQL 16（`postgres:16-alpine3.24`）。元のアプリと同じメジャーバージョン |
| スキーマ | `apps/api/prisma/schema.prisma`。元のアプリからコピーし、生成先（`../src/generated/prisma`）と、Node ESM 向けの出力設定（`moduleFormat = "esm"`、`importFileExtension = "js"`）だけを変えた |
| マイグレーション | `apps/api/prisma/migrations`。元のアプリの 8 本をそのままコピーしたので、既存の DB とそのまま互換がある。既存のマイグレーションは編集せず、変更は `prisma migrate dev` で新しいマイグレーションとして追加する |
| Prisma Client | `prisma generate` で `apps/api/src/generated/prisma` に TypeScript として生成する（git 管理外）。tsc でそのまま `dist` にコンパイルされるので、実行用イメージへの追加のコピーは不要 |
| 接続 | `apps/api/src/lib/prisma.ts` の `prisma` を使う。`@prisma/adapter-pg` で接続し、DB セッションのタイムゾーンを `Asia/Tokyo` にする |

`prisma generate` は、api の `dev`・`build`・`typecheck`・`test` の前に自動で実行されます。DB への接続は不要なので、`DATABASE_URL` がなくても動きます。

### 日時とタイムゾーン（すべて JST）

UTC が混ざると混乱するので、DB・アプリ・コンテナのどこで見ても日本時間（`Asia/Tokyo`）になるようにしています。

| 場所 | 設定 |
| --- | --- |
| DB の列 | `TIMESTAMP(3)`（タイムゾーンなし）に **JST の値**を保存する。既定値は `CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo'`（元のアプリと同じ） |
| DB サーバー | 既定の `timezone` と `log_timezone` を `Asia/Tokyo` にする。compose では起動オプション（`-c timezone=...`）と `TZ` で、CI では `TZ`（initdb が設定ファイルに書き込む）で設定する。psql や生の SQL の `now()` も、ログの時刻も JST になる |
| Prisma の接続 | 接続オプションで、セッションのタイムゾーンも `Asia/Tokyo` にする |
| コンテナ | db・migrate・app はすべて `TZ=Asia/Tokyo`。Node のイメージには `tzdata` を入れているので、`date` コマンドも JST になる |
| Node.js | `TZ=Asia/Tokyo`。`server-timezone.ts` と `prisma.config.ts` でも `process.env.TZ` を設定する |

コードで日時を扱うときは、`@watchlog/shared` の JST ヘルパーを使います。Prisma は JST の値を「UTC の `Date`」として返すので、`new Date()` をそのまま DB に書き込むと 9 時間ずれます。

| 用途 | 使う関数 |
| --- | --- |
| 現在時刻を書き込む・保存済みの時刻と比べる | `toJstWallTimeDate()` |
| 入力値（文字列）を日時にする | `parseJstWallTime()` / `createJstWallTimeDate()` |
| API で返す | `toJstWallTimeIsoString()`（`+09:00` 付きの文字列） |
| 画面に表示する | `formatJstWallDateTime()` |

`apps/api/src/lib/prisma.test.ts` で、Prisma の接続と DB サーバーの既定値の両方が `Asia/Tokyo` であることを確認しています。

### api の Prisma 関連の npm scripts

| コマンド（`-w @watchlog/api` を付けて実行） | 内容 |
| --- | --- |
| `npm run prisma:generate` | Prisma Client を生成する |
| `npm run prisma:migrate` | マイグレーションを適用する（`prisma migrate deploy`） |
| `npm run prisma:migrate:dev` | スキーマの変更から新しいマイグレーションを作る（`prisma migrate dev`） |
| `npm run prisma:seed` | 初期データを入れる（ロール `admin`・`premiumuser`・`user` と権限など） |

## Docker で起動する

```bash
docker compose up -d --build
```

| URL | 内容 |
| --- | --- |
| http://localhost:3000/ | 画面（今は空ページ） |
| http://localhost:3000/api | API（今は `{}` を返す） |

停止するときは `docker compose down` を実行します。DB のデータも消す場合は `docker compose down -v` です。

### サービス

| サービス | 内容 |
| --- | --- |
| `db` | PostgreSQL。データは名前付きボリューム `postgres_data` に保存する。ローカル開発用に `127.0.0.1:5432` で公開する（`DB_PORT` で変更でき、外部からは接続できない） |
| `migrate` | `db` が起動したら `prisma migrate deploy` を実行して終了する。Prisma CLI が必要なので、Dockerfile の `migrator` ステージ（devDependencies を含む）を使う |
| `app` | `migrate` が成功してから起動する |

初期データは次のコマンドで入れます。

```bash
docker compose run --rm migrate npx prisma db seed
```

### コンテナの中身

- `Dockerfile` は 4 段階でビルドします。依存のインストール → shared・web・api のビルド（`prisma generate` を含む）→ api の本番依存だけをインストール → 実行用イメージ、の順です。マイグレーション用の `migrator` ステージは、ビルドの段階から分岐させたもので、実行用イメージには含まれません。
- 実行用イメージでは、**api サーバー 1 つが `/api/*` と SPA の両方を配信**します。
  - SPA の場所は環境変数 `WEB_DIST_DIR` で指定します。
  - `/api/*` 以外の未知のパスには `index.html` を返すので、React Router のクライアントルーティングがそのまま動きます。
  - `/api/*` で存在しないパスには、JSON で 404 を返します。
- 環境変数 `TZ=Asia/Tokyo` を設定し、`tzdata` を入れています。Node.js も `date` コマンドも JST で動きます。
- 実行ユーザーは `node`（root ではない）です。SIGTERM を受け取ると、すぐに正常終了します。

### ベースイメージと脆弱性対策

| 対策 | 内容 |
| --- | --- |
| ベースイメージ | `node:24-alpine3.24`。Alpine のマイナーバージョンまで固定し、Node.js 24 と Alpine のパッチは取り込む。`Dockerfile` 冒頭の `ARG NODE_IMAGE` で変更できる |
| 最新パッチの取得 | `compose.yml` の `build.pull: true` で、ビルドのたびにベースイメージを取得し直す |
| OS パッケージ | 実行用イメージで `apk upgrade` を実行する |
| パッケージマネージャー | 実行時は `node` しか使わないので、npm・npx・corepack・yarn を実行用イメージから削除する。これらに同梱の tar・undici などの脆弱性がイメージに残らない |
| 本番依存 | `npm ci --omit=dev --omit=optional --omit=peer` を使う |

本番依存の omit について補足します。`prisma` と `typescript` は、api の devDependencies であり、同時に `@prisma/client` の任意の peer 依存でもあります。npm はこれを「devOptional」と判定するので、`--omit=dev` だけでは外れません。`--omit=optional` を併用して外しています。これで、Prisma CLI・Prisma Studio・TypeScript が本番イメージに入りません。

脆弱性は Trivy で確認できます（Docker へのログインは不要です）。

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity HIGH,CRITICAL watchlog-react:latest
```

> Git Bash で実行するときは、パスが変換されないよう先頭に `MSYS_NO_PATHCONV=1` を付けてください。

> 実行用イメージで Prisma Client が動くことは確認済みです（DB を検索でき、タイムゾーンは JST）。

#### postgres イメージについて

- `postgres:16-alpine3.24` を使い、`pull_policy: daily` で1日1回、最新パッチのイメージを取得します。ローカルに古いイメージが残っていると、OS パッケージの脆弱性（OpenSSL など）がそのまま残るためです。
- 最新のイメージでも、Trivy は `gosu` に組み込まれた Go 標準ライブラリの HIGH / CRITICAL を検出します。
  - `gosu` は、公式イメージが起動時に root から postgres ユーザーへ切り替えるためだけのツールです。切り替えたあとは postgres を起動するだけなので、該当する Go の機能は使われず、悪用される経路はありません。
  - 公式イメージの更新で解消されるのを待ちます。
  - アプリのイメージ（`watchlog-react`）は 0 件です。

## ローカル開発

必要なもの: Node.js 24 以上、npm 11 以上

```bash
npm install
cp apps/api/.env.example apps/api/.env   # DATABASE_URL を設定する（初回のみ）
docker compose up -d db                  # PostgreSQL だけを Docker で起動する
npm run prisma:migrate -w @watchlog/api  # マイグレーションを適用する
npm run prisma:seed -w @watchlog/api     # 初期データを入れる（初回のみ）
npm run dev:api   # http://localhost:3000（API。apps/api/.env を読み込む）
npm run dev:web   # http://localhost:5173（画面。/api は 3000 番へプロキシ）
```

> `docker compose up -d`（全サービス）で `app` も起動していると、3000 番ポートがぶつかって `dev:api` が起動できません。ローカル開発中は `db` だけを起動してください。

### npm scripts（ルート）

| コマンド | 内容 |
| --- | --- |
| `npm run dev:web` | フロントエンドの開発サーバー（Vite） |
| `npm run dev:api` | API サーバー（`tsx watch`） |
| `npm run build` | すべてのワークスペースをビルド |
| `npm run test` | すべてのワークスペースのテストを実行 |
| `npm run typecheck` | すべてのワークスペースの型チェック（テストファイルも対象） |
| `npm run lint` | ESLint（TypeScript、React Hooks、React Refresh のルール） |
| `npm run format` | Prettier で整形する |
| `npm run format:check` | 整形されているかだけを確認する（CI で使う） |

各ワークスペースで直接 `npm run test:watch` を実行すると、ウォッチモードになります。

### コードの書式

- Prettier で整形します（`prettier.config.js`、1行100文字）。`prettier-plugin-tailwindcss` で、Tailwind のクラスも並べ替えます。`cn()` と `cva()` の中のクラスも対象です。
- Markdown と、shadcn から取り込んだ CSS は対象外です（`.prettierignore`）。
- 改行コードは `.gitattributes` で LF に統一しています。
- VS Code で開くと、ESLint、Prettier、Tailwind CSS IntelliSense の拡張機能が推奨されます（`.vscode/extensions.json`）。

### CI

`.github/workflows/ci.yml` で、`main` と `develop` へのプッシュ、およびプルリクエストのたびに次を実行します。

| ジョブ | 内容 |
| --- | --- |
| Lint / Typecheck / Test / Build | PostgreSQL のサービスコンテナを起動し、`npm ci` → lint → format:check → typecheck → マイグレーション適用 → test → build を実行する |
| Docker compose | `docker compose up -d --build` で db → migrate → app を起動し、`/api` が `{}` を返すこと、`/` が表示されること、migrate が正常終了したこと、実行用イメージの Prisma Client で DB を検索できることを確認する |

コミットの前には、ローカルでも `npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build` を実行してください。

## テスト

Vitest と Testing Library を使います。テストファイルは対象ファイルと同じ場所に置きます（`foo.ts` → `foo.test.ts`、`Bar.tsx` → `Bar.test.tsx`）。

| ワークスペース | 実行環境 | 書き方 |
| --- | --- | --- |
| `apps/api` | node | Hono の `app.request()` で、ポートを開かずにリクエストを送る。DB を使うテストは Prisma をモックせず、実際の PostgreSQL に接続する（`DATABASE_URL` がなければスキップ） |
| `packages/shared` | node | 純粋な関数を直接テストする |
| `apps/web` | jsdom | `@/test-utils/render` の `renderWithProviders` / `renderRoute` で描画する。通信は `vi.stubGlobal("fetch", ...)` で差し替える |

今あるテスト:

- `apps/api/src/app.test.ts`: `GET /api` が空の JSON を返すこと
- `apps/api/src/server.test.ts`: 静的ファイルの配信、SPA のフォールバック、`/api/*` の 404 を JSON で返すこと。一時ディレクトリにダミーの `index.html` を置いて確認する
- `apps/web/src/pages/home-page.test.tsx`: ホーム画面が空の `<main>` を描画すること
- `apps/web/src/routes.test.tsx`: `/` でホーム画面が表示されること
- `apps/web/src/lib/utils.test.ts`: `cn()` がクラスを結合し、競合する Tailwind のクラスを解決すること
- `apps/web/src/lib/api-client.test.ts`: `apiClient.api.$get()` が `GET /api` を呼び、JSON を返すこと
- `apps/api/src/lib/env.test.ts`: 必須の環境変数の検証（元のアプリから移植）
- `apps/api/src/lib/prisma.test.ts`: DB に接続できること、Prisma のセッションのタイムゾーンと DB サーバーの既定値（`timezone`・`log_timezone`）がどちらも `Asia/Tokyo` であること（統合テスト）
- `packages/shared/src/jst.test.ts`: JST の日時ヘルパー（元のアプリから移植）

補足:

- api の Vitest は `apps/api/.env` を読み込みます。ローカルで `docker compose up -d db` とマイグレーションを済ませておくと、統合テストも実行されます。
- web は Vitest の globals を使わないため、Testing Library の `cleanup` を `vitest.setup.ts` で登録しています。
- api と shared のビルドは `tsconfig.build.json` で行い、`*.test.ts` を `dist` から外しています。型チェックは `tsconfig.json` で行い、テストファイルも対象にします。

## 今後の作業

1. Auth.js（Google OAuth）を Hono に組み込む
2. `lib/`、API Routes、画面を順番に移植する（対応表は [AGENTS.md](AGENTS.md) の「Porting from Next.js」）
