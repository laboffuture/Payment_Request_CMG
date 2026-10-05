# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Express API. Built from the monorepo root so the workspace packages resolve.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# --- dependencies ----------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/calc/package.json packages/calc/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false

# --- build -----------------------------------------------------------------
FROM deps AS build
COPY packages packages
COPY apps/api apps/api
RUN pnpm --filter @cm/shared build \
 && pnpm --filter @cm/calc build \
 && pnpm --filter @cm/api build

# --- runtime ---------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/packages packages
COPY --from=build /app/apps/api apps/api

# Do not run as root.
USER node
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/server.js"]
