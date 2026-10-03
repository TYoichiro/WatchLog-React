# ベースイメージ。Alpine のマイナーバージョンまで固定し、パッチは compose の pull: true で取り込む
ARG NODE_IMAGE=node:24-alpine3.24

# Stage 1: すべての依存（ビルドツール含む）をインストール
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci

# Stage 2: shared → api（JS）→ web（静的ファイル）の順にビルド（ワークスペースの並び順）
FROM deps AS builder
COPY . .
RUN npm run build

# Stage 3: api の実行に必要な本番依存だけをインストール
# --omit=peer: @prisma/client の peer 依存（prisma CLI・typescript）が自動で入るのを防ぐ
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --omit=optional --omit=peer -w @watchlog/api

# Stage 4: 実行用イメージ。api サーバーが /api と SPA の両方を配信する
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

# OS パッケージを最新化し、実行時に使わないパッケージマネージャーを削除する
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules /opt/yarn-* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production \
    TZ=Asia/Tokyo \
    PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist

COPY --from=prod-deps /app ./
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
