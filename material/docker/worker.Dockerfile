# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# BullMQ worker. Also renders PDFs, so it carries a Chromium for Puppeteer —
# which is why this image is deliberately separate from the API's.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/calc/package.json packages/calc/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
# Alpine ships its own Chromium; Puppeteer must not download a second one.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages packages
COPY apps/api apps/api
COPY apps/worker apps/worker
RUN pnpm --filter @cm/shared build \
 && pnpm --filter @cm/calc build \
 && pnpm --filter @cm/api build \
 && pnpm --filter @cm/worker build

FROM base AS runtime
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages packages
COPY --from=build /app/apps/api apps/api
COPY --from=build /app/apps/worker apps/worker

USER node
WORKDIR /app/apps/worker
# Bull Board, reachable only from inside the Docker network (§13).
EXPOSE 4100
CMD ["node", "dist/index.js"]
